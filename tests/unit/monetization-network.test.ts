import { describe, expect, it } from 'vitest'
import {
  rankCoPromotionCandidates,
  type ShowProfile,
} from '../../src/modules/monetization/copromotion'
import {
  buildDistributionPackage,
  exclusivityConflict,
} from '../../src/modules/monetization/distribution'

const show = (over: Partial<ShowProfile>): ShowProfile => ({
  siteId: 'site-a',
  inventoryId: 'inv-a',
  name: 'Show A',
  surface: 'podcast',
  categories: ['comedy', 'news'],
  language: 'en',
  audienceMonthly: 10000,
  blockedSiteIds: [],
  ...over,
})

describe('co-promotion ranking (CE-12)', () => {
  it('ranks opted-in comparable shows, excludes self and blocked, explains itself', () => {
    const source = show({})
    const candidates = [
      show({ siteId: 'site-a', inventoryId: 'self' }),
      show({ siteId: 'site-b', inventoryId: 'inv-b', name: 'Close Match', audienceMonthly: 20000 }),
      show({
        siteId: 'site-c',
        inventoryId: 'inv-c',
        name: 'Far',
        categories: ['sports'],
        language: 'fr',
        audienceMonthly: 900000,
      }),
      show({ siteId: 'site-d', inventoryId: 'inv-d', name: 'Blocked', blockedSiteIds: ['site-a'] }),
    ]
    const ranked = rankCoPromotionCandidates(source, candidates)
    expect(ranked.map((r) => r.inventoryId)).toEqual(['inv-b'])
    expect(ranked[0].reasons.join(' ')).toMatch(/shared categories/)
    expect(ranked[0].reasons.join(' ')).toMatch(/comparable audience/)
  })
  it('benchmarks a 10-show fixture deterministically (fixture, not a live network)', () => {
    const source = show({})
    const fixture = Array.from({ length: 10 }, (_, i) =>
      show({
        siteId: `site-${i + 1}`,
        inventoryId: `inv-${i + 1}`,
        name: `Fixture Show ${i + 1}`,
        categories: i % 2 === 0 ? ['comedy'] : ['tech'],
        audienceMonthly: 5000 * (i + 1),
      }),
    )
    const first = rankCoPromotionCandidates(source, fixture)
    const second = rankCoPromotionCandidates(source, fixture)
    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(0)
    expect(first[0].score).toBeGreaterThanOrEqual(first[first.length - 1].score)
  })
})

describe('distribution packages (CE-11)', () => {
  const record = {
    id: 'rr1',
    status: 'ready',
    basis: 'original',
    fingerprint: 'sha256:xyz',
    holders: [{ name: 'Creator' }],
    releases: { model: true },
    grantable: { print: true },
    restrictions: {},
    expiresAt: null,
    aiTdmOptIn: false,
    aiTdmTermsVersion: null,
  }
  it('builds a checksummed manifest and blocks conflicting exclusivity', () => {
    const pkg = buildDistributionPackage({
      providerId: 'adobe-stock-contributor',
      record,
      title: 'Sunset over the bay',
      description: 'A photo.',
      keywords: ['sunset', 'bay'],
      at: '2026-11-26T00:00:00.000Z',
    })
    expect(pkg.manifestChecksum).toMatch(/^[a-f0-9]{64}$/)
    const again = buildDistributionPackage({
      providerId: 'adobe-stock-contributor',
      record,
      title: 'Sunset over the bay',
      description: 'A photo.',
      keywords: ['bay', 'sunset'],
      at: '2026-11-26T00:00:00.000Z',
    })
    expect(again.manifestChecksum).toBe(pkg.manifestChecksum)
    expect(
      exclusivityConflict({
        fingerprint: 'sha256:xyz',
        wantExclusive: true,
        activeGrants: [
          { fingerprint: 'sha256:xyz', termsSnapshot: { exclusive: true }, status: 'issued' },
        ],
        priorSubmissions: [],
      }),
    ).toMatch(/exclusive license grant/)
    expect(
      exclusivityConflict({
        fingerprint: 'sha256:xyz',
        wantExclusive: false,
        activeGrants: [
          { fingerprint: 'sha256:xyz', termsSnapshot: { exclusive: true }, status: 'issued' },
        ],
        priorSubmissions: [],
      }),
    ).toBeNull()
  })
})
