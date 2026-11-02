/* eslint-disable @typescript-eslint/no-explicit-any -- runtime-shaped delivery records */
import { afterEach, describe, expect, it } from 'vitest'

import {
  verifyWebhookDeliverySignature,
  webhookDeliverySignature,
} from '../../src/modules/integrations/webhooks'
import {
  consumeInboundWebhookRateLimit,
  inboundWebhookRateLimitPerMinute,
  resetInboundWebhookRateLimitsForTest,
} from '../../src/modules/integrations/rate-limit'
import { reconcileWebhookSubscription } from '../../src/modules/integrations/reconciliation'

describe('16B delivery signature verification (timing-safe comparison)', () => {
  const raw = JSON.stringify({ id: 'evt-1', type: 'content.created' })
  const timestamp = '1793577600'
  const now = new Date(1793577600 * 1000)

  it('accepts a correctly signed delivery', () => {
    const signature = webhookDeliverySignature(raw, 'receiver-secret', timestamp)
    expect(
      verifyWebhookDeliverySignature({ raw, signature, secret: 'receiver-secret', now }).valid,
    ).toBe(true)
  })

  it('rejects a tampered body and a wrong secret as invalid, not malformed', () => {
    const signature = webhookDeliverySignature(raw, 'receiver-secret', timestamp)
    expect(
      verifyWebhookDeliverySignature({ raw: `${raw} `, signature, secret: 'receiver-secret', now }),
    ).toMatchObject({ valid: false, reason: 'invalid' })
    expect(
      verifyWebhookDeliverySignature({ raw, signature, secret: 'other-secret', now }),
    ).toMatchObject({ valid: false, reason: 'invalid' })
  })

  it('keeps the malformed and stale verdicts intact', () => {
    expect(
      verifyWebhookDeliverySignature({ raw, signature: 'garbage', secret: 'receiver-secret', now })
        .reason,
    ).toBe('malformed')
    const signature = webhookDeliverySignature(raw, 'receiver-secret', timestamp)
    expect(
      verifyWebhookDeliverySignature({
        raw,
        signature,
        secret: 'receiver-secret',
        now: new Date(now.getTime() + 301_000),
      }).reason,
    ).toBe('stale')
  })
})

describe('16B inbound webhook rate limit', () => {
  afterEach(() => {
    resetInboundWebhookRateLimitsForTest()
    delete process.env.INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE
  })

  it('allows up to the bound, then blocks with a retry hint', () => {
    process.env.INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE = '3'
    expect(inboundWebhookRateLimitPerMinute()).toBe(3)
    const t0 = 1_000_000
    expect(consumeInboundWebhookRateLimit('email-webhook', t0).allowed).toBe(true)
    expect(consumeInboundWebhookRateLimit('email-webhook', t0).allowed).toBe(true)
    expect(consumeInboundWebhookRateLimit('email-webhook', t0).allowed).toBe(true)
    const blocked = consumeInboundWebhookRateLimit('email-webhook', t0)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1)
    expect(blocked.remaining).toBe(0)
  })

  it('isolates buckets per key and resets after the window', () => {
    process.env.INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE = '1'
    const t0 = 2_000_000
    expect(consumeInboundWebhookRateLimit('commerce-webhook:a', t0).allowed).toBe(true)
    expect(consumeInboundWebhookRateLimit('commerce-webhook:a', t0).allowed).toBe(false)
    // A different provider key is unaffected.
    expect(consumeInboundWebhookRateLimit('commerce-webhook:b', t0).allowed).toBe(true)
    // After the 60s window the first key is allowed again.
    expect(consumeInboundWebhookRateLimit('commerce-webhook:a', t0 + 60_001).allowed).toBe(true)
  })

  it('falls back to the default bound for missing or invalid env values', () => {
    delete process.env.INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE
    expect(inboundWebhookRateLimitPerMinute()).toBe(300)
    process.env.INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE = 'not-a-number'
    expect(inboundWebhookRateLimitPerMinute()).toBe(300)
  })
})

const sub = (overrides: Record<string, any> = {}) => ({
  id: 'sub-1',
  site: 'site-a',
  target: 'https://receiver.example/hook',
  status: 'active',
  failureCount: 0,
  ...overrides,
})
const delivery = (overrides: Record<string, any> = {}) => ({
  id: 'del-1',
  subscription: 'sub-1',
  state: 'delivered',
  attempts: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:05.000Z',
  nextAttemptAt: null,
  ...overrides,
})
const NOW = new Date('2026-11-01T12:00:00.000Z')

describe('16B webhook delivery reconciliation', () => {
  it('reports a healthy subscription from observed delivered records only', () => {
    const view = reconcileWebhookSubscription({
      subscription: sub(),
      deliveries: [delivery()],
      now: NOW,
    })
    expect(view.healthy).toBe(true)
    expect(view.findings).toEqual([])
    expect(view.counts).toMatchObject({ delivered: 1, total: 1 })
    expect(view.lastDeliveredAt).toBe('2026-11-01T10:00:05.000Z')
    expect(view.lastAttemptAt).toBe('2026-11-01T10:00:05.000Z')
  })

  it('flags dead-letter deliveries as critical and never claims a success time', () => {
    const view = reconcileWebhookSubscription({
      subscription: sub({ status: 'disabled', failureCount: 5 }),
      deliveries: [delivery({ id: 'del-9', state: 'dead-letter', attempts: 5 })],
      now: NOW,
    })
    expect(view.healthy).toBe(false)
    expect(view.lastDeliveredAt).toBeNull()
    expect(view.findings.map((f) => f.code)).toContain('dead-letter-awaiting-action')
    expect(
      view.findings.find((f) => f.code === 'dead-letter-awaiting-action')?.deliveryIds,
    ).toEqual(['del-9'])
  })

  it('treats a dead-letter as resolved once its event is redelivered and delivered', () => {
    const view = reconcileWebhookSubscription({
      subscription: sub({ failureCount: 0 }),
      deliveries: [
        delivery({ id: 'del-9', state: 'dead-letter', attempts: 5, eventId: 'evt-7' }),
        delivery({ id: 'del-10', state: 'delivered', attempts: 1, eventId: 'evt-7' }),
      ],
      now: NOW,
    })
    expect(view.findings.map((f) => f.code)).not.toContain('dead-letter-awaiting-action')
    expect(view.counts.deadLetter).toBe(1)
    expect(view.healthy).toBe(true)
  })

  it('flags pending deliveries stranded on a disabled subscription', () => {
    const view = reconcileWebhookSubscription({
      subscription: sub({ status: 'disabled' }),
      deliveries: [delivery({ id: 'del-2', state: 'queued', attempts: 0 })],
      now: NOW,
    })
    expect(view.findings.map((f) => f.code)).toContain('subscription-disabled-with-pending')
    expect(view.pending).toBe(1)
  })

  it('flags counter drift: failure limit reached but subscription still active', () => {
    const view = reconcileWebhookSubscription({
      subscription: sub({ failureCount: 5 }),
      deliveries: [],
      now: NOW,
    })
    const codes = view.findings.map((f) => f.code)
    expect(codes).toContain('failure-limit-without-disable')
    expect(codes).toContain('no-deliveries-recorded')
    expect(view.healthy).toBe(false)
  })

  it('flags stalled due deliveries but not future-scheduled retries', () => {
    const stalled = reconcileWebhookSubscription({
      subscription: sub(),
      deliveries: [
        delivery({
          id: 'del-3',
          state: 'retrying',
          attempts: 2,
          nextAttemptAt: '2026-11-01T11:30:00.000Z',
        }),
      ],
      now: NOW,
    })
    expect(stalled.findings.map((f) => f.code)).toContain('stalled-deliveries')
    expect(stalled.duePending).toBe(1)

    const scheduled = reconcileWebhookSubscription({
      subscription: sub(),
      deliveries: [
        delivery({
          id: 'del-4',
          state: 'retrying',
          attempts: 1,
          nextAttemptAt: '2026-11-01T12:30:00.000Z',
        }),
      ],
      now: NOW,
    })
    expect(scheduled.findings).toEqual([])
    expect(scheduled.duePending).toBe(0)
    expect(scheduled.healthy).toBe(true)
  })

  it('ignores deliveries belonging to other subscriptions', () => {
    const view = reconcileWebhookSubscription({
      subscription: sub(),
      deliveries: [
        delivery(),
        delivery({ id: 'del-x', subscription: 'sub-2', state: 'dead-letter', attempts: 5 }),
        delivery({ id: 'del-y', subscription: { id: 'sub-1' }, state: 'queued', attempts: 0 }),
      ],
      now: NOW,
    })
    expect(view.counts.total).toBe(2)
    expect(view.counts.deadLetter).toBe(0)
    expect(view.counts.queued).toBe(1)
  })
})
