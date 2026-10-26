import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ send: vi.fn(), reconcile: vi.fn() }))
vi.mock('../../src/modules/core/config', () => ({
  loadConfig: () => ({ email: { from: 'sender@example.test', sendTimeoutMs: 5000 } }),
}))
vi.mock('../../src/modules/email/delivery', () => ({
  selectEmailDeliveryAdapter: () => ({
    id: 'smtp',
    capabilities: ['transactional'],
    send: state.send,
    reconcile: state.reconcile,
  }),
}))
vi.mock('../../src/modules/community/external-notifications', () => ({ communityEmailTask: {} }))
vi.mock('../../src/modules/audience/form-tasks', () => ({ formIntakeTask: {} }))
import { emailDeliveryTask, recoverEmailOutbox } from '../../src/modules/audience/tasks'
const handler = emailDeliveryTask.handler as unknown as (args: unknown) => Promise<unknown>
function store(extra: Record<string, unknown> = {}) {
  const doc = {
    id: 'one',
    status: 'queued',
    attempts: 0,
    message: {
      kind: 'transactional',
      subject: 'Hello',
      blocks: [{ type: 'text', text: 'Exact body' }],
    },
    idempotencyKey: 'stable',
    recipientEmail: 'inbox@example.test',
    ...extra,
  }
  const payload = {
    findByID: vi.fn(async () => structuredClone(doc)),
    update: vi.fn(async ({ data }: { data: object }) => Object.assign(doc, data)),
    logger: { error: vi.fn() },
    find: vi.fn(async () => ({ docs: [doc] })),
  }
  return { doc, payload }
}
beforeEach(() => {
  state.send
    .mockReset()
    .mockResolvedValue({ ok: true, provider: 'smtp', providerMessageId: 'accepted' })
  state.reconcile.mockReset()
})
describe('09C durable email dispatch', () => {
  it('honors a persisted future lease without quarantining or dispatching', async () => {
    const { payload } = store({
      status: 'sending',
      leaseUntil: new Date(Date.now() + 60000).toISOString(),
    })
    await handler({ input: { deliveryId: 'one' }, req: { payload } })
    expect(payload.update).not.toHaveBeenCalled()
    expect(state.send).not.toHaveBeenCalled()
  })
  it('honors persisted backoff even when a job is replayed early', async () => {
    const { payload } = store({ nextAttemptAt: new Date(Date.now() + 60000).toISOString() })
    await handler({ input: { deliveryId: 'one' }, req: { payload } })
    expect(state.send).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })
  it('bounds automatic retries and retains lifetime attempts', async () => {
    state.send.mockResolvedValue({
      ok: false,
      provider: 'smtp',
      failure: { kind: 'retryable', code: 'temporary_provider_error', message: '451' },
    })
    const { doc, payload } = store({ attempts: 3 })
    await expect(handler({ input: { deliveryId: 'one' }, req: { payload } })).rejects.toThrow(
      'retryable',
    )
    expect(doc).toMatchObject({ status: 'dead-letter', attempts: 4, leaseUntil: null })
    expect(doc).toHaveProperty('nextAttemptAt')
  })
  it('allows a new explicitly requested retry budget without erasing prior attempts', async () => {
    const { doc, payload } = store({ attempts: 4, outcome: { retryAttemptBase: 4 } })
    await handler({ input: { deliveryId: 'one' }, req: { payload } })
    expect(doc).toMatchObject({
      status: 'accepted',
      attempts: 5,
      leaseUntil: null,
      nextAttemptAt: null,
    })
  })
  it('recovers an orphan queued delivery and replay does not duplicate accepted output', async () => {
    const { doc, payload } = store()
    await recoverEmailOutbox(payload)
    await recoverEmailOutbox(payload)
    expect(state.send).toHaveBeenCalledTimes(1)
    expect(doc).toMatchObject({ status: 'accepted', attempts: 1 })
  })
})
