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

  it('releases the orphaned payment-event job lease so the concurrency lane cannot deadlock', async () => {
    const updates: any[] = []
    const mockPayload = {
      collections: {
        'payment-webhook-events': {},
        'payload-jobs': {},
      },
      find: vi.fn().mockImplementation(async ({ collection }: any) => {
        if (collection === 'payload-jobs')
          return {
            docs: [
              {
                id: 'job-orphan',
                taskSlug: 'commerce-process-payment-event',
                processing: true,
                updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
              },
            ],
          }
        return { docs: [] }
      }),
      update: vi.fn().mockImplementation(async (args: any) => {
        updates.push(args)
        return { id: args.id, ...args.data }
      }),
      jobs: { queue: vi.fn() },
    }

    const recovered = await recoverStaleCommerceJobs(mockPayload, 10 * 60 * 1000)

    expect(recovered).toBe(1)
    expect(updates).toEqual([
      {
        collection: 'payload-jobs',
        id: 'job-orphan',
        data: { processing: false },
        overrideAccess: true,
      },
    ])
    // The stale-lease query must include the payment-event task; without it a
    // killed worker's row blocks the whole commerce.payment-events lane.
    const jobsQuery = mockPayload.find.mock.calls.find(
      ([args]: any) => args.collection === 'payload-jobs',
    )?.[0]
    const slugFilter = JSON.stringify(jobsQuery.where)
    expect(slugFilter).toContain('commerce-process-payment-event')
  })

  it('ignores when collection is not configured', async () => {
    const mockPayload = {
      collections: {},
    }
    const recovered = await recoverStaleCommerceJobs(mockPayload)
    expect(recovered).toBe(0)
  })
})
