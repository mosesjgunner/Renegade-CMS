import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { OPERATIONS_QUEUE } from '../../src/modules/operations/tasks'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  if (payload?.db.destroy) await payload.db.destroy()
})

describe('PostgreSQL operations jobs', () => {
  it('persists and completes the harmless heartbeat task', async () => {
    const queued = await payload.jobs.queue({
      task: 'operations-heartbeat',
      input: {},
      queue: OPERATIONS_QUEUE,
    })

    await payload.jobs.runByID({ id: queued.id, silent: true })
    const completed = await payload.findByID({ collection: 'payload-jobs', id: queued.id })

    expect(completed.completedAt).toBeTruthy()
    expect(completed.hasError).toBe(false)
    expect(completed.totalTried).toBe(1)
    expect(completed.log?.[0]?.state).toBe('succeeded')
    expect(completed.concurrencyKey).toBe('operations.heartbeat')
  })

  it('uses bounded exponential retry and retains terminal failure evidence', async () => {
    const marker = randomUUID()
    const queued = await payload.jobs.queue({
      task: 'operations-forced-failure',
      input: { marker },
      queue: OPERATIONS_QUEUE,
    })

    for (const delay of [0, 150, 250]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      await payload.jobs.runByID({ id: queued.id, silent: true })
    }

    const failed = await payload.findByID({ collection: 'payload-jobs', id: queued.id })
    expect(failed.hasError).toBe(true)
    expect(failed.totalTried).toBe(3)
    expect(failed.log).toHaveLength(3)
    expect(failed.log?.every((entry) => entry.state === 'failed')).toBe(true)
    expect(failed.concurrencyKey).toBe(`operations.forced-failure:${marker}`)
  })

  it('runs a future-scheduled job after the queueing process has exited', async () => {
    const tsxCLI = path.resolve('node_modules/tsx/dist/cli.mjs')
    const helper = path.resolve('tests/helpers/job-restart-process.ts')
    const childOptions = { encoding: 'utf8' as const, env: process.env, timeout: 30_000 }
    const queuedProcess = spawnSync(process.execPath, [tsxCLI, helper, 'queue'], childOptions)
    expect(queuedProcess.status, queuedProcess.stderr).toBe(0)
    const jobID = queuedProcess.stdout.match(/JOB_ID=([0-9a-f-]{36})/i)?.[1]
    expect(jobID).toBeTruthy()

    await new Promise((resolve) => setTimeout(resolve, 350))
    const runnerProcess = spawnSync(process.execPath, [tsxCLI, helper, 'run', jobID!], childOptions)
    expect(runnerProcess.status, runnerProcess.stderr).toBe(0)
    const resultText = runnerProcess.stdout.match(/RESULT=(\{.*\})/)?.[1]
    expect(resultText).toBeTruthy()
    expect(JSON.parse(resultText!)).toMatchObject({ hasError: false })
  }, 30_000)
})
