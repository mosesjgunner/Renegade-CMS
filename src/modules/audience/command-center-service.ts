/**
 * AUD-07: Audience Command Center Domain Services.
 *
 * Implements bounded experiments, deterministic recipient hashing, bot filtering,
 * privacy-aware link attribution, deliverability health monitoring, funnel projections,
 * and privacy-safe CSV export.
 */

import { createHash } from 'node:crypto'
import {
  type AudienceCommandCenterHealth,
  type AudienceExperiment,
  type BotClassification,
  type CampaignFunnelProjection,
  type CampaignTrackingParams,
  type CohortBreakdownCell,
  type DeliverabilityAlertSeverity,
  type ExperimentWinnerDecision,
  type FunnelStageData,
  type UnifiedCampaignCalendarItem,
  PRIVACY_MASKED_VALUE,
  PRIVACY_MIN_COHORT_SIZE,
  applyPrivacyThreshold,
} from './command-center-contracts'

// ============================================================================
// 1. Deterministic Recipient Allocation for Experiments
// ============================================================================

/**
 * Assigns a subscriber to an experiment variant using deterministic cryptographic hashing.
 *
 * INVARIANT:
 * - Deterministic: Given the same experimentId and subscriberId, the assignment is 100% reproducible.
 * - Uniform distribution: Uses SHA-256 hash modulo 100 across variant allocation percentages.
 * - Immutable: Does not reassign recipients mid-test; does not mutate subscriber or contact rows.
 */
export function assignRecipientToVariant(
  experimentId: string,
  subscriberId: string,
  variants: readonly { id: string; allocationPercent: number }[],
): string {
  if (!variants.length) throw new Error('Experiment must define at least one variant.')
  if (variants.length === 1) return variants[0].id

  // Validate allocation sum equals 100%
  const totalAllocation = variants.reduce((sum, v) => sum + v.allocationPercent, 0)
  if (totalAllocation !== 100) {
    throw new Error(`Variant allocations must total 100%, got ${totalAllocation}%.`)
  }

  // Hash input: experimentId:subscriberId
  const seed = `${experimentId}:${subscriberId}`
  const hash = createHash('sha256').update(seed).digest('hex')

  // Use first 8 hex characters (32-bit unsigned int) modulo 100 -> bucket [0..99]
  const intVal = Number.parseInt(hash.slice(0, 8), 16)
  const bucket = intVal % 100

  let cumulative = 0
  for (const variant of variants) {
    cumulative += variant.allocationPercent
    if (bucket < cumulative) {
      return variant.id
    }
  }

  return variants[variants.length - 1].id
}

/**
 * Computes an immutable allocations fingerprint hash for an experiment and its recipient snapshot.
 */
export function computeExperimentAllocationsHash(
  experimentId: string,
  recipientIds: readonly string[],
  variants: readonly { id: string; allocationPercent: number }[],
): string {
  const assignments = recipientIds
    .map((id) => `${id}->${assignRecipientToVariant(experimentId, id, variants)}`)
    .sort()
    .join(';')
  return createHash('sha256').update(assignments).digest('hex')
}

// ============================================================================
// 2. Bounded Experiment Guardrails & Manual Winner Decision
// ============================================================================

export type ExperimentGuardrailCheckResult = {
  breached: boolean
  autoPaused: boolean
  warnings: string[]
}

/**
 * Evaluates statistical sample size and safety guardrails (bounce/complaint limits).
 */
export function evaluateExperimentGuardrails(
  experiment: AudienceExperiment,
): ExperimentGuardrailCheckResult {
  const warnings: string[] = []
  let breached = false
  let autoPaused = false

  const minRequiredTotal = experiment.guardrails.minSampleSize * experiment.variants.length
  if (experiment.totalAllocated < minRequiredTotal) {
    warnings.push(
      `Sample size warning: Total allocated (${experiment.totalAllocated}) is below recommended minimum (${minRequiredTotal}) for statistical significance.`,
    )
  }

  for (const variant of experiment.variants) {
    if (variant.sampleSize > 0) {
      const bounceRate = (variant.bounces / variant.sampleSize) * 100
      if (bounceRate > experiment.guardrails.maxBounceRatePercent) {
        warnings.push(
          `Guardrail breach on ${variant.label}: Bounce rate (${bounceRate.toFixed(1)}%) exceeds limit (${experiment.guardrails.maxBounceRatePercent}%).`,
        )
        breached = true
        autoPaused = true
      }

      const complaintRate = (variant.complaints / variant.sampleSize) * 100
      if (complaintRate > experiment.guardrails.maxComplaintRatePercent) {
        warnings.push(
          `CRITICAL guardrail breach on ${variant.label}: Complaint rate (${complaintRate.toFixed(2)}%) exceeds limit (${experiment.guardrails.maxComplaintRatePercent}%).`,
        )
        breached = true
        autoPaused = true
      }
    }
  }

  return { breached, autoPaused, warnings }
}

/**
 * Records a human operator winner decision for a bounded experiment.
 *
 * INVARIANT:
 * - Manual operator action is strictly required.
 * - No automatic winner deployment without explicit approved policy.
 * - Winner decision is recorded with operator identity, timestamp, and rationale.
 */
export function recordExperimentWinnerDecision(
  experiment: AudienceExperiment,
  input: {
    winningVariantId: string
    decidedBy: string
    rationale: string
    manualConfirmation: boolean
  },
): AudienceExperiment {
  if (!input.manualConfirmation) {
    throw new Error('Manual confirmation by authorized operator is required to declare a winner.')
  }
  const variantExists = experiment.variants.some((v) => v.id === input.winningVariantId)
  if (!variantExists) {
    throw new Error(`Variant "${input.winningVariantId}" does not exist in experiment.`)
  }
  if (!input.decidedBy.trim()) {
    throw new Error('Operator identity is required to record winner decision.')
  }
  if (!input.rationale.trim()) {
    throw new Error('Operator decision rationale is required.')
  }

  const decision: ExperimentWinnerDecision = {
    winningVariantId: input.winningVariantId,
    decidedBy: input.decidedBy,
    decidedAt: new Date().toISOString(),
    decisionRationale: input.rationale,
    manualConfirmation: true,
    autoDeployed: false, // Invariant: manual decision, no auto-deploy
  }

  return {
    ...experiment,
    status: 'concluded',
    concludedAt: new Date().toISOString(),
    winnerDecision: decision,
  }
}

// ============================================================================
// 3. Bot Click Filtering & Classification
// ============================================================================

const SECURITY_SCANNER_PATTERNS = [
  /barracuda/i,
  /proofpoint/i,
  /mimecast/i,
  /symantec/i,
  /fireeye/i,
  /trendmicro/i,
  /sophos/i,
  /kaspersky/i,
  /fortinet/i,
  /cyren/i,
  /ironport/i,
  /cisco/i,
  /spamexperts/i,
  /mailchannels/i,
  /messagelabs/i,
  /forcepoint/i,
  /zscaler/i,
  /avast/i,
  /bitdefender/i,
]

const SEARCH_CRAWLER_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
  /applebot/i,
]

const HEADLESS_TOOL_PATTERNS = [
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /playwright/i,
  /puppeteer/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /axios\//i,
  /go-http-client/i,
  /apache-httpclient/i,
]

/**
 * Classifies an incoming link request or open beacon for known security crawlers and prefetch bots.
 * Preserves bot counts separately and prevents false engagement inflation.
 */
export function classifyClickAgent(
  userAgent?: string,
  headers: Record<string, string | string[] | undefined> = {},
): BotClassification {
  const ua = userAgent ?? ''

  // 1. Check HTTP Prefetch / Preview headers
  const getHeader = (key: string): string => {
    const val = headers[key] || headers[key.toLowerCase()]
    return Array.isArray(val) ? val.join(',') : (val ?? '')
  }

  const purpose = getHeader('purpose') || getHeader('sec-purpose') || getHeader('x-purpose')
  if (/prefetch|preview/i.test(purpose)) {
    return {
      isBot: true,
      botType: 'prefetch_engine',
      confidence: 'high',
      reason: `HTTP Purpose header indicates prefetch/preview: "${purpose}"`,
    }
  }

  // 2. Check Corporate Security Scanners (frequent automated link pre-clickers)
  for (const pattern of SECURITY_SCANNER_PATTERNS) {
    if (pattern.test(ua)) {
      return {
        isBot: true,
        botType: 'security_scanner',
        confidence: 'high',
        reason: `User-Agent matches email security gateway scanner: ${pattern.source}`,
      }
    }
  }

  // 3. Check Search / Social Link Preview Crawlers
  for (const pattern of SEARCH_CRAWLER_PATTERNS) {
    if (pattern.test(ua)) {
      return {
        isBot: true,
        botType: 'search_crawler',
        confidence: 'high',
        reason: `User-Agent matches web crawler / preview bot: ${pattern.source}`,
      }
    }
  }

  // 4. Check Headless automation / script libraries
  for (const pattern of HEADLESS_TOOL_PATTERNS) {
    if (pattern.test(ua)) {
      return {
        isBot: true,
        botType: 'headless',
        confidence: 'high',
        reason: `User-Agent matches automated HTTP library or headless browser: ${pattern.source}`,
      }
    }
  }

  // 5. Generic bot keywords
  if (/\b(bot|crawler|spider|scraper|transcoder)\b/i.test(ua)) {
    return {
      isBot: true,
      botType: 'search_crawler',
      confidence: 'probable',
      reason: 'User-Agent contains generic bot keyword',
    }
  }

  return {
    isBot: false,
    botType: 'human',
    confidence: 'probable',
    reason: 'Standard consumer browser headers observed',
  }
}

// ============================================================================
// 4. Privacy-Aware Link & Conversion Attribution
// ============================================================================

/**
 * Builds a privacy-respecting campaign tracking URL.
 *
 * Invariant:
 * - If `directLinkOnly` is true or visitor opt-out is requested, returns the clean baseUrl with NO tracking parameters.
 * - Uses first-party parameters (`rcid`, `rcch`, `rcvar`).
 * - Never includes cross-site third-party ad networks, fingerprinting, or tracking pixels.
 */
export function buildCampaignTrackingUrl(baseUrl: string, params: CampaignTrackingParams): string {
  if (params.directLinkOnly) {
    return baseUrl
  }

  try {
    const url = new URL(baseUrl, 'https://renegade.local')
    url.searchParams.set('rcid', params.campaignId)
    url.searchParams.set('rcch', params.channel)
    if (params.variantId) {
      url.searchParams.set('rcvar', params.variantId)
    }

    // If original was relative, return relative string
    if (baseUrl.startsWith('/')) {
      return `${url.pathname}${url.search}${url.hash}`
    }
    return url.toString()
  } catch {
    // Fallback simple concatenation if URL parse fails
    const delimiter = baseUrl.includes('?') ? '&' : '?'
    const variantPart = params.variantId ? `&rcvar=${encodeURIComponent(params.variantId)}` : ''
    return `${baseUrl}${delimiter}rcid=${encodeURIComponent(params.campaignId)}&rcch=${encodeURIComponent(params.channel)}${variantPart}`
  }
}

// ============================================================================
// 5. Funnel & Cohort Projections with Privacy Threshold Masking
// ============================================================================

export type RawCampaignFunnelInput = {
  campaignId: string
  campaignTitle: string
  channel: 'email' | 'sms' | 'rcs' | 'multi'
  provider: string
  windowStart: string
  windowEnd: string
  counts: {
    eligible: number
    attempted: number
    accepted: number
    delivered: number
    observedOpensConfirmed: number
    observedOpensProxyCached: number
    observedClicksHuman: number
    observedClicksBot: number
    conversions: number
  }
  cohorts: Array<{
    dimension: 'segment' | 'list' | 'source' | 'language' | 'channel'
    key: string
    label: string
    eligible: number
    delivered: number
    observedOpens: number
    observedClicks: number
    conversions: number
  }>
}

/**
 * Projects an honest, source-labeled campaign funnel with explicit proxy uncertainty and privacy masking.
 */
export function projectCampaignFunnel(input: RawCampaignFunnelInput): CampaignFunnelProjection {
  const { counts } = input

  const totalOpensMax = counts.observedOpensConfirmed + counts.observedOpensProxyCached

  const stages: FunnelStageData[] = [
    {
      stage: 'eligible',
      label: 'Eligible Snapshot',
      count: applyPrivacyThreshold(counts.eligible),
      rawCount: counts.eligible,
      rateFromPrevious: 1.0,
      rateFromTop: 1.0,
      status: 'factual',
    },
    {
      stage: 'attempted',
      label: 'Attempted Dispatch',
      count: applyPrivacyThreshold(counts.attempted),
      rawCount: counts.attempted,
      rateFromPrevious: counts.eligible > 0 ? counts.attempted / counts.eligible : 0,
      rateFromTop: counts.eligible > 0 ? counts.attempted / counts.eligible : 0,
      status: 'factual',
    },
    {
      stage: 'accepted',
      label: 'Provider Accepted (Sent)',
      count: applyPrivacyThreshold(counts.accepted),
      rawCount: counts.accepted,
      rateFromPrevious: counts.attempted > 0 ? counts.accepted / counts.attempted : 0,
      rateFromTop: counts.eligible > 0 ? counts.accepted / counts.eligible : 0,
      uncertainty: 'Upstream MTA/gateway handoff; not proof of inbox arrival',
      status: 'factual',
    },
    {
      stage: 'delivered',
      label: 'Confirmed Delivered',
      count: applyPrivacyThreshold(counts.delivered),
      rawCount: counts.delivered,
      rateFromPrevious: counts.accepted > 0 ? counts.delivered / counts.accepted : 0,
      rateFromTop: counts.eligible > 0 ? counts.delivered / counts.eligible : 0,
      uncertainty: input.channel === 'sms' ? 'Network DLR' : 'DLR / SMTP 250 verified',
      status: 'factual',
    },
    {
      stage: 'observed_opens',
      label: 'Observed Opens (Range)',
      count: `${applyPrivacyThreshold(counts.observedOpensConfirmed)} - ${applyPrivacyThreshold(totalOpensMax)}`,
      rawCount: counts.observedOpensConfirmed,
      rateFromPrevious: counts.delivered > 0 ? counts.observedOpensConfirmed / counts.delivered : 0,
      rateFromTop: counts.eligible > 0 ? counts.observedOpensConfirmed / counts.eligible : 0,
      uncertainty: `Includes ${counts.observedOpensProxyCached} Apple MPP / image proxy cached opens`,
      status: 'estimated',
    },
    {
      stage: 'observed_clicks',
      label: 'Human Clicks (Bot-Filtered)',
      count: applyPrivacyThreshold(counts.observedClicksHuman),
      rawCount: counts.observedClicksHuman,
      rateFromPrevious: counts.delivered > 0 ? counts.observedClicksHuman / counts.delivered : 0,
      rateFromTop: counts.eligible > 0 ? counts.observedClicksHuman / counts.eligible : 0,
      uncertainty: `Filtered ${counts.observedClicksBot} scanner/crawler pre-clicks`,
      status: 'factual',
    },
    {
      stage: 'conversions',
      label: 'Attributed Conversions',
      count: applyPrivacyThreshold(counts.conversions),
      rawCount: counts.conversions,
      rateFromPrevious:
        counts.observedClicksHuman > 0 ? counts.conversions / counts.observedClicksHuman : 0,
      rateFromTop: counts.eligible > 0 ? counts.conversions / counts.eligible : 0,
      uncertainty: 'First-party goal attribution (7-day window)',
      status: 'factual',
    },
  ]

  const cohortBreakdown: CohortBreakdownCell[] = input.cohorts.map((c) => {
    const isMasked =
      c.eligible < PRIVACY_MIN_COHORT_SIZE ||
      c.delivered < PRIVACY_MIN_COHORT_SIZE ||
      c.conversions < PRIVACY_MIN_COHORT_SIZE

    return {
      dimension: c.dimension,
      key: c.key,
      label: c.label,
      eligible: applyPrivacyThreshold(c.eligible),
      delivered: applyPrivacyThreshold(c.delivered),
      observedOpens: applyPrivacyThreshold(c.observedOpens),
      observedClicks: applyPrivacyThreshold(c.observedClicks),
      conversions: applyPrivacyThreshold(c.conversions),
      rawConversions: c.conversions,
      isMasked,
    }
  })

  return {
    campaignId: input.campaignId,
    campaignTitle: input.campaignTitle,
    channel: input.channel,
    provider: input.provider,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    stages,
    openUncertaintyRange: {
      minimumConfirmed: counts.observedOpensConfirmed,
      maximumPossible: totalOpensMax,
      proxyCachedCount: counts.observedOpensProxyCached,
    },
    cohortBreakdown,
    privacyNotice: `Cells with fewer than ${PRIVACY_MIN_COHORT_SIZE} interactions are masked (${PRIVACY_MASKED_VALUE}) to protect subscriber anonymity.`,
  }
}

// ============================================================================
// 6. Deliverability & System Health Evaluator
// ============================================================================

export type RawHealthEvaluationInput = {
  siteId: string
  emailProviderStatus: 'healthy' | 'degraded' | 'disabled'
  emailProviderName: string
  spfVerified: boolean
  dkimVerified: boolean
  dmarcVerified: boolean
  tlsVerified: boolean
  telecomProviderStatus: 'healthy' | 'degraded' | 'disabled'
  telecomProviderName: string
  telecomOutboundAllowed: boolean
  totalSentRecently: number
  hardBouncesRecently: number
  complaintsRecently: number
  queueAgeMinutesMax: number
  webhookLagSecondsMax: number
  staleSegmentCount: number
  invalidFormCount: number
  failingAutomationsCount: number
}

/**
 * Computes health metrics against deliverability industry thresholds and surfaces direct remediations.
 */
export function evaluateAudienceHealth(
  input: RawHealthEvaluationInput,
): AudienceCommandCenterHealth {
  const bounceRate =
    input.totalSentRecently > 0 ? (input.hardBouncesRecently / input.totalSentRecently) * 100 : 0
  const complaintRate =
    input.totalSentRecently > 0 ? (input.complaintsRecently / input.totalSentRecently) * 100 : 0

  const bounceSeverity: DeliverabilityAlertSeverity =
    bounceRate >= 4.0 ? 'critical' : bounceRate >= 2.0 ? 'warning' : 'normal'
  const complaintSeverity: DeliverabilityAlertSeverity =
    complaintRate >= 0.2 ? 'critical' : complaintRate >= 0.1 ? 'warning' : 'normal'
  const queueSeverity: DeliverabilityAlertSeverity =
    input.queueAgeMinutesMax >= 1440
      ? 'critical'
      : input.queueAgeMinutesMax >= 60
        ? 'warning'
        : 'normal'
  const webhookSeverity: DeliverabilityAlertSeverity =
    input.webhookLagSecondsMax >= 3600
      ? 'critical'
      : input.webhookLagSecondsMax >= 300
        ? 'warning'
        : 'normal'

  const remediations: AudienceCommandCenterHealth['remediationsAvailable'] = []

  if (bounceSeverity !== 'normal') {
    remediations.push({
      id: 'rem-bounce-hygiene',
      title: 'Review Bounce Rate & Suppressions',
      description: `Hard bounce rate is ${bounceRate.toFixed(1)}% (threshold 2.0%). Review recently imported lists and purge unconfirmed contacts.`,
      actionKey: 'review_bounce_suppressions',
      severity: bounceSeverity,
    })
  }

  if (complaintSeverity !== 'normal') {
    remediations.push({
      id: 'rem-complaint-pause',
      title: 'Immediate Campaign Pause & Consent Audit',
      description: `Spam complaint rate is ${complaintRate.toFixed(2)}% (threshold 0.10%). Pause running marketing campaigns immediately to protect domain reputation.`,
      actionKey: 'pause_marketing_campaigns',
      severity: complaintSeverity,
    })
  }

  if (input.invalidFormCount > 0) {
    remediations.push({
      id: 'rem-invalid-forms',
      title: 'Quarantine Invalid Forms',
      description: `${input.invalidFormCount} form(s) have missing legal consent revisions or schema validation errors.`,
      actionKey: 'quarantine_invalid_forms',
      severity: 'warning',
    })
  }

  if (input.staleSegmentCount > 0) {
    remediations.push({
      id: 'rem-refresh-segments',
      title: 'Refresh Stale Segments',
      description: `${input.staleSegmentCount} audience segment(s) have not been evaluated in over 24 hours.`,
      actionKey: 'refresh_stale_segments',
      severity: 'advisory',
    })
  }

  if (input.failingAutomationsCount > 0) {
    remediations.push({
      id: 'rem-retry-automations',
      title: 'Inspect Failing Automations',
      description: `${input.failingAutomationsCount} automation run(s) encountered execution errors and require inspection.`,
      actionKey: 'inspect_failing_automations',
      severity: 'warning',
    })
  }

  if (queueSeverity !== 'normal') {
    remediations.push({
      id: 'rem-queue-workers',
      title: 'Inspect Delivery Queue Backlog',
      description: `Delivery items queued for ${input.queueAgeMinutesMax} minutes without dispatch. Check worker process status.`,
      actionKey: 'check_queue_workers',
      severity: queueSeverity,
    })
  }

  return {
    siteId: input.siteId,
    evaluatedAt: new Date().toISOString(),
    providers: {
      email: {
        provider: input.emailProviderName,
        status: input.emailProviderStatus,
        spfVerified: input.spfVerified,
        dkimVerified: input.dkimVerified,
        dmarcVerified: input.dmarcVerified,
        tlsVerified: input.tlsVerified,
        readiness:
          input.spfVerified && input.dkimVerified && input.emailProviderStatus === 'healthy'
            ? 'ready'
            : 'degraded',
      },
      telecom: {
        provider: input.telecomProviderName,
        status: input.telecomProviderStatus,
        outboundAllowed: input.telecomOutboundAllowed,
        routesActive: ['SMS-GSM7', 'SMS-UCS2', 'RCS-Jibe'],
      },
    },
    metrics: {
      hardBounceRate: {
        key: 'hard_bounce_rate',
        title: 'Hard Bounce Rate',
        currentValue: bounceRate,
        formattedValue: `${bounceRate.toFixed(2)}%`,
        thresholdWarning: 2.0,
        thresholdCritical: 4.0,
        severity: bounceSeverity,
        trend: bounceRate > 2.0 ? 'worsening' : 'stable',
        explanation: 'Percentage of dispatched envelopes rejected permanently by destination MTA.',
        remediationAction: 'Purge stale contacts and require double-opt-in for public forms.',
      },
      complaintRate: {
        key: 'complaint_rate',
        title: 'Spam Complaint Rate',
        currentValue: complaintRate,
        formattedValue: `${complaintRate.toFixed(3)}%`,
        thresholdWarning: 0.1,
        thresholdCritical: 0.2,
        severity: complaintSeverity,
        trend: complaintRate > 0.1 ? 'worsening' : 'stable',
        explanation: 'ISP feedback loop (FBL) complaint reports. Google/Yahoo limit is 0.10%.',
        remediationAction: 'Ensure clear 1-click unsubscribe links and audited double opt-in.',
      },
      queueAgeMinutes: {
        key: 'queue_age_minutes',
        title: 'Oldest Queued Job Age',
        currentValue: input.queueAgeMinutesMax,
        formattedValue: `${input.queueAgeMinutesMax} min`,
        thresholdWarning: 60,
        thresholdCritical: 1440,
        severity: queueSeverity,
        trend: input.queueAgeMinutesMax > 60 ? 'worsening' : 'stable',
        explanation: 'Age of oldest pending delivery record awaiting transport worker pickup.',
      },
      webhookLagSeconds: {
        key: 'webhook_lag_seconds',
        title: 'Webhook Callback Lag',
        currentValue: input.webhookLagSecondsMax,
        formattedValue: `${input.webhookLagSecondsMax} sec`,
        thresholdWarning: 300,
        thresholdCritical: 3600,
        severity: webhookSeverity,
        trend: 'stable',
        explanation:
          'Latency between provider dispatch and delivery receipt / event webhook ingestion.',
      },
      staleSegmentCount: {
        key: 'stale_segment_count',
        title: 'Stale Audience Segments',
        currentValue: input.staleSegmentCount,
        formattedValue: String(input.staleSegmentCount),
        thresholdWarning: 1,
        thresholdCritical: 5,
        severity: input.staleSegmentCount > 0 ? 'advisory' : 'normal',
        trend: 'stable',
        explanation: 'Segments that have not been re-evaluated within their 24h freshness window.',
      },
      invalidFormCount: {
        key: 'invalid_form_count',
        title: 'Invalid Forms / Schemas',
        currentValue: input.invalidFormCount,
        formattedValue: String(input.invalidFormCount),
        thresholdWarning: 1,
        thresholdCritical: 3,
        severity: input.invalidFormCount > 0 ? 'warning' : 'normal',
        trend: 'stable',
        explanation: 'Forms with missing reviewed consent or broken conditional field validation.',
      },
      failingAutomationsCount: {
        key: 'failing_automations_count',
        title: 'Failing Automation Runs',
        currentValue: input.failingAutomationsCount,
        formattedValue: String(input.failingAutomationsCount),
        thresholdWarning: 1,
        thresholdCritical: 5,
        severity: input.failingAutomationsCount > 0 ? 'warning' : 'normal',
        trend: 'stable',
        explanation: 'Automation triggers that encountered unhandled action failures.',
      },
    },
    remediationsAvailable: remediations,
  }
}

// ============================================================================
// 7. Unified Campaign Calendar Projector
// ============================================================================

export type RawCalendarItemInput = {
  id: string
  siteId: string
  title: string
  channel: 'email' | 'sms' | 'rcs'
  itemType: 'campaign' | 'automation' | 'digest'
  status:
    | 'draft'
    | 'review'
    | 'approved'
    | 'scheduled'
    | 'running'
    | 'completed'
    | 'paused'
    | 'cancelled'
  scheduledFor: string | null
  completedAt: string | null
  timeZone: string
  targetAudienceLabel: string
  estimatedRecipients: number
  targetSegmentId?: string
  releaseReferenceId?: string
  releaseTitle?: string
}

/**
 * Merges Email, SMS, RCS campaigns and automations into a single unified schedule,
 * detecting frequency conflicts and quiet hours violations.
 */
export function projectUnifiedAudienceCalendar(
  items: readonly RawCalendarItemInput[],
  options: { referenceDate?: Date } = {},
): UnifiedCampaignCalendarItem[] {
  const now = options.referenceDate ?? new Date()

  return items.map((item, index) => {
    const warnings: string[] = []
    let hasFrequencyConflict = false
    let isWithinQuietHours = false

    // Check frequency conflict: another campaign scheduled on the same date targeting same segment
    if (item.scheduledFor && item.targetSegmentId) {
      const itemDate = item.scheduledFor.slice(0, 10)
      const conflicting = items.find(
        (other, oIdx) =>
          oIdx !== index &&
          other.targetSegmentId === item.targetSegmentId &&
          other.scheduledFor &&
          other.scheduledFor.slice(0, 10) === itemDate &&
          other.status !== 'cancelled' &&
          other.status !== 'draft',
      )

      if (conflicting) {
        hasFrequencyConflict = true
        warnings.push(
          `Frequency Conflict: Overlaps with "${conflicting.title}" on ${itemDate} targeting the same segment.`,
        )
      }
    }

    // Check quiet hours (8:00 AM to 9:00 PM local time)
    if (item.scheduledFor && (item.channel === 'sms' || item.channel === 'rcs')) {
      try {
        const d = new Date(item.scheduledFor)
        const hourFormatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: item.timeZone || 'UTC',
        })
        const hour = Number.parseInt(hourFormatter.format(d), 10)
        // Quiet hours: before 8 AM (08:00) or at/after 9 PM (21:00)
        if (hour < 8 || hour >= 21) {
          isWithinQuietHours = true
          warnings.push(
            `Quiet Hours Warning: Scheduled for ${hour}:00 in ${item.timeZone}. TCPA marketing window is 8:00 AM - 9:00 PM.`,
          )
        }
      } catch {
        // Safe fallback if timezone invalid
      }
    }

    return {
      id: item.id,
      siteId: item.siteId,
      title: item.title,
      itemType: item.itemType,
      channel: item.channel,
      status: item.status,
      scheduledFor: item.scheduledFor,
      completedAt: item.completedAt,
      timeZone: item.timeZone,
      targetAudienceLabel: item.targetAudienceLabel,
      estimatedRecipients: item.estimatedRecipients,
      releaseReferenceId: item.releaseReferenceId,
      releaseTitle: item.releaseTitle,
      warnings,
      hasFrequencyConflict,
      isWithinQuietHours,
    }
  })
}

// ============================================================================
// 8. Privacy-Preserving CSV & Report Export
// ============================================================================

export type AudienceReportExportInput = {
  siteId: string
  userRole: string
  windowLabel: string
  metrics: Array<{
    key: string
    label: string
    channel: string
    count: number
    definition: string
    caveats: string
  }>
  cohorts: Array<{
    dimension: string
    label: string
    eligible: number
    delivered: number
    observedClicks: number
    conversions: number
  }>
}

/**
 * Generates an exportable CSV report with strict role verification and privacy threshold enforcement.
 *
 * Invariant:
 * - Requires 'owner', 'administrator', or 'staff' role.
 * - Counts < 5 are masked with '< 5' to preserve k-anonymity.
 * - Never includes contact PII (emails, phone numbers) or sensitive form inputs in aggregate export.
 */
export function exportAudienceSummaryReport(input: AudienceReportExportInput): {
  csv: string
  filename: string
  privacyStatement: string
} {
  const allowedRoles = ['owner', 'administrator', 'staff']
  if (!allowedRoles.includes(input.userRole)) {
    throw new Error('Unauthorized: Audience summary export requires staff or administrator role.')
  }

  const lines: string[] = []

  // Header metadata
  lines.push('# Renegade CMoS Audience Operational Summary')
  lines.push(`# Site ID: ${input.siteId}`)
  lines.push(`# Report Window: ${input.windowLabel}`)
  lines.push(`# Generated At: ${new Date().toISOString()}`)
  lines.push(`# Role: ${input.userRole}`)
  lines.push(
    `# Privacy Assertion: All cohorts with < ${PRIVACY_MIN_COHORT_SIZE} subjects are masked ("${PRIVACY_MASKED_VALUE}"). No individual contact engagement records are exposed.`,
  )
  lines.push('')

  // Section 1: Key Metrics
  lines.push('Metric Key,Label,Channel,Value,Definition,Caveats')
  for (const m of input.metrics) {
    const val = applyPrivacyThreshold(m.count)
    const escapedDef = `"${m.definition.replace(/"/g, '""')}"`
    const escapedCav = `"${m.caveats.replace(/"/g, '""')}"`
    lines.push(`${m.key},"${m.label}",${m.channel},${val},${escapedDef},${escapedCav}`)
  }

  lines.push('')

  // Section 2: Cohort Breakdowns
  lines.push('Dimension,Cohort,Eligible,Delivered,Observed Clicks,Conversions')
  for (const c of input.cohorts) {
    const eligible = applyPrivacyThreshold(c.eligible)
    const delivered = applyPrivacyThreshold(c.delivered)
    const clicks = applyPrivacyThreshold(c.observedClicks)
    const conversions = applyPrivacyThreshold(c.conversions)
    lines.push(`"${c.dimension}","${c.label}",${eligible},${delivered},${clicks},${conversions}`)
  }

  const filename = `audience-report-${input.siteId}-${new Date().toISOString().slice(0, 10)}.csv`
  const privacyStatement = `Privacy threshold applied: Any cell with count < ${PRIVACY_MIN_COHORT_SIZE} is masked as "${PRIVACY_MASKED_VALUE}". Individual identities are protected.`

  return {
    csv: lines.join('\n'),
    filename,
    privacyStatement,
  }
}
