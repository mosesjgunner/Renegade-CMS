/**
 * TELEMETRY & EXPERIMENT CONTRACT INVENTORY
 *
 * Formal registry of all event sources, grain definitions, identity linkage models,
 * retention policies, suppression rules, and reconciliation mappings against
 * canonical content, audience, community, and commerce records.
 */

export type EventSourceId =
  | 'web-client-telemetry'
  | 'consent-lifecycle'
  | 'audience-crm'
  | 'community-interactions'
  | 'commerce-financial'
  | 'experiment-lifecycle'
  | 'suppression-ledger'

export type EventGrain =
  | 'raw-event'
  | 'daily-rollup'
  | 'campaign-rollup'
  | 'content-rollup'
  | 'channel-rollup'
  | 'goal-rollup'
  | 'order-snapshot'
  | 'delivery-snapshot'

export type IdentityLinkageModel =
  | 'consented-salted-hash'
  | 'member-authenticated'
  | 'privacy-default-unlinked'
  | 'suppressed-masked'

export type ReconciliationTarget =
  | 'canonical-content'
  | 'canonical-audience'
  | 'canonical-community'
  | 'canonical-commerce'
  | 'none'

export interface EventSourceInventoryItem {
  id: EventSourceId
  name: string
  collection: string
  primaryGrain: EventGrain
  supportedGrains: readonly EventGrain[]
  identityLinkage: IdentityLinkageModel
  retentionDays: number | 'permanent'
  suppressionBehavior: string
  reconciliationTarget: ReconciliationTarget
  canonicalCollections: readonly string[]
  uncertaintyDisclosures: readonly string[]
}

export const TELEMETRY_EVENT_INVENTORY: readonly EventSourceInventoryItem[] = [
  {
    id: 'web-client-telemetry',
    name: 'First-Party Client Web Telemetry',
    collection: 'analytics-events',
    primaryGrain: 'raw-event',
    supportedGrains: ['raw-event', 'daily-rollup', 'campaign-rollup', 'content-rollup', 'goal-rollup'],
    identityLinkage: 'consented-salted-hash',
    retentionDays: 90,
    suppressionBehavior: 'Excluded if subject matches suppression hash; never joined with suppressed visitor identities.',
    reconciliationTarget: 'canonical-content',
    canonicalCollections: ['content', 'publications', 'page-layouts'],
    uncertaintyDisclosures: [
      'Filtered when DNT/GPC headers are present or consent is not granted.',
      'Unique visitor counts are salted daily hashes and approximate across rollup windows.',
      'Client-side ad-blockers may prevent beacon delivery; treat as lower-bound baseline.',
    ],
  },
  {
    id: 'consent-lifecycle',
    name: 'Consent & Privacy Preference Evidence',
    collection: 'analytics-consent-records',
    primaryGrain: 'raw-event',
    supportedGrains: ['raw-event', 'daily-rollup'],
    identityLinkage: 'consented-salted-hash',
    retentionDays: 'permanent',
    suppressionBehavior: 'Suppression records maintained separately in suppressions collection; withdrawals generate immutable audit records.',
    reconciliationTarget: 'canonical-audience',
    canonicalCollections: ['consent-events', 'subscribers', 'suppressions'],
    uncertaintyDisclosures: [
      'Reflects verified browser storage; does not imply email or telecom marketing consent.',
      'Withdrawals immediately purge active session and anonymous tracking cookies.',
    ],
  },
  {
    id: 'audience-crm',
    name: 'Audience & Form Interactions',
    collection: 'form-submissions',
    primaryGrain: 'raw-event',
    supportedGrains: ['raw-event', 'campaign-rollup', 'goal-rollup'],
    identityLinkage: 'member-authenticated',
    retentionDays: 730,
    suppressionBehavior: 'Suppressed emails blocked from campaigns and masked with < 5 privacy floor in reports.',
    reconciliationTarget: 'canonical-audience',
    canonicalCollections: ['form-definitions', 'contacts', 'subscribers', 'audience-lists'],
    uncertaintyDisclosures: [
      'Submissions require double opt-in confirmation before inclusion in verified audience reach.',
      'Honeypot, challenge, and rate-limited entries are isolated from conversion metrics.',
    ],
  },
  {
    id: 'community-interactions',
    name: 'Community & Discussion Telemetry',
    collection: 'activity-events',
    primaryGrain: 'raw-event',
    supportedGrains: ['raw-event', 'content-rollup'],
    identityLinkage: 'member-authenticated',
    retentionDays: 365,
    suppressionBehavior: 'Blocked members and quarantined posts scrubbed from public projections.',
    reconciliationTarget: 'canonical-community',
    canonicalCollections: ['members', 'comments', 'forum_discussions', 'community_reports'],
    uncertaintyDisclosures: [
      'Public engagement metrics reflect non-quarantined content only.',
      'Direct message metadata excludes message body content for end-to-end privacy.',
    ],
  },
  {
    id: 'commerce-financial',
    name: 'Commerce, Orders & Payment Snapshots',
    collection: 'metric-snapshots',
    primaryGrain: 'order-snapshot',
    supportedGrains: ['order-snapshot', 'daily-rollup', 'campaign-rollup'],
    identityLinkage: 'member-authenticated',
    retentionDays: 'permanent',
    suppressionBehavior: 'Suppression does not delete financial audit records required by legal or tax regulations.',
    reconciliationTarget: 'canonical-commerce',
    canonicalCollections: ['orders', 'contributions', 'affiliate-referrals', 'subscriptions'],
    uncertaintyDisclosures: [
      'Currency separation is strictly enforced: distinct presentment/settlement currencies are never summed without provenance-tagged exchange rates.',
      'Distinguishes reconciled canonical payments, provider-reported webhooks, and estimated affiliate commissions.',
    ],
  },
  {
    id: 'experiment-lifecycle',
    name: 'Experience Experiments & Variant Outcomes',
    collection: 'experiment-events',
    primaryGrain: 'raw-event',
    supportedGrains: ['raw-event', 'goal-rollup'],
    identityLinkage: 'consented-salted-hash',
    retentionDays: 90,
    suppressionBehavior: 'Suppressed visitors receive deterministic control and generate zero experiment telemetry.',
    reconciliationTarget: 'canonical-audience',
    canonicalCollections: ['experiments', 'experiment-variants', 'experiment-decisions', 'conversion-goals'],
    uncertaintyDisclosures: [
      'Unconsented or privacy-controlled visitors are served the control variant with isDefault: true.',
      'Early stopping prohibited: statistical significance requires sample size >= 100 per variant.',
      'Winner selection requires explicit human operator approval and recorded rationale.',
    ],
  },
  {
    id: 'suppression-ledger',
    name: 'Suppression & Right-to-be-Forgotten Ledger',
    collection: 'suppressions',
    primaryGrain: 'raw-event',
    supportedGrains: ['raw-event'],
    identityLinkage: 'suppressed-masked',
    retentionDays: 'permanent',
    suppressionBehavior: 'Authoritative barrier: hashed emails are permanently blocked from outbound dispatch and masked in reports.',
    reconciliationTarget: 'canonical-audience',
    canonicalCollections: ['subscribers', 'contacts', 'telecom-deliveries'],
    uncertaintyDisclosures: [
      'One-way SHA-256 hashed emails prevent re-identification while preserving compliance audit proof.',
      'Never exposed in cleartext in operator reporting surfaces.',
    ],
  },
]
