import { describe, expect, it } from 'vitest'
import {
  assertInvoiceConsistency,
  canTransition,
  findConflicts,
  ioChangeIsMaterial,
  nextIoVersion,
  representationFeeFor,
  type BookingWindow,
} from '../../src/modules/monetization/sponsorship'
import { grantTermsSnapshot, validateGrant } from '../../src/modules/monetization/rights'
import {
  buildAdsTxt,
  selectPlacement,
  type PlacementShape,
} from '../../src/modules/monetization/ads'

describe('sponsorship state machine', () => {
  it('forbids skipping from inquiry to collected', () => {
    expect(canTransition('inquiry', 'collected')).toBe(false)
    expect(canTransition('inquiry', 'tentative')).toBe(true)
    expect(canTransition('invoiced', 'collected')).toBe(true)
    expect(canTransition('refunded', 'inquiry')).toBe(false)
  })
  it('keeps invoice state consistent with collection (an invoice is not cash)', () => {
    expect(() => assertInvoiceConsistency('invoiced', 'paid')).toThrow(/collected state/)
    expect(() => assertInvoiceConsistency('collected', 'sent')).toThrow(/paid invoice/)
    expect(() => assertInvoiceConsistency('collected', 'paid')).not.toThrow()
  })
  it('detects inventory overlap and expired holds', () => {
    const candidate: BookingWindow = {
      id: 'b2',
      inventoryId: 'inv1',
      advertiserId: 'adv2',
      state: 'approved',
      startsAt: '2026-12-10T00:00:00.000Z',
      endsAt: '2026-12-20T00:00:00.000Z',
      holdExpiresAt: null,
    }
    const existing: BookingWindow[] = [
      {
        id: 'b1',
        inventoryId: 'inv1',
        advertiserId: 'adv1',
        state: 'scheduled',
        startsAt: '2026-12-15T00:00:00.000Z',
        endsAt: '2026-12-25T00:00:00.000Z',
        holdExpiresAt: null,
      },
      {
        id: 'b0',
        inventoryId: 'inv1',
        advertiserId: 'adv0',
        state: 'tentative',
        startsAt: '2026-12-10T00:00:00.000Z',
        endsAt: '2026-12-20T00:00:00.000Z',
        holdExpiresAt: '2026-11-01T00:00:00.000Z', // expired before "now"
      },
    ]
    const conflicts = findConflicts(candidate, existing, new Set(), '2026-11-26T00:00:00.000Z')
    expect(conflicts).toEqual([{ withBookingId: 'b1', reason: 'inventory-overlap' }])
    const blocked = findConflicts(candidate, [], new Set(['adv2']), '2026-11-26T00:00:00.000Z')
    expect(blocked[0].reason).toBe('advertiser-blocked')
  })
  it('versions insertion orders on material change', () => {
    expect(nextIoVersion(null)).toBe('IO-1')
    expect(nextIoVersion('IO-1')).toBe('IO-2')
    expect(ioChangeIsMaterial({ priceMinor: '100' }, { priceMinor: '200' })).toBe(true)
    expect(ioChangeIsMaterial({ priceMinor: '100' }, { priceMinor: '100' })).toBe(false)
  })
})

describe('representation fee', () => {
  const agreement = {
    id: 'ag1',
    status: 'active',
    commissionBasisBps: 2000,
    carveouts: ['carved'],
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: null,
    revokedAt: null,
  }
  it('applies only to covered collected revenue', () => {
    const applied = representationFeeFor({
      agreement,
      bookingId: 'b1',
      collectedMinor: '10000',
      collectedAt: '2026-06-01T00:00:00.000Z',
    })
    expect(applied).toMatchObject({ applies: true, feeMinor: '2000', creatorNetMinor: '8000' })
    expect(
      representationFeeFor({
        agreement,
        bookingId: 'carved',
        collectedMinor: '10000',
        collectedAt: '2026-06-01T00:00:00.000Z',
      }).applies,
    ).toBe(false)
    expect(
      representationFeeFor({
        agreement,
        bookingId: 'b1',
        collectedMinor: null,
        collectedAt: '2026-06-01T00:00:00.000Z',
      }).reason,
    ).toMatch(/Nothing has been collected/)
    expect(
      representationFeeFor({
        agreement: null,
        bookingId: 'b1',
        collectedMinor: '10000',
        collectedAt: '2026-06-01T00:00:00.000Z',
      }).feeMinor,
    ).toBe('0')
  })
})

const rightsRecord = {
  id: 'rr1',
  status: 'ready',
  basis: 'original',
  fingerprint: 'sha256:abc',
  holders: [{ name: 'Creator', shareBps: 10000 }],
  releases: { model: true },
  grantable: { print: true, digital: true },
  restrictions: { requiredReleases: ['model'] },
  expiresAt: null,
  aiTdmOptIn: false,
  aiTdmTermsVersion: null,
}

describe('rights validation', () => {
  it('grants only what the record supports', () => {
    expect(validateGrant(rightsRecord, { rights: ['print'], at: '2026-11-26' }).ok).toBe(true)
    const tv = validateGrant(rightsRecord, { rights: ['tv'], at: '2026-11-26' })
    expect(tv.ok).toBe(false)
    expect(tv.reasons.join(' ')).toMatch(/not marked grantable/)
  })
  it('keeps AI/TDM opt-in separate and default-off', () => {
    const ai = validateGrant(rightsRecord, {
      rights: ['digital'],
      includesAiTdm: true,
      at: '2026-11-26',
    })
    expect(ai.ok).toBe(false)
    expect(ai.reasons.join(' ')).toMatch(/explicit opt-in/)
  })
  it('blocks licensed-in work without sublicensing and freezes grant snapshots', () => {
    const licensed = { ...rightsRecord, basis: 'licensed-in' }
    expect(validateGrant(licensed, { rights: ['print'], at: '2026-11-26' }).ok).toBe(false)
    const snapshot = grantTermsSnapshot({
      offerTerms: { media: ['print'] },
      agreementVersion: 'LA-1',
      fingerprint: 'sha256:abc',
      rightsRecordId: 'rr1',
      includesAiTdm: false,
      aiTdmTermsVersion: null,
    })
    expect(snapshot['agreementVersion']).toBe('LA-1')
    expect((snapshot['aiTdm'] as { included: boolean }).included).toBe(false)
  })
})

const placement = (over: Partial<PlacementShape>): PlacementShape => ({
  id: 'p1',
  slot: 'web-in-content',
  kind: 'house',
  providerId: null,
  providerConnected: false,
  status: 'active',
  startsAt: null,
  endsAt: null,
  frequencyCapPerDay: null,
  categoryExclusions: [],
  excludePaidContent: true,
  requiresConsent: false,
  ...over,
})

describe('ad placement selection', () => {
  const ctx = {
    slot: 'web-in-content',
    at: '2026-11-26T12:00:00.000Z',
    contentPaid: false,
    contentCategory: null,
    consentGranted: true,
    impressionsTodayByPlacement: {},
  }
  it('prefers direct-sold, falls back to house, never invents a network', () => {
    const sold = placement({ id: 'sold', kind: 'direct-sold' })
    const house = placement({ id: 'house' })
    expect(selectPlacement([house, sold], ctx).placementId).toBe('sold')
    expect(selectPlacement([house], ctx).reason).toMatch(/house fallback/)
    expect(selectPlacement([], ctx).placementId).toBeNull()
  })
  it('respects paid-content exclusion, consent and frequency caps', () => {
    const house = placement({ id: 'house' })
    expect(selectPlacement([house], { ...ctx, contentPaid: true }).placementId).toBeNull()
    const consent = placement({
      id: 'c',
      kind: 'provider-tag',
      providerConnected: true,
      requiresConsent: true,
    })
    expect(selectPlacement([consent], { ...ctx, consentGranted: false }).placementId).toBeNull()
    const capped = placement({ id: 'cap', frequencyCapPerDay: 2 })
    expect(
      selectPlacement([capped], { ...ctx, impressionsTodayByPlacement: { cap: 2 } }).placementId,
    ).toBeNull()
    const deadTag = placement({ id: 'tag', kind: 'provider-tag', providerConnected: false })
    expect(selectPlacement([deadTag, house], ctx).placementId).toBe('house')
  })
  it('builds ads.txt only from authorized relationships, deduped and sorted', () => {
    const txt = buildAdsTxt([
      { domain: 'network.example', sellerId: 'pub-2', relationship: 'DIRECT' },
      { domain: 'network.example', sellerId: 'pub-2', relationship: 'DIRECT' },
      { domain: 'exchange.example', sellerId: 'pub-1', relationship: 'RESELLER', tagId: 'tag9' },
    ])
    expect(txt.match(/network\.example/g)).toHaveLength(1)
    expect(txt).toContain('exchange.example, pub-1, RESELLER, tag9')
    expect(buildAdsTxt([])).not.toContain('DIRECT')
  })
})
