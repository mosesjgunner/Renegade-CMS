import { describe, expect, it, vi } from 'vitest'
import { recoverStaleMediaVariantJobs } from '@/modules/media/tasks'

type JobDoc = Record<string, unknown>

function stubPayload(docs: JobDoc[]) {
  const find = vi.fn(async (_args: Record<string, unknown>) => ({ docs }))
  const update = vi.fn(async (_args: Record<string, unknown>) => ({}))
  const payload = {
    find,
    update,
    collections: { 'payload-jobs': {} },
  } as never
  return { payload, find, update }
}

const staleJob = (over: JobDoc = {}): JobDoc => ({
  id: 'job-1',
  taskSlug: 'media-variant-generate',
  processing: true,
  totalTried: 0,
  ...over,
})

/**
 * Perf Pass 0 lane 05: a media-variant job claimed by a worker that died
 * must become claimable again — bounded by the task's retry budget, and
 * never at the expense of a job that is merely slow.
 */
describe('recoverStaleMediaVariantJobs', () => {
  it('only ever looks for stale-claimed media-variant jobs', async () => {
    const { payload, find } = stubPayload([])
    await recoverStaleMediaVariantJobs(payload, 60_000)
    const where = JSON.stringify(find.mock.calls[0][0])
    expect(where).toContain('media-variant-generate')
    expect(where).toContain('"processing":{"equals":true}')
    expect(where).toContain('"completedAt":{"exists":false}')
  })

  it('resets a stale claim, consuming one attempt with exponential backoff', async () => {
    const { payload, update } = stubPayload([staleJob({ totalTried: 1 })])
    const before = Date.now()
    const recovered = await recoverStaleMediaVariantJobs(payload, 60_000)
    expect(recovered).toBe(1)
    const data = update.mock.calls[0][0].data as JobDoc
    expect(data.processing).toBe(false)
    expect(data.totalTried).toBe(2)
    const wait = new Date(String(data.waitUntil)).getTime()
    expect(wait).toBeGreaterThanOrEqual(before + 2_000)
    expect(wait).toBeLessThan(before + 5_000)
  })

  it('marks a job terminal once the recovery budget is exhausted', async () => {
    const { payload, update } = stubPayload([staleJob({ totalTried: 4 })])
    const recovered = await recoverStaleMediaVariantJobs(payload, 60_000)
    expect(recovered).toBe(1)
    const data = update.mock.calls[0][0].data as JobDoc
    expect(data.processing).toBe(false)
    expect(data.hasError).toBe(true)
    // Payload's jobs error field is JSON ({ name, message }); a plain
    // string fails validation and the terminal mark never lands.
    const error = data.error as { name?: string; message?: string }
    expect(error.name).toBe('StaleClaimRecoveryExhausted')
    expect(error.message).toContain('recovery budget is exhausted')
  })

  it('does not count a recovery whose update failed', async () => {
    const find = vi.fn(async (_args: Record<string, unknown>) => ({
      docs: [staleJob({ totalTried: 4 })],
    }))
    const update = vi.fn(async (_args: Record<string, unknown>) => {
      throw new Error('validation failed')
    })
    const payload = { find, update, collections: { 'payload-jobs': {} } } as never
    await expect(recoverStaleMediaVariantJobs(payload, 60_000)).resolves.toBe(0)
  })

  it('returns zero when the jobs collection is unavailable (module gated off)', async () => {
    const find = vi.fn(async () => ({ docs: [staleJob()] }))
    const payload = { find, update: vi.fn(), collections: {} } as never
    await expect(recoverStaleMediaVariantJobs(payload)).resolves.toBe(0)
    expect(find).not.toHaveBeenCalled()
  })

  it('a failed lookup recovers nothing and does not throw', async () => {
    const payload = {
      find: vi.fn(async () => {
        throw new Error('db down')
      }),
      update: vi.fn(),
      collections: { 'payload-jobs': {} },
    } as never
    await expect(recoverStaleMediaVariantJobs(payload)).resolves.toBe(0)
  })
})
