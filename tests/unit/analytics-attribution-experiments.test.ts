import { describe, expect, it } from 'vitest'
import {
  attributeCampaignFunnel,
  attributePath,
  maskSuppressedIdentity,
  SUPPRESSED_MASK,
  sumCompatibleMetricValues,
  type FirstPartyEvent,
  type MetricSnapshot,
  ANALYTICS_SCHEMA_VERSION,
} from '../../src/modules/analytics/contracts'
import { TELEMETRY_EVENT_INVENTORY } from '../../src/modules/analytics/inventory'
import { TELEMETRY_METRIC_DEFINITIONS } from '../../src/modules/analytics/definitions'
import {
  analyzeExperiment,
  approveWinner,
  deterministicAssignment,
} from '../../src/modules/experiences/contracts'

const makeEvent = (
  id: string,
  eventType: FirstPartyEvent['eventType'],
  occurredAt: string,
  overrides: Partial<FirstPartyEvent> = {},
): FirstPartyEvent => ({
  id,
  eventType,
  occurredAt,
  receivedAt: occurredAt,
  identity: { anonymousId: 'anon-visitor-1', sessionId: 'sess-visitor-1' },
  context: { siteId: 'site-1', channel: 'newsletter', campaignId: 'autumn-sovereign-launch' },
  consentBasis: 'analytics-consent',
  schemaVersion: ANALYTICS_SCHEMA_VERSION,
  trusted: false,
  dedupeKey: `site-1:event:${id}:${eventType}`,
  ...overrides,
})

describe('Telemetry & Experiment Contracts — Prompt 5', () => {
  describe('Event Source Inventory & Metric Definitions', () => {
    it('inventories all 7 canonical event sources with defined grains and reconciliation targets', () => {
      expect(TELEMETRY_EVENT_INVENTORY).toHaveLength(7)
      const ids = TELEMETRY_EVENT_INVENTORY.map((item) => item.id)
      expect(ids).toContain('web-client-telemetry')
      expect(ids).toContain('consent-lifecycle')
      expect(ids).toContain('audience-crm')
      expect(ids).toContain('community-interactions')
      expect(ids).toContain('commerce-financial')
      expect(ids).toContain('experiment-lifecycle')
      expect(ids).toContain('suppression-ledger')

      // Validate retention policies
      const webTelemetry = TELEMETRY_EVENT_INVENTORY.find((i) => i.id === 'web-client-telemetry')!
      expect(webTelemetry.retentionDays).toBe(90)
      expect(webTelemetry.canonicalCollections).toContain('content')

      const commerce = TELEMETRY_EVENT_INVENTORY.find((i) => i.id === 'commerce-financial')!
      expect(commerce.retentionDays).toBe('permanent')
      expect(commerce.reconciliationTarget).toBe('canonical-commerce')
    })

    it('contains formal definitions and uncertainty disclosures for all core metrics', () => {
      const keys = Object.keys(TELEMETRY_METRIC_DEFINITIONS)
      expect(keys).toContain('page_views')
      expect(keys).toContain('unique_visitors')
      expect(keys).toContain('disclosed_campaign_clicks')
      expect(keys).toContain('conversions')
      expect(keys).toContain('conversion_rate')
      expect(keys).toContain('experiment_exposures')
      expect(keys).toContain('practical_effect')
      expect(keys).toContain('financial_gross')

      for (const def of Object.values(TELEMETRY_METRIC_DEFINITIONS)) {
        expect(def.formula.length).toBeGreaterThan(5)
        expect(def.grain.length).toBeGreaterThan(3)
        expect(def.uncertaintyDisclosure.length).toBeGreaterThan(10)
      }
    })
  })

  describe('Campaign Funnel Attribution & Uncertainty Modeling', () => {
    it('attributes a consented multi-touch journey with disclosed UTM parameters', () => {
      const events: FirstPartyEvent[] = [
        makeEvent('click-1', 'click_internal', '2026-09-01T10:00:00Z', {
          context: {
            siteId: 'site-1',
            channel: 'newsletter',
            campaignId: 'autumn-sovereign-launch',
            utm: {
              utm_source: 'dispatch-42',
              utm_medium: 'email',
              utm_campaign: 'autumn-sovereign-launch',
            },
          },
        }),
        makeEvent('view-1', 'page_view', '2026-09-01T10:00:05Z', {
          context: {
            siteId: 'site-1',
            channel: 'newsletter',
            path: '/articles/sovereign-protocol',
          },
        }),
        makeEvent('read-1', 'read_depth', '2026-09-01T10:02:30Z', {
          context: {
            siteId: 'site-1',
            channel: 'newsletter',
            path: '/articles/sovereign-protocol',
          },
        }),
        makeEvent('signup-1', 'signup', '2026-09-01T10:05:00Z', {
          context: { siteId: 'site-1', channel: 'direct', goal: 'newsletter-member-signup' },
        }),
      ]

      const attribution = attributeCampaignFunnel(events, 'signup-1', {
        id: 'sub-user-1',
        target: 'subscriber',
      })

      expect(attribution.consentVerified).toBe(true)
      expect(attribution.confidence).toBe('verified')
      expect(attribution.uncertaintyRating).toBe('low')
      expect(attribution.attributedChannel).toBe('newsletter')
      expect(attribution.attributedCampaign).toBe('autumn-sovereign-launch')
      expect(attribution.disclosedLink?.source).toBe('dispatch-42')
      expect(attribution.touchpoints).toHaveLength(4)
      expect(attribution.canonicalOutcomeId).toBe('sub-user-1')
      expect(attribution.canonicalTarget).toBe('subscriber')
    })

    it('refuses to claim certainty when visitor consent is absent or denied', () => {
      const events: FirstPartyEvent[] = [
        makeEvent('unconsented-view', 'page_view', '2026-09-01T11:00:00Z', {
          consentBasis: 'denied',
          identity: {},
        }),
        makeEvent('unconsented-conv', 'signup', '2026-09-01T11:03:00Z', {
          consentBasis: 'denied',
          identity: {},
        }),
      ]

      const attribution = attributeCampaignFunnel(events, 'unconsented-conv')

      expect(attribution.consentVerified).toBe(false)
      expect(attribution.confidence).toBe('unlinked')
      expect(attribution.uncertaintyRating).toBe('high - consent absent')
      expect(attribution.attributedChannel).toBe('unattributed (consent absent)')
      expect(attribution.uncertaintyStatement).toContain(
        'Visitor has not granted analytics consent',
      )
    })

    it('flags high uncertainty when consent is present but identity linkage is missing', () => {
      const events: FirstPartyEvent[] = [
        makeEvent('anon-landing', 'page_view', '2026-09-01T12:00:00Z', {
          identity: {}, // No persistent hashes
        }),
        makeEvent('anon-conv', 'signup', '2026-09-01T12:02:00Z', {
          identity: {},
        }),
      ]

      const attribution = attributeCampaignFunnel(events, 'anon-conv')

      expect(attribution.consentVerified).toBe(true)
      expect(attribution.confidence).toBe('unlinked')
      expect(attribution.uncertaintyRating).toBe('high - untracked identity')
      expect(attribution.uncertaintyStatement).toContain(
        'lacks persistent anonymous or session hashes',
      )
    })
  })

  describe('Suppressed Visitor Protection', () => {
    it('strictly masks visitors present on the suppressions ledger', () => {
      const suppressions = new Set(['hash-suppressed-visitor-123', 'hash-opted-out-456'])

      expect(maskSuppressedIdentity('hash-suppressed-visitor-123', suppressions)).toBe(
        SUPPRESSED_MASK,
      )
      expect(maskSuppressedIdentity('hash-opted-out-456', suppressions)).toBe(SUPPRESSED_MASK)
      expect(maskSuppressedIdentity('hash-normal-consented-visitor', suppressions)).toBe(
        'hash-normal-consented-visitor',
      )
      expect(maskSuppressedIdentity(null, suppressions)).toBe('anonymous')
    })
  })

  describe('Currency-Separated Financial Views', () => {
    it('refuses to merge distinct currency snapshots into a single sum', () => {
      const usdSnapshot: MetricSnapshot = {
        id: 'snap-usd-1',
        metric: 'order-gross',
        value: '5000',
        definition: 'USD Gross Orders',
        grain: 'order',
        windowStart: '2026-09-01T00:00:00Z',
        windowEnd: '2026-09-02T00:00:00Z',
        presentmentCurrency: 'USD',
        settlementCurrency: 'USD',
        processor: 'stripe',
        reconciliationStatus: 'reconciled',
      }

      const eurSnapshot: MetricSnapshot = {
        ...usdSnapshot,
        id: 'snap-eur-1',
        presentmentCurrency: 'EUR',
        settlementCurrency: 'EUR',
        definition: 'EUR Gross Orders',
      }

      expect(() => sumCompatibleMetricValues([usdSnapshot, eurSnapshot])).toThrow('Incompatible')

      // Compatible snapshots in the same currency can be summed cleanly
      const usdSnapshot2: MetricSnapshot = { ...usdSnapshot, id: 'snap-usd-2', value: '2500' }
      expect(sumCompatibleMetricValues([usdSnapshot, usdSnapshot2])).toBe('7500')
    })
  })

  describe('Experiment Statistical Analysis & Human Winner Approval', () => {
    it('calculates practical effect and flags tiny sample warning when exposures < 100', () => {
      const variants = [
        { id: 'variant-control', exposures: 40, conversions: 4, isControl: true },
        { id: 'variant-treatment', exposures: 42, conversions: 8 },
      ]

      const analysis = analyzeExperiment(variants)

      expect(analysis.controlId).toBe('variant-control')
      expect(analysis.results).toHaveLength(2)
      // Practical effect: treatment (8/42 = 0.1905) - control (4/40 = 0.10)
      expect(analysis.results[1].practicalEffect).toBeGreaterThan(0.08)
      expect(analysis.warnings).toHaveLength(2)
      expect(analysis.warnings[0]).toContain('Tiny sample: fewer than 100 exposures')
    })

    it('requires explicit human approval before winner can be selected', () => {
      expect(() =>
        approveWinner({
          state: 'running',
          selectedVariantId: 'variant-treatment',
          humanApproved: false,
        }),
      ).toThrow('human approval is required')

      const approvedState = approveWinner({
        state: 'running',
        selectedVariantId: 'variant-treatment',
        humanApproved: true,
      })
      expect(approvedState).toBe('winner-selected')
    })
  })
})
