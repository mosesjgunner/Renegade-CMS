import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  guardContentHierarchy,
  guardHierarchyNode,
  protectHierarchyDelete,
  protectSiteHierarchyDelete,
} from '@/modules/editorial/hierarchy'
import { loadPublicHierarchy, hierarchyTrail } from '@/modules/public/hierarchy'
import { HierarchyView } from '@/modules/public/HierarchyView'

vi.mock('@/modules/public/semantic-url-service', () => ({ assertRecordSemanticPath: vi.fn() }))
const fixture = () => {
  const records: Record<string, Record<string, any>> = {
    sites: { a: { id: 'a', name: 'Alpha' }, b: { id: 'b', name: 'Beta' } },
    sections: { s: { id: 's', site: 'a' }, t: { id: 't', site: 'b' } },
    categories: {
      root: { id: 'root', site: 'a', section: 's', scope: 'site' },
      leaf: { id: 'leaf', site: 'a', section: 's', scope: 'site', parent: 'root' },
      foreign: { id: 'foreign', site: 'b', section: 't', scope: 'site' },
    },
    albums: { album: { id: 'album', site: 'a' }, private: { id: 'private', site: 'b' } },
    content: {
      page: { id: 'page', site: 'a', contentType: 'page' },
      child: { id: 'child', site: 'a', contentType: 'page', parentPage: 'page' },
    },
  }
  const payload = {
    jobs: {},
    collections: Object.fromEntries(Object.keys(records).map((key) => [key, {}])),
    config: {
      collections: [
        {
          slug: 'content',
          fields: [
            {
              type: 'tabs',
              tabs: [{ fields: [{ name: 'site', type: 'relationship', relationTo: 'sites' }] }],
            },
          ],
        },
      ],
    },
    findByID: vi.fn(async ({ collection, id }: any) => {
      if (!records[collection]?.[id]) throw new Error('Not found')
      return records[collection][id]
    }),
    find: vi.fn(async () => ({ docs: [] })),
    count: vi.fn(async () => ({ totalDocs: 0 })),
  }
  return { records, payload, req: { payload } as any }
}
describe('canonical hierarchy integrity', () => {
  it('allows an empty draft but rejects publishing without an editor body', async () => {
    const { req } = fixture()
    await expect(
      guardContentHierarchy({
        data: { site: 'a', contentType: 'article', status: 'draft', body: null },
        req,
      } as any),
    ).resolves.toBeDefined()
    await expect(
      guardContentHierarchy({
        data: { status: 'published' },
        originalDoc: { id: 'empty', site: 'a', contentType: 'article', body: null },
        req,
      } as any),
    ).rejects.toThrow(/Add content in the editor/)
  })
  it('generates a stable category URL, permits same-section reparent and preserves URL on rename', async () => {
    const { req, records } = fixture()
    const hook = guardHierarchyNode('categories')
    const created = await hook({
      data: { site: 'a', section: 's', scope: 'site', slug: 'guides', parent: 'root' },
      req,
    } as any)
    expect(created.canonicalPath).toBe('/categories/guides')
    const edited = await hook({
      data: { parent: 'root', slug: 'renamed' },
      originalDoc: { ...records.categories.leaf, canonicalPath: '/categories/guides' },
      req,
    } as any)
    expect(edited.canonicalPath).toBe('/categories/guides')
  })
  it.each([
    ['foreign', { parent: 'foreign' }, /same site/],
    ['self', { parent: 'leaf' }, /own parent/],
    ['descendant', { parent: 'leaf' }, /own parent/, 'root'],
    ['section', { parent: 'root', section: 't' }, /same section/],
    ['publication', { parent: 'root', publication: 'pub' }, /same site|Not found/],
    ['missing', { parent: 'missing' }, /Not found/],
  ])(
    'rejects %s category parent without mutating original',
    async (_label, data, error, id = 'leaf') => {
      const { req, records } = fixture()
      const original = structuredClone(records.categories[id])
      await expect(
        guardHierarchyNode('categories')({ data, originalDoc: records.categories[id], req } as any),
      ).rejects.toThrow(error as RegExp)
      expect(records.categories[id]).toEqual(original)
    },
  )
  it('blocks changing scope when dependents exist', async () => {
    const { req, payload } = fixture()
    payload.count.mockResolvedValue({ totalDocs: 1 })
    await expect(
      guardHierarchyNode('sections')({
        data: { site: 'b' },
        originalDoc: { id: 's', site: 'a' },
        req,
      } as any),
    ).rejects.toThrow(/dependent/)
  })
  it('blocks cross-site collection category', async () => {
    const { req } = fixture()
    await expect(
      guardHierarchyNode('albums')({ data: { site: 'a', category: 'foreign' }, req } as any),
    ).rejects.toThrow(/same site/)
  })
  it.each([
    ['sections', 't'],
    ['categories', 'foreign'],
    ['collections', 'private'],
  ])('rejects cross-site %s content relationship', async (field, id) => {
    const { req } = fixture()
    await expect(
      guardContentHierarchy({ data: { site: 'a', [field]: [id] }, req } as any),
    ).rejects.toThrow(/same site/)
  })
  it('rejects page cycles and non-page parents, accepts detachment', async () => {
    const { req, records } = fixture()
    await expect(
      guardContentHierarchy({
        data: { parentPage: 'child' },
        originalDoc: records.content.page,
        req,
      } as any),
    ).rejects.toThrow(/ancestor/)
    await expect(
      guardContentHierarchy({
        data: { site: 'a', contentType: 'article', parentPage: 'page' },
        req,
      } as any),
    ).rejects.toThrow(/Page/)
    await expect(
      guardContentHierarchy({
        data: { parentPage: null },
        originalDoc: records.content.child,
        req,
      } as any),
    ).resolves.toMatchObject({ parentPage: null })
  })
  it.each(['sections', 'categories', 'albums', 'content'])(
    'protects dependent %s deletes',
    async (collection) => {
      const { req, payload } = fixture()
      payload.count.mockResolvedValue({ totalDocs: 1 })
      await expect(protectHierarchyDelete(collection)({ id: 'node', req } as any)).rejects.toThrow(
        collection === 'content' ? /archive content with revision history/ : /dependent/,
      )
      payload.count.mockResolvedValue({ totalDocs: 0 })
      await expect(
        protectHierarchyDelete(collection)({ id: 'node', req } as any),
      ).resolves.toBeUndefined()
    },
  )
  it('protects site from records nested in collection tabs', async () => {
    const { req, payload } = fixture()
    payload.count.mockResolvedValue({ totalDocs: 1 })
    await expect(protectSiteHierarchyDelete({ id: 'a', req } as any)).rejects.toThrow(/content/)
  })
  it('requires real transaction and locks parent rows before reference inspection', async () => {
    const { req, payload } = fixture()
    ;(payload as any).db = { sessions: {} }
    await expect(protectHierarchyDelete('albums')({ id: 'a', req } as any)).rejects.toThrow(
      /transaction/,
    )
    const execute = vi.fn()
    ;(payload as any).db.sessions.tx = { db: { execute } }
    req.transactionID = Promise.resolve('tx')
    await protectHierarchyDelete('albums')({ id: 'a', req } as any)
    expect(execute).toHaveBeenCalledOnce()
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(
      payload.count.mock.invocationCallOrder[0],
    )
  })
})

describe('public hierarchy output', () => {
  const node = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    name,
    canonicalPath: `/${id}`,
    site: 'a',
    ...extra,
  })
  async function graph() {
    const lists: Record<string, unknown[]> = {
      sections: [node('s', 'Knowledge')],
      categories: [
        node('root', 'Engineering', { section: 's' }),
        node('leaf', 'Databases', { section: 's', parent: 'root' }),
      ],
      albums: [
        node('album', 'Guides', { category: 'leaf', visibility: 'public' }),
        node('private', 'HIDDEN', { category: 'leaf', visibility: 'private' }),
      ],
      content: [
        node('article', 'Article', { collections: ['album'], status: 'published' }),
        node('legacy', 'Legacy direct article', { categories: ['leaf'], status: 'published' }),
        node('draft', 'DRAFT', { status: 'draft' }),
      ],
    }
    const payload = {
      findByID: vi.fn(async () => ({ name: 'Alpha' })),
      find: vi.fn(async ({ collection }: any) => ({ docs: lists[collection] })),
    }
    return loadPublicHierarchy(payload as any, 'a')
  }
  it('renders all six named levels with canonical paths, suppressing private and draft nodes', async () => {
    const g = await graph()
    expect(hierarchyTrail(g, 'content', g.content[0]).map((item) => item.name)).toEqual([
      'Alpha',
      'Knowledge',
      'Engineering',
      'Databases',
      'Guides',
      'Article',
    ])
    expect(g.collections.map((item) => item.name)).toEqual(['Guides'])
    expect(g.content.map((item) => item.name)).toEqual(['Article', 'Legacy direct article'])
  })
  it('retains direct taxonomy listings and shows truthful empty collection state', async () => {
    const g = await graph()
    const category = renderToStaticMarkup(
      <HierarchyView graph={g} kind="category" node={g.categories[1]} />,
    )
    expect(category).toContain('Legacy direct article')
    expect(category).toContain('Guides')
    const empty = renderToStaticMarkup(
      <HierarchyView graph={{ ...g, content: [] }} kind="collection" node={g.collections[0]} />,
    )
    expect(empty).toContain('No published content yet.')
    expect(empty).not.toContain('HIDDEN')
  })
  it('terminates safely on corrupt legacy category cycles', async () => {
    const g = await graph()
    g.categories[0].parent = 'leaf'
    expect(hierarchyTrail(g, 'category', g.categories[1])).toEqual([
      { name: 'Alpha', path: '/browse' },
    ])
  })
})
