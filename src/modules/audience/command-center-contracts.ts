/**
 * AUD-07: Audience Command Center Contracts & Metric Dictionary.
 *
 * Establishes formal source-labeled metric definitions, privacy threshold rules,
 * bounded experiment boundaries, bot filtering taxonomy, and unified calendar models.
 */

import { createHash } from 'node:crypto'

// ============================================================================
// 1. Privacy Threshold & Data Protection Constants
// ============================================================================

/** Minimum cohort/cell count to display or export without masking (k-anonymity floor). */
export const PRIVACY_MIN_COHORT_SIZE = 5

/** Privacy-safe display value for counts below threshold */
export const PRIVACY_MASKED_VALUE = '< 5'

export function applyPrivacyThreshold(count: number, threshold = PRIVACY_MIN_COHORT_SIZE): string | number {
  if (count === 0) return 0
  if (count < threshold) return PRIVACY_MASKED_VALUE
  return count
}

export function isPrivacyMasked(value: string | number): boolean {
  return value === PRIVACY_MASKED_VALUE
}

// ============================================================================
// 2. Metric Dictionary & Source-Labeled Event Model
// ============================================================================

export type MetricCategory =
  | 'acquisition'
  | 'deliverability'
  | 'engagement'
  | 'retention'
  | 'conversion'

export type ChannelScope = 'email' | 'sms' | 'rcs' | 'multi' | 'web'

export type MetricDictionaryEntry = {
  key: string
  label: string
  category: MetricCategory
  channel: ChannelScope
  numerator: string
  denominator: string | null
  window: string
  formula: string
  definition: string
  caveats: string[]
  uncertaintyLabel?: string
  source: string
}

export const AUDIENCE_METRIC_DICTIONARY: readonly MetricDictionaryEntry[] = [
  {
    key: 'form_views',
    label: 'Form Impressions',
    category: 'acquisition',
    channel: 'web',
    numerator: 'Direct first-party form component renders',
    denominator: null,
    window: 'Event timestamp',
    formula: 'COUNT(form_view_events)',
    definition: 'Count of unique page renders containing the published form schema.',
    caveats: [
      'Measured client-side without third-party surveillance scripts.',
      'Subject to browser ad-blockers and privacy shields; treat as a lower-bound estimate.',
    ],
    uncertaintyLabel: 'Estimated lower bound',
    source: 'First-party PublicForm mount telemetry',
  },
  {
    key: 'form_submissions',
    label: 'Form Submissions',
    category: 'acquisition',
    channel: 'web',
    numerator: 'Validated form submissions accepted by server',
    denominator: 'form_views (when available)',
    window: 'Event timestamp',
    formula: 'COUNT(form_submissions WHERE status = "received")',
    definition: 'Successful form submission payloads validated against immutable schema snapshot.',
    caveats: [
      'Excludes honeypot rejections, validation errors, and rate-limited attempts.',
      'Does not equate to verified double-opt-in subscribers.',
    ],
    source: 'canonical `form-submissions` collection',
  },
  {
    key: 'double_opt_in_sent',
    label: 'Confirmations Dispatched',
    category: 'acquisition',
    channel: 'email',
    numerator: 'Single-use hashed confirmation tokens dispatched',
    denominator: 'form_submissions requiring confirmation',
    window: '24-hour expiration window',
    formula: 'COUNT(subscriber_confirmation_tokens)',
    definition: 'Opaque cryptographically signed confirmation invitations dispatched to subscriber.',
    caveats: ['One token per subscriber per 24 hours; expired tokens are pruned.'],
    source: '`subscriber-confirmation-tokens` outbox',
  },
  {
    key: 'double_opt_in_confirmed',
    label: 'Confirmed Opt-Ins',
    category: 'acquisition',
    channel: 'email',
    numerator: 'Consumed confirmation tokens',
    denominator: 'double_opt_in_sent',
    window: '24-hour token validity',
    formula: 'COUNT(consent_events WHERE event = "double-opt-in-confirmed")',
    definition: 'Subscribers who verified ownership by consuming their unique confirmation token.',
    caveats: ['Requires valid unexpired token; consumed once and rendered immutable.'],
    source: '`consent-events` ledger',
  },
  {
    key: 'eligible_snapshot',
    label: 'Eligible Audience Snapshot',
    category: 'deliverability',
    channel: 'multi',
    numerator: 'Subscribers active, unsuppressed, matching segment rules',
    denominator: null,
    window: 'Send-time snapshot creation',
    formula: 'COUNT(recipient_snapshot_members)',
    definition: 'Exact pinned recipient list evaluated at approval before worker dispatch.',
    caveats: [
      'Frozen at campaign approval.',
      'Recipients who withdraw consent between snapshot and dispatch are suppressed at send time.',
    ],
    source: '`recipient-snapshots`',
  },
  {
    key: 'dispatch_attempted',
    label: 'Dispatch Attempted',
    category: 'deliverability',
    channel: 'multi',
    numerator: 'Deliveries claimed by outbox worker',
    denominator: 'eligible_snapshot',
    window: 'Job execution batch',
    formula: 'COUNT(deliveries WHERE status IN ("sending", "accepted", "delivered", "bounced", "failed"))',
    definition: 'Outbox records passed to channel transport adapter after suppression re-check.',
    caveats: ['Excludes deliveries cancelled due to send-time suppression or quiet-hours hold.'],
    source: '`email-deliveries` / `telecom-deliveries`',
  },
  {
    key: 'provider_accepted',
    label: 'Provider Accepted (Sent)',
    category: 'deliverability',
    channel: 'multi',
    numerator: 'Transport envelope accepted by upstream gateway',
    denominator: 'dispatch_attempted',
    window: 'Immediate transport response',
    formula: 'COUNT(deliveries WHERE status = "accepted")',
    definition: 'Upstream gateway (SMTP MTA or Twilio API) accepted message for transmission; not proof of recipient inbox placement.',
    caveats: [
      'CRITICAL: "Accepted" is transport handoff, NOT proof of recipient inbox placement or handset arrival.',
      'SMTP 250 OK or Telecom 201 Created only proves provider enqueue.',
    ],
    uncertaintyLabel: 'Transport handoff only; not inbox receipt',
    source: 'Provider API / SMTP return code',
  },
  {
    key: 'carrier_delivered',
    label: 'Confirmed Delivered',
    category: 'deliverability',
    channel: 'multi',
    numerator: 'Deliveries verified by carrier DLR or recipient mailserver',
    denominator: 'provider_accepted',
    window: 'Up to 72h webhook callback',
    formula: 'COUNT(delivery_events WHERE event = "delivered")',
    definition: 'Cryptographically verified Delivery Receipt (DLR) from carrier or DSN delivery confirmation.',
    caveats: [
      'For SMS: Network carrier DLR.',
      'For RCS: Device read/delivery receipt.',
      'For Email: Only available where downstream MTA returns positive DSN (many consumer MTAs do not).',
    ],
    uncertaintyLabel: 'Provider DLR coverage varies by carrier',
    source: 'Verified provider webhook DLR',
  },
  {
    key: 'deferred_transient',
    label: 'Deferred / Retryable',
    category: 'deliverability',
    channel: 'multi',
    numerator: 'Transient 4xx MTA deferrals or carrier 429 backoff',
    denominator: 'dispatch_attempted',
    window: 'Retry policy backoff (up to 24h)',
    formula: 'COUNT(deliveries WHERE status = "deferred")',
    definition: 'Deliveries temporarily queued for retry due to rate limiting or temporary carrier congestion.',
    caveats: ['Automatically retried using exponential backoff with jitter.'],
    source: 'Transport error handler',
  },
  {
    key: 'hard_bounced',
    label: 'Permanent Hard Bounce',
    category: 'deliverability',
    channel: 'multi',
    numerator: 'Permanent 5xx rejections (invalid mailbox, unallocated number)',
    denominator: 'provider_accepted',
    window: 'Delivery response or bounce webhook',
    formula: 'COUNT(deliveries WHERE status = "bounced")',
    definition: 'Permanent destination failure. Automatically creates canonical suppression record.',
    caveats: [
      'Warning threshold: > 2.0% signals severe domain or list hygiene issues.',
      'Subscribers are immediately suppressed.',
    ],
    source: 'SMTP 5xx / Telecom invalid number callback',
  },
  {
    key: 'spam_complaint',
    label: 'Spam Complaint',
    category: 'deliverability',
    channel: 'email',
    numerator: 'Feedback loop (FBL) complaint reports received',
    denominator: 'provider_accepted',
    window: 'Callback receipt',
    formula: 'COUNT(delivery_events WHERE event = "complaint")',
    definition: 'Recipient clicked "Report Spam" in mail client, routed via ISP Feedback Loop.',
    caveats: [
      'Critical threshold: > 0.1% risks ISP-wide domain blocking.',
      'Immediately creates suppression record and cancels queued sends.',
    ],
    source: 'Signed provider FBL webhook',
  },
  {
    key: 'unsubscribed',
    label: 'Unsubscribe / Opt-Out',
    category: 'retention',
    channel: 'multi',
    numerator: 'Signed token unsubscribes or inbound STOP keywords',
    denominator: 'provider_accepted',
    window: 'Session or SMS inbound',
    formula: 'COUNT(consent_events WHERE event IN ("preference-withdrawn", "unsubscribe"))',
    definition: 'Explicit user-initiated revocation of marketing consent.',
    caveats: ['Permanent until explicit re-opt-in with affirmative evidence.'],
    source: 'Preference token or Inbound STOP handler',
  },
  {
    key: 'observed_opens',
    label: 'Observed Opens (with Proxy Uncertainty)',
    category: 'engagement',
    channel: 'email',
    numerator: 'Observed image beacon or link-implied fetches',
    denominator: 'provider_accepted',
    window: '30 days post-dispatch',
    formula: 'COUNT(DISTINCT delivery_id WHERE open_observed)',
    definition: 'Observed image asset fetch. Explicitly separated into human-likely vs proxy/bot cached.',
    caveats: [
      'Apple Mail Privacy Protection (MPP) and Google Image Proxies prefetch images automatically.',
      'Exact open truth is impossible; reports must display min-confirmed and max-possible uncertainty range.',
    ],
    uncertaintyLabel: 'Proxy cache & bot prefetch uncertainty: ±20-35%',
    source: 'Image proxy header analysis & fetch telemetry',
  },
  {
    key: 'observed_clicks',
    label: 'Human-Filtered Clicks',
    category: 'engagement',
    channel: 'multi',
    numerator: 'First-party link clicks after bot and prefetch removal',
    denominator: 'provider_accepted',
    window: '30 days post-dispatch',
    formula: 'COUNT(DISTINCT delivery_id WHERE click_observed AND NOT is_bot)',
    definition: 'Interactive URL navigations from message content, with known bot scanners and security crawlers filtered.',
    caveats: [
      'Corporate email scanners (Barracuda, Proofpoint, Mimecast) pre-click links to scan malware.',
      'Scanners are identified by header signatures and excluded from human totals.',
    ],
    uncertaintyLabel: 'Known bot filters applied; residual scanner noise possible',
    source: 'First-party link redirect router',
  },
  {
    key: 'inbound_replies',
    label: 'Inbound Replies',
    category: 'engagement',
    channel: 'multi',
    numerator: 'Inbound SMS/RCS messages or monitored email replies',
    denominator: 'provider_accepted',
    window: '14 days post-dispatch',
    formula: 'COUNT(telecom_inbound_messages WHERE keyword_type != "stop")',
    definition: 'Conversational replies from recipients routed to staff workflow inbox.',
    caveats: ['Exclude automated keyword opt-outs (STOP, UNSUBSCRIBE).'],
    source: 'Telecom inbound webhook / reply inbox',
  },
  {
    key: 'attributed_conversions',
    label: 'Configured Conversions',
    category: 'conversion',
    channel: 'multi',
    numerator: 'First-party goal completions linked to campaign ID',
    denominator: 'observed_clicks',
    window: 'Configured window (default 7 days)',
    formula: 'COUNT(attributed_goal_events WHERE campaign_id = target.id)',
    definition: 'Completed site goals (e.g. form submission, donation, purchase, registration) attributed to campaign.',
    caveats: [
      'Uses first-party campaign parameters (?rcid=).',
      'No third-party cross-site fingerprinting or dark tracking.',
      'Supports first-touch and last-non-direct models.',
    ],
    source: '`analytics-events` goal attribution',
  },
] as const

// ============================================================================
// 3. Funnel & Cohort Projections with Privacy Thresholds
// ============================================================================

export type FunnelStageData = {
  stage: string
  label: string
  count: number | string // formatted with PRIVACY_MASKED_VALUE if < 5
  rawCount: number
  rateFromPrevious: number | null
  rateFromTop: number | null
  uncertainty?: string
  status: 'factual' | 'estimated' | 'delayed' | 'missing'
}

export type CohortBreakdownCell = {
  dimension: 'segment' | 'list' | 'source' | 'language' | 'channel'
  key: string
  label: string
  eligible: number | string
  delivered: number | string
  observedOpens: number | string
  observedClicks: number | string
  conversions: number | string
  rawConversions: number
  isMasked: boolean
}

export type CampaignFunnelProjection = {
  campaignId: string
  campaignTitle: string
  channel: ChannelScope
  provider: string
  windowStart: string
  windowEnd: string
  stages: FunnelStageData[]
  openUncertaintyRange: {
    minimumConfirmed: number
    maximumPossible: number
    proxyCachedCount: number
  }
  cohortBreakdown: CohortBreakdownCell[]
  privacyNotice: string
}

// ============================================================================
// 4. Bounded Message Experiments Contracts
// ============================================================================

export type ExperimentStatus = 'draft' | 'running' | 'completed' | 'concluded' | 'aborted'

export type ExperimentMetric = 'open_rate' | 'click_rate' | 'conversion_rate'

export type ExperimentVariant = {
  id: string
  label: string
  subject?: string
  fromName?: string
  contentPreview: string
  allocationPercent: number
  sampleSize: number
  observedOpens: number
  observedClicks: number
  conversions: number
  bounces: number
  complaints: number
}

export type ExperimentGuardrails = {
  maxBounceRatePercent: number // e.g. 5.0%
  maxComplaintRatePercent: number // e.g. 0.2%
  minSampleSize: number // e.g. 100 recipients per variant
}

export type ExperimentWinnerDecision = {
  winningVariantId: string | null
  decidedBy: string | null
  decidedAt: string | null
  decisionRationale: string | null
  manualConfirmation: boolean
  autoDeployed: false // Invariant: automatic deployment prohibited
}

export type AudienceExperiment = {
  id: string
  siteId: string
  title: string
  hypothesis: string
  channel: 'email' | 'sms' | 'rcs'
  metric: ExperimentMetric
  windowHours: number
  status: ExperimentStatus
  variants: [ExperimentVariant, ExperimentVariant, ...ExperimentVariant[]]
  guardrails: ExperimentGuardrails
  totalAllocated: number
  startedAt: string | null
  concludedAt: string | null
  allocationsHash: string | null
  winnerDecision: ExperimentWinnerDecision
  warnings: string[]
}

// ============================================================================
// 5. Bot Filtering and Privacy Attribution Contracts
// ============================================================================

export type BotClassification = {
  isBot: boolean
  botType: 'security_scanner' | 'search_crawler' | 'prefetch_engine' | 'headless' | 'human'
  confidence: 'high' | 'probable' | 'uncertain'
  reason: string
}

export type CampaignTrackingParams = {
  campaignId: string
  variantId?: string
  channel: 'email' | 'sms' | 'rcs'
  directLinkOnly?: boolean
}

// ============================================================================
// 6. Unified Campaign & Automation Calendar Contracts
// ============================================================================

export type CampaignOrAutomationState =
  | 'draft'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'paused'
  | 'cancelled'

export type UnifiedCampaignCalendarItem = {
  id: string
  siteId: string
  title: string
  itemType: 'campaign' | 'automation' | 'digest'
  channel: 'email' | 'sms' | 'rcs'
  status: CampaignOrAutomationState
  scheduledFor: string | null
  completedAt: string | null
  timeZone: string
  targetAudienceLabel: string
  estimatedRecipients: number
  releaseReferenceId?: string
  releaseTitle?: string
  warnings: string[]
  hasFrequencyConflict: boolean
  isWithinQuietHours: boolean
}

// ============================================================================
// 7. Deliverability & System Health Contracts
// ============================================================================

export type DeliverabilityAlertSeverity = 'normal' | 'advisory' | 'warning' | 'critical'

export type DeliverabilityHealthMetric = {
  key: string
  title: string
  currentValue: number
  formattedValue: string
  thresholdWarning: number
  thresholdCritical: number
  severity: DeliverabilityAlertSeverity
  trend: 'improving' | 'stable' | 'worsening'
  explanation: string
  remediationAction?: string
}

export type AudienceCommandCenterHealth = {
  siteId: string
  evaluatedAt: string
  providers: {
    email: {
      provider: string
      status: 'healthy' | 'degraded' | 'disabled'
      spfVerified: boolean
      dkimVerified: boolean
      dmarcVerified: boolean
      tlsVerified: boolean
      readiness: 'ready' | 'unconfigured' | 'degraded'
    }
    telecom: {
      provider: string
      status: 'healthy' | 'degraded' | 'disabled'
      outboundAllowed: boolean
      routesActive: string[]
    }
  }
  metrics: {
    hardBounceRate: DeliverabilityHealthMetric
    complaintRate: DeliverabilityHealthMetric
    queueAgeMinutes: DeliverabilityHealthMetric
    webhookLagSeconds: DeliverabilityHealthMetric
    staleSegmentCount: DeliverabilityHealthMetric
    invalidFormCount: DeliverabilityHealthMetric
    failingAutomationsCount: DeliverabilityHealthMetric
  }
  remediationsAvailable: Array<{
    id: string
    title: string
    description: string
    actionKey: string
    targetId?: string
    severity: DeliverabilityAlertSeverity
  }>
}
