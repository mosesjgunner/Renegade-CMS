import { createHmac } from 'node:crypto'
import { expect, it } from 'vitest'
import { createStripeTestAdapter } from '../../src/modules/commerce/payment-provider'

it('does not turn an unrecognized provider state into success', async () => {
  const adapter = createStripeTestAdapter({
    secretKey: 'sk_test_unit',
    webhookSecret: 'unit',
    fetch: async () => new Response(JSON.stringify({ status: 'surprise' })),
  })
  await expect(adapter.reconcileSubscription('sub_1')).rejects.toThrow('Unknown provider')
})
it('rejects an active projection without a valid billing period', async () => {
  const adapter = createStripeTestAdapter({
    secretKey: 'sk_test_unit',
    webhookSecret: 'unit',
    fetch: async () => new Response(JSON.stringify({ status: 'active' })),
  })
  await expect(adapter.reconcileSubscription('sub_1')).rejects.toThrow(
    'Invalid provider billing period',
  )
})
it('previews replacement of the existing provider item and rejects a fabricated zero estimate', async () => {
  let body = ''
  const adapter = createStripeTestAdapter({
    secretKey: 'sk_test_unit',
    webhookSecret: 'unit',
    fetch: async (url, init) => {
      if (String(url).includes('/subscriptions/'))
        return new Response(JSON.stringify({ items: { data: [{ id: 'si_1' }] } }))
      body = String(init?.body)
      return new Response(JSON.stringify({ currency: 'usd' }))
    },
  })
  await expect(
    adapter.previewSubscriptionChange({
      subscriptionReference: 'sub_1',
      priceReference: 'price_2',
    }),
  ).rejects.toThrow('Invalid provider change preview')
  expect(new URLSearchParams(body).get('subscription_details[items][0][id]')).toBe('si_1')
})
it('normalizes failed invoice identity and amount due rather than zero collected', () => {
  const now = new Date(),
    created = Math.floor(now.getTime() / 1000)
  const raw = JSON.stringify({
    id: 'evt_fail',
    created,
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_1',
        object: 'invoice',
        subscription: 'sub_1',
        amount_paid: 0,
        amount_due: 1200,
        currency: 'usd',
      },
    },
  })
  const signature = createHmac('sha256', 'unit').update(`${created}.${raw}`).digest('hex')
  const adapter = createStripeTestAdapter({ secretKey: 'sk_test_unit', webhookSecret: 'unit' })
  expect(
    adapter.normalizeSignedSubscriptionWebhook(raw, `t=${created},v1=${signature}`, now),
  ).toMatchObject({
    invoiceReference: 'in_1',
    kind: 'invoice_failed',
    evidence: { amountMinor: 1200, currency: 'USD' },
  })
})
