import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  PrintfulPodAdapter,
  normalizePrintfulOrderState,
} from '../../src/modules/commerce/pod-real-provider'
import { PodProviderError } from '../../src/modules/commerce/pod-contract'
import { PodEmulatorAdapter } from '../../src/modules/commerce/pod-emulator'
import { submitPodJobWithRetry } from '../../src/modules/commerce/pod-operations'
import { reconcilePodJobWithProvider } from '../../src/modules/commerce/pod-reconciliation'
import type { PODJob } from '../../src/modules/commerce/fulfillment-plan'

const job: PODJob = {
  id: 'job-local',
  orderId: 'order-local',
  siteId: 'site-local',
  connectionId: 'connection-local',
  providerKey: 'pod-emulator',
  packageIndex: 0,
  idempotencyKey: 'local-stable-key',
  payloadHash: 'local-hash',
  state: 'created',
  addressPolicy: 'domestic',
  recipientSnapshot: {
    name: 'Local Test',
    address1: '1 Test St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  itemsSnapshot: [],
  costSnapshot: { estimatedCostMinor: '0', currency: 'USD' },
  attemptCount: 0,
  auditTrail: [],
  createdAt: '2026-10-29T00:00:00Z',
  updatedAt: '2026-10-29T00:00:00Z',
}

describe('13B provider outcome truth', () => {
  it.each([
    ['draft', 'created'],
    ['pending', 'submitted'],
    ['onhold', 'on_hold'],
    ['inprocess', 'in_production'],
    ['partial', 'partially_shipped'],
    ['fulfilled', 'shipped'],
    ['canceled', 'cancelled'],
    ['failed', 'failed'],
    ['new-provider-status', 'exception'],
    ['', 'exception'],
  ])('maps actual status %s to %s', (status, expected) => {
    expect(normalizePrintfulOrderState(status)).toBe(expected)
  })

  it('retains an unknown status and actual request identifier without manufacturing shipment', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { id: 42, status: 'unrecognized' } }), {
        headers: { 'x-request-id': 'request-42' },
      }),
    )
    const adapter = new PrintfulPodAdapter({ apiKey: 'local-test-token', fetchFn })
    const result = await adapter.getOrder('42')
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      externalOrderId: '42',
      state: 'exception',
      providerStatus: 'unrecognized',
      requestId: 'request-42',
      fulfillments: [],
    })
  })

  it.each([
    new PodProviderError('unknown-outcome', 'secret=do-not-persist', true, false),
    new Error('Bearer do-not-persist'),
  ])('blocks retry and manual duplication after ambiguous submission', async (error) => {
    const adapter = new PodEmulatorAdapter()
    const create = vi.spyOn(adapter, 'createOrder').mockRejectedValue(error)
    const first = await submitPodJobWithRetry({ job, adapter })
    expect(first.success).toBe(false)
    expect(first).toMatchObject({
      retryable: false,
      handoffRequired: false,
      job: { state: 'exception', attemptCount: 1 },
    })
    expect(JSON.stringify(first)).not.toContain('do-not-persist')
    expect(first.job.auditTrail[0].details).toMatchObject({
      outcomeKnown: false,
      idempotencyKey: job.idempotencyKey,
    })
    const second = await submitPodJobWithRetry({ job: first.job, adapter })
    expect(second.success).toBe(false)
    expect(create).toHaveBeenCalledOnce()
    expect(second.job.attemptCount).toBe(1)
  })

  it('keeps known transient rejection retryable', async () => {
    const adapter = new PodEmulatorAdapter()
    vi.spyOn(adapter, 'createOrder').mockRejectedValue(
      new PodProviderError('rate-limited', 'private provider response', true, true),
    )
    const result = await submitPodJobWithRetry({ job, adapter })
    expect(result).toMatchObject({
      success: false,
      retryable: true,
      handoffRequired: false,
      job: { state: 'submitting', attemptCount: 1 },
    })
    expect(JSON.stringify(result)).not.toContain('private provider response')
  })
})

describe('13B polling uncertainty', () => {
  it.each(['created', 'on_hold', 'submitting', 'exception'] as const)(
    'does not turn %s into an accepted order event',
    async (state) => {
      const adapter = new PodEmulatorAdapter()
      vi.spyOn(adapter, 'getOrder').mockResolvedValue({
        externalOrderId: 'provider-42',
        state,
        providerStatus: 'actual-status',
        requestId: 'request-43',
      })
      const updated = await reconcilePodJobWithProvider(
        { ...job, state: 'exception', externalOrderId: 'provider-42' },
        adapter,
      )
      expect(updated.state).toBe('exception')
      expect(updated.auditTrail.at(-1)).toMatchObject({
        action: 'provider_state_unresolved',
        details: { observedState: state, providerStatus: 'actual-status', requestId: 'request-43' },
      })
      expect(updated.lastError).toContain('not confirmed')
    },
  )
})

describe('13B provider identity submission boundary', () => {
  it.each(['created', 'on_hold', 'submitting'] as const)(
    'does not resubmit %s when a provider order already exists',
    async (state) => {
      const adapter = new PodEmulatorAdapter()
      const create = vi.spyOn(adapter, 'createOrder')
      const result = await submitPodJobWithRetry({
        job: {
          ...job,
          state,
          releasedAt: job.createdAt,
          externalOrderId: 'existing-provider-order',
        },
        adapter,
      })
      expect(result.success).toBe(false)
      expect(create).not.toHaveBeenCalled()
    },
  )
})

describe('13B rejected provider observations', () => {
  it('lookup failure is not proof that an order does not exist', async () => {
    const adapter = new PrintfulPodAdapter({
      apiKey: 'local-only-test-token',
      fetchFn: vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
    })
    await expect(adapter.findOrderByIdempotencyKey('stable-key')).rejects.toMatchObject({
      code: 'provider-unavailable',
      outcomeKnown: false,
      httpStatus: 503,
    })
  })
  it('signed unrecognized webhook cannot invent an order-created event', () => {
    const adapter = new PrintfulPodAdapter({ apiKey: 'local-only-test-token' })
    const body = JSON.stringify({
      type: 'unknown-future-event',
      created: 12345,
      data: { order: { id: 42 } },
    })
    const sig = createHmac('sha256', 'local-secret').update(body).digest('hex')
    expect(adapter.verifyWebhook(body, sig, 'local-secret')).toBeNull()
  })
})
