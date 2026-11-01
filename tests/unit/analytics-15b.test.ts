import { describe, expect, it } from 'vitest'
import {
  campaignParameters,
  paidOrder,
  reportWindow,
  summarizeOperatorEvents,
  reportRows,
} from '../../src/modules/analytics/operator-report'
import type { Payload } from 'payload'

const touch = (id: string, subject: string, campaign: string, time = '2026-11-01T01:00:00Z') => ({
  id,
  eventType: 'page_view',
  anonymousHash: subject,
  occurredAt: time,
  context: { utm: { utm_campaign: campaign } },
})
const order = (id = 'o1', currency = 'USD', amountMinor = '2500') => ({
  id,
  state: 'paid',
  receipt: { receiptNumber: 'receipt' },
  currency,
  amountMinor,
})
const conversion = (subject = 's1', id = 'o1') => ({
  eventType: 'payment_completed',
  anonymousHash: subject,
  occurredAt: '2026-11-01T03:00:00Z',
  trusted: true,
  context: { sourceEventId: `orders:${id}` },
  properties: { canonicalOutcomeId: id },
})

describe('15B canonical operator metrics', () => {
  it('reads every matching row with a site constraint, without capped samples', async () => {
    const rows = Array.from({ length: 1001 }, (_, id) => ({ id }))
    const payload = {
      find: async (args: Record<string, unknown>) => {
        expect(args).toMatchObject({
          pagination: false,
          limit: 0,
          where: { and: [{ site: { equals: 'alpha' } }, { state: { equals: 'paid' } }] },
        })
        return { docs: rows }
      },
    } as unknown as Payload
    expect(
      await reportRows(payload, 'orders', 'alpha', { state: { equals: 'paid' } }),
    ).toHaveLength(1001)
  })
  it('distinguishes a disabled source from a query failure', async () => {
    const disabled = { collections: {} } as unknown as Payload
    expect(await reportRows(disabled, 'orders', 'alpha')).toEqual([])
    const broken = {
      find: async () => {
        throw new Error('database unavailable')
      },
    } as unknown as Payload
    await expect(reportRows(broken, 'orders', 'alpha')).rejects.toThrow('database unavailable')
  })
  it('normalizes explicit offsets across DST boundaries', () => {
    const window = reportWindow(
      new URLSearchParams({
        startDate: '2026-11-01T01:00:00-05:00',
        endDate: '2026-11-01T01:00:00-06:00',
      }),
    )
    expect(window).toMatchObject({
      start: '2026-11-01T06:00:00.000Z',
      end: '2026-11-01T07:00:00.000Z',
      boundaries: '[start, end)',
    })
  })
  it.each(['garbage', '2026-11-01', '2026-11-01T01:00:00'])(
    'rejects ambiguous dates %s',
    (startDate) => {
      expect(() => reportWindow(new URLSearchParams({ startDate }))).toThrow()
    },
  )
  it('rejects reversed windows', () => {
    expect(() =>
      reportWindow(
        new URLSearchParams({ startDate: '2026-11-02T00:00:00Z', endDate: '2026-11-01T00:00:00Z' }),
      ),
    ).toThrow()
  })
  it('retains only minimal campaign labels', () => {
    expect(
      campaignParameters(
        '/?utm_campaign=launch&utm_source=dispatch&utm_medium=email&email=secret@test.invalid&token=secret',
      ),
    ).toEqual({ utm_campaign: 'launch', utm_source: 'dispatch', utm_medium: 'email' })
    expect(campaignParameters('/?utm_campaign=secret%40test.invalid')).toEqual({})
  })
  it('does not mix currencies, pending orders or duplicate snapshots', () => {
    const result = summarizeOperatorEvents(
      [],
      [order(), order('o2', 'JPY', '123'), { ...order('pending'), state: 'pending-payment' }],
    )
    expect(result.financialSummary.map((row) => [row.currency, row.grossMinor])).toEqual([
      ['USD', '2500'],
      ['JPY', '123'],
    ])
    expect(result.financialSummary[0].netFormatted).toBe('Unknown')
  })
  it('requires a receipt and canonical minor amount', () => {
    expect(paidOrder({ ...order(), receipt: null })).toBe(false)
    expect(paidOrder(order('o1', 'USD', '2.50'))).toBe(false)
  })
  it('counts repeated landings once per subject and one conversion per order', () => {
    const result = summarizeOperatorEvents(
      [touch('a', 's1', 'launch'), touch('b', 's1', 'launch'), conversion(), conversion()],
      [order()],
    )
    expect(result.campaignFunnels[0]).toMatchObject({
      landings: 2,
      uniqueVisitors: 1,
      conversions: 1,
      conversionRate: '100.0',
      conversionAmounts: { USD: '2500' },
    })
  })
  it('compares first and last observed campaigns without linking another subject or future touch', () => {
    const result = summarizeOperatorEvents(
      [
        touch('a', 's1', 'first'),
        touch('b', 's2', 'foreign'),
        touch('c', 's1', 'last', '2026-11-01T02:00:00Z'),
        touch('d', 's1', 'future', '2026-11-01T04:00:00Z'),
        conversion(),
      ],
      [order()],
    )
    expect(result.campaignFunnels.find((row) => row.campaign === 'last')?.attribution).toEqual([
      { source: 'orders:o1', firstTouch: 'first', lastNonDirect: 'last' },
    ])
    expect(result.campaignFunnels.find((row) => row.campaign === 'foreign')?.conversions).toBe(0)
  })
  it('excludes forged, unpaid and identity-unlinked conversions', () => {
    const result = summarizeOperatorEvents(
      [touch('a', 's1', 'launch'), { ...conversion(), trusted: false }, conversion('s2')],
      [order()],
    )
    expect(result.campaignFunnels[0].conversions).toBe(0)
    expect(
      summarizeOperatorEvents([touch('a', 's1', 'launch'), conversion()], []).campaignFunnels[0]
        .conversions,
    ).toBe(0)
  })
  it('returns empty collections for no data', () => {
    expect(summarizeOperatorEvents([], [])).toEqual({
      financialSummary: [],
      campaignFunnels: [],
      unattributedConversions: 0,
    })
  })
})
