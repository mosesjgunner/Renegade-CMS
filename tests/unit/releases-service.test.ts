import { describe, expect, it } from 'vitest'

import { executeContentRelease } from '../../src/modules/releases/service'

describe('content release execution saga', () => {
  it('retains successful items and retries only the failed item', async () => {
    const release: any = {
      id: 'release-1',
      lastScheduleMutationId: 'schedule-1',
      status: 'scheduled',
      executionAudit: [],
      executionItems: [
        {
          key: 'product:good',
          type: 'product',
          targetId: 'good',
          status: 'pending',
          attempts: 0,
          updatedAt: 'now',
        },
        {
          key: 'product:bad',
          type: 'product',
          targetId: 'bad',
          status: 'pending',
          attempts: 0,
          updatedAt: 'now',
        },
      ],
    }
    const products: Record<string, any> = {
      good: { id: 'good', state: 'approved', media: [] },
      bad: { id: 'bad', state: 'approved', media: [] },
    }
    let productWrites = 0
    const payload: any = {
      findByID: async ({ collection, id }: any) =>
        collection === 'content-releases' ? release : products[id],
      find: async () => ({ docs: [] }),
      update: async ({ collection, id, data }: any) => {
        if (collection === 'products') {
          if (id === 'bad') throw new Error('injected product failure')
          productWrites++
          products[id] = { ...products[id], ...data }
        } else Object.assign(release, data)
      },
    }
    const first = await executeContentRelease(payload, {
      releaseId: 'release-1',
      scheduleMutationId: 'schedule-1',
      actorId: 'publisher',
    })
    expect(first).toMatchObject({ status: 'partial-failure', succeeded: 1, unresolved: 1 })
    expect(release.executionItems.map((item: any) => item.status)).toEqual(['succeeded', 'failed'])
    await executeContentRelease(payload, {
      releaseId: 'release-1',
      scheduleMutationId: 'schedule-1',
      actorId: 'publisher',
    })
    expect(productWrites).toBe(1)
    expect(release.executionItems[0].status).toBe('succeeded')
  })

  it('does not execute a stale scheduled job after a reschedule', async () => {
    const payload: any = {
      findByID: async () => ({
        id: 'release-1',
        lastScheduleMutationId: 'new',
        status: 'scheduled',
        executionItems: [],
      }),
    }
    await expect(
      executeContentRelease(payload, {
        releaseId: 'release-1',
        scheduleMutationId: 'old',
        actorId: 'publisher',
      }),
    ).resolves.toMatchObject({ succeeded: 0, unresolved: 0 })
  })
})
