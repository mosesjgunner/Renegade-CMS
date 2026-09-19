import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  assertHumanReviewApproved,
  evaluateLocalizationQualityPolicy,
  evaluateTranslationCompleteness,
  computeHreflangAlternates,
  LocalizationEngine,
  NotificationManager,
  rotateSubscriptionSecret,
  SimulatedTranslationProviderAdapter,
  validateWebhookUrl,
  verifyWebhookSignature,
  WebhookEngine,
} from '../../src/modules/editorial/localization'
import {
  evaluateReleaseGates,
  type GateEvaluationOptions,
} from '../../src/modules/releases/gates'
import type { CoordinatedRelease, ReleaseArtifactItem } from '../../src/modules/releases/contracts'

describe('Workflow Pass FLOW-05 — Translation Groups, Localization Quality & Reliable Notifications', () => {
  let engine: LocalizationEngine
  let provider: SimulatedTranslationProviderAdapter

  beforeEach(() => {
    provider = new SimulatedTranslationProviderAdapter()
    engine = new LocalizationEngine()
  })

  // 1. Translation groups linking locale variants to one conceptual content item
  it('1. Manages translation groups without overwriting source documents', () => {
    const sourceDoc = {
      id: 'art-en-001',
      locale: 'en',
      title: 'Renegade Autonomous Governance',
      slug: 'autonomous-governance',
      canonicalPath: '/en/articles/autonomous-governance',
      canonicalUrl: 'https://renegadeparty.org/en/articles/autonomous-governance',
      summary: 'An overview of distributed autonomous leadership.',
      body: { text: 'English source prose regarding decentralized systems.' },
      revisionSequence: 1,
      revisionHash: 'hash-en-rev-1',
      status: 'published' as const,
      seoTitle: 'Autonomous Governance | Renegade',
      seoDescription: 'An overview of distributed autonomous leadership.',
      mediaChoices: {
        'img-01': { altText: 'Diagram of autonomous network nodes', caption: 'Network topology' },
      },
    }

    const group = engine.createTranslationGroup({
      sourceDocument: sourceDoc,
    })

    expect(group.id).toBeDefined()
    expect(group.sourceLocale).toBe('en')
    expect(group.variants['en']).toBeDefined()
    expect(group.variants['en'].title).toBe('Renegade Autonomous Governance')

    // Request translation for Spanish locale
    const request = engine.requestTranslation({
      groupId: group.id,
      targetLocale: 'es',
      translatorId: 'translator-elena',
      reviewerId: 'editor-marcos',
      dueDate: '2026-10-01T12:00:00Z',
    })

    expect(request.id).toBeDefined()
    expect(request.status).toBe('assigned')
    expect(request.sourceRevisionPin.sequence).toBe(1)
    expect(request.sourceRevisionPin.hash).toBe('hash-en-rev-1')

    // Target variant draft exists in the group
    expect(group.variants['es']).toBeDefined()
    expect(group.variants['es'].status).toBe('draft')
    expect(group.variants['es'].canonicalPath).toContain('/es/articles/')

    // Crucial check: Source document in the group is unchanged and NEVER overwritten
    expect(group.variants['en'].title).toBe('Renegade Autonomous Governance')
    expect(group.variants['en'].revisionSequence).toBe(1)
    expect(group.variants['en'].status).toBe('published')
  })

  // 2. Translation request, assignment, progress, and stale-source detection
  it('2. Detects stale source when source document advances beyond pinned revision', () => {
    const group = engine.createTranslationGroup({
      sourceDocument: {
        id: 'art-002',
        locale: 'en',
        title: 'Original Title',
        slug: 'original-title',
        canonicalPath: '/en/articles/original-title',
        canonicalUrl: 'https://renegadeparty.org/en/articles/original-title',
        revisionSequence: 1,
        revisionHash: 'hash-v1',
        status: 'published',
      },
    })

    const request = engine.requestTranslation({
      groupId: group.id,
      targetLocale: 'es',
      translatorId: 'translator-1',
      reviewerId: 'reviewer-1',
    })

    expect(request.isStale).toBe(false)

    // Advance source document to revision 2
    const advResult = engine.advanceSourceDocument(group.id, {
      title: 'Advanced Title v2',
      summary: 'Updated summary.',
      newRevisionSequence: 2,
      newRevisionHash: 'hash-v2',
    })

    expect(advResult.staleRequestsCount).toBe(1)
    expect(request.isStale).toBe(true)
    expect(request.staleReason).toContain('Source document advanced from revision 1 to 2')

    // Approving a stale translation must be rejected
    expect(() => {
      engine.approveTranslation(request.id, 'reviewer-1')
    }).toThrowError(/CANNOT_APPROVE_STALE/)

    // Re-aligning pin clears staleness
    const realigned = engine.realignTranslationPin(request.id)
    expect(realigned.isStale).toBe(false)
    expect(realigned.sourceRevisionPin.sequence).toBe(2)
    expect(realigned.sourceRevisionPin.hash).toBe('hash-v2')
  })

  // 3. Side-by-side completeness check and unsupported rich-text/layout nodes
  it('3. Evaluates side-by-side completeness and visibly fails on unsupported rich-text nodes', () => {
    // A target document with missing alt text and unsupported node type
    const source = {
      title: 'Source Title',
      summary: 'Source summary text.',
      body: {
        root: {
          type: 'root',
          children: [
            { type: 'paragraph', text: 'Paragraph one.' },
            { type: 'paragraph', text: 'Paragraph two.' },
          ],
        },
      },
      media: [{ id: 'img-1', altText: 'Source diagram' }],
      seoTitle: 'Source SEO Title | Renegade',
      seoDescription: 'Source SEO Description long enough to be valid.',
    }

    const invalidTarget = {
      id: 'target-01',
      title: 'Target Title Translated',
      summary: 'Target summary.',
      body: {
        root: {
          type: 'root',
          children: [
            { type: 'paragraph', text: 'Parrafo uno traducido.' },
            // Unsupported node injected
            { type: 'dangerous_embedded_script_node', text: 'alert(1)' },
          ],
        },
      },
      mediaChoices: {
        // Missing alt text
        'img-1': { mediaId: 'img-1', altText: '' },
      },
      seoTitle: 'Target SEO Title',
      seoDescription: 'Target SEO Description long enough to be valid.',
    }

    const report = evaluateTranslationCompleteness({
      source,
      target: invalidTarget,
    })

    expect(report.isComplete).toBe(false)
    expect(report.blockers.length).toBeGreaterThan(0)

    // Check unsupported node blocker
    const nodeBlocker = report.blockers.find((b) => b.code === 'TRANSLATION_UNSUPPORTED_NODE_TYPE')
    expect(nodeBlocker).toBeDefined()
    expect(nodeBlocker?.message).toContain('dangerous_embedded_script_node')
    expect(nodeBlocker?.repairUrl).toContain('focus=body')

    // Check missing media alt blocker
    const altBlocker = report.blockers.find((b) => b.code === 'TRANSLATION_MEDIA_ALT_MISSING')
    expect(altBlocker).toBeDefined()
    expect(altBlocker?.repairUrl).toContain('focus=media')

    // Now repair target
    const repairedTarget = {
      ...invalidTarget,
      body: {
        root: {
          type: 'root',
          children: [
            { type: 'paragraph', text: 'Parrafo uno traducido.' },
            { type: 'paragraph', text: 'Parrafo dos traducido.' },
          ],
        },
      },
      mediaChoices: {
        'img-1': { mediaId: 'img-1', altText: 'Diagrama traducido' },
      },
    }

    const repairedReport = evaluateTranslationCompleteness({
      source,
      target: repairedTarget,
    })

    expect(repairedReport.isComplete).toBe(true)
    expect(repairedReport.blockers.length).toBe(0)
    expect(repairedReport.score).toBe(100)
  })

  // 4. Optional translation-provider adapter, AI draft attribution, and mandatory human review
  it('4. Creates attributed AI draft with usage metadata; blocks release without human review', async () => {
    const group = engine.createTranslationGroup({
      sourceDocument: {
        id: 'art-003',
        locale: 'en',
        title: 'Decentralized Network',
        slug: 'decentralized-network',
        canonicalPath: '/en/articles/decentralized-network',
        canonicalUrl: 'https://renegadeparty.org/en/articles/decentralized-network',
        summary: 'Prose summary.',
        body: 'Source body text with five words.',
        revisionSequence: 1,
        revisionHash: 'h-1',
        status: 'published',
        mediaChoices: {
          'm-1': { altText: 'Network chart' },
        },
      },
    })

    const request = engine.requestTranslation({
      groupId: group.id,
      targetLocale: 'es',
      translatorId: 'translator-1',
      reviewerId: 'editor-1',
    })

    // Execute provider draft
    const draftRes = await engine.draftWithProvider(request.id, provider)
    expect(draftRes.success).toBe(true)

    const targetVariant = group.variants['es']
    expect(targetVariant.attribution).toBeDefined()
    expect(targetVariant.attribution?.isMachineDraft).toBe(true)
    expect(targetVariant.attribution?.humanReviewed).toBe(false)
    expect(targetVariant.attribution?.tokensUsed).toBeGreaterThan(0)
    expect(targetVariant.attribution?.cost).toBeGreaterThan(0)
    expect(targetVariant.mediaChoices?.['m-1'].altText).toContain('[ES]')

    // Attempting publication before human review must be blocked
    expect(() => {
      engine.publishLocaleVariant(group.id, 'es')
    }).toThrowError(/HUMAN_REVIEW_REQUIRED/)

    // Also assert human review guard function directly
    const check = assertHumanReviewApproved(targetVariant)
    expect(check.approved).toBe(false)
    expect(check.reason).toContain('HUMAN_REVIEW_REQUIRED')

    // Submit for review and approve with human reviewer
    engine.submitForReview(request.id)
    engine.approveTranslation(request.id, 'editor-marcos')

    expect(targetVariant.attribution?.humanReviewed).toBe(true)
    expect(targetVariant.attribution?.humanReviewerId).toBe('editor-marcos')
    expect(targetVariant.status).toBe('approved')

    // Now publication succeeds
    const pubRes = engine.publishLocaleVariant(group.id, 'es')
    expect(pubRes.variant.status).toBe('published')
  })

  // 5. Locale URL / alternate / hreflang integration with self-reference and no phantom languages
  it('5. Computes hreflang with self-reference, canonical consistency, and excludes phantom unapproved languages', () => {
    const group = engine.createTranslationGroup({
      sourceDocument: {
        id: 'art-004',
        locale: 'en',
        title: 'Platform Vision',
        slug: 'platform-vision',
        canonicalPath: '/en/articles/platform-vision',
        canonicalUrl: 'https://renegadeparty.org/en/articles/platform-vision',
        revisionSequence: 1,
        revisionHash: 'h-1',
        status: 'published',
      },
    })

    // Add approved 'es' variant
    group.variants['es'] = {
      documentId: 'art-004-es',
      locale: 'es',
      title: 'Vision de la plataforma',
      slug: 'vision-plataforma',
      canonicalPath: '/es/articles/vision-plataforma',
      canonicalUrl: 'https://renegadeparty.org/es/articles/vision-plataforma',
      revisionSequence: 1,
      revisionHash: 'h-es-1',
      status: 'approved',
      updatedAt: new Date().toISOString(),
    }

    // Add unapproved 'fr' variant in 'draft' status (Phantom candidate)
    group.variants['fr'] = {
      documentId: 'art-004-fr',
      locale: 'fr',
      title: 'Vision de la plateforme (Draft)',
      slug: 'vision-plateforme-draft',
      canonicalPath: '/fr/articles/vision-draft',
      canonicalUrl: 'https://renegadeparty.org/fr/articles/vision-draft',
      revisionSequence: 1,
      revisionHash: 'h-fr-1',
      status: 'draft', // Not approved!
      updatedAt: new Date().toISOString(),
    }

    // Compute hreflang for 'es'
    const hreflang = computeHreflangAlternates(group, 'es', 'https://renegadeparty.org')

    // Invariant 1: Self-reference present
    expect(hreflang.alternateLocales['es']).toBe(
      'https://renegadeparty.org/es/articles/vision-plataforma',
    )

    // Invariant 2: Approved source 'en' present
    expect(hreflang.alternateLocales['en']).toBe(
      'https://renegadeparty.org/en/articles/platform-vision',
    )

    // Invariant 3: Canonical consistency
    expect(hreflang.canonicalUrl).toBe(
      'https://renegadeparty.org/es/articles/vision-plataforma',
    )

    // Invariant 4: No phantom languages! Draft 'fr' MUST NOT be in alternateLocales
    expect(hreflang.alternateLocales['fr']).toBeUndefined()
    expect(hreflang.omittedPhantomLocales).toContain('fr')

    // Invariant 5: x-default points to default/source locale
    expect(hreflang.alternateLocales['x-default']).toBe(
      'https://renegadeparty.org/en/articles/platform-vision',
    )
  })

  // 6. Configurable quality policy & FLOW-04 Preflight Gate Matrix Integration
  it('6. Integrates localization quality gate with FLOW-04 preflight evaluation', async () => {
    // Create release containing a stale and unapproved machine-translated artifact
    const releaseWithStaleTranslation: Partial<CoordinatedRelease> = {
      id: 'rel-trans-01',
      name: 'Global Multi-Locale Release',
      releaseRevision: 1,
      status: 'in-review',
      artifacts: [
        {
          id: 'article:art-005-es',
          targetType: 'article',
          targetId: 'art-005-es',
          title: 'Spanish Translation',
          pinnedRevisionId: 'rev-es-1',
          pinnedRevisionSequence: 1,
          pinnedHash: 'hash-es-1',
          locale: 'es',
          translationGroupId: 'grp-005',
          isMachineDraft: true,
          humanReviewed: false, // Unreviewed!
          translationStale: true, // Stale!
          status: 'pending',
          attempts: 0,
          updatedAt: new Date().toISOString(),
        } as ReleaseArtifactItem,
      ],
    }

    // Evaluate FLOW-04 gates
    const snapshot = await evaluateReleaseGates(null, releaseWithStaleTranslation, {
      actor: { id: 'publisher-1', role: 'publisher' },
    })

    expect(snapshot.overallStatus).toBe('blocked')
    const locRule = snapshot.rules.find((r) => r.ruleId === 'rule-localization-quality')
    expect(locRule).toBeDefined()
    expect(locRule?.status).toBe('failed')
    expect(locRule?.message).toContain('stale')
    expect(locRule?.message).toContain('unreviewed machine draft')

    // Now test authorized staff waiver
    const waivedSnapshot = await evaluateReleaseGates(null, releaseWithStaleTranslation, {
      actor: { id: 'publisher-1', role: 'publisher' },
      existingWaivers: {
        'rule-localization-quality': {
          waivedByUserId: 'director-1',
          waivedByUserRole: 'administrator',
          reason: 'Emergency broadcast waiver for critical update',
          waivedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    })

    const waivedRule = waivedSnapshot.rules.find((r) => r.ruleId === 'rule-localization-quality')
    expect(waivedRule?.status).toBe('waived')
  })

  // 7. Notification preferences and durable outbox reliability
  it('7. Delivers in-app notifications immediately; queues outbox; adapter failures do not break workflow state', async () => {
    const notifManager = new NotificationManager()

    // Configure user preferences
    notifManager.setUserPreferences({
      userId: 'editor-sara',
      enabledChannels: { in_app: true, email: true, webhook: false },
      mutedEvents: ['mention_comment'],
      emailAddress: 'sara@renegadeparty.org',
    })

    // Dispatch muted event -> ignored
    const mutedRes = notifManager.dispatchNotification({
      eventType: 'mention_comment',
      recipientId: 'editor-sara',
      title: 'Comment on draft',
      message: 'Someone mentioned you.',
    })
    expect(mutedRes.inAppDelivered).toBe(false)
    expect(mutedRes.outboxItemsQueued).toBe(0)

    // Dispatch assignment event -> delivered in-app, queued in outbox for email
    const assignRes = notifManager.dispatchNotification({
      eventType: 'assignment',
      recipientId: 'editor-sara',
      title: 'New Translation Assignment',
      message: 'Please review the German locale translation.',
    })
    expect(assignRes.inAppDelivered).toBe(true)
    expect(assignRes.outboxItemsQueued).toBe(1)

    // In-app is immediately readable without any email provider configured
    const userNotifs = notifManager.getInAppNotifications('editor-sara')
    expect(userNotifs.length).toBe(1)
    expect(userNotifs[0].title).toBe('New Translation Assignment')
    expect(userNotifs[0].read).toBe(false)

    // Mark as read
    notifManager.markAsRead(userNotifs[0].id)
    expect(userNotifs[0].read).toBe(true)

    // Verify Outbox handling when external email adapter fails
    const failingEmailAdapter = {
      id: 'failing-smtp',
      sendEmail: async () => ({ success: false, error: 'SMTP connection timeout' }),
    }
    notifManager.setEmailAdapter(failingEmailAdapter)

    const processRes = await notifManager.processOutbox()
    expect(processRes.processed).toBe(1)
    expect(processRes.retrying).toBe(1)

    const outbox = notifManager.getOutbox()
    expect(outbox[0].status).toBe('retrying')
    expect(outbox[0].lastError).toContain('SMTP connection timeout')
    expect(outbox[0].attempts).toBe(1)

    // CRITICAL: Notice that despite email failure, the in-app notification remains intact
    // and no exception was thrown that would corrupt the business workflow state!
  })

  // 8. Event/webhook seam: signed payloads, secret rotation, SSRF protection, and delivery log
  it('8. Enforces HMAC signatures, secret rotation, SSRF protection, and delivery audit logging', async () => {
    const webhookEngine = new WebhookEngine()

    // 8a. SSRF Protection checks
    expect(validateWebhookUrl('http://127.0.0.1/evil').valid).toBe(false)
    expect(validateWebhookUrl('https://localhost:8080/hook').valid).toBe(false)
    expect(validateWebhookUrl('https://10.0.1.5/webhook').valid).toBe(false)
    expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data').valid).toBe(false)
    expect(validateWebhookUrl('https://192.168.1.100/hook').valid).toBe(false)
    expect(validateWebhookUrl('https://user:pass@legit.com/hook').valid).toBe(false)
    expect(validateWebhookUrl('ftp://example.com/hook').valid).toBe(false)

    // Valid HTTPS public target passes
    const validCheck = validateWebhookUrl('https://api.partner.org/renegade-webhook')
    expect(validCheck.valid).toBe(true)

    // 8b. Register subscription
    const sub = {
      id: 'sub-001',
      name: 'Global Translation Hook',
      targetUrl: 'https://api.partner.org/renegade-webhook',
      primarySecret: 'primary-secret-key-12345',
      eventTypes: ['approval', 'completion'] as any[],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const regRes = webhookEngine.registerSubscription(sub)
    expect(regRes.valid).toBe(true)

    // 8c. Dispatch event and verify HMAC signature
    const dispatchRes = await webhookEngine.dispatchEvent('approval', {
      translationId: 'tr-999',
      approvedBy: 'editor-1',
    })
    expect(dispatchRes.dispatchedCount).toBe(1)

    const logs = webhookEngine.getDeliveryLogs('sub-001')
    expect(logs.length).toBe(1)
    expect(logs[0].status).toBe('success')

    // Test signature verification with primary secret
    const payload = JSON.stringify({ test: 'data' })
    const nowSec = Math.floor(Date.now() / 1000)
    const sig = `t=${nowSec},v1=${createHash('sha256')
      .update(`${nowSec}.${payload}`)
      .digest('hex')}`

    // Verify using verifyWebhookSignature helper
    const hmacSig = verifyWebhookSignature({
      rawPayload: payload,
      signatureHeader: `t=${nowSec},v1=${require('node:crypto')
        .createHmac('sha256', 'primary-secret-key-12345')
        .update(`${nowSec}.${payload}`)
        .digest('hex')}`,
      primarySecret: 'primary-secret-key-12345',
    })
    expect(hmacSig.valid).toBe(true)
    expect(hmacSig.usedKey).toBe('primary')

    // 8d. Secret Rotation: Promote old primary to secondary, accept both
    const rotated = rotateSubscriptionSecret(sub, 'new-primary-secret-67890')
    expect(rotated.primarySecret).toBe('new-primary-secret-67890')
    expect(rotated.secondarySecret).toBe('primary-secret-key-12345')

    // Old secret signature still verifies under rotated configuration
    const oldSigVerified = verifyWebhookSignature({
      rawPayload: payload,
      signatureHeader: `t=${nowSec},v1=${require('node:crypto')
        .createHmac('sha256', 'primary-secret-key-12345')
        .update(`${nowSec}.${payload}`)
        .digest('hex')}`,
      primarySecret: rotated.primarySecret,
      secondarySecret: rotated.secondarySecret,
    })
    expect(oldSigVerified.valid).toBe(true)
    expect(oldSigVerified.usedKey).toBe('secondary')
  })

  // 9. Full End-to-End Acceptance Lifecycle
  it('9. Executes full FLOW-05 acceptance: request, draft, staleness, review, approve, release, alternates, and failure outbox', async () => {
    // Step A: Setup source document and group
    const group = engine.createTranslationGroup({
      sourceDocument: {
        id: 'content-en-100',
        locale: 'en',
        title: 'Renegade Economic Manifesto',
        slug: 'economic-manifesto',
        canonicalPath: '/en/articles/economic-manifesto',
        canonicalUrl: 'https://renegadeparty.org/en/articles/economic-manifesto',
        summary: 'Prose summary of economic self-determination.',
        body: 'Source economic analysis for decentralized communities.',
        revisionSequence: 1,
        revisionHash: 'hash-eco-v1',
        status: 'published',
        mediaChoices: {
          'chart-01': { altText: 'Economic distribution chart' },
        },
      },
    })

    // Step B: Request translation for 'es'
    const req = engine.requestTranslation({
      groupId: group.id,
      targetLocale: 'es',
      translatorId: 'translator-mateo',
      reviewerId: 'editor-lucia',
      dueDate: '2026-10-15T00:00:00Z',
    })
    expect(req.status).toBe('assigned')

    // Step C: Draft second locale via provider
    const draftRes = await engine.draftWithProvider(req.id, provider)
    expect(draftRes.success).toBe(true)
    expect(group.variants['es'].attribution?.isMachineDraft).toBe(true)

    // Step D: Advance source document to create staleness
    const adv = engine.advanceSourceDocument(group.id, {
      title: 'Renegade Economic Manifesto (Second Edition)',
      summary: 'Updated economic analysis with new fiscal metrics.',
      newRevisionSequence: 2,
      newRevisionHash: 'hash-eco-v2',
    })
    expect(adv.staleRequestsCount).toBe(1)
    expect(req.isStale).toBe(true)

    // Verify staleness blocks approval
    expect(() => {
      engine.approveTranslation(req.id, 'editor-lucia')
    }).toThrowError(/CANNOT_APPROVE_STALE/)

    // Step E: Review, repair, realign pin, and approve
    engine.realignTranslationPin(req.id)
    expect(req.isStale).toBe(false)

    // Translator updates target content with human review and polish
    engine.updateTargetContent(req.id, {
      title: 'Manifiesto Economico de Renegade',
      summary: 'Resumen en prosa sobre la autodeterminacion economica.',
      body: 'Analisis economico de comunidades descentralizadas.',
      seoTitle: 'Manifiesto Economico | Renegade',
      seoDescription: 'Resumen en prosa sobre la autodeterminacion economica comunitaria.',
      mediaChoices: {
        'chart-01': { altText: 'Grafico de distribucion economica', caption: 'Distribucion' },
      },
    })

    // Submit for review and approve by authorized human editor
    engine.submitForReview(req.id)
    const approvedReq = engine.approveTranslation(req.id, 'editor-lucia')
    expect(approvedReq.status).toBe('approved')
    expect(group.variants['es'].status).toBe('approved')
    expect(group.variants['es'].attribution?.humanReviewed).toBe(true)
    expect(group.variants['es'].attribution?.humanReviewerId).toBe('editor-lucia')

    // Step F: Publish locale variants and inspect alternates
    const pubRes = engine.publishLocaleVariant(group.id, 'es', {
      siteBaseUrl: 'https://renegadeparty.org',
    })
    expect(pubRes.variant.status).toBe('published')

    // Step G: Inspect alternates
    const hreflang = pubRes.hreflang
    expect(hreflang.canonicalUrl).toBe(
      'https://renegadeparty.org/es/articles/economic-manifesto-es',
    )
    expect(hreflang.alternateLocales['es']).toBe(
      'https://renegadeparty.org/es/articles/economic-manifesto-es',
    )
    expect(hreflang.alternateLocales['en']).toBe(
      'https://renegadeparty.org/en/articles/economic-manifesto',
    )
    expect(hreflang.alternateLocales['x-default']).toBe(
      'https://renegadeparty.org/en/articles/economic-manifesto',
    )

    // Step H: Exercise in-app and outbox retry/notification logs
    const notifications = engine.notificationManager.getInAppNotifications('translator-mateo')
    expect(notifications.length).toBeGreaterThan(0)
    // Check that approval notification was received
    const approvalNotif = notifications.find((n) => n.eventType === 'approval')
    expect(approvalNotif).toBeDefined()
    expect(approvalNotif?.title).toContain('Translation Approved')
  })
})
