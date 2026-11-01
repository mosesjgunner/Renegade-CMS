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
      'Excludes unconsented visitors, bot/crawler user agents, and requests marked internal.',
      'Subject to ad-blockers and privacy shields; treat as lower bound of client observations.',
    ],
    uncertaintyDisclosure:
      'Represents consented client observations only. Unconsented traffic is reported separately as missing data.',
  },
  unique_visitors: {
    key: 'unique_visitors',
    label: 'Estimated Unique Visitors',
    grain: 'Site-scoped consent subject over retained events',
    formula: 'COUNT(DISTINCT anonymousHash)',
    source: 'Server-derived site-scoped consent subject hash',
    definition:
      'Distinct consent subjects represented in retained accepted events; not a count of people.',
    caveats: [
      'Subject hashes are site-scoped and linked events are purged on withdrawal.',
      'Multiple browsers and cleared consent cookies can count one person more than once.',
    ],
    uncertaintyDisclosure: 'Consent subjects do not establish unique human identity.',
  },
  disclosed_campaign_clicks: {
    key: 'disclosed_campaign_clicks',
    label: 'Disclosed Campaign & Referral Touchpoints',
    grain: 'Raw event (analytics-events)',
    formula: 'COUNT(current_consent_page_views WHERE utm_campaign IS NOT NULL)',
    source: 'Observed minimal UTM campaign labels on consented page views',
    definition:
      'Observed campaign landings with self-reported UTM labels; not proof of external link clicks.',
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
    formula: 'COUNT(DISTINCT canonical sourceEventId with same-subject prior campaign landing)',
    source: 'Canonical form submissions and authorized observations of paid order receipts',
    definition:
      'Persisted form submissions and paid order receipt observations linked to current analytics consent.',
    caveats: [
      'Reconciled against canonical business records in PostgreSQL.',
      'Failed payments, abandoned carts, and unverified double opt-in signups are excluded.',
    ],
    uncertaintyDisclosure:
      'Only persisted canonical outcomes are verified; browser observations alone cannot establish a business conversion.',
  },
  conversion_rate: {
    key: 'conversion_rate',
    label: 'Consented Conversion Rate (CR)',
    grain: 'Calculated ratio',
    formula: '(Distinct converted consent subjects / Distinct landing consent subjects) * 100',
    source: 'Aggregated analytics stream',
    definition: 'Percentage of consented visitors who completed the specified goal.',
    caveats: [
      'Calculated over consented sessions only; unconsented visitors are excluded from both numerator and denominator.',
    ],
    uncertaintyDisclosure:
      'Descriptive same-subject linkage, not evidence of causation or cross-device identity.',
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
    grain: 'Canonical order created within selected window',
    formula: 'SUM(orders.amountMinor WHERE paid state AND receipt) GROUP BY currency',
    source: 'Canonical orders and settled payment records',
    definition:
      'Gross presentment value of paid, fulfilling or fulfilled receipted orders; refunded orders excluded.',
    caveats: [
      'Never merged across distinct currencies without explicit historical exchange rates.',
      'Reported in minor units (e.g., cents, pence) to prevent floating point inaccuracies.',
    ],
    uncertaintyDisclosure:
      'Provider payout, fees and net settlement unknown; snapshots never added to canonical orders.',
  },
}
