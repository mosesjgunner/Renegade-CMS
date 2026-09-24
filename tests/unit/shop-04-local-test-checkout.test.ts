import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ webhook: vi.fn(), attemptState: 'action-required' }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    find: async () => ({
      docs: [
        {
          id: 'attempt-1',
          site: 'site-1',
          checkoutSession: 'session-1',
          providerKey: 'deterministic-test',
          state: state.attemptState,
          amountMinor: '500',
          currency: 'USD',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    }),
    findByID: async () => ({ id: 'session-1', state: 'open' }),
  }),
}))
vi.mock('@/modules/commerce/payment-operations', () => ({
  verifyGuestOrderToken: (token: string) => token === 'authorized',
}))
vi.mock('@/app/(frontend)/api/commerce/webhooks/[provider]/route', () => ({
  POST: state.webhook,
}))

import { POST } from '../../src/app/(frontend)/api/commerce/checkout/test/confirm/route'
import { signedLocalPaymentEvent } from '../../src/modules/commerce/local-test-checkout'
import { createDeterministicPaymentAdapter } from '../../src/modules/commerce/payment-provider'

function request(cookie = '') {
  return new Request('http://localhost/api/commerce/checkout/test/confirm', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'reference=det_cs_0123456789abcdef01234567',
  })
}

describe('local checkout boundary', () => {
  beforeEach(() => {
    state.webhook.mockReset().mockResolvedValue(new Response('{}', { status: 202 }))
    state.attemptState = 'action-required'
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    process.env.COMMERCE_GUEST_ORDER_SECRET = 'unit-test-guest-order-secret-long-enough'
  })

  it('keeps the test payment endpoint disabled without explicit local mode', async () => {
    delete process.env.LOCAL_E2E_TEST_MODE
    expect((await POST(request())).status).toBe(404)
    expect(state.webhook).not.toHaveBeenCalled()
  })

  it('requires the guest checkout capability before queueing payment evidence', async () => {
    expect((await POST(request())).status).toBe(403)
    expect(state.webhook).not.toHaveBeenCalled()
  })

  it('queues a signed deterministic event once and redirects to persisted status', async () => {
    const response = await POST(request('renegade_checkout_session-1=authorized'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/checkout/return?session=session-1')
    expect(state.webhook).toHaveBeenCalledTimes(1)
    const [eventRequest] = state.webhook.mock.calls[0]
    const raw = await eventRequest.text()
    expect(eventRequest.headers.get('x-commerce-signature')).toBe(
      createHmac('sha256', 'development-only').update(raw).digest('hex'),
    )
    expect(JSON.parse(raw)).toMatchObject({
      providerEventId: 'local-test-paid:attempt-1',
      kind: 'succeeded',
      amountMinor: '500',
      currency: 'USD',
    })
    state.attemptState = 'succeeded'
    expect((await POST(request('renegade_checkout_session-1=authorized'))).status).toBe(303)
    expect(state.webhook).toHaveBeenCalledTimes(1)
  })

  it('signs the exact payload with the configured test secret', () => {
    const event = signedLocalPaymentEvent({
      attemptId: 'attempt-2',
      providerReference: 'det_cs_0123456789abcdef01234567',
      amountMinor: '1200',
      currency: 'USD',
      secret: 'secret',
    })
    expect(event.signature).toBe(createHmac('sha256', 'secret').update(event.raw).digest('hex'))
  })

  it('accepts loopback HTTP returns only in explicit local test mode', async () => {
    const env = process.env as Record<string, string | undefined>
    const previousNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'
    const adapter = createDeterministicPaymentAdapter({ secret: 'secret' })
    const input = {
      attemptId: 'attempt-3',
      idempotencyKey: 'local-test-attempt-3',
      amountMinor: '500',
      currency: 'USD',
      description: 'Local test',
      successUrl: 'http://localhost:3110/checkout/return',
      cancelUrl: 'http://localhost:3110/checkout/cancel',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      metadata: {},
    }
    try {
      expect((await adapter.createHostedCheckout(input)).actionUrl).toMatch(/^\/checkout\/test\//)
      delete process.env.LOCAL_E2E_TEST_MODE
      await expect(
        adapter.createHostedCheckout({
          ...input,
          idempotencyKey: 'remote-http-test',
          successUrl: 'http://example.test/checkout/return',
        }),
      ).rejects.toThrow('allowed web protocol')
    } finally {
      if (previousNodeEnv === undefined) {
        delete env.NODE_ENV
      } else {
        env.NODE_ENV = previousNodeEnv
      }
    }
  })
})
