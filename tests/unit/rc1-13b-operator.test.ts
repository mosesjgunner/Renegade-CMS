/* eslint-disable @typescript-eslint/no-explicit-any -- stateful durable-boundary test double */
import { beforeEach, describe, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  submit: vi.fn(),
  adapter: {
    key: 'printful',
    metadata: { mode: 'deterministic-emulator' },
    health: vi.fn(),
    findOrderByIdempotencyKey: vi.fn(),
    getOrder: vi.fn(),
  },
}))
vi.mock('../../src/modules/commerce/pod-adapters', () => ({
  adapterForPodConnection: () => f.adapter,
}))
vi.mock('../../src/modules/commerce/pod-operations', async (original) => ({
  ...(await original<any>()),
  submitPodJobWithRetry: f.submit,
}))
import { executePodOperatorAction } from '../../src/modules/commerce/pod-operator'

let stored: any
const paid = {
  id: 'order',
  site: 'site',
  merchantConnection: 'merchant',
  checkoutSession: 'session',
  state: 'paid',
  receipt: { state: 'issued' },
  amountMinor: '500',
  currency: 'USD',
}
const payload: any = {
  findByID: async ({ collection }: any) =>
    collection === 'pod-jobs'
      ? structuredClone(stored)
      : collection === 'orders'
        ? paid
        : {
            id: 'connection',
            site: 'site',
            merchantConnection: 'merchant',
            providerKey: 'printful',
            status: 'active',
          },
  find: async () => ({
    docs: [
      {
        site: 'site',
        merchantConnection: 'merchant',
        state: 'paid',
        amountMinor: '500',
        currency: 'USD',
        financialEvents: [{ kind: 'succeeded', resultingState: 'succeeded' }],
      },
    ],
  }),
  update: async ({ data }: any) => {
    stored = { ...stored, ...data }
    return structuredClone(stored)
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  f.adapter.metadata.mode = 'deterministic-emulator'
  stored = {
    id: 'job',
    order: 'order',
    site: 'site',
    connection: 'connection',
    providerKey: 'printful',
    state: 'created',
    attemptCount: 0,
    idempotencyKey: 'stable-request-key',
    auditTrail: [],
    itemsSnapshot: [],
    recipientSnapshot: {},
    createdAt: '2026-10-29T00:00:00Z',
    updatedAt: '2026-10-29T00:00:00Z',
  }
  f.adapter.health.mockResolvedValue({ ready: true, health: 'healthy' })
})
describe('13B durable submission boundary', () => {
  it('reserves uncertainty before external I/O; interruption cannot authorize a duplicate request', async () => {
    f.submit.mockImplementation(async () => {
      expect(stored).toMatchObject({ state: 'exception', attemptCount: 1 })
      expect(stored.auditTrail.at(-1)).toMatchObject({
        action: 'provider_request_reserved',
        details: { idempotencyKey: 'stable-request-key' },
      })
      throw new Error('simulated process interruption after reservation')
    })
    await expect(
      executePodOperatorAction(payload, 'job', 'submit-pod-job', 'owner', () => {}),
    ).rejects.toThrow('interruption')
    const retry = await executePodOperatorAction(
      payload,
      'job',
      'submit-pod-job',
      'owner',
      () => {},
    )
    expect(retry.success).toBe(false)
    expect(stored.attemptCount).toBe(1)
    expect(f.submit).toHaveBeenCalledOnce()
    f.adapter.findOrderByIdempotencyKey.mockResolvedValue({
      externalOrderId: 'provider-real-response',
      state: 'submitted',
    })
    f.adapter.getOrder.mockResolvedValue({
      externalOrderId: 'provider-real-response',
      state: 'submitted',
      providerStatus: 'pending',
      requestId: 'observed-request',
    })
    const recovered = await executePodOperatorAction(
      payload,
      'job',
      'reconcile-pod-job',
      'owner',
      () => {},
    )
    expect(recovered.success).toBe(true)
    expect(stored).toMatchObject({
      state: 'submitted',
      externalOrderId: 'provider-real-response',
      attemptCount: 1,
    })
    expect(f.submit).toHaveBeenCalledOnce()
  })
  it('denies retry when a request is absent from provider lookup without manufacturing a known rejection', async () => {
    stored.state = 'exception'
    stored.attemptCount = 1
    f.adapter.findOrderByIdempotencyKey.mockResolvedValue(null)
    const result = await executePodOperatorAction(
      payload,
      'job',
      'reconcile-pod-job',
      'owner',
      () => {},
    )
    expect(result.success).toBe(false)
    expect(stored.state).toBe('exception')
    expect(f.submit).not.toHaveBeenCalled()
  })
  it('prevents simulator-sold instructions from becoming real-provider fulfillment', async () => {
    stored.itemsSnapshot = [{ podMapping: { providerMode: 'deterministic-emulator' } }]
    f.adapter.metadata.mode = 'live-configured'
    await expect(
      executePodOperatorAction(payload, 'job', 'submit-pod-job', 'owner', () => {}),
    ).rejects.toThrow('Simulator-sold')
    expect(stored.attemptCount).toBe(0)
    expect(f.submit).not.toHaveBeenCalled()
  })
  it('denies foreign site before any adapter I/O or persisted mutation', async () => {
    await expect(
      executePodOperatorAction(payload, 'job', 'submit-pod-job', 'foreign', () => {
        throw new Error('Forbidden.')
      }),
    ).rejects.toThrow('Forbidden')
    expect(f.adapter.health).not.toHaveBeenCalled()
    expect(stored.attemptCount).toBe(0)
  })
})
