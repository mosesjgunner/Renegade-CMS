import type { ReleaseGateRuleWaiver } from '../../releases/contracts'
import { assertHumanReviewApproved } from './adapter'
import { evaluateTranslationCompleteness } from './completeness'
import type {
  LocaleVariant,
  SourceRevisionPin,
  TranslationGroup,
  TranslationRequest,
} from './contracts'
import { computeHreflangAlternates } from './hreflang'

export interface LocalizationPolicyEvaluationContext {
  variant: LocaleVariant
  group: TranslationGroup
  request?: TranslationRequest
  sourceRevision?: { sequence: number; hash: string }
  sourceMediaRights?: Record<string, { status: string; expiresAt?: string }>
  existingWaivers?: Record<string, ReleaseGateRuleWaiver>
  siteBaseUrl?: string
  now?: string
}

export interface LocalizationPolicyRuleResult {
  ruleId: string
  ruleVersion: string
  name: string
  severity: 'blocker' | 'warning'
  status: 'passed' | 'failed' | 'waived'
  message: string
  repairUrl?: string
  waiver?: ReleaseGateRuleWaiver
  details?: Record<string, unknown>
}

export interface LocalizationPolicyReport {
  overallStatus: 'passed' | 'warnings' | 'blocked'
  blockerCount: number
  warningCount: number
  rules: LocalizationPolicyRuleResult[]
}

/**
 * Evaluates the full deterministic localization quality policy for a locale variant.
 * Supports rule versions, blockers, warnings, role-authorized waivers, and direct repair links.
 */
export function evaluateLocalizationQualityPolicy(
  context: LocalizationPolicyEvaluationContext,
): LocalizationPolicyReport {
  const now = context.now ? new Date(context.now) : new Date()
  const waivers = context.existingWaivers || {}
  const repairPrefix = '/admin/workflow/translations'
  const targetId = context.variant.documentId

  const rules: LocalizationPolicyRuleResult[] = []

  const checkWaiver = (ruleId: string): ReleaseGateRuleWaiver | undefined => {
    const w = waivers[ruleId]
    if (!w) return undefined
    if (new Date(w.expiresAt) <= now) return undefined
    return w
  }

  // 1. Rule: Translation Staleness Check
  const sourceRevision = context.sourceRevision || {
    sequence: context.group.variants[context.group.sourceLocale]?.revisionSequence || 1,
    hash: context.group.variants[context.group.sourceLocale]?.revisionHash || '',
  }
  const pinnedRevision = context.request?.sourceRevisionPin

  let isStale = false
  let staleMessage = 'Translation is synchronized with current source revision.'

  if (pinnedRevision) {
    if (
      sourceRevision.sequence > pinnedRevision.sequence ||
      (pinnedRevision.hash && sourceRevision.hash !== pinnedRevision.hash)
    ) {
      isStale = true
      staleMessage = `Translation is stale: source document advanced from revision ${pinnedRevision.sequence} to ${sourceRevision.sequence}.`
    }
  }

  const staleWaiver = checkWaiver('rule-translation-staleness')
  rules.push({
    ruleId: 'rule-translation-staleness',
    ruleVersion: 'v1.0',
    name: 'Translation Staleness & Source Synchronization',
    severity: 'blocker',
    status: !isStale ? 'passed' : staleWaiver ? 'waived' : 'failed',
    message: staleMessage,
    repairUrl: `${repairPrefix}?id=${targetId}&action=realign`,
    waiver: staleWaiver,
    details: {
      pinnedSequence: pinnedRevision?.sequence,
      currentSourceSequence: sourceRevision.sequence,
    },
  })

  // 2. Rule: Mandatory Human Review & Approval for Machine Drafts
  const humanApprovalCheck = assertHumanReviewApproved(context.variant)
  const approvalWaiver = checkWaiver('rule-translation-human-approval')
  rules.push({
    ruleId: 'rule-translation-human-approval',
    ruleVersion: 'v1.0',
    name: 'Mandatory Human Review and Approval',
    severity: 'blocker',
    status: humanApprovalCheck.approved ? 'passed' : approvalWaiver ? 'waived' : 'failed',
    message: humanApprovalCheck.approved
      ? 'Variant has verified human review and editorial approval.'
      : humanApprovalCheck.reason || 'Human review is required.',
    repairUrl: `${repairPrefix}?id=${targetId}&action=review`,
    waiver: approvalWaiver,
    details: {
      isMachineDraft: context.variant.attribution?.isMachineDraft,
      humanReviewed: context.variant.attribution?.humanReviewed,
      reviewerId: context.variant.attribution?.humanReviewerId,
    },
  })

  // 3. Rule: Side-by-Side Completeness & Unsupported Node Check
  const sourceVariant = context.group.variants[context.group.sourceLocale]
  const completenessReport = evaluateTranslationCompleteness({
    source: {
      title: sourceVariant?.title || '',
      summary: sourceVariant?.summary,
      body: sourceVariant?.body,
      seoTitle: sourceVariant?.seoTitle,
      seoDescription: sourceVariant?.seoDescription,
    },
    target: {
      id: context.variant.documentId,
      title: context.variant.title,
      summary: context.variant.summary,
      body: context.variant.body,
      mediaChoices: context.variant.mediaChoices,
      seoTitle: context.variant.seoTitle,
      seoDescription: context.variant.seoDescription,
    },
  })

  const completenessWaiver = checkWaiver('rule-translation-completeness')
  const hasCompletenessBlockers = completenessReport.blockers.length > 0
  rules.push({
    ruleId: 'rule-translation-completeness',
    ruleVersion: 'v1.0',
    name: 'Structured Content & Node Completeness',
    severity: 'blocker',
    status: !hasCompletenessBlockers ? 'passed' : completenessWaiver ? 'waived' : 'failed',
    message: !hasCompletenessBlockers
      ? `Structured completeness verified (score: ${completenessReport.score}%).`
      : `Found ${completenessReport.blockers.length} completeness blocker(s): ${completenessReport.blockers.map((b) => b.message).join('; ')}`,
    repairUrl:
      completenessReport.blockers[0]?.repairUrl ||
      `${repairPrefix}?id=${targetId}&focus=completeness`,
    waiver: completenessWaiver,
    details: {
      score: completenessReport.score,
      blockers: completenessReport.blockers,
      warnings: completenessReport.warnings,
    },
  })

  // 4. Rule: Hreflang Alternates & Phantom Language Elimination
  let hreflangPassed = true
  let hreflangMessage = 'Locale hreflang alternates are consistent and free of phantom languages.'
  try {
    const hreflang = computeHreflangAlternates(
      context.group,
      context.variant.locale,
      context.siteBaseUrl || 'https://example.com',
    )
    // Verify self-reference
    if (!hreflang.alternateLocales[context.variant.locale]) {
      hreflangPassed = false
      hreflangMessage = `Missing mandatory self-referencing hreflang alternate for locale '${context.variant.locale}'.`
    }
  } catch (err: any) {
    hreflangPassed = false
    hreflangMessage = `Hreflang computation error: ${err?.message || err}`
  }

  const hreflangWaiver = checkWaiver('rule-translation-hreflang-consistency')
  rules.push({
    ruleId: 'rule-translation-hreflang-consistency',
    ruleVersion: 'v1.0',
    name: 'Hreflang Canonical Consistency and Phantom Elimination',
    severity: 'blocker',
    status: hreflangPassed ? 'passed' : hreflangWaiver ? 'waived' : 'failed',
    message: hreflangMessage,
    repairUrl: `${repairPrefix}?id=${targetId}&focus=hreflang`,
    waiver: hreflangWaiver,
  })

  // 5. Rule: Localized Media Choices & Rights Clearance
  const mediaRights = context.sourceMediaRights || {}
  const expiredOrUnapprovedMedia: string[] = []
  if (context.variant.mediaChoices) {
    for (const [mediaId, choice] of Object.entries(context.variant.mediaChoices)) {
      const rights = mediaRights[mediaId]
      if (rights) {
        if (rights.status && rights.status !== 'approved') {
          expiredOrUnapprovedMedia.push(`${mediaId} (rights status: ${rights.status})`)
        }
        if (rights.expiresAt && new Date(rights.expiresAt) <= now) {
          expiredOrUnapprovedMedia.push(`${mediaId} (rights expired at ${rights.expiresAt})`)
        }
      }
    }
  }

  const mediaRightsWaiver = checkWaiver('rule-translation-media-rights')
  const hasMediaRightsIssues = expiredOrUnapprovedMedia.length > 0
  rules.push({
    ruleId: 'rule-translation-media-rights',
    ruleVersion: 'v1.0',
    name: 'Localized Media Choices and Rights Clearance',
    severity: 'blocker',
    status: !hasMediaRightsIssues ? 'passed' : mediaRightsWaiver ? 'waived' : 'failed',
    message: !hasMediaRightsIssues
      ? 'All localized media choices have verified active rights clearance.'
      : `Localized media choices with rights violations: ${expiredOrUnapprovedMedia.join('; ')}`,
    repairUrl: `/admin/media?focus=${context.variant.documentId}`,
    waiver: mediaRightsWaiver,
    details: { expiredOrUnapprovedMedia },
  })

  const blockers = rules.filter((r) => r.severity === 'blocker' && r.status === 'failed')
  const warningList = rules.filter((r) => r.severity === 'warning' && r.status === 'failed')

  const overallStatus =
    blockers.length > 0 ? 'blocked' : warningList.length > 0 ? 'warnings' : 'passed'

  return {
    overallStatus,
    blockerCount: blockers.length,
    warningCount: warningList.length,
    rules,
  }
}
