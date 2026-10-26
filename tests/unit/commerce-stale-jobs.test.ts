import { describe, expect, it, vi } from 'vitest'
import { recoverStaleCommerceJobs } from '../../src/modules/commerce/tasks'

describe('Commerce Stale Job Recovery', () => {
  it('identifies and resets stale processing payment webhook events', async () => {
    const updatedEvents: any[] = []
    const queuedJobs: any[] = []

    const mockPayload = {
      collections: {
        'payment-webhook-events': {},
      },
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            id: 'evt-stale-1',
            processingState: 'processing',
            updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          },
          {
            id: 'evt-stale-2',
            processingState: 'processing',
            updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          },
        ],
      }),
      update: vi.fn().mockImplementation(async ({ collection, id, data }: any) => {
        updatedEvents.push({ collection, id, data })
        return { id, ...data }
      }),
      jobs: {
        queue: vi.fn().mockImplementation(async (job: any) => {
          queuedJobs.push(job)
          return { id: 'job-new' }
        }),
      },
    }

    const recovered = await recoverStaleCommerceJobs(mockPayload, 10 * 60 * 1000)

    expect(recovered).toBe(2)
    expect(updatedEvents).toHaveLength(2)
    expect(updatedEvents[0]).toEqual({
      collection: 'payment-webhook-events',
      id: 'evt-stale-1',
      data: { processingState: 'received' },
    })
    expect(queuedJobs).toHaveLength(2)
    expect(queuedJobs[0]).toEqual({
      task: 'commerce-process-payment-event',
      input: { webhookEventId: 'evt-stale-1' },
      queue: 'commerce',
    })
  })

  it('ignores when collection is not configured', async () => {
    const mockPayload = {
      collections: {},
    }
    const recovered = await recoverStaleCommerceJobs(mockPayload)
    expect(recovered).toBe(0)
  })
})
