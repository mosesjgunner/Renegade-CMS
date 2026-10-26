import { describe, expect, it, vi } from 'vitest'
import { evaluateSegmentRecipients } from '../../src/modules/audience/service'

describe('complete site-scoped segment counts', () => {
  it('evaluates all 2001 records instead of silently truncating at 2000', async () => {
    const subscribers = Array.from({ length: 2001 }, (_, i) => ({
      id: `sub-${i}`,
      site: 'alpha',
      email: `person-${i}@example.test`,
      emailHash: `hash-${i}`,
      status: 'active',
    }))
    const find = vi.fn(async (input) => {
      if (input.collection === 'subscribers')
        return {
          docs: input.limit ? subscribers.slice(0, input.limit) : subscribers,
          totalDocs: subscribers.length,
        }
      return { docs: [], totalDocs: 0 }
    })
    const result = await evaluateSegmentRecipients(
      {
        find,
        findByID: async () => ({
          id: 'segment',
          site: 'alpha',
          definition: { predicate: { field: 'consentPurpose', op: 'is', value: 'newsletter' } },
        }),
      },
      { siteId: 'alpha', segmentId: 'segment' },
    )
    expect(result.counts.totalSubscribers).toBe(2001)
    expect(result.counts.eligibleConsented).toBe(2001)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'audience-memberships',
        where: {
          and: [
            { status: { equals: 'active' } },
            { subscriber: { in: subscribers.map((s) => s.id) } },
          ],
        },
        pagination: false,
      }),
    )
  })
  it('denies a foreign segment before enumerating subscribers', async () => {
    const find = vi.fn()
    await expect(
      evaluateSegmentRecipients(
        { find, findByID: async () => ({ id: 'foreign', site: 'beta' }) },
        { siteId: 'alpha', segmentId: 'foreign' },
      ),
    ).rejects.toThrow('site mismatch')
    expect(find).not.toHaveBeenCalled()
  })
})
