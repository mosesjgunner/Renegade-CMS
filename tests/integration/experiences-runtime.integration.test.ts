import { describe, expect, it } from 'vitest'

import type { FirstPartyEvent } from '../../src/modules/analytics/contracts'
import type { AnalyticsEventStore } from '../../src/modules/analytics/service'
import {
  ExperiencesRuntimeService,
  type ExperienceDefinition,
} from '../../src/modules/experiences/service'

class MemoryAnalyticsStore implements AnalyticsEventStore {
  events: FirstPartyEvent[] = []

  async record(event: FirstPartyEvent) {
    const deduplicated = this.events.some(
      (item) => item.dedupeKey === `source:${event.context.sourceEventId}`,
    )
    const normalized = { ...event, dedupeKey: `source:${event.context.sourceEventId}` }
    if (!deduplicated) this.events.push(normalized)
    return { event: normalized, deduplicated }
  }
}

const experiment = (salt = 'approved-salt'): ExperienceDefinition => ({
  id: 'newsletter-cta',
  siteId: 'site-1',
  state: 'running',
  assignmentSalt: salt,
  collectionEnabled: true,
  conditions: [{ input: 'language-region', equals: 'en-US' }],
  variants: [
    {
      id: 'control',
      allocation: 50,
      isControl: true,
      registeredComponent: 'publisher.newsletter-cta',
    },
    { id: 'treatment', allocation: 50, registeredComponent: 'publisher.cta' },
  ],
})
const privacy = { analyticsConsent: true, personalizationConsent: true, capabilityEnabled: true }
const request = {
  privacy,
  subject: { kind: 'session' as const, value: 'first-party-session-a' },
  audience: { 'language-region': 'en-US' },
}

describe('privacy-safe experiences runtime', () => {
  it('runs the consented first-party workflow through canonical analytics', async () => {
    const analytics = new MemoryAnalyticsStore()
    const decisions: Array<Record<string, string>> = []
    const runtime = new ExperiencesRuntimeService(
      analytics,
      new Set(['publisher.newsletter-cta', 'publisher.cta']),
      { record: async (decision) => void decisions.push(decision) },
    )
    const definition = experiment()
    const first = runtime.resolve(definition, request)
    const same = runtime.resolve(definition, request)
    expect(first.assignment.variantId).toBe(same.assignment.variantId)
    expect(
      runtime.resolve(experiment('new-salt'), request).assignment.variantId,
    ).not.toBeUndefined()
    expect(
      await runtime.recordExposure({
        experiment: definition,
        resolution: first,
        privacy,
        occurredAt: '2026-08-29T00:00:00.000Z',
      }),
    ).toMatchObject({ recorded: true })
    expect(
      await runtime.recordExposure({
        experiment: definition,
        resolution: first,
        privacy,
        occurredAt: '2026-08-29T00:00:01.000Z',
      }),
    ).toMatchObject({ deduplicated: true })
    expect(
      await runtime.recordConversion({
        experiment: definition,
        resolution: first,
        privacy,
        goalKey: 'newsletter-member-signup',
        occurredAt: '2026-08-29T00:02:00.000Z',
      }),
    ).toMatchObject({ recorded: true })
    expect(
      await runtime.recordConversion({
        experiment: definition,
        resolution: first,
        privacy,
        goalKey: 'newsletter-member-signup',
        occurredAt: '2026-08-29T00:02:01.000Z',
      }),
    ).toMatchObject({ deduplicated: true })
    expect(analytics.events.map((event) => event.eventType)).toEqual([
      'experiment_exposure',
      'experiment_conversion',
    ])
    expect(runtime.analyze(definition, analytics.events).results).toHaveLength(2)
    await expect(
      runtime.approveWinner({
        experiment: definition,
        selectedVariantId: 'treatment',
        actorId: 'owner-1',
        reason: 'Reviewed result',
        humanApproved: false,
        decidedAt: '2026-08-29T01:00:00.000Z',
      }),
    ).rejects.toThrow(/human approval/)
    await expect(
      runtime.approveWinner({
        experiment: definition,
        selectedVariantId: 'treatment',
        actorId: 'owner-1',
        reason: 'Reviewed result',
        humanApproved: true,
        decidedAt: '2026-08-29T01:00:00.000Z',
      }),
    ).resolves.toBe('winner-selected')
    expect(decisions).toHaveLength(1)
  })

  it('uses control without recording when privacy or capability policy forbids experimentation', async () => {
    const analytics = new MemoryAnalyticsStore()
    const runtime = new ExperiencesRuntimeService(
      analytics,
      new Set(['publisher.newsletter-cta', 'publisher.cta']),
    )
    const definition = experiment()
    for (const blockedPrivacy of [
      { ...privacy, analyticsConsent: false },
      { ...privacy, personalizationConsent: false },
      { ...privacy, capabilityEnabled: false },
    ]) {
      const resolution = runtime.resolve(definition, { ...request, privacy: blockedPrivacy })
      expect(resolution.assignment.variantId).toBe('control')
      expect(resolution.eligible).toBe(false)
      await expect(
        runtime.recordExposure({
          experiment: definition,
          resolution,
          privacy: blockedPrivacy,
          occurredAt: '2026-08-29T00:00:00.000Z',
        }),
      ).resolves.toMatchObject({ recorded: false })
    }
    expect(analytics.events).toHaveLength(0)
  })

  it('rejects unregistered variants and prohibited targeting inputs', () => {
    const runtime = new ExperiencesRuntimeService(
      new MemoryAnalyticsStore(),
      new Set(['publisher.newsletter-cta', 'publisher.cta']),
    )
    expect(() =>
      runtime.resolve(
        {
          ...experiment(),
          variants: [
            {
              id: 'control',
              allocation: 100,
              isControl: true,
              registeredComponent: 'javascript:alert(1)',
            },
          ],
        },
        request,
      ),
    ).toThrow(/Unregistered/)
    expect(() =>
      runtime.resolve(experiment(), { ...request, audience: { ipAddress: '127.0.0.1' } }),
    ).toThrow(/Prohibited targeting input/)
  })
})
