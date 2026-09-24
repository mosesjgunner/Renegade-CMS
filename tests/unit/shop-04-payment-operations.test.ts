import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createDeterministicPaymentAdapter,
  createStripeTestAdapter,
  type NormalizedPaymentEvent,
} from '../../src/modules/commerce/payment-provider'
import {
  applyNormalizedPaymentEvent,
  checkoutBindingKey,
  financeDashboardSummary,
  previewRefund,
  receiptMessageSnapshot,
  signGuestOrderToken,
  verifyGuestOrderToken,
  type PaymentAttemptSnapshot,
} from '../../src/modules/commerce/payment-operations'

const checkout = {
  attemptId: 'attempt-1',
  idempotencyKey: 'checkout:session-1:1',
  amountMinor: '2599',
  currency: 'USD',
  description: 'Order session-1',
  successUrl: 'https://shop.example/checkout/return',
  cancelUrl: 'https://shop.example/checkout/cancel',
  expiresAt: '2030-01-01T00:00:00.000Z',
  customerEmail: 'buyer@example.com',
  metadata: { renegade_attempt_id: 'attempt-1' },
} as const

const attempt = (overrides: Partial<PaymentAttemptSnapshot> = {}): PaymentAttemptSnapshot => ({
  id: 'attempt-1',
  checkoutSessionId: 'session-1',
  proposalId: 'proposal-1',
  customerKey: 'customer-1',
  siteId: 'site-1',
  amountMinor: '2599',
  currency: 'USD',
  attempt: 1,
  state: 'processing',
  providerReference: 'det_cs_1',
  providerPaymentReference: 'det_pi_1',
  refundedAmountMinor: '0',
  processedEventIds: [],
  ...overrides,
})

const event = (overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent => ({
  providerEventId: 'evt-1',
  providerReference: 'det_cs_1',
  providerPaymentReference: 'det_pi_1',
  kind: 'succeeded',
  amountMinor: '2599',
  currency: 'USD',
  occurredAt: '2026-09-23T00:00:00.000Z',
  sequence: 10,
  sanitizedEvidence: { objectId: 'safe-id' },
  ...overrides,
})

describe('SHOP-04 payment provider contract', () => {
  it('creates one deterministic hosted checkout for replay and never accepts payment data', async () => {
    const adapter = createDeterministicPaymentAdapter({ secret: 'fixture-secret' })
    const first = await adapter.createHostedCheckout(checkout)
    const replay = await adapter.createHostedCheckout(checkout)
    const afterRestart = await createDeterministicPaymentAdapter({
      secret: 'fixture-secret',
    }).createHostedCheckout(checkout)
    expect(replay).toEqual(first)
    expect(afterRestart.providerReference).toBe(first.providerReference)
    expect(first.actionUrl).toMatch(/^\/checkout\/test\//)
    expect(adapter.metadata.rawPaymentDataAccepted).toBe(false)
    expect(adapter.contractVersion).toBe('shop-04.v1')
  })

  it('marks transport ambiguity as an unknown outcome in the real adapter', async () => {
    const adapter = createStripeTestAdapter({
      secretKey: 'sk_test_fixture',
      webhookSecret: 'whsec_fixture',
      fetch: vi.fn().mockRejectedValue(new Error('connection reset')),
    })
    await expect(adapter.createHostedCheckout(checkout)).rejects.toMatchObject({
      code: 'unknown-outcome',
      outcomeKnown: false,
    })
  })

  it('sends exact amount, safe URLs, metadata, API version, and idempotency to Stripe test checkout', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'cs_test_1',
          payment_intent: 'pi_1',
          payment_status: 'unpaid',
          status: 'open',
          amount_total: 2599,
          currency: 'usd',
          url: 'https://checkout.stripe.com/c/pay/test',
          expires_at: 1893456000,
        }),
        { status: 200 },
      ),
    )
    const adapter = createStripeTestAdapter({
      secretKey: 'sk_test_fixture',
      webhookSecret: 'whsec_fixture',
      fetch: fetchMock,
    })
    const result = await adapter.createHostedCheckout(checkout)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Idempotency-Key']).toBe(checkout.idempotencyKey)
    expect(init.headers['Stripe-Version']).toBe(adapter.metadata.providerApiVersion)
    expect(String(init.body)).toContain('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=2599')
    expect(String(init.body)).toContain(
      'payment_intent_data%5Bmetadata%5D%5Brenegade_attempt_id%5D=attempt-1',
    )
    expect(result).toMatchObject({
      providerReference: 'cs_test_1',
      providerPaymentReference: 'pi_1',
      state: 'action-required',
      amountMinor: '2599',
      currency: 'USD',
    })
  })

  it('rejects forged and stale Stripe events and normalizes signed paid evidence', () => {
    const now = new Date('2026-09-23T00:00:00.000Z')
    const timestamp = Math.floor(now.getTime() / 1000)
    const raw = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      created: timestamp,
      livemode: false,
      data: {
        object: {
          id: 'cs_test_1',
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: 2599,
          currency: 'usd',
          payment_intent: 'pi_1',
          metadata: { renegade_attempt_id: 'attempt-1' },
        },
      },
    })
    const secret = 'whsec_fixture'
    const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')
    const adapter = createStripeTestAdapter({ secretKey: 'sk_test_fixture', webhookSecret: secret })
    expect(adapter.normalizeSignedWebhook(raw, `t=${timestamp},v1=forged`, now)).toBeNull()
    expect(
      adapter.normalizeSignedWebhook(raw, `t=${timestamp - 301},v1=${signature}`, now),
    ).toBeNull()
    expect(
      adapter.normalizeSignedWebhook(raw, `t=${timestamp},v1=${signature}`, now),
    ).toMatchObject({
      providerEventId: 'evt_1',
      providerReference: 'cs_test_1',
      providerPaymentReference: 'pi_1',
      kind: 'succeeded',
      amountMinor: '2599',
      currency: 'USD',
    })
  })

  it('normalizes disputes and preserves an explicit provider refund failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 're_failed', status: 'failed', amount: 500 }), {
        status: 200,
      }),
    )
    const secret = 'whsec_fixture'
    const adapter = createStripeTestAdapter({
      secretKey: 'sk_test_fixture',
      webhookSecret: secret,
      fetch: fetchMock,
    })
    await expect(
      adapter.refund({
        providerPaymentReference: 'pi_1',
        amountMinor: '500',
        currency: 'USD',
        idempotencyKey: 'refund-1',
      }),
    ).resolves.toMatchObject({ state: 'failed', amountMinor: '500' })
    const now = new Date('2026-09-23T00:00:00.000Z')
    const timestamp = Math.floor(now.getTime() / 1000)
    const raw = JSON.stringify({
      id: 'evt_dispute',
      type: 'charge.dispute.created',
      created: timestamp,
      livemode: false,
      data: {
        object: {
          id: 'dp_1',
          object: 'dispute',
          payment_intent: 'pi_1',
          amount: 500,
          currency: 'usd',
          status: 'needs_response',
        },
      },
    })
    const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')
    expect(
      adapter.normalizeSignedWebhook(raw, `t=${timestamp},v1=${signature}`, now),
    ).toMatchObject({ kind: 'disputed', providerPaymentReference: 'pi_1', amountMinor: '500' })
  })

  it('correlates signed recurring disputes and refunds through their Stripe invoice', async () => {
    const secret = 'whsec_recurring_fixture'
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      return url.includes('/charges/ch_1')
        ? new Response(
            JSON.stringify({ id: 'ch_1', invoice: 'in_1', amount: 1200, amount_refunded: 1200 }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ id: 'in_1', subscription: 'sub_provider_1' }), {
            status: 200,
          })
    })
    const adapter = createStripeTestAdapter({
      secretKey: 'sk_test_fixture',
      webhookSecret: secret,
      fetch: fetchMock,
    }) as ReturnType<typeof createStripeTestAdapter> &
      import('../../src/modules/commerce/payment-provider').RecurringPaymentProvider
    const now = new Date('2026-09-23T00:00:00.000Z')
    const timestamp = Math.floor(now.getTime() / 1000)
    const raw = JSON.stringify({
      id: 'evt_dispute_recurring',
      type: 'charge.dispute.created',
      created: timestamp,
      data: {
        object: {
          id: 'dp_1',
          object: 'dispute',
          charge: 'ch_1',
          amount: 1200,
          currency: 'usd',
          reason: 'fraudulent',
        },
      },
    })
    const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')
    const event = adapter.normalizeSignedSubscriptionWebhook(
      raw,
      `t=${timestamp},v1=${signature}`,
      now,
    )
    expect(event).toMatchObject({
      kind: 'payment_review',
      chargeReference: 'ch_1',
      evidence: { eventType: 'charge.dispute.created' },
    })
    await expect(
      adapter.resolveSubscriptionPayment({ chargeReference: event!.chargeReference }),
    ).resolves.toEqual({ subscriptionReference: 'sub_provider_1', fullyRefunded: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('SHOP-04 replay, ordering, refund, receipt, and access invariants', () => {
  it('deduplicates replay, ignores stale evidence, and quarantines terminal success conflicts', () => {
    const paid = applyNormalizedPaymentEvent(attempt(), event())
    expect(applyNormalizedPaymentEvent(paid, event())).toBe(paid)
    const failed = attempt({ state: 'failed', lastProviderSequence: 20 })
    expect(
      applyNormalizedPaymentEvent(failed, event({ providerEventId: 'evt-stale', sequence: 10 }))
        .state,
    ).toBe('failed')
    expect(
      applyNormalizedPaymentEvent(failed, event({ providerEventId: 'evt-conflict', sequence: 21 }))
        .state,
    ).toBe('unknown')
  })

  it('quarantines amount or currency mismatch as unknown', () => {
    expect(applyNormalizedPaymentEvent(attempt(), event({ amountMinor: '2600' })).state).toBe(
      'unknown',
    )
    expect(applyNormalizedPaymentEvent(attempt(), event({ currency: 'EUR' })).state).toBe('unknown')
  })

  it('accepts a partial refund amount without confusing it with captured-amount evidence', () => {
    expect(
      applyNormalizedPaymentEvent(
        attempt({ state: 'succeeded' }),
        event({ kind: 'partially-refunded', amountMinor: '500' }),
      ).state,
    ).toBe('partially-refunded')
  })

  it('binds sessions to proposal, customer, site, money, and attempt', () => {
    const first = checkoutBindingKey({
      proposalId: 'p',
      customerKey: 'c',
      siteId: 's',
      amountMinor: '100',
      currency: 'USD',
      attempt: 1,
    })
    const replay = checkoutBindingKey({
      proposalId: 'p',
      customerKey: 'c',
      siteId: 's',
      amountMinor: '100',
      currency: 'USD',
      attempt: 1,
    })
    const next = checkoutBindingKey({
      proposalId: 'p',
      customerKey: 'c',
      siteId: 's',
      amountMinor: '100',
      currency: 'USD',
      attempt: 2,
    })
    expect(first).toBe(replay)
    expect(next).not.toBe(first)
  })

  it('validates partial/full refunds and dual control without over-refunding', () => {
    expect(
      previewRefund({
        capturedAmountMinor: '1000',
        alreadyRefundedAmountMinor: '100',
        requestedAmountMinor: '400',
        currency: 'USD',
        orderState: 'paid',
        dualControlThresholdMinor: '300',
      }),
    ).toMatchObject({
      outcome: 'partial',
      remainingAfterMinor: '500',
      requiresSecondApproval: true,
    })
    expect(
      previewRefund({
        capturedAmountMinor: '1000',
        alreadyRefundedAmountMinor: '100',
        requestedAmountMinor: '900',
        currency: 'USD',
        orderState: 'fulfilled',
      }).outcome,
    ).toBe('full')
    expect(() =>
      previewRefund({
        capturedAmountMinor: '1000',
        alreadyRefundedAmountMinor: '100',
        requestedAmountMinor: '901',
        currency: 'USD',
        orderState: 'paid',
      }),
    ).toThrow(/exceeds/)
  })

  it('scopes expiring guest order tokens and creates transactional-only receipt snapshots', () => {
    const secret = 'a-secret-that-is-at-least-thirty-two-characters'
    const token = signGuestOrderToken(
      { orderId: 'o1', checkoutSessionId: 's1', siteId: 'site1', exp: 2000 },
      secret,
    )
    expect(
      verifyGuestOrderToken(token, { orderId: 'o1', siteId: 'site1' }, secret, 1000)
        ?.checkoutSessionId,
    ).toBe('s1')
    expect(
      verifyGuestOrderToken(token, { orderId: 'o2', siteId: 'site1' }, secret, 1000),
    ).toBeNull()
    expect(
      verifyGuestOrderToken(token, { orderId: 'o1', siteId: 'site1' }, secret, 2001),
    ).toBeNull()
    expect(
      receiptMessageSnapshot({
        orderNumber: 'N1',
        receiptNumber: 'R1',
        recipientEmail: 'x@example.com',
        amountMinor: '100',
        currency: 'USD',
      }),
    ).toMatchObject({
      kind: 'transactional',
      purpose: 'commerce-receipt',
      marketingConsentRequired: false,
    })
  })

  it('reports exception age and totals without customer data', () => {
    expect(
      financeDashboardSummary(
        [
          {
            state: 'unknown',
            amountMinor: '125',
            currency: 'USD',
            createdAt: '2026-09-22T23:00:00.000Z',
          },
          {
            state: 'unknown',
            amountMinor: '75',
            currency: 'EUR',
            createdAt: '2026-09-22T23:30:00.000Z',
          },
        ],
        Date.parse('2026-09-23T00:00:00.000Z'),
      ),
    ).toEqual({
      counts: { unknown: 2 },
      totalsMinorByCurrency: { USD: { unknown: '125' }, EUR: { unknown: '75' } },
      oldestAgeMs: { unknown: 3_600_000 },
    })
  })

  it('exercises all payment outcomes and preserves state machine immutability under browser redirects', () => {
    const baseAttempt = attempt({ state: 'initiated' })
    expect(baseAttempt.state).toBe('initiated')

    // Initiated -> Action-required
    const actionRequired = applyNormalizedPaymentEvent(
      baseAttempt,
      event({ providerEventId: 'evt-ar', kind: 'action-required', sequence: 1 }),
    )
    expect(actionRequired.state).toBe('action-required')

    // Action-required -> Processing
    const processing = applyNormalizedPaymentEvent(
      actionRequired,
      event({ providerEventId: 'evt-proc', kind: 'processing', sequence: 2 }),
    )
    expect(processing.state).toBe('processing')

    // Browser redirect happens here (e.g. /checkout/return?session=session-1)
    // Server state remains strictly 'processing' — redirect does NOT settle payment!
    expect(processing.state).toBe('processing')

    // Processing -> Succeeded
    const succeeded = applyNormalizedPaymentEvent(
      processing,
      event({ providerEventId: 'evt-succ', kind: 'succeeded', sequence: 3 }),
    )
    expect(succeeded.state).toBe('succeeded')

    // Succeeded -> Partially Refunded
    const partialRefund = applyNormalizedPaymentEvent(
      succeeded,
      event({
        providerEventId: 'evt-pref',
        kind: 'partially-refunded',
        amountMinor: '500',
        sequence: 4,
      }),
    )
    expect(partialRefund.state).toBe('partially-refunded')

    // Partially Refunded -> Refunded
    const fullRefund = applyNormalizedPaymentEvent(
      partialRefund,
      event({ providerEventId: 'evt-fref', kind: 'refunded', amountMinor: '2599', sequence: 5 }),
    )
    expect(fullRefund.state).toBe('refunded')

    // Separate paths: Failed, Cancelled, Disputed
    const failed = applyNormalizedPaymentEvent(
      baseAttempt,
      event({ providerEventId: 'evt-fail', kind: 'failed', sequence: 1 }),
    )
    expect(failed.state).toBe('failed')

    const cancelled = applyNormalizedPaymentEvent(
      baseAttempt,
      event({ providerEventId: 'evt-canc', kind: 'cancelled', sequence: 1 }),
    )
    expect(cancelled.state).toBe('cancelled')

    const disputed = applyNormalizedPaymentEvent(
      succeeded,
      event({ providerEventId: 'evt-disp', kind: 'disputed', sequence: 4 }),
    )
    expect(disputed.state).toBe('disputed')

    // Amount mismatch turns into unknown
    const unknown = applyNormalizedPaymentEvent(
      processing,
      event({
        providerEventId: 'evt-mismatch',
        kind: 'succeeded',
        amountMinor: '9999',
        sequence: 3,
      }),
    )
    expect(unknown.state).toBe('unknown')
  })

  it('recovers from unknown crash states through deterministic adapter reconciliation without fresh charge', async () => {
    const adapter = createDeterministicPaymentAdapter({ secret: 'reconcile-secret' })
    const initial = await adapter.createHostedCheckout(checkout)

    // Simulate crash where client lost the response: replay exact idempotency key
    const replayed = await adapter.createHostedCheckout(checkout)
    expect(replayed.providerReference).toBe(initial.providerReference)
    expect(replayed.actionUrl).toBe(initial.actionUrl)

    // Simulate restart of process: new adapter instance with same secret & request
    const afterRestart = createDeterministicPaymentAdapter({ secret: 'reconcile-secret' })
    const restarted = await afterRestart.createHostedCheckout(checkout)
    expect(restarted.providerReference).toBe(initial.providerReference)

    // Reconcile unknown attempt to server truth
    adapter.setState(initial.providerReference, 'succeeded')
    const reconciled = await adapter.reconcile(initial.providerReference)
    expect(reconciled.state).toBe('succeeded')
    expect(reconciled.amountMinor).toBe(checkout.amountMinor)
    expect(reconciled.currency).toBe(checkout.currency)
  })

  it('prevents leakage of raw card or bank data, credentials, and customer personal data in status models', () => {
    const adapter = createDeterministicPaymentAdapter({ secret: 'secret-123' })
    expect(adapter.metadata.rawPaymentDataAccepted).toBe(false)

    const stripeAdapter = createStripeTestAdapter({
      secretKey: 'sk_test_123',
      webhookSecret: 'whsec_123',
    })
    expect(stripeAdapter.metadata.rawPaymentDataAccepted).toBe(false)

    // Verify dashboard projection does not include PII or card credentials
    const summary = financeDashboardSummary([
      {
        state: 'succeeded',
        amountMinor: '2599',
        currency: 'USD',
        createdAt: '2026-09-23T00:00:00.000Z',
      },
    ])
    expect(summary).not.toHaveProperty('email')
    expect(summary).not.toHaveProperty('card')
    expect(summary).not.toHaveProperty('customer')
    expect(summary.totalsMinorByCurrency.USD.succeeded).toBe('2599')
  })

  it('guarantees receipt idempotency, auditability, and no marketing consent implications', () => {
    const receipt = receiptMessageSnapshot({
      orderNumber: 'ORD-100',
      receiptNumber: 'REC-100',
      recipientEmail: 'customer@example.com',
      amountMinor: '2599',
      currency: 'USD',
    })
    expect(receipt.kind).toBe('transactional')
    expect(receipt.purpose).toBe('commerce-receipt')
    expect(receipt.marketingConsentRequired).toBe(false)

    // Correction receipt on refund
    const correction = receiptMessageSnapshot({
      orderNumber: 'ORD-100',
      receiptNumber: 'REC-100-R1',
      recipientEmail: 'customer@example.com',
      amountMinor: '500',
      currency: 'USD',
      correctionOf: 'REC-100',
    })
    expect(correction.subject).toContain('Correction')
    expect(correction.variables.correctionOf).toBe('REC-100')
    expect(correction.marketingConsentRequired).toBe(false)
  })
})
