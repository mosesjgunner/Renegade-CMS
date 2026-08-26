import { describe, expect, it } from 'vitest'
import {
  deterministicAssignment,
  experimentEventKey,
  analyzeExperiment,
  approveWinner,
} from '../../src/modules/experiences/contracts'
import {
  canWaive,
  externalLinkFinding,
  releaseEligible,
  scanLocal,
} from '../../src/modules/quality/contracts'
import { rollupEvents, type FirstPartyEvent } from '../../src/modules/analytics/contracts'

const variants = [
  { id: 'control', allocation: 50, isControl: true, registeredComponent: 'NewsletterCTA' },
  { id: 'cta-b', allocation: 50, registeredComponent: 'NewsletterCTA' },
]
describe('Prompt 14 privacy-safe experimentation', () => {
  it('keeps assignment deterministic, defaulted on opt-out, and events idempotent', () => {
    const input = {
      experimentId: 'newsletter-cta',
      salt: 'approved-salt',
      subjectKey: 'session-a',
      consented: true,
      collectionEnabled: true,
      variants,
    }
    expect(deterministicAssignment(input)).toEqual(deterministicAssignment(input))
    expect(deterministicAssignment({ ...input, consented: false }).variantId).toBe('control')
    expect(deterministicAssignment({ ...input, consented: false }).isDefault).toBe(true)
    expect(experimentEventKey('exposure', 'newsletter-cta', 'assignment-a')).toBe(
      experimentEventKey('exposure', 'newsletter-cta', 'assignment-a'),
    )
  })
  it('reports uncertainty and refuses magical winner promotion', () => {
    const analysis = analyzeExperiment([
      { id: 'control', exposures: 20, conversions: 2, isControl: true },
      { id: 'cta-b', exposures: 20, conversions: 5 },
    ])
    expect(analysis.warnings.join(' ')).toMatch(/Insufficient evidence/)
    expect(() =>
      approveWinner({ state: 'running', selectedVariantId: 'cta-b', humanApproved: false }),
    ).toThrow(/human approval/)
    expect(
      approveWinner({ state: 'running', selectedVariantId: 'cta-b', humanApproved: true }),
    ).toBe('winner-selected')
  })
})
describe('Prompt 14 quality center', () => {
  it('blocks release for exact local problems and leaves remote uncertainty non-blocking', () => {
    const issues = scanLocal({
      targetId: 'revision-1',
      canonicalUrl: 'not-a-url',
      images: [
        { id: 'hero', rightsStatus: 'expired' },
        { id: 'secondary', altText: '' },
      ],
      internalLinks: [{ href: '/deleted', exists: false, visible: false }],
      translationStatus: 'stale',
    })
    expect(issues).toHaveLength(6)
    expect(releaseEligible(issues)).toBe(false)
    expect(externalLinkFinding('https://unreachable.example', null)).toMatchObject({
      severity: 'warning',
      uncertain: true,
    })
    expect(
      canWaive({ severity: 'publication_blocking', category: 'privacy', actorRole: 'owner' }),
    ).toBe(false)
    expect(canWaive({ severity: 'warning', category: 'grammar', actorRole: 'owner' })).toBe(true)
  })
  it('rescan is clear after corrections', () =>
    expect(
      scanLocal({
        targetId: 'revision-1',
        canonicalUrl: 'https://example.test/story',
        images: [{ id: 'hero', altText: 'A city skyline', rightsStatus: 'approved' }],
        internalLinks: [{ href: '/live', exists: true, visible: true }],
        translationStatus: 'reviewed',
      }),
    ).toEqual([]))
})
describe('Prompt 14 first-party aggregation', () => {
  it('deduplicates raw events before bounded rollup', () => {
    const event: FirstPartyEvent = {
      id: 'signup',
      eventType: 'signup',
      occurredAt: '2026-08-25T01:00:00Z',
      receivedAt: '2026-08-25T01:00:00Z',
      identity: {},
      context: { siteId: 'site' },
      consentBasis: 'analytics-consent',
      schemaVersion: 1,
      trusted: false,
      dedupeKey: 'same',
    }
    expect(
      rollupEvents(
        [event, { ...event, id: 'retry' }],
        '2026-08-25T00:00:00Z',
        '2026-08-26T00:00:00Z',
      )[0].value,
    ).toBe('1')
  })
})
