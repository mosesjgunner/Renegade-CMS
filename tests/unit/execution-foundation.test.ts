import { describe, expect, it, afterEach } from 'vitest'

import {
  assertExecutionScope,
  createExecutionEvent,
  ExecutionError,
} from '../../src/modules/execution/contracts'
import { executionOutboxHandleTask } from '../../src/modules/operations/tasks'
import {
  recordExecutionEvent,
  registerExecutionHandler,
  resetExecutionHandlersForTest,
} from '../../src/modules/execution/service'
import { providerHealth, executeProvider } from '../../src/modules/execution/providers'

const eventInput = (idempotencyKey = 'B01:synthetic:1') => ({
  siteId: 'site-a',
  tenantId: 'tenant-a',
  actor: { kind: 'system' as const, id: null },
  eventType: 'synthetic.changed' as const,
  idempotencyKey,
  privacyClass: 'internal' as const,
  payload: { recordId: 'record-1', revision: 1 },
})

const harness = () => {
  const records = new Map<string, Record<string, unknown>>()
  const store = {
    async find(args: { where?: { idempotencyKey?: { equals?: string } } }) {
      const key = args.where?.idempotencyKey?.equals
      return { docs: [...records.values()].filter((record) => record.idempotencyKey === key) }
    },
    async create(args: { data: Record<string, unknown> }) {
      const saved = { ...args.data }
      records.set(String(saved.id), saved)
      return saved
    },
    async update(args: { id: string; data: Record<string, unknown> }) {
      const current = records.get(args.id)!
      Object.assign(current, args.data)
      return current
    },
    jobs: {
      async queue() {
        return { id: 'job-1' }
      },
    },
  }
  const req = {
    payload: {
      ...store,
      async findByID(args: { id: string }) {
        return records.get(args.id)!
      },
    },
  }
  return { records, store, req }
}

afterEach(resetExecutionHandlersForTest)

const handle = (args: unknown) =>
  (
    executionOutboxHandleTask as unknown as {
      handler: (args: unknown) => Promise<unknown>
    }
  ).handler(args)

describe('Phase B execution foundation', () => {
  it('proves synthetic transaction/outbox/worker success and duplicate delivery idempotency', async () => {
    const { store, req, records } = harness()
    const first = await recordExecutionEvent(store, eventInput())
    const duplicate = await recordExecutionEvent(store, eventInput())
    expect(first.duplicate).toBe(false)
    expect(duplicate.duplicate).toBe(true)
    let deliveries = 0
    registerExecutionHandler('synthetic.changed', async () => {
      deliveries++
    })
    await handle({ input: { eventId: first.event.id }, req })
    await handle({ input: { eventId: first.event.id }, req })
    expect(deliveries).toBe(1)
    expect(records.get(first.event.id)).toMatchObject({ state: 'processed', attempts: 1 })
  })

  it('retries transient work and retains terminal failure for operators', async () => {
    const { store, req, records } = harness()
    const transient = await recordExecutionEvent(store, eventInput('B01:transient:1'))
    let tries = 0
    registerExecutionHandler('synthetic.changed', async () => {
      if (++tries === 1) throw new ExecutionError('temporary secret=do-not-leak', 'timeout', true)
    })
    await expect(handle({ input: { eventId: transient.event.id }, req })).rejects.toThrow(
      'temporary',
    )
    expect(records.get(transient.event.id)).toMatchObject({
      state: 'retrying',
      attempts: 1,
      lastError: 'temporary secret=[REDACTED]',
    })
    await handle({ input: { eventId: transient.event.id }, req })
    expect(records.get(transient.event.id)).toMatchObject({ state: 'processed', attempts: 2 })

    resetExecutionHandlersForTest()
    const terminal = await recordExecutionEvent(store, eventInput('B01:terminal:1'))
    registerExecutionHandler('synthetic.changed', async () => {
      throw new ExecutionError('recipient rejected', 'invalid_target', false)
    })
    await handle({ input: { eventId: terminal.event.id }, req })
    expect(records.get(terminal.event.id)).toMatchObject({
      state: 'dead-letter',
      attempts: 1,
      lastError: 'recipient rejected',
    })
  })

  it('bounds retries, sanitizes job errors, and never handles cancelled or unknown events', async () => {
    const { store, req, records } = harness()
    const event = await recordExecutionEvent(store, eventInput())
    registerExecutionHandler('synthetic.changed', async () => {
      throw new Error('secret=hidden')
    })
    for (let attempt = 0; attempt < 2; attempt++)
      await expect(handle({ input: { eventId: event.event.id }, req })).rejects.toThrow(
        'secret=[REDACTED]',
      )
    await handle({ input: { eventId: event.event.id }, req })
    await handle({ input: { eventId: event.event.id }, req })
    expect(records.get(event.event.id)).toMatchObject({ state: 'dead-letter', attempts: 3 })
    resetExecutionHandlersForTest()
    const unknown = await recordExecutionEvent(store, eventInput('unknown'))
    await handle({ input: { eventId: unknown.event.id }, req })
    expect(records.get(unknown.event.id)).toMatchObject({ state: 'dead-letter', attempts: 1 })
    const cancelled = await recordExecutionEvent(store, eventInput('cancelled'))
    records.get(cancelled.event.id)!.state = 'cancelled'
    await handle({ input: { eventId: cancelled.event.id }, req })
    expect(records.get(cancelled.event.id)).toMatchObject({ state: 'cancelled', attempts: 0 })
  })

  it('namespaces duplicate keys by tenant and site and carries the transaction request', async () => {
    const { store } = harness()
    const first = await recordExecutionEvent(store, eventInput())
    const tenant = await recordExecutionEvent(store, { ...eventInput(), tenantId: 'tenant-b' })
    const site = await recordExecutionEvent(store, { ...eventInput(), siteId: 'site-b' })
    expect(new Set([first.event.id, tenant.event.id, site.event.id]).size).toBe(3)
    const req = { transactionID: 'transaction-proof' }
    await recordExecutionEvent(
      {
        ...store,
        create: async (args) => {
          expect(args.req).toBe(req)
          return store.create(args)
        },
      },
      eventInput('transaction'),
      req,
    )
  })

  it('contains provider errors and prevents sandbox fallback to live operations', async () => {
    const adapter = {
      id: 'synthetic',
      mode: 'live' as const,
      validate: () => ({ ok: true as const }),
      capabilities: () => ['send'],
      health: async () => {
        throw new Error('token=hidden')
      },
    }
    await expect(providerHealth(adapter, {})).resolves.toEqual({
      status: 'degraded',
      detail: 'token=[REDACTED]',
    })
    let calls = 0
    await expect(
      executeProvider(adapter, {}, 'send', 'sandbox', async () => {
        calls++
        return true
      }),
    ).rejects.toThrow('mode')
    await expect(
      executeProvider(undefined, undefined, 'send', 'test', async () => {
        calls++
        return true
      }),
    ).rejects.toThrow('configured')
    expect(calls).toBe(0)
    await expect(
      executeProvider({ ...adapter, mode: 'test' }, {}, 'send', 'test', async () => 'synthetic'),
    ).resolves.toBe('synthetic')
  })

  it('rejects cross-tenant processing and personal data, and defines safe unconfigured providers', async () => {
    const event = createExecutionEvent(eventInput())
    expect(() => assertExecutionScope(event, { siteId: 'site-b', tenantId: 'tenant-a' })).toThrow(
      'scope',
    )
    expect(() =>
      createExecutionEvent({ ...eventInput(), payload: { email: 'person@example.test' } }),
    ).toThrow('personal data')
    expect(() =>
      createExecutionEvent({ ...eventInput(), payload: { value: 'person@example.test' } }),
    ).toThrow('personal data')
    expect(() => createExecutionEvent({ ...eventInput(), eventVersion: 0 })).toThrow('envelope')
    await expect(providerHealth(undefined, undefined)).resolves.toEqual({
      status: 'disabled',
      detail: 'Provider is not configured.',
    })
  })
})
