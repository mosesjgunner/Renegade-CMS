import { describe, expect, it, vi } from 'vitest'
import { evaluateSegmentRecipients } from '../../src/modules/audience/service'

describe('complete site-scoped segment counts', () => {
  it('uses canonical linked-contact tags, deduplicates them, and retains suppression', async () => {
    const subscribers = [
      {
        id: 'included',
        contact: { id: 'contact' },
        email: 'yes@example.test',
        emailHash: 'yes',
        status: 'active',
      },
      {
        id: 'suppressed',
        contact: 'contact',
        email: 'no@example.test',
        emailHash: 'no',
        status: 'active',
      },
      { id: 'unlinked', email: 'other@example.test', emailHash: 'other', status: 'active' },
    ]
    const find = vi.fn(async (input) => {
      if (input.collection === 'subscribers') return { docs: subscribers }
      if (input.collection === 'contact-taggings')
        return {
          docs: [
            { contact: 'contact', tag: 'supporter' },
            { contact: { id: 'contact' }, tag: { id: 'supporter' } },
          ],
        }
      if (input.collection === 'suppressions')
        return { docs: input.where.emailHash?.equals === 'no' ? [{}] : [] }
      return { docs: [] }
    })
    const result = await evaluateSegmentRecipients(
      {
        find,
        findByID: async () => ({
          site: 'alpha',
          definition: { predicate: { field: 'tag', op: 'is', value: 'supporter' } },
        }),
      },
      { siteId: 'alpha', segmentId: 'segment' },
    )
    expect(result.eligibleRecipients).toEqual([
      { subscriberId: 'included', email: 'yes@example.test' },
    ])
    expect(result.counts.suppressed).toBe(1)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'contact-taggings',
        pagination: false,
        limit: 0,
        depth: 0,
        where: {
          and: [
            { contact: { in: ['contact'] } },
            { 'contact.site': { equals: 'alpha' } },
            { 'tag.site': { equals: 'alpha' } },
          ],
        },
      }),
    )
  })

  it('propagates tag storage failure rather than reporting an empty successful audience', async () => {
    await expect(
      evaluateSegmentRecipients(
        {
          findByID: async () => ({
            site: 'alpha',
            definition: { predicate: { field: 'tag', op: 'is', value: 'supporter' } },
          }),
          find: async (input: { collection: string }) => {
            if (input.collection === 'subscribers')
              return { docs: [{ id: 'sub', contact: 'contact' }] }
            if (input.collection === 'contact-taggings') throw new Error('tag store unavailable')
            return { docs: [] }
          },
        },
        { siteId: 'alpha', segmentId: 'segment' },
      ),
    ).rejects.toThrow('tag store unavailable')
  })

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
