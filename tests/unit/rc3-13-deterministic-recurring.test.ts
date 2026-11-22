import { describe, expect, it } from 'vitest'
import {
  createDeterministicPaymentAdapter,
  recurringProvider,
  type NormalizedSubscriptionEvent,
} from '../../src/modules/commerce/payment-provider'

/**
 * RC3-13 fixture proof: the deterministic test provider now implements
 * the recurring contract F-02 recorded as missing, so provider-hosted
 * recurring checkout is exercisable in the sandbox in provider test
 * mode. These tests pin the fixture's contract behavior only — they
 * prove nothing about a live provider.
 */

const secret = 'rc313-deterministic-fixture-secret'
const makeAdapter = () => createDeterministicPaymentAdapter({ secret, isolated: true })

const checkoutInput = {
  idempotencyKey: 'sub-checkout:rc313-unit-1',
  priceReference: 'det_price_members_monthly',
  expectedPrice: { amountMinor: '1200', currency: 'USD', interval: 'month', intervalCount: 1 },
  successUrl: 'https://site-a.example.test/members/settings?tab=billing&checkout=complete',
  cancelUrl: 'https://site-a.example.test/members/settings?tab=billing&checkout=cancelled',
  customerEmail: 'member@example.test',
  metadata: { renegade_member_id: 'member-1', renegade_site_id: 'site-a' },
}

describe('RC3-13 deterministic recurring fixture', () => {
  it('satisfies the recurring provider contract (the F-02 seam)', () => {
    const adapter = makeAdapter()
    expect(() => recurringProvider(adapter)).not.toThrow()
    const recurring = recurringProvider(adapter)
    expect(typeof recurring.createSubscriptionCheckout).toBe('function')
    expect(typeof recurring.normalizeSignedSubscriptionWebhook).toBe('function')
  })

  it('creates a subscription checkout idempotently with derived references', async () => {
    const adapter = makeAdapter()
    const first = await adapter.createSubscriptionCheckout(checkoutInput)
    expect(first.state).toBe('incomplete')
    expect(first.providerReference).toMatch(/^det_scs_/)
    expect(first.subscriptionReference).toMatch(/^det_sub_/)
    expect(first.customerReference).toMatch(/^det_cus_/)
    expect(first.actionUrl).toContain('/checkout/test/')

    const replay = await adapter.createSubscriptionCheckout(checkoutInput)
    expect(replay).toEqual(first)

    // A different member seeds a different customer; the same member reuses theirs.
    const other = await adapter.createSubscriptionCheckout({
      ...checkoutInput,
      idempotencyKey: 'sub-checkout:rc313-unit-2',
      metadata: { renegade_member_id: 'member-2', renegade_site_id: 'site-a' },
    })
    expect(other.customerReference).not.toBe(first.customerReference)
    const sameMember = await adapter.createSubscriptionCheckout({
      ...checkoutInput,
      idempotencyKey: 'sub-checkout:rc313-unit-3',
    })
    expect(sameMember.customerReference).toBe(first.customerReference)
    expect(sameMember.subscriptionReference).not.toBe(first.subscriptionReference)
  })

  it('starts trialing when trial days are offered and projects provider truth on reconcile', async () => {
    const adapter = makeAdapter()
    const created = await adapter.createSubscriptionCheckout({ ...checkoutInput, trialDays: 14 })
    expect(created.state).toBe('trialing')
    const projection = await adapter.reconcileSubscription(created.subscriptionReference!)
    expect(projection.state).toBe('trialing')
    expect(projection.customerReference).toBe(created.customerReference)
    expect(projection.priceReference).toBe(checkoutInput.priceReference)
    expect(Date.parse(projection.currentPeriodEnd)).toBeGreaterThan(
      Date.parse(projection.currentPeriodStart),
    )

    adapter.setSubscriptionState(created.subscriptionReference!, {
      state: 'active',
      cancelAtPeriodEnd: true,
    })
    const advanced = await adapter.reconcileSubscription(created.subscriptionReference!)
    expect(advanced.state).toBe('active')
    expect(advanced.cancelAtPeriodEnd).toBe(true)

    await expect(adapter.reconcileSubscription('det_sub_missing')).rejects.toMatchObject({
      code: 'not-found',
    })
  })

  it('previews a plan change from the registered price and refuses unregistered prices', async () => {
    const adapter = makeAdapter()
    const created = await adapter.createSubscriptionCheckout(checkoutInput)
    adapter.setSubscriptionPrice('det_price_members_yearly', {
      amountMinor: '12000',
      currency: 'USD',
      interval: 'year',
      intervalCount: 1,
    })
    const preview = await adapter.previewSubscriptionChange({
      subscriptionReference: created.subscriptionReference!,
      priceReference: 'det_price_members_yearly',
    })
    expect(preview.amountMinor).toBe('12000')
    expect(preview.currency).toBe('USD')
    expect(Date.parse(preview.expiresAt)).toBeGreaterThan(Date.now())
    await expect(
      adapter.previewSubscriptionChange({
        subscriptionReference: created.subscriptionReference!,
        priceReference: 'det_price_unknown',
      }),
    ).rejects.toMatchObject({ code: 'configuration' })
  })

  it('hands back a customer portal URL', async () => {
    const adapter = makeAdapter()
    const created = await adapter.createSubscriptionCheckout(checkoutInput)
    const url = await adapter.createCustomerPortal({
      customerReference: created.customerReference!,
      returnUrl: 'https://site-a.example.test/members/settings?tab=billing',
    })
    expect(url).toContain('/billing/test/')
    expect(url).toContain(encodeURIComponent(created.customerReference!))
  })

  it('resolves invoice-only payments through the invoice registry', async () => {
    const adapter = makeAdapter()
    const created = await adapter.createSubscriptionCheckout(checkoutInput)
    expect(
      await adapter.resolveSubscriptionPayment({ invoiceReference: 'det_in_unknown' }),
    ).toEqual({ subscriptionReference: null, fullyRefunded: false })
    adapter.setInvoice('det_in_100', {
      subscriptionReference: created.subscriptionReference!,
      fullyRefunded: true,
    })
    expect(await adapter.resolveSubscriptionPayment({ invoiceReference: 'det_in_100' })).toEqual({
      subscriptionReference: created.subscriptionReference,
      fullyRefunded: true,
    })
    expect(await adapter.resolveSubscriptionPayment({ chargeReference: 'det_in_100' })).toEqual({
      subscriptionReference: created.subscriptionReference,
      fullyRefunded: true,
    })
  })

  it('round-trips signed subscription webhooks and rejects tampering', async () => {
    const adapter = makeAdapter()
    const created = await adapter.createSubscriptionCheckout(checkoutInput)
    const event: NormalizedSubscriptionEvent = {
      providerEventId: 'det_evt_1',
      subscriptionReference: created.subscriptionReference,
      kind: 'invoice_paid',
      occurredAt: '2026-11-21T12:00:00.000Z',
      sequence: 2,
      invoiceReference: 'det_in_100',
      evidence: {
        invoiceReference: 'det_in_100',
        amountMinor: '1200',
        currency: 'USD',
        livemode: false,
      },
    }
    const { raw, signature } = adapter.signSubscriptionEvent(event)
    expect(adapter.normalizeSignedSubscriptionWebhook(raw, signature)).toEqual(event)
    // Wrong key, tampered body, and malformed events all normalize to null.
    const other = createDeterministicPaymentAdapter({ secret: 'another-secret', isolated: true })
    expect(other.normalizeSignedSubscriptionWebhook(raw, signature)).toBeNull()
    expect(
      adapter.normalizeSignedSubscriptionWebhook(raw.replace('1200', '9900'), signature),
    ).toBeNull()
    const badKind = adapter.signSubscriptionEvent({ ...event, kind: 'exploded' as never })
    expect(adapter.normalizeSignedSubscriptionWebhook(badKind.raw, badKind.signature)).toBeNull()
  })

  it('rejects malformed checkout input instead of inventing a price', async () => {
    const adapter = makeAdapter()
    await expect(
      adapter.createSubscriptionCheckout({ ...checkoutInput, idempotencyKey: '' }),
    ).rejects.toThrow(/idempotency/i)
    await expect(
      adapter.createSubscriptionCheckout({
        ...checkoutInput,
        idempotencyKey: 'sub-checkout:bad-price',
        expectedPrice: { amountMinor: '0', currency: 'USD', interval: 'month', intervalCount: 1 },
      }),
    ).rejects.toThrow(/minor units/i)
  })
})
