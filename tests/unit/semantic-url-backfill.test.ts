import { describe, expect, it, vi } from 'vitest'
import { resolvePublicUrl } from '../../src/modules/public/semantic-url'
import { runSemanticUrlBackfill } from '../../src/modules/public/semantic-url-backfill'

function createPayload(seed: Record<string, Array<Record<string, unknown>>> = {}) {
  const records = new Map(Object.entries(seed))
  const create = vi.fn(
    async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      const docs = records.get(collection) ?? []
      const created = { id: `created-${docs.length}`, ...data }
      records.set(collection, [...docs, created])
      return created
    },
  )
  const update = vi.fn(
    async ({
      collection,
      id,
      data,
    }: {
      collection: string
      id: string
      data: Record<string, unknown>
    }) => {
      const docs = records.get(collection) ?? []
      const next = docs.map((doc) => {
        if (String(doc.id) !== id) return doc
        const changed = { ...doc, ...data }
        if (collection === 'content' && typeof data.slug === 'string')
          changed.canonicalPath = resolvePublicUrl({ kind: 'article', slug: data.slug })
        return changed
      })
      records.set(collection, next)
      return next.find((doc) => String(doc.id) === id)
    },
  )
  const payload = {
    findGlobal: vi.fn(async () => ({})),
    find: vi.fn(async ({ collection }: { collection: string }) => ({
      docs: records.get(collection) ?? [],
      hasNextPage: false,
    })),
    create,
    update,
  }
  return { payload, records, create, update }
}

describe('semantic URL backfill', () => {
  it('keeps dry-run read-only and reports stable-path changes', async () => {
    const { payload, create, update } = createPayload({
      content: [
        {
          id: 'article-1',
          site: 'site-1',
          status: 'published',
          visibility: 'public',
          contentType: 'article',
          slug: 'new-name',
          canonicalPath: '/articles/old-name',
        },
      ],
    })

    const report = await runSemanticUrlBackfill(payload as never)

    expect(report.mode).toBe('dry-run')
    expect(report.changed).toMatchObject([
      { id: 'article-1', fromPath: '/articles/old-name', toPath: '/articles/new-name' },
    ])
    expect(report.conflicts).toEqual([])
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('aborts the whole apply when a proposed route belongs to a form', async () => {
    const { payload, create, update } = createPayload({
      content: [
        {
          id: 'article-1',
          site: 'site-1',
          status: 'published',
          visibility: 'public',
          contentType: 'article',
          slug: 'new-name',
          canonicalPath: '/articles/old-name',
        },
      ],
      'form-definitions': [{ id: 'form-1', site: 'site-1', publicPath: '/articles/new-name' }],
    })

    const report = await runSemanticUrlBackfill(payload as never, true)

    expect(report.conflicts[0]?.reason).toContain('form-definitions')
    expect(report.applied).toBe(0)
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('creates redirects before changes and is safe to rerun after apply', async () => {
    const { payload, records, create } = createPayload({
      content: [
        {
          id: 'article-1',
          site: 'site-1',
          status: 'published',
          visibility: 'public',
          contentType: 'article',
          slug: 'new-name',
          canonicalPath: '/articles/old-name',
        },
      ],
    })

    const applied = await runSemanticUrlBackfill(payload as never, true)
    expect(applied.applied).toBe(1)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'public-redirects',
        data: expect.objectContaining({
          fromPath: '/articles/old-name',
          toPath: '/articles/new-name',
          statusCode: '308',
        }),
      }),
    )
    expect(records.get('content')?.[0]?.canonicalPath).toBe('/articles/new-name')

    const repeated = await runSemanticUrlBackfill(payload as never, true)
    expect(repeated.conflicts).toEqual([])
    expect(repeated.changed).toEqual([])
    expect(repeated.applied).toBe(0)
  })
})
