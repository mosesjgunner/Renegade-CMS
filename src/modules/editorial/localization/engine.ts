import { createHash, randomUUID } from 'node:crypto'

import {
  type TranslationDraftRequest,
  type TranslationProviderAdapter,
} from './adapter'
import type {
  LocaleCode,
  LocaleVariant,
  NotificationEventType,
  SourceRevisionPin,
  TranslationDraftAttribution,
  TranslationGroup,
  TranslationRequest,
  TranslationStatus,
} from './contracts'
import { computeHreflangAlternates } from './hreflang'
import { NotificationManager } from './notifications'
import { evaluateLocalizationQualityPolicy, type LocalizationPolicyReport } from './policy'
import { WebhookEngine } from './webhooks'

export interface CreateTranslationGroupInput {
  conceptualId?: string
  sourceDocument: {
    id: string
    locale: LocaleCode
    title: string
    slug: string
    canonicalPath: string
    canonicalUrl: string
    summary?: string
    body?: Record<string, unknown> | string
    revisionSequence: number
    revisionHash: string
    status: 'draft' | 'review' | 'approved' | 'published' | 'archived'
    seoTitle?: string
    seoDescription?: string
    mediaChoices?: Record<string, any>
  }
}

export interface RequestTranslationInput {
  groupId: string
  targetLocale: LocaleCode
  targetSlug?: string
  targetCanonicalPath?: string
  targetCanonicalUrl?: string
  translatorId?: string
  reviewerId?: string
  dueDate?: string
}

/**
 * Server-authoritative Translation & Localization Engine for Renegade CMoS.
 */
export class LocalizationEngine {
  private groups: Map<string, TranslationGroup> = new Map()
  private requests: Map<string, TranslationRequest> = new Map()

  readonly notificationManager: NotificationManager
  readonly webhookEngine: WebhookEngine

  constructor(options: {
    notificationManager?: NotificationManager
    webhookEngine?: WebhookEngine
  } = {}) {
    this.notificationManager = options.notificationManager || new NotificationManager()
    this.webhookEngine = options.webhookEngine || new WebhookEngine()
  }

  /**
   * Creates a new TranslationGroup linking locale variants to one conceptual content item.
   * Ensures the source document is pinned as the primary variant.
   */
  createTranslationGroup(input: CreateTranslationGroupInput): TranslationGroup {
    const groupId = `grp_${Date.now()}_${randomUUID().slice(0, 8)}`
    const conceptualId = input.conceptualId || `concept_${randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()

    const sourceVariant: LocaleVariant = {
      documentId: input.sourceDocument.id,
      locale: input.sourceDocument.locale,
      title: input.sourceDocument.title,
      slug: input.sourceDocument.slug,
      canonicalPath: input.sourceDocument.canonicalPath,
      canonicalUrl: input.sourceDocument.canonicalUrl,
      summary: input.sourceDocument.summary,
      body: input.sourceDocument.body,
      seoTitle: input.sourceDocument.seoTitle,
      seoDescription: input.sourceDocument.seoDescription,
      mediaChoices: input.sourceDocument.mediaChoices,
      revisionSequence: input.sourceDocument.revisionSequence,
      revisionHash: input.sourceDocument.revisionHash,
      status: input.sourceDocument.status,
      updatedAt: now,
    }

    const group: TranslationGroup = {
      id: groupId,
      conceptualId,
      sourceDocumentId: input.sourceDocument.id,
      sourceLocale: input.sourceDocument.locale,
      variants: {
        [input.sourceDocument.locale]: sourceVariant,
      },
      createdAt: now,
      updatedAt: now,
    }

    this.groups.set(groupId, group)
    return group
  }

  getGroup(groupId: string): TranslationGroup | undefined {
    return this.groups.get(groupId)
  }

  getAllGroups(): TranslationGroup[] {
    return Array.from(this.groups.values())
  }

  getRequest(requestId: string): TranslationRequest | undefined {
    return this.requests.get(requestId)
  }

  getAllRequests(): TranslationRequest[] {
    return Array.from(this.requests.values())
  }

  getAllRequestsForGroup(groupId: string): TranslationRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.groupId === groupId)
  }

  /**
   * Creates a formal translation request with pinned source revision, target locale,
   * assignments, and SLA due date.
   */
  requestTranslation(input: RequestTranslationInput): TranslationRequest {
    const group = this.groups.get(input.groupId)
    if (!group) {
      throw new Error(`TranslationGroup '${input.groupId}' not found.`)
    }

    const sourceVariant = group.variants[group.sourceLocale]
    if (!sourceVariant) {
      throw new Error(`Source locale '${group.sourceLocale}' not found in group '${group.id}'.`)
    }

    const requestId = `tr_${Date.now()}_${randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()

    const pin: SourceRevisionPin = {
      sequence: sourceVariant.revisionSequence,
      hash: sourceVariant.revisionHash,
      revisionId: `rev_${sourceVariant.revisionSequence}`,
      pinnedAt: now,
      title: sourceVariant.title,
      summary: sourceVariant.summary,
      bodySnapshot: sourceVariant.body,
    }

    // Provision target locale variant draft if not already existing
    let targetDocId = group.variants[input.targetLocale]?.documentId
    if (!targetDocId) {
      targetDocId = `doc_${input.targetLocale}_${randomUUID().slice(0, 8)}`
      const targetSlug = input.targetSlug || `${sourceVariant.slug}-${input.targetLocale}`
      const targetCanonicalPath =
        input.targetCanonicalPath || `/${input.targetLocale}/articles/${targetSlug}`
      const targetCanonicalUrl =
        input.targetCanonicalUrl ||
        new URL(targetCanonicalPath, sourceVariant.canonicalUrl).toString()

      group.variants[input.targetLocale] = {
        documentId: targetDocId,
        locale: input.targetLocale,
        title: `[Draft] ${sourceVariant.title}`,
        slug: targetSlug,
        canonicalPath: targetCanonicalPath,
        canonicalUrl: targetCanonicalUrl,
        summary: '',
        revisionSequence: 1,
        revisionHash: createHash('sha256').update(`${targetDocId}-initial`).digest('hex'),
        status: 'draft',
        updatedAt: now,
      }
      group.updatedAt = now
    }

    const request: TranslationRequest = {
      id: requestId,
      groupId: group.id,
      sourceDocumentId: sourceVariant.documentId,
      sourceLocale: group.sourceLocale,
      targetLocale: input.targetLocale,
      sourceRevisionPin: pin,
      targetDocumentId: targetDocId,
      translatorId: input.translatorId || null,
      reviewerId: input.reviewerId || null,
      dueDate: input.dueDate || null,
      progress: 0,
      status: input.translatorId ? 'assigned' : 'requested',
      isStale: false,
      createdAt: now,
      updatedAt: now,
    }

    this.requests.set(requestId, request)

    // Dispatch assignment notification if translator is assigned
    if (input.translatorId) {
      this.notificationManager.dispatchNotification({
        eventType: 'assignment',
        recipientId: input.translatorId,
        title: `New Translation Task Assigned: ${sourceVariant.title} (${input.targetLocale.toUpperCase()})`,
        message: `You have been assigned to translate '${sourceVariant.title}' from ${group.sourceLocale} to ${input.targetLocale}. Due: ${input.dueDate || 'Standard SLA'}.`,
        payload: { requestId, groupId: group.id, targetLocale: input.targetLocale },
      })

      this.webhookEngine.dispatchEvent('assignment', {
        requestId,
        groupId: group.id,
        translatorId: input.translatorId,
        targetLocale: input.targetLocale,
      })
    }

    return request
  }

  /**
   * Advances the source document to a new revision.
   * Checks staleness on all active or approved translation requests for this source.
   * If the source advanced beyond the pinned revision, marks isStale: true and sends notifications.
   * CRITICAL: Never overwrites the source document or target documents.
   */
  advanceSourceDocument(
    groupId: string,
    update: {
      title?: string
      summary?: string
      body?: Record<string, unknown> | string
      newRevisionSequence?: number
      newRevisionHash?: string
      sequence?: number
      hash?: string
    },
  ): { staleRequestsCount: number; staleRequests: TranslationRequest[] } {
    const group = this.groups.get(groupId)
    if (!group) throw new Error(`Group '${groupId}' not found.`)

    const sourceVariant = group.variants[group.sourceLocale]
    if (!sourceVariant) throw new Error(`Source variant for '${group.sourceLocale}' not found.`)

    const now = new Date().toISOString()

    // Update source document with new revision
    sourceVariant.revisionSequence = update.newRevisionSequence ?? update.sequence ?? (sourceVariant.revisionSequence + 1)
    sourceVariant.revisionHash = update.newRevisionHash ?? update.hash ?? `sha256-rev${sourceVariant.revisionSequence}`
    if (update.title) sourceVariant.title = update.title
    if (update.summary) sourceVariant.summary = update.summary
    if (update.body) sourceVariant.body = update.body
    sourceVariant.updatedAt = now
    group.updatedAt = now

    // Check all requests for this group
    const groupRequests = this.getAllRequestsForGroup(groupId)
    const staleRequests: TranslationRequest[] = []

    for (const req of groupRequests) {
      // Check if source advanced past pin
      if (
        sourceVariant.revisionSequence > req.sourceRevisionPin.sequence ||
        sourceVariant.revisionHash !== req.sourceRevisionPin.hash
      ) {
        req.isStale = true
        req.staleReason = `Source document advanced from revision ${req.sourceRevisionPin.sequence} to ${sourceVariant.revisionSequence} (hash: ${sourceVariant.revisionHash.slice(0, 8)}).`
        req.sourceCurrentRevision = {
          sequence: sourceVariant.revisionSequence,
          hash: sourceVariant.revisionHash,
        }
        req.updatedAt = now
        staleRequests.push(req)

        // Notify translator and reviewer about staleness
        const recipients = [req.translatorId, req.reviewerId].filter(Boolean) as string[]
        for (const recipientId of recipients) {
          this.notificationManager.dispatchNotification({
            eventType: 'stale_translation',
            recipientId,
            title: `Source Content Updated — Translation Stale: ${sourceVariant.title}`,
            message: req.staleReason,
            payload: {
              requestId: req.id,
              groupId: group.id,
              targetLocale: req.targetLocale,
              currentSourceSequence: sourceVariant.revisionSequence,
            },
          })
        }

        this.webhookEngine.dispatchEvent('stale_translation', {
          requestId: req.id,
          groupId: group.id,
          targetLocale: req.targetLocale,
          staleReason: req.staleReason,
        })
      }
    }

    return {
      staleRequestsCount: staleRequests.length,
      staleRequests,
    }
  }

  /**
   * Re-aligns a stale translation request to the current source revision pin.
   */
  realignTranslationPin(requestId: string): TranslationRequest {
    const req = this.requests.get(requestId)
    if (!req) throw new Error(`Request '${requestId}' not found.`)

    const group = this.groups.get(req.groupId)
    if (!group) throw new Error(`Group '${req.groupId}' not found.`)

    const sourceVariant = group.variants[group.sourceLocale]
    const now = new Date().toISOString()

    req.sourceRevisionPin = {
      sequence: sourceVariant.revisionSequence,
      hash: sourceVariant.revisionHash,
      revisionId: `rev_${sourceVariant.revisionSequence}`,
      pinnedAt: now,
      title: sourceVariant.title,
      summary: sourceVariant.summary,
      bodySnapshot: sourceVariant.body,
    }
    req.isStale = false
    req.staleReason = null
    req.sourceCurrentRevision = undefined
    req.updatedAt = now

    return req
  }

  /**
   * Generates a machine translation draft using a provider adapter.
   * Attaches attribution metadata with cost and token calculations.
   * Strictly flags humanReviewed: false — human sign-off is mandatory before publication.
   */
  async draftWithProvider(
    requestId: string,
    adapter: TranslationProviderAdapter,
    options: { model?: string } = {},
  ): Promise<{ success: boolean; request: TranslationRequest; error?: string }> {
    const req = this.requests.get(requestId)
    if (!req) throw new Error(`Request '${requestId}' not found.`)

    const group = this.groups.get(req.groupId)
    if (!group) throw new Error(`Group '${req.groupId}' not found.`)

    const sourceVariant = group.variants[group.sourceLocale]
    const targetVariant = req.targetLocale ? group.variants[req.targetLocale] : undefined

    if (!targetVariant) {
      throw new Error(`Target variant for locale '${req.targetLocale}' not found in group.`)
    }

    // Extract media alt texts
    const mediaAltTexts: Record<string, string> = {}
    if (sourceVariant.mediaChoices) {
      for (const [id, choice] of Object.entries(sourceVariant.mediaChoices)) {
        if (choice.altText) mediaAltTexts[id] = choice.altText
      }
    }

    const draftInput: TranslationDraftRequest = {
      sourceText: {
        title: sourceVariant.title,
        summary: sourceVariant.summary,
        body: sourceVariant.body,
        seoTitle: sourceVariant.seoTitle,
        seoDescription: sourceVariant.seoDescription,
        mediaAltTexts,
      },
      sourceLocale: group.sourceLocale,
      targetLocale: req.targetLocale,
      options,
    }

    const response = await adapter.translateDraft(draftInput)
    const now = new Date().toISOString()

    if (!response.success || !response.translatedText) {
      req.attribution = response.attribution
      req.updatedAt = now
      return {
        success: false,
        request: req,
        error: response.attribution.errorMetadata?.message || 'Translation provider draft failed.',
      }
    }

    // Update target variant with draft translation
    targetVariant.title = response.translatedText.title
    if (response.translatedText.summary) targetVariant.summary = response.translatedText.summary
    if (response.translatedText.body) targetVariant.body = response.translatedText.body
    if (response.translatedText.seoTitle) targetVariant.seoTitle = response.translatedText.seoTitle
    if (response.translatedText.seoDescription) {
      targetVariant.seoDescription = response.translatedText.seoDescription
    }

    // Apply translated media choices
    if (response.translatedText.mediaAltTexts) {
      targetVariant.mediaChoices = targetVariant.mediaChoices || {}
      for (const [mediaId, altText] of Object.entries(response.translatedText.mediaAltTexts)) {
        targetVariant.mediaChoices[mediaId] = {
          mediaId,
          altText,
          caption: `Localized for ${req.targetLocale}`,
        }
      }
    }

    targetVariant.attribution = response.attribution
    targetVariant.revisionSequence++
    targetVariant.revisionHash = createHash('sha256')
      .update(`${targetVariant.title}-${targetVariant.revisionSequence}`)
      .digest('hex')
    targetVariant.status = 'draft'
    targetVariant.updatedAt = now

    req.attribution = response.attribution
    req.status = 'in-translation'
    req.progress = 50
    req.updatedAt = now

    return {
      success: true,
      request: req,
    }
  }

  /**
   * Allows human translator or editor to review, edit, and update the target document.
   */
  updateTargetContent(
    requestId: string,
    updates: {
      title?: string
      summary?: string
      body?: Record<string, unknown> | string
      seoTitle?: string
      seoDescription?: string
      mediaChoices?: Record<string, any>
    },
  ): LocaleVariant {
    const req = this.requests.get(requestId)
    if (!req) throw new Error(`Request '${requestId}' not found.`)

    const group = this.groups.get(req.groupId)
    if (!group) throw new Error(`Group '${req.groupId}' not found.`)

    const targetVariant = group.variants[req.targetLocale]
    if (!targetVariant) throw new Error(`Target variant '${req.targetLocale}' not found.`)

    const now = new Date().toISOString()

    if (updates.title !== undefined) targetVariant.title = updates.title
    if (updates.summary !== undefined) targetVariant.summary = updates.summary
    if (updates.body !== undefined) targetVariant.body = updates.body
    if (updates.seoTitle !== undefined) targetVariant.seoTitle = updates.seoTitle
    if (updates.seoDescription !== undefined) targetVariant.seoDescription = updates.seoDescription
    if (updates.mediaChoices !== undefined) targetVariant.mediaChoices = updates.mediaChoices

    targetVariant.revisionSequence++
    targetVariant.revisionHash = createHash('sha256')
      .update(`${targetVariant.title}-${targetVariant.revisionSequence}`)
      .digest('hex')
    targetVariant.updatedAt = now

    req.progress = Math.max(req.progress, 75)
    req.updatedAt = now

    return targetVariant
  }

  /**
   * Submits target variant for review.
   */
  submitForReview(requestId: string): TranslationRequest {
    const req = this.requests.get(requestId)
    if (!req) throw new Error(`Request '${requestId}' not found.`)

    const group = this.groups.get(req.groupId)
    const targetVariant = group?.variants[req.targetLocale]
    if (!targetVariant) throw new Error(`Target variant not found.`)

    const now = new Date().toISOString()
    req.status = 'in-review'
    req.progress = 85
    req.updatedAt = now

    targetVariant.status = 'review'
    targetVariant.updatedAt = now

    if (req.reviewerId) {
      this.notificationManager.dispatchNotification({
        eventType: 'mention_comment',
        recipientId: req.reviewerId,
        title: `Translation Ready for Review: ${targetVariant.title}`,
        message: `Translation for '${targetVariant.title}' (${req.targetLocale}) is ready for editorial review.`,
        payload: { requestId, groupId: req.groupId, targetLocale: req.targetLocale },
      })
    }

    return req
  }

  /**
   * Reviewer requests changes on the translation.
   */
  requestChanges(requestId: string, reviewerId: string, reason: string): TranslationRequest {
    const req = this.requests.get(requestId)
    if (!req) throw new Error(`Request '${requestId}' not found.`)

    const group = this.groups.get(req.groupId)
    const targetVariant = group?.variants[req.targetLocale]
    if (!targetVariant) throw new Error(`Target variant not found.`)

    const now = new Date().toISOString()
    req.status = 'changes-requested'
    req.changesRequestedReason = reason
    req.reviewerId = reviewerId
    req.progress = 60
    req.updatedAt = now

    targetVariant.status = 'draft'
    targetVariant.updatedAt = now

    if (req.translatorId) {
      this.notificationManager.dispatchNotification({
        eventType: 'changes_requested',
        recipientId: req.translatorId,
        title: `Changes Requested on Translation: ${targetVariant.title}`,
        message: `Reviewer requested changes: ${reason}`,
        payload: { requestId, groupId: req.groupId, targetLocale: req.targetLocale, reason },
      })
    }

    this.webhookEngine.dispatchEvent('changes_requested', {
      requestId,
      groupId: req.groupId,
      targetLocale: req.targetLocale,
      reviewerId,
      reason,
    })

    return req
  }

  /**
   * Approves the translation after human review.
   * Mandatory human sign-off: sets humanReviewed: true and records reviewer ID.
   */
  approveTranslation(requestId: string, reviewerId: string): TranslationRequest {
    const req = this.requests.get(requestId)
    if (!req) throw new Error(`Request '${requestId}' not found.`)

    if (req.isStale) {
      throw new Error(
        `CANNOT_APPROVE_STALE: Source content has advanced since the translation was pinned. Re-align translation before approving.`,
      )
    }

    const group = this.groups.get(req.groupId)
    const targetVariant = group?.variants[req.targetLocale]
    if (!targetVariant) throw new Error(`Target variant not found.`)

    const now = new Date().toISOString()

    // Enforce human review attribution
    if (targetVariant.attribution) {
      targetVariant.attribution.humanReviewed = true
      targetVariant.attribution.humanReviewerId = reviewerId
      targetVariant.attribution.humanApprovedAt = now
    } else {
      targetVariant.attribution = {
        provider: 'human',
        generatedAt: now,
        isMachineDraft: false,
        humanReviewed: true,
        humanReviewerId: reviewerId,
        humanApprovedAt: now,
      }
    }

    targetVariant.status = 'approved'
    targetVariant.updatedAt = now

    req.status = 'approved'
    req.reviewerId = reviewerId
    req.progress = 100
    req.changesRequestedReason = null
    req.updatedAt = now

    if (req.translatorId) {
      this.notificationManager.dispatchNotification({
        eventType: 'approval',
        recipientId: req.translatorId,
        title: `Translation Approved: ${targetVariant.title}`,
        message: `Your translation of '${targetVariant.title}' was approved by ${reviewerId}.`,
        payload: { requestId, groupId: req.groupId, targetLocale: req.targetLocale, reviewerId },
      })
    }

    this.webhookEngine.dispatchEvent('approval', {
      requestId,
      groupId: req.groupId,
      targetLocale: req.targetLocale,
      reviewerId,
      approvedAt: now,
    })

    return req
  }

  /**
   * Publishes or releases a localized variant.
   * Verifies that the variant is approved, not stale, human-reviewed, and passes quality policy.
   */
  publishLocaleVariant(
    groupId: string,
    locale: LocaleCode,
    options: {
      siteBaseUrl?: string
      existingWaivers?: Record<string, any>
    } = {},
  ): { variant: LocaleVariant; hreflang: ReturnType<typeof computeHreflangAlternates> } {
    const group = this.groups.get(groupId)
    if (!group) throw new Error(`Group '${groupId}' not found.`)

    const variant = group.variants[locale]
    if (!variant) throw new Error(`Variant for '${locale}' not found.`)

    // Evaluate Quality Policy
    const request = this.getAllRequestsForGroup(groupId).find((r) => r.targetLocale === locale)
    const policy = evaluateLocalizationQualityPolicy({
      variant,
      group,
      request,
      existingWaivers: options.existingWaivers,
      siteBaseUrl: options.siteBaseUrl,
    })

    if (policy.overallStatus === 'blocked') {
      const blockers = policy.rules.filter((r) => r.severity === 'blocker' && r.status === 'failed')
      throw new Error(
        `PUBLICATION_GATE_BLOCKED: ${blockers.map((b) => b.message).join('; ')}`,
      )
    }

    const now = new Date().toISOString()
    variant.status = 'published'
    variant.updatedAt = now
    group.updatedAt = now

    if (request) {
      request.status = 'completed'
      request.updatedAt = now
    }

    // Compute Hreflang Alternates (strictly only real approved/published equivalents)
    const hreflang = computeHreflangAlternates(
      group,
      locale,
      options.siteBaseUrl || 'https://example.com',
    )

    this.notificationManager.dispatchNotification({
      eventType: 'completion',
      recipientId: variant.attribution?.humanReviewerId || 'publisher',
      title: `Locale Variant Published: ${variant.title} (${locale})`,
      message: `Variant '${variant.title}' is now published with ${hreflang.activeLocales.length} active hreflang alternate(s).`,
      payload: { groupId, locale, canonicalUrl: hreflang.canonicalUrl },
    })

    this.webhookEngine.dispatchEvent('completion', {
      groupId,
      locale,
      canonicalUrl: hreflang.canonicalUrl,
      activeLocales: hreflang.activeLocales,
      publishedAt: now,
    })

    return { variant, hreflang }
  }
}
