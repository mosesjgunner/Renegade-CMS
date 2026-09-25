export interface TelemetryMetricDefinition {
  key: string
  label: string
  grain: string
  formula: string
  source: string
  definition: string
  caveats: string[]
  uncertaintyDisclosure: string
}

export const TELEMETRY_METRIC_DEFINITIONS: Record<string, TelemetryMetricDefinition> = {
  page_views: {
    key: 'page_views',
    label: 'Consented Page Views',
    grain: 'Raw event (analytics-events)',
    formula:
      'COUNT(analytics_events WHERE eventType = "page_view" AND consentBasis = "analytics-consent")',
    source: 'First-party client beacon (/api/analytics/collect)',
    definition: 'Total successful page view beacons received from consented visitor sessions.',
    caveats: [
      'Excludes unconsented visitors, bot/crawler user agents, and internal staff sessions.',
      'Subject to ad-blockers and privacy shields; treat as conservative verified floor.',
    ],
    uncertaintyDisclosure:
      'Represents verified consented visits only. Unconsented traffic is reported separately as missing data.',
  },
  unique_visitors: {
    key: 'unique_visitors',
    label: 'Estimated Unique Visitors',
    grain: 'Daily salted anonymous hash rollup',
    formula: 'COUNT(DISTINCT anonymousHash)',
    source: 'Salted first-party anonymousId cookie (renegade-aid)',
    definition: 'Cryptographically hashed daily distinct visitors with active analytics consent.',
    caveats: [
      'Salt rotates across retention windows to prevent long-term cross-window profiling.',
      'Approximate across multi-day rollups due to privacy-safe daily hash rotation.',
    ],
    uncertaintyDisclosure: 'Cross-window deduplication is probabilistic by privacy design.',
  },
  disclosed_campaign_clicks: {
    key: 'disclosed_campaign_clicks',
    label: 'Disclosed Campaign & Referral Touchpoints',
    grain: 'Raw event (analytics-events)',
    formula:
      'COUNT(analytics_events WHERE utm_campaign IS NOT NULL OR ref IS NOT NULL OR channel != "direct")',
    source: 'URL parameters and disclosure-tagged inbound referrals',
    definition:
      'Touchpoints arriving via explicit campaign UTM parameters, partner referral codes, or disclosed affiliate links.',
    caveats: [
      'Only recorded when the visitor grants analytics consent upon landing.',
      'Stripped or truncated UTM parameters by privacy proxies may result in direct classification.',
    ],
    uncertaintyDisclosure:
      'Unconsented arrivals via campaigns cannot be tracked or credited without violating privacy.',
  },
  conversions: {
    key: 'conversions',
    label: 'Verified Goal Conversions',
    grain: 'Raw event reconciled against canonical collection',
    formula: 'COUNT(conversion_events WHERE goalKey MATCHES active_goal)',
    source: 'Canonical forms, subscriptions, orders, and contributions',
    definition:
      'Completion of a tracked business objective (newsletter signup, purchase, donation, registration).',
    caveats: [
      'Reconciled against canonical business records in PostgreSQL.',
      'Failed payments, abandoned carts, and unverified double opt-in signups are excluded.',
    ],
    uncertaintyDisclosure:
      '100% verified when matching canonical orders; labeled as unlinked when visitor identity is absent.',
  },
  conversion_rate: {
    key: 'conversion_rate',
    label: 'Consented Conversion Rate (CR)',
    grain: 'Calculated ratio',
    formula: '(Verified Conversions / Consented Landings) * 100',
    source: 'Aggregated analytics stream',
    definition: 'Percentage of consented visitors who completed the specified goal.',
    caveats: [
      'Calculated over consented sessions only; unconsented visitors are excluded from both numerator and denominator.',
    ],
    uncertaintyDisclosure:
      'Standard error and 95% confidence intervals are displayed where applicable.',
  },
  experiment_exposures: {
    key: 'experiment_exposures',
    label: 'Experiment Variant Exposures',
    grain: 'Raw event (experiment-events & analytics-events)',
    formula: 'COUNT(analytics_events WHERE eventType = "experiment_exposure")',
    source: 'PublicExperiment component render beacon',
    definition: 'Unique verified visitor encounters with a specific experiment variant.',
    caveats: [
      'Deduped per assignment key; repeat pageviews within the same session do not inflate exposures.',
      'Unconsented visitors receive default control without recording an exposure event.',
    ],
    uncertaintyDisclosure:
      'Zero exposure telemetry recorded for privacy-shielded or unconsented traffic.',
  },
  practical_effect: {
    key: 'practical_effect',
    label: 'Practical Effect (Lift)',
    grain: 'Statistical delta',
    formula: 'Treatment CR - Control CR',
    source: 'Variant analysis formula',
    definition:
      'Absolute difference in conversion rate between the treatment variant and the control baseline.',
    caveats: [
      'Must be interpreted in conjunction with sample size and 95% confidence bounds.',
      'Early stopping on small sample sizes (< 100) produces false positive results.',
    ],
    uncertaintyDisclosure:
      'Tiny samples (< 100 per variant) are explicitly flagged with insufficient evidence warnings.',
  },
  financial_gross: {
    key: 'financial_gross',
    label: 'Currency-Separated Gross Volume',
    grain: 'Order / payment snapshot (metric-snapshots)',
    formula: 'SUM(grossMinor) GROUP BY settlementCurrency',
    source: 'Canonical orders and settled payment records',
    definition:
      'Total monetary value processed before fees and refunds, strictly segregated by ISO currency.',
    caveats: [
      'Never merged across distinct currencies without explicit historical exchange rates.',
      'Reported in minor units (e.g., cents, pence) to prevent floating point inaccuracies.',
    ],
    uncertaintyDisclosure:
      'Distinguishes between settled payments and provider-reported pending attempts.',
  },
}
