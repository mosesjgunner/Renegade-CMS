import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { loadContentArchive } from '@/modules/public/content-archives'

vi.mock('@/modules/public/discovery', () => ({
  resolveDiscoveryDocument: vi.fn(
    async (_payload, { record }: { record: Record<string, string> }) => ({
      indexability: { indexable: true },
      canonicalUrl: record.canonicalPath,
      publicUrl: record.canonicalPath,
      canonicalPath: record.canonicalPath,
      title: { value: record.title },
      revisions: { entityId: record.id },
    }),
  ),
}))

describe('public author and tag archives', () => {
  const published = {
    id: 'public',
    title: 'Public',
    status: 'published',
    visibility: 'public',
    canonicalPath: '/articles/public',
  }
  const hidden = [
    { ...published, id: 'draft', status: 'draft' },
    { ...published, id: 'members', visibility: 'members' },
    { ...published, id: 'deleted', status: 'archived' },
    { ...published, id: 'discovery', removeFromDiscovery: true },
    { ...published, id: 'future', publishedAt: '2999-01-01T00:00:00Z' },
    { ...published, id: 'burned', retentionMode: 'tombstone' },
  ]
  it.each(['authors', 'tags'])(
    'filters hidden %s memberships and scopes queries to the host site',
    async (collection) => {
      const find = vi
        .fn()
        .mockResolvedValueOnce({ docs: [{ id: 'taxonomy', name: 'Tag', displayName: 'Author' }] })
        .mockResolvedValueOnce({ docs: [published, ...hidden] })
      const result = await loadContentArchive(
        { find } as unknown as Payload,
        'alpha',
        `/${collection}/public`,
      )
      expect(result?.articles.map((record) => record.id)).toEqual(['public'])
      expect(find.mock.calls[1][0].where.and).toContainEqual({ site: { equals: 'alpha' } })
      expect(find.mock.calls[1][0].where.and).toContainEqual({
        [collection === 'authors' ? 'authors.author' : 'tags']: { equals: 'taxonomy' },
      })
      if (collection === 'tags')
        expect(find.mock.calls[0][0].where.and).toContainEqual({ site: { equals: 'alpha' } })
    },
  )
  it('does not expose a global author with only hidden or foreign-site content', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: 'a', displayName: 'Private Identity' }] })
      .mockResolvedValueOnce({ docs: hidden })
    expect(
      await loadContentArchive({ find } as unknown as Payload, 'alpha', '/authors/private'),
    ).toBeNull()
  })
  it('returns no archive for removed taxonomy or malformed paths', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] })
    const payload = { find } as unknown as Payload
    expect(await loadContentArchive(payload, 'alpha', '/tags/deleted')).toBeNull()
    expect(await loadContentArchive(payload, 'alpha', '/tags/a/b')).toBeNull()
    expect(find).toHaveBeenCalledTimes(1)
  })
})
