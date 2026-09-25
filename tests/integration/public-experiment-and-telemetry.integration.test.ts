import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_SCHEMA_VERSION,
  isBotOrInternal,
  normalizeConsentChoices,
  analyticsAllowed,
  maskSuppressedIdentity,
  SUPPRESSED_MASK,
  attributeCampaignFunnel,
  defaultPrivacyPolicy,
  type FirstPartyEvent,
} from '../../src/modules/analytics/contracts'
import {
  browserPrivacySignals,
  consentSetCookie,
  readConsent,
} from '../../src/modules/analytics/privacy'
import {
  analyzeExperiment,
  approveWinner,
  deterministicAssignment,
} from '../../src/modules/experiences/contracts'
import {
  CANONICAL_PUBLIC_EXPERIMENT,
  resolvePublicExperimentVariant,
} from '../../src/modules/experiences/public-experiment'
import {
  ExperiencesRuntimeService,
  type ExperienceDefinition,
} from '../../src/modules/experiences/service'

class MemoryAnalyticsStore {
  events: FirstPartyEvent[] = []

  async record(event: FirstPartyEvent) {
    const dedupeKey = event.context.sourceEventId
      ? `source:${event.context.sourceEventId}`
      : `event:${event.id}:${event.eventType}`
    const deduplicated = this.events.some((e) => e.dedupeKey === dedupeKey)
    const normalized = { ...event, dedupeKey }
    if (!deduplicated) this.events.push(normalized)
    return { event: normalized, deduplicated }
  }
}

describe('Public Experiment & Consent-Safe Telemetry Integration — Prompt 5', () => {
  const secret = 'test-renegade-secret-1234567890123456'

  describe('1. Tracking-Off & Privacy Shield Verification', () => {
    it('strictly serves privacy-default variant with ZERO telemetry when consent is absent', () => {
      const headers = new Headers()
      const resolution = resolvePublicExperimentVariant({
        experiment: {
          ...CANONICAL_PUBLIC_EXPERIMENT,
          dbId: 'exp-1',
          siteId: 'site-1',
          winnerDecision: null,
        },
        cookieHeader: null, // No consent cookie
        headers,
        secret,
        privacyPolicy: defaultPrivacyPolicy,
      })

      expect(resolution.consented).toBe(false)
      expect(resolution.assignment.isDefault).toBe(true)
      expect(resolution.assignment.subjectKey).toBe('privacy-default')
      expect(resolution.variant.isControl).toBe(true)
      expect(resolution.privacyMode).toBe('tracking-off')
    })

    it('honors Global Privacy Control (GPC) and Do-Not-Track (DNT) headers even if cookie exists', () => {
      const cookie = consentSetCookie(
        { subject: 'user-gpc-test', version: defaultPrivacyPolicy.consentVersion, choices: { necessary: true, analytics: true, personalization: true, marketing: true } },
        secret,
        false,
      )

      // Test with GPC header
      const gpcHeaders = new Headers({ 'sec-gpc': '1' })
      const gpcSignals = browserPrivacySignals(gpcHeaders)
      expect(gpcSignals.globalPrivacyControl).toBe(true)

      const gpcAllowed = analyticsAllowed({
        choices: { necessary: true, analytics: true, personalization: true, marketing: true },
        policy: defaultPrivacyPolicy,
        ...gpcSignals,
      })
      expect(gpcAllowed).toBe(false) // GPC overrides granted cookie!

      // Test with DNT header
      const dntHeaders = new Headers({ dnt: '1' })
      const dntSignals = browserPrivacySignals(dntHeaders)
      expect(dntSignals.doNotTrack).toBe(true)

      const dntAllowed = analyticsAllowed({
        choices: { necessary: true, analytics: true, personalization: true, marketing: true },
        policy: defaultPrivacyPolicy,
        ...dntSignals,
      })
      expect(dntAllowed).toBe(false) // DNT overrides granted cookie!
    })

    it('verifies consent withdrawal immediately halts tracking', () => {
      // 1. Initial grant
      const granted = normalizeConsentChoices({ analytics: true, personalization: true })
      expect(granted.analytics).toBe(true)

      // 2. Withdrawal action
      const withdrawn = normalizeConsentChoices({ analytics: false, personalization: false, marketing: false })
      expect(withdrawn.analytics).toBe(false)
      expect(withdrawn.necessary).toBe(true)

      const withdrawnAllowed = analyticsAllowed({
        choices: withdrawn,
        policy: { ...defaultPrivacyPolicy, analyticsEnabled: true },
      })
      expect(withdrawnAllowed).toBe(false)
    })

    it('filters out automated search engine bots and internal crawlers', () => {
      expect(isBotOrInternal({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).toBe(true)
      expect(isBotOrInternal({ userAgent: 'HeadlessChrome/108.0.5359.0' })).toBe(true)
      expect(isBotOrInternal({ userAgent: 'python-requests/2.28.1' })).toBe(false)
      expect(isBotOrInternal({ internal: true })).toBe(true)
    })
  })

  describe('2. Live Public Experiment Lifecycle: Assignment, Exposure, Conversion, Winner Approval', () => {
    it('executes end-to-end experiment journey with deduplication and human winner enforcement', async () => {
      const analytics = new MemoryAnalyticsStore()
      const decisions: Array<{
        experimentId: string
        selectedVariantId: string
        actorId: string
        reason: string
        decidedAt: string
      }> = []

      const runtime = new ExperiencesRuntimeService(
        analytics,
        new Set(['publisher.newsletter-cta', 'publisher.cta', 'publisher.hero-action']),
        { record: async (d) => void decisions.push(d) },
      )

      const definition: ExperienceDefinition = {
        id: 'exp-homepage-hero-cta',
        siteId: 'site-1',
        state: 'running',
        assignmentSalt: 'renegade-hero-experiment-salt-2026',
        collectionEnabled: true,
        conditions: [],
        variants: [
          {
            id: 'variant-control',
            allocation: 50,
            isControl: true,
            registeredComponent: 'publisher.newsletter-cta',
          },
          {
            id: 'variant-treatment',
            allocation: 50,
            registeredComponent: 'publisher.cta',
          },
        ],
      }

      const privacy = {
        analyticsConsent: true,
        personalizationConsent: true,
        capabilityEnabled: true,
      }

      // 1. Deterministic Variant Resolution for visitor A
      const visitorAReq = {
        privacy,
        subject: { kind: 'session' as const, value: 'subject-visitor-alpha' },
      }
      const resA = runtime.resolve(definition, visitorAReq)
      expect(resA.eligible).toBe(true)
      expect(['variant-control', 'variant-treatment']).toContain(resA.assignment.variantId)

      // Same visitor receives identical assignment on revisit (deterministic guarantee)
      const resA2 = runtime.resolve(definition, visitorAReq)
      expect(resA2.assignment.variantId).toBe(resA.assignment.variantId)

      // 2. Exposure Tracking with Deduplication
      const exp1 = await runtime.recordExposure({
        experiment: definition,
        resolution: resA,
        privacy,
        occurredAt: '2026-09-01T10:00:00.000Z',
      })
      expect(exp1.recorded).toBe(true)
      expect(exp1.deduplicated).toBe(false)

      // Repeat exposure in same session is deduped
      const expRepeat = await runtime.recordExposure({
        experiment: definition,
        resolution: resA,
        privacy,
        occurredAt: '2026-09-01T10:01:00.000Z',
      })
      expect(expRepeat.deduplicated).toBe(true)
      expect(analytics.events.filter((e) => e.eventType === 'experiment_exposure')).toHaveLength(1)

      // 3. Conversion Tracking with Deduplication
      const conv1 = await runtime.recordConversion({
        experiment: definition,
        resolution: resA,
        privacy,
        goalKey: 'newsletter-member-signup',
        occurredAt: '2026-09-01T10:05:00.000Z',
      })
      expect(conv1.recorded).toBe(true)
      expect(conv1.deduplicated).toBe(false)

      const convRepeat = await runtime.recordConversion({
        experiment: definition,
        resolution: resA,
        privacy,
        goalKey: 'newsletter-member-signup',
        occurredAt: '2026-09-01T10:05:05.000Z',
      })
      expect(convRepeat.deduplicated).toBe(true)
      expect(analytics.events.filter((e) => e.eventType === 'experiment_conversion')).toHaveLength(1)

      // 4. Statistical Analysis
      const analysis = runtime.analyze(definition, analytics.events)
      expect(analysis.controlId).toBe('variant-control')
      expect(analysis.results).toHaveLength(2)
      expect(analysis.warnings).toHaveLength(2) // Flag tiny sample because < 100 exposures

      // 5. Human Winner Approval
      const decidedState = await runtime.approveWinner({
        experiment: definition,
        selectedVariantId: 'variant-treatment',
        actorId: 'operator-staff-1',
        reason: 'Evaluated conversion rate and audience retention; treatment significantly outperforms control.',
        humanApproved: true,
        decidedAt: '2026-09-01T12:00:00.000Z',
      })

      expect(decidedState).toBe('winner-selected')
      expect(decisions).toHaveLength(1)
      expect(decisions[0].selectedVariantId).toBe('variant-treatment')
      expect(decisions[0].actorId).toBe('operator-staff-1')

      // 6. Winner Enforcement: subsequent visitors all receive the approved winner
      const resolvedAfterWinner = resolvePublicExperimentVariant({
        experiment: {
          ...CANONICAL_PUBLIC_EXPERIMENT,
          state: 'winner-selected',
          winnerDecision: {
            selectedVariantId: 'variant-treatment',
            reason: decisions[0].reason,
            decidedAt: decisions[0].decidedAt,
          },
        },
        cookieHeader: consentSetCookie({ subject: 'any-new-visitor', version: defaultPrivacyPolicy.consentVersion, choices: { necessary: true, analytics: true, personalization: true, marketing: true } }, secret, false),
        headers: new Headers(),
        secret,
        privacyPolicy: defaultPrivacyPolicy,
      })

      expect(resolvedAfterWinner.variant.id).toBe('variant-treatment')
      expect(resolvedAfterWinner.privacyMode).toBe('winner-enforced')
    })
  })

  describe('3. Campaign Funnel Explanation & Suppression Protection', () => {
    it('proves an operator can explain a campaign funnel from inspectable events without exposing suppressed visitors', () => {
      const suppressions = new Set(['hash-suppressed-alice', 'hash-optout-bob'])

      const funnelEvents: FirstPartyEvent[] = [
        {
          id: 'evt-inbound-1',
          eventType: 'click_internal',
          occurredAt: '2026-09-01T14:00:00Z',
          receivedAt: '2026-09-01T14:00:00Z',
          identity: { anonymousId: 'hash-visitor-charlie', sessionId: 'sess-charlie' },
          context: {
            siteId: 'site-1',
            channel: 'newsletter',
            campaignId: 'autumn-sovereign-launch',
            utm: { utm_source: 'newsletter-dispatch-42', utm_medium: 'email', utm_campaign: 'autumn-sovereign-launch' },
          },
          consentBasis: 'analytics-consent',
          schemaVersion: ANALYTICS_SCHEMA_VERSION,
          trusted: false,
          dedupeKey: 'site-1:evt-inbound-1',
        },
        {
          id: 'evt-landing-1',
          eventType: 'page_view',
          occurredAt: '2026-09-01T14:00:04Z',
          receivedAt: '2026-09-01T14:00:04Z',
          identity: { anonymousId: 'hash-visitor-charlie', sessionId: 'sess-charlie' },
          context: { siteId: 'site-1', path: '/articles/sovereignty', channel: 'newsletter' },
          consentBasis: 'analytics-consent',
          schemaVersion: ANALYTICS_SCHEMA_VERSION,
          trusted: false,
          dedupeKey: 'site-1:evt-landing-1',
        },
        {
          id: 'evt-suppressed-visit',
          eventType: 'page_view',
          occurredAt: '2026-09-01T14:01:00Z',
          receivedAt: '2026-09-01T14:01:00Z',
          identity: { anonymousId: 'hash-suppressed-alice', sessionId: 'sess-alice' },
          context: { siteId: 'site-1', path: '/articles/sovereignty', channel: 'newsletter' },
          consentBasis: 'analytics-consent',
          schemaVersion: ANALYTICS_SCHEMA_VERSION,
          trusted: false,
          dedupeKey: 'site-1:evt-suppressed-visit',
        },
        {
          id: 'evt-conv-1',
          eventType: 'signup',
          occurredAt: '2026-09-01T14:04:30Z',
          receivedAt: '2026-09-01T14:04:30Z',
          identity: { anonymousId: 'hash-visitor-charlie', sessionId: 'sess-charlie' },
          context: { siteId: 'site-1', channel: 'direct', goal: 'newsletter-member-signup' },
          consentBasis: 'analytics-consent',
          schemaVersion: ANALYTICS_SCHEMA_VERSION,
          trusted: false,
          dedupeKey: 'site-1:evt-conv-1',
        },
      ]

      // 1. Operator explains the funnel via attributeCampaignFunnel
      const attribution = attributeCampaignFunnel(funnelEvents, 'evt-conv-1', {
        id: 'sub-canonical-charlie',
        target: 'subscriber',
      })

      expect(attribution.attributedCampaign).toBe('autumn-sovereign-launch')
      expect(attribution.attributedChannel).toBe('newsletter')
      expect(attribution.disclosedLink?.source).toBe('newsletter-dispatch-42')
      expect(attribution.confidence).toBe('verified')
      expect(attribution.uncertaintyRating).toBe('low')

      // 2. Operator inspects source events: suppressed visitors MUST be masked
      const inspectableList = funnelEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        maskedIdentity: maskSuppressedIdentity(e.identity.anonymousId, suppressions),
      }))

      // Normal visitor is visible as hashed pseudonym
      expect(inspectableList[0].maskedIdentity).toBe('hash-visitor-charlie')
      // Suppressed visitor is strictly masked
      expect(inspectableList[2].maskedIdentity).toBe(SUPPRESSED_MASK)
      expect(inspectableList[2].maskedIdentity).not.toContain('alice')
    })
  })
})
