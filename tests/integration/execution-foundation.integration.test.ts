/* eslint-disable @typescript-eslint/no-explicit-any -- Integration uses runtime collection shapes. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { ExecutionError, assertExecutionScope } from '../../src/modules/execution/contracts'
import {
  recordExecutionEvent,
  registerExecutionHandler,
  resetExecutionHandlersForTest,
} from '../../src/modules/execution/service'

let payload: Payload
beforeAll(async () => {
  payload = await getPayload({ config })
})
afterAll(async () => {
  resetExecutionHandlersForTest()
  await payload?.destroy()
})

describe('transactional execution foundation', () => {
  it('proves commit/rollback, dispatch, duplicate, bounded retries, cancellation and operator evidence', async () => {
    const site = await payload.create({
      collection: 'sites',
      data: { name: 'Execution proof', lifecycle: 'active', slug: `execution-${randomUUID()}` },
    })
    const input = (key: string, tenantId = 'proof-a') => ({
      siteId: String(site.id),
      tenantId,
      actor: { kind: 'system' as const, id: null },
      eventType: 'synthetic.proof' as const,
      idempotencyKey: key,
      privacyClass: 'internal' as const,
      payload: { recordId: String(site.id) },
    })
    const read = (id: string) => payload.findByID({ collection: 'execution-events', id, depth: 0 })
    const tx = await payload.db.beginTransaction()
    expect(tx).toBeTruthy()
    const req = await createLocalReq({}, payload)
    req.transactionID = tx!
    await payload.update({
      collection: 'sites',
      id: site.id,
      data: { description: 'rolled back' },
      req,
    })
    const rolledBack = await recordExecutionEvent(payload as any, input('rollback'), req)
    await payload.db.rollbackTransaction(tx!)
    await expect(read(rolledBack.event.id)).rejects.toThrow()
    expect((await payload.findByID({ collection: 'sites', id: site.id })).description).not.toBe(
      'rolled back',
    )

    req.transactionID = (await payload.db.beginTransaction())!
    await payload.update({
      collection: 'sites',
      id: site.id,
      data: { description: 'committed' },
      req,
    })
    const first = await recordExecutionEvent(payload as any, input('success'), req)
    await payload.db.commitTransaction(req.transactionID)
    expect((await recordExecutionEvent(payload as any, input('success'))).duplicate).toBe(true)
    const otherTenant = await recordExecutionEvent(payload as any, input('success', 'proof-b'))
    expect(otherTenant.event.id).not.toBe(first.event.id)
    let deliveries = 0
    registerExecutionHandler('synthetic.proof', async (event) => {
      assertExecutionScope(event, { siteId: String(site.id), tenantId: 'proof-a' })
      deliveries++
    })
    const dispatch = async () => {
      const job = await payload.jobs.queue({
        task: 'execution-outbox-dispatch',
        input: {},
        queue: 'execution-proof',
      })
      await payload.jobs.runByID({ id: job.id, silent: true })
      expect((await payload.findByID({ collection: 'payload-jobs', id: job.id })).hasError).toBe(
        false,
      )
    }
    await dispatch()
    const dispatched = await read(first.event.id)
    expect(dispatched.state).toBe('dispatched')
    await payload.jobs.runByID({ id: dispatched.jobId!, silent: true })
    const duplicate = await payload.jobs.queue({
      task: 'execution-outbox-handle',
      input: { eventId: first.event.id },
      queue: 'execution-proof',
    })
    await payload.jobs.runByID({ id: duplicate.id, silent: true })
    expect(deliveries).toBe(1)
    expect(await read(first.event.id)).toMatchObject({ state: 'processed', attempts: 1 })
    await payload.jobs.runByID({ id: (await read(otherTenant.event.id)).jobId!, silent: true })
    expect(await read(otherTenant.event.id)).toMatchObject({ state: 'dead-letter', attempts: 1 })

    resetExecutionHandlersForTest()
    let tries = 0
    registerExecutionHandler('synthetic.proof', async () => {
      if (++tries === 1) throw new ExecutionError('temporary secret=proof-secret', 'timeout', true)
    })
    const transient = await recordExecutionEvent(payload as any, input('transient'))
    await dispatch()
    const retryJob = (await read(transient.event.id)).jobId!
    await payload.jobs.runByID({ id: retryJob, silent: true })
    expect(await read(transient.event.id)).toMatchObject({ state: 'retrying', attempts: 1 })
    const failedAttempt = await payload.findByID({ collection: 'payload-jobs', id: retryJob })
    expect(failedAttempt.waitUntil).toBeTruthy()
    expect(JSON.stringify(failedAttempt)).not.toContain('proof-secret')
    await dispatch()
    expect((await read(transient.event.id)).jobId).toBe(retryJob)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await payload.jobs.runByID({ id: retryJob, silent: true })
    expect(await read(transient.event.id)).toMatchObject({ state: 'processed', attempts: 2 })

    resetExecutionHandlersForTest()
    registerExecutionHandler('synthetic.proof', async () => {
      throw new ExecutionError('secret=proof-secret', 'timeout', true)
    })
    const terminal = await recordExecutionEvent(payload as any, input('terminal'))
    await dispatch()
    const terminalJob = (await read(terminal.event.id)).jobId!
    for (const delay of [0, 300, 600]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      await payload.jobs.runByID({ id: terminalJob, silent: true })
    }
    expect(await read(terminal.event.id)).toMatchObject({
      state: 'dead-letter',
      attempts: 3,
      lastError: 'secret=[REDACTED]',
    })
    await dispatch()
    expect((await read(terminal.event.id)).jobId).toBe(terminalJob)
    const cancelled = await recordExecutionEvent(payload as any, input('cancelled'))
    await payload.update({
      collection: 'execution-events',
      id: cancelled.event.id,
      data: { state: 'cancelled' },
    })
    const cancelledJob = await payload.jobs.queue({
      task: 'execution-outbox-handle',
      input: { eventId: cancelled.event.id },
      queue: 'execution-proof',
    })
    await payload.jobs.runByID({ id: cancelledJob.id, silent: true })
    expect(await read(cancelled.event.id)).toMatchObject({ state: 'cancelled', attempts: 0 })
    const visible = await payload.find({
      collection: 'execution-events',
      overrideAccess: false,
      user: { id: randomUUID(), collection: 'users', role: 'owner' } as any,
      where: { id: { equals: terminal.event.id } },
    })
    expect(visible.docs).toHaveLength(1)
    await expect(
      payload.find({
        collection: 'execution-events',
        overrideAccess: false,
        user: { id: randomUUID(), collection: 'users', role: 'staff' } as any,
      }),
    ).rejects.toThrow()
  }, 60_000)
})
