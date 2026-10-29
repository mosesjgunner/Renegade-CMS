/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const providerRefund = vi.hoisted(() => vi.fn())
const referralReconcile = vi.hoisted(() => vi.fn().mockResolvedValue({ state: 'unattributed' }))
vi.mock('../../src/modules/commerce/referral-lifecycle', () => ({
  reconcileOrderReferral: referralReconcile,
}))
vi.mock('payload', () => ({
  createLocalReq: async (_: unknown, payload: unknown) => ({ payload }),
}))
vi.mock('../../src/modules/commerce/payment-provider', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  configuredPaymentProvider: () => ({ refund: providerRefund }),
}))

import { executeRefund } from '../../src/modules/commerce/refund-execution'
import { PaymentProviderError } from '../../src/modules/commerce/payment-provider'

function store() {
  const order: any = {
    id: 'order',
    site: 'site',
    amountMinor: '500',
    currency: 'USD',
    state: 'paid',
    orderNumber: 'LOCAL-1',
    transitionLog: [],
    partySnapshot: {},
  }
  const attempt: any = {
    id: 'attempt',
    providerKey: 'deterministic-test',
    providerPaymentReference: 'local-payment',
    paymentIntent: 'payment',
  }
  const refund: any = {
    id: 'refund',
    state: 'previewed',
    amountMinor: '500',
    currency: 'USD',
    idempotencyKey: 'local-refund',
    order,
    paymentAttempt: attempt,
    auditLog: [],
  }
  let failEffects = true
  const payload: any = {
    config: {},
    jobs: { queue: vi.fn() },
    db: {
      beginTransaction: vi.fn(async () => 'transaction'),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
    },
    findByID: vi.fn(async ({ collection }: any) =>
      collection === 'commerce-refunds' ? { ...refund } : null,
    ),
    find: vi.fn(async ({ collection }: any) => {
      if (collection === 'commerce-refunds') {
        if (failEffects) throw new Error('Local projection database unavailable')
        return { docs: [refund] }
      }
      return { docs: [] }
    }),
    update: vi.fn(async ({ collection, data }: any) => {
      const record =
        collection === 'commerce-refunds' ? refund : collection === 'orders' ? order : attempt
      Object.assign(record, data)
      return { ...record }
    }),
  }
  return {
    payload,
    refund,
    order,
    recover: () => {
      failEffects = false
    },
  }
}

describe('confirmed refunds and local reconciliation', () => {
  beforeEach(() => {
    providerRefund.mockReset()
  })

  it('preserves confirmed provider truth on local failure, then reconciles without another refund', async () => {
    providerRefund.mockResolvedValue({
      state: 'succeeded',
      providerRefundReference: 'local-refund-reference',
      amountMinor: '500',
    })
    const fixture = store()
    const pending = await executeRefund(fixture.payload, 'refund')
    expect(pending.status).toBe(202)
    expect(await pending.json()).toMatchObject({
      reconcileRequired: true,
      providerOutcome: 'succeeded',
    })
    expect(fixture.refund.state).toBe('succeeded')
    expect(fixture.refund.providerEvidence.localReconciliationRequired).toBe(true)
    expect(fixture.order.state).toBe('paid')
    expect(fixture.payload.db.rollbackTransaction).toHaveBeenCalledOnce()
    fixture.recover()
    expect((await executeRefund(fixture.payload, 'refund')).status).toBe(200)
    expect(referralReconcile).toHaveBeenCalledWith(fixture.payload, 'order')
    expect(fixture.order.state).toBe('refunded')
    expect(fixture.refund.providerEvidence.localReconciliationRequired).toBe(false)
    expect((await executeRefund(fixture.payload, 'refund')).status).toBe(200)
    expect(fixture.order.transitionLog).toHaveLength(1)
    expect(providerRefund).toHaveBeenCalledOnce()
  })

  it('keeps unknown provider outcomes pending and does not revoke benefits', async () => {
    providerRefund.mockRejectedValue(
      new PaymentProviderError('provider-unavailable', 'Local protocol response lost', true, false),
    )
    const fixture = store()
    const response = await executeRefund(fixture.payload, 'refund')
    expect(response.status).toBe(202)
    expect(fixture.refund.state).toBe('unknown')
    expect(fixture.order.state).toBe('paid')
    expect(fixture.payload.db.beginTransaction).not.toHaveBeenCalled()
    expect(providerRefund).toHaveBeenCalledOnce()
  })
  it('quarantines a provider refund amount mismatch without applying benefits or financial effects', async () => {
    providerRefund.mockResolvedValue({
      state: 'succeeded',
      providerRefundReference: 'mismatched',
      amountMinor: '499',
    })
    const fixture = store()
    fixture.recover()
    const response = await executeRefund(fixture.payload, 'refund')
    expect(response.status).toBe(202)
    expect(fixture.refund.state).toBe('unknown')
    expect(fixture.refund.providerEvidence.code).toBe('refund-amount-mismatch')
    expect(fixture.order.state).toBe('paid')
    expect(fixture.payload.db.beginTransaction).not.toHaveBeenCalled()
  })
})
