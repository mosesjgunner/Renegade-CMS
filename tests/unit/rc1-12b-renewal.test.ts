import { providerPlanChangeDue } from '../../src/modules/commerce/subscription-service'
import { describe, expect, it } from 'vitest'
import {
  billingDeadline,
  subscriptionInvoices,
} from '../../src/modules/commerce/subscription-reconciliation'

describe('renewal invoices and durable dunning', () => {
  it('records distinct invoices and never downgrades a paid invoice on late failure', () => {
    const event = (kind: string, reference: string, occurredAt: string) => ({
      kind,
      occurredAt,
      evidence: { invoiceReference: reference, amountMinor: 1200, currency: 'USD' },
    })
    expect(
      subscriptionInvoices([
        event('invoice_failed', 'in_1', '2026-10-01'),
        event('invoice_paid', 'in_1', '2026-10-02'),
        event('invoice_failed', 'in_1', '2026-10-03'),
        event('invoice_failed', 'in_2', '2026-11-01'),
      ]),
    ).toMatchObject([
      { reference: 'in_2', state: 'payment_failed' },
      { reference: 'in_1', state: 'paid', amountMinor: '1200' },
    ])
  })
  it('anchors grace to the failed invoice rather than worker wall clock', () => {
    const row = { failure: { occurredAt: '2026-10-01T00:00:00.000Z' } }
    expect(
      billingDeadline(row, 'past_due', '2026-10-01T00:00:00.000Z', new Date('2026-10-02')),
    ).toEqual({ state: 'grace', graceEnd: '2026-10-04T00:00:00.000Z' })
    expect(
      billingDeadline(row, 'past_due', '2026-10-01T00:00:00.000Z', new Date('2026-10-05')).state,
    ).toBe('expired')
  })
  it('expires existing grace when provider continues reporting past due', () => {
    expect(
      billingDeadline(
        { graceEnd: '2026-10-02T00:00:00Z' },
        'past_due',
        '2026-10-01',
        new Date('2026-10-03'),
      ).state,
    ).toBe('expired')
  })
  it('does not reopen an expired grace on another retry', () => {
    const row = { graceEnd: '2026-10-02T00:00:00Z' }
    for (const day of [3, 4, 5])
      expect(
        billingDeadline(row, 'past_due', '2026-10-01', new Date(`2026-10-0${day}`)).state,
      ).toBe('expired')
  })
  it('keeps cancellation until its contractual end and then terminates', () => {
    expect(
      billingDeadline({}, 'cancel_at_period_end', '2026-11-01', new Date('2026-10-30')).state,
    ).toBe('cancel_at_period_end')
    expect(
      billingDeadline({}, 'cancel_at_period_end', '2026-11-01', new Date('2026-11-01')).state,
    ).toBe('canceled')
  })
  it('expires last-known active access without inventing renewal', () => {
    expect(billingDeadline({}, 'active', '2026-11-01', new Date('2026-11-01')).state).toBe(
      'expired',
    )
  })
  it('clears old grace only after confirmed active recovery', () => {
    expect(
      billingDeadline({ graceEnd: '2026-10-01' }, 'active', '2026-12-01', new Date('2026-11-01')),
    ).toEqual({ state: 'active', graceEnd: null })
  })
})

it('honors immutable plan-change timing and fails closed before period rollover', () => {
  expect(providerPlanChangeDue({ changePolicy: 'period_end' }, '2026-11-01', '2026-10-01')).toBe(
    false,
  )
  expect(providerPlanChangeDue({ changePolicy: 'period_end' }, '2026-11-01', '2026-11-01')).toBe(
    true,
  )
  expect(providerPlanChangeDue({ changePolicy: 'immediate' }, '2026-11-01', '2026-10-01')).toBe(
    true,
  )
})
