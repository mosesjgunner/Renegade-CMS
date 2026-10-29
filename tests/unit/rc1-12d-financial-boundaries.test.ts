import { describe, expect, it } from 'vitest'
import { importConversionEvidence } from '../../src/modules/commerce/affiliate-service'
import type {
  AffiliateClick,
  CommissionLedger,
} from '../../src/modules/commerce/affiliate-referral-contracts'
import { reverseCommissionEntry } from '../../src/modules/commerce/referral-service'
import {
  createSettlementBatch,
  approveSettlementBatch,
  generateSettlementExport,
  summarizeCommissionLiabilities,
} from '../../src/modules/commerce/settlement-service'

const click: AffiliateClick = {
  id: 'click-a',
  siteId: 'alpha',
  offerId: 'offer-a',
  clickToken: 'token-a',
  timestamp: '2026-10-29T00:00:00Z',
  destinationUrl: 'https://seller.example/item',
  trackingAllowed: true,
  botDetected: false,
}
const item = {
  externalEventId: 'event-a',
  amountMinor: '1000',
  currency: 'USD',
  attributionHint: 'token-a',
}
const input = {
  siteId: 'alpha',
  source: 'webhook' as const,
  network: 'local-harness',
  rawPayload: {},
  items: [item],
  existingEvidence: [],
  existingClicks: [click],
  existingOffers: [],
}
const accrual: CommissionLedger = {
  id: 'commission-a',
  siteId: 'alpha',
  programId: 'program-a',
  programVersion: 1,
  referrerMemberId: 'referrer-a',
  orderId: 'order-a',
  orderNumber: 'ORDER-A',
  currency: 'USD',
  amountMinor: '100',
  type: 'accrual',
  status: 'eligible',
  matureAt: '2026-10-29T00:00:00Z',
  createdAt: '2026-10-29T00:00:00Z',
  explanation: 'Local fixture',
}

describe('12D financial service boundaries (not persisted lifecycle acceptance)', () => {
  it('exports only remaining same-site commission after a partial reversal', () => {
    const entries = [
      { ...accrual, reversedAmountMinor: '30' },
      { ...accrual, id: 'foreign', siteId: 'beta' },
    ]
    const summaries = summarizeCommissionLiabilities(entries, 'alpha')
    expect(summaries[0]).toMatchObject({
      eligibleAmountMinor: '70',
      reversedAmountMinor: '30',
      settledAmountMinor: '0',
    })
    const { batch } = createSettlementBatch({ siteId: 'alpha', currency: 'USD', ledgers: entries })
    expect(batch.totalAmountMinor).toBe('70')
    const approved = approveSettlementBatch({ batch, operatorUser: { id: 'owner', role: 'owner' } })
    const exported = generateSettlementExport(approved, entries)
    expect(exported.lineItems).toHaveLength(1)
    expect(exported.lineItems[0].amountMinor).toBe('70')
  })
  it('rejects callbacks without stable identity or with invalid status/date evidence', () => {
    expect(() =>
      importConversionEvidence({ ...input, items: [{ ...item, externalEventId: '' }] }),
    ).toThrow('external event ID')
    expect(() =>
      importConversionEvidence({ ...input, items: [{ ...item, occurredAt: 'invalid' }] }),
    ).toThrow('timestamp')
    expect(() =>
      importConversionEvidence({
        ...input,
        items: [{ ...item, status: 'invented' as 'approved' }],
      }),
    ).toThrow('status')
  })

  it('deduplicates repeated events within a single callback batch', () => {
    const result = importConversionEvidence({
      ...input,
      items: [item, { ...item, amountMinor: '9999' }],
    })
    expect(result.imported).toHaveLength(1)
    expect(result.duplicates).toHaveLength(1)
    expect(result.imported[0].money.amountMinor).toBe('1000')
  })

  it('does not let another site consume the same external event ID', () => {
    const foreign = importConversionEvidence({ ...input, siteId: 'beta' }).imported
    const result = importConversionEvidence({ ...input, existingEvidence: foreign })
    expect(result.imported).toHaveLength(1)
    expect(result.duplicates).toHaveLength(0)
  })

  it.each([
    { ...click, siteId: 'beta' },
    { ...click, trackingAllowed: false },
    { ...click, botDetected: true },
    { ...click, clickToken: 'token' },
  ])('does not attribute a foreign, denied, bot or substring click: %j', (candidate) => {
    const result = importConversionEvidence({ ...input, existingClicks: [candidate] })
    expect(result.matchedCount).toBe(0)
    expect(result.imported[0].matchedClickId).toBeUndefined()
    expect(result.imported[0].reconciliationState).toBe('unmatched')
  })

  it('counts a reversal once and never reports the compensating entry as a payout', () => {
    const reversed = reverseCommissionEntry({ entry: accrual, reason: 'order_refunded' })
    const summaries = summarizeCommissionLiabilities(
      [reversed.updatedEntry, reversed.reversalEntry],
      'alpha',
    )
    expect(summaries[0].reversedAmountMinor).toBe('100')
    expect(summaries[0].settledAmountMinor).toBe('0')
    expect(summaries[0].eligibleAmountMinor).toBe('0')
    expect(() =>
      reverseCommissionEntry({ entry: reversed.updatedEntry, reason: 'order_refunded' }),
    ).toThrow('unreversed accrual')
    expect(() =>
      reverseCommissionEntry({ entry: reversed.reversalEntry, reason: 'order_refunded' }),
    ).toThrow('unreversed accrual')
  })

  it('keeps approval unpaid, separates currencies/sites and excludes compensating entries from batches', () => {
    const entries: CommissionLedger[] = [
      { ...accrual, status: 'approved' },
      { ...accrual, id: 'eur', currency: 'EUR', amountMinor: '200' },
      { ...accrual, id: 'foreign', siteId: 'beta', amountMinor: '900' },
      { ...accrual, id: 'compensation', type: 'reversal', amountMinor: '800' },
    ]
    const summaries = summarizeCommissionLiabilities(entries, 'alpha')
    expect(summaries).toHaveLength(2)
    expect(summaries.find((s) => s.currency === 'USD')).toMatchObject({
      eligibleAmountMinor: '100',
      settledAmountMinor: '0',
    })
    expect(summaries.find((s) => s.currency === 'EUR')?.eligibleAmountMinor).toBe('200')
    expect(
      createSettlementBatch({ siteId: 'alpha', currency: 'USD', ledgers: entries })
        .includedLedgerIds,
    ).toEqual([])
  })
})
