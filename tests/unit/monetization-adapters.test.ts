import { describe, expect, it } from 'vitest'
import {
  assertLiveCallAllowed,
  parseAmazonEarningsRows,
  parseAwinTransactions,
  parseCjCommissionDetails,
  parseImpactActions,
} from '../../src/modules/monetization/network-adapters'

describe('network adapters (fixtures only — live calls disabled)', () => {
  it('translates Awin transactions with provider states preserved', () => {
    const { rows, skipped } = parseAwinTransactions([
      {
        id: 'tx1',
        status: 'approved',
        commissionAmount: '12.34',
        saleAmount: '100.00',
        currency: 'usd',
        transactionDate: '2026-11-01',
        advertiserId: 'adv-9',
      },
      { id: '', commissionAmount: '1.00' },
    ])
    expect(skipped).toBe(1)
    expect(rows[0]).toMatchObject({
      providerEventId: 'tx1',
      status: 'approved',
      currency: 'USD',
      commissionMinor: '1234',
      grossMinor: '10000',
      isEstimated: false,
    })
  })
  it('translates CJ, impact and Amazon shapes', () => {
    const cj = parseCjCommissionDetails({
      items: [
        {
          commissionId: 'c1',
          actionStatus: 'closed',
          commissionAmount: 5.5,
          saleAmount: '55.00',
          currency: 'USD',
          eventDate: '2026-10-01',
        },
      ],
    })
    expect(cj.rows[0]).toMatchObject({ status: 'settled', commissionMinor: '550' })
    const impact = parseImpactActions({
      actions: [{ id: 'a1', state: 'REVERSED', payout: '3.21', amount: '40.00', currency: 'USD' }],
    })
    expect(impact.rows[0]).toMatchObject({ status: 'reversed', commissionMinor: '321' })
    const amazon = parseAmazonEarningsRows([
      { orderId: 'o1', earnings: '2.00', revenue: '50.00', currency: 'USD' },
    ])
    expect(amazon.rows[0]).toMatchObject({ status: 'reported-estimated', isEstimated: true })
  })
  it('keeps the live-call gate closed by default', () => {
    expect(() =>
      assertLiveCallAllowed({
        status: 'connected',
        credentialReference: 'vault://x',
        evidenceByCapability: {},
      }),
    ).toThrow(/disabled/)
    expect(() =>
      assertLiveCallAllowed({
        status: 'not-configured',
        credentialReference: null,
        evidenceByCapability: null,
      }),
    ).toThrow(/connected provider/)
    expect(() =>
      assertLiveCallAllowed({
        status: 'connected',
        credentialReference: 'vault://x',
        evidenceByCapability: { liveReadEnabled: true },
      }),
    ).not.toThrow()
  })
})
