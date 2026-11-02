import { describe, expect, it } from 'vitest'
import { createPortableManifest } from '../../src/modules/portability/contracts'
import {
  assertPortableSiteBoundary,
  importPortableManifest,
  portableIdentityMap,
  type PortableStore,
} from '../../src/modules/portability/workflow'

describe('executable portable import', () => {
  const manifest = createPortableManifest({
    createdAt: '2026-08-29T00:00:00Z',
    records: [
      { collection: 'sites', id: 'site-1', data: { name: 'Fixture', slug: 'fixture' } },
      {
        collection: 'media-assets',
        id: 'media-1',
        data: { title: 'Image', storageLocation: 'local://fixture.jpg' },
      },
      {
        collection: 'taxonomy-redirects',
        id: 'redirect-1',
        data: { fromPath: '/old', toPath: '/new' },
      },
    ],
    media: [],
  })
  const records = new Map<string, Record<string, unknown>>(),
    media: string[] = []
  const store: PortableStore = {
    read: async (collection, id) => records.get(`${collection}/${id}`) ?? null,
    write: async (collection, id, data) => {
      const key = `${collection}/${id}`,
        exists = records.has(key)
      records.set(key, data)
      return exists ? 'updated' : 'created'
    },
    reconcileMedia: async (record) => {
      media.push(record.id)
    },
    repairRelationships: async () => 2,
  }
  it('dry-runs without writes, then resumes duplicate-safely with media and redirects', async () => {
    const dry = await importPortableManifest(manifest, store, { runId: 'dry' })
    expect(dry.dryRun).toBe(true)
    expect(records.size).toBe(0)
    expect(dry.redirects).toBe(1)
    const first = await importPortableManifest(manifest, store, { runId: 'one', dryRun: false })
    const resumed = await importPortableManifest(manifest, store, {
      runId: 'one',
      dryRun: false,
      checkpoint: first.checkpoint,
    })
    expect(first.created).toBe(3)
    expect(first.mediaReconciled).toBe(1)
    expect(first.relationshipRepairs).toBe(2)
    expect(resumed.skipped).toBe(3)
    expect(records.size).toBe(3)
    expect(media).toEqual(['media-1'])
    expect(portableIdentityMap(manifest)['sites/site-1']).toBe(
      portableIdentityMap(manifest)['sites/site-1'],
    )
  })
  it('reports unsupported records and rejects mismatched resume checkpoints', async () => {
    const invalid = createPortableManifest({
      createdAt: '2026-08-29T00:00:00Z',
      records: [{ collection: 'private-sessions', id: 'x', data: {} }],
      media: [],
    })
    expect(
      (await importPortableManifest(invalid, store, { runId: 'bad', dryRun: false })).failedRows[0]
        ?.message,
    ).toBe('Unsupported collection.')
    await expect(
      importPortableManifest(manifest, store, {
        runId: 'bad',
        checkpoint: {
          runId: 'bad',
          sourceChecksum: 'sha256:nope',
          frameworkVersion: 1,
          completedSourceIds: [],
          failedRows: [],
        },
      }),
    ).rejects.toThrow('different portable')
  })

  it('writes records in portable dependency order regardless of manifest order', async () => {
    const ordered = createPortableManifest({
      createdAt: '2026-08-29T00:00:00Z',
      records: [
        { collection: 'content', id: 'content-1', data: { title: 'Post' } },
        { collection: 'categories', id: 'category-1', data: { name: 'News' } },
        { collection: 'publications', id: 'publication-1', data: { name: 'Daily' } },
        { collection: 'authors', id: 'author-1', data: { displayName: 'Riley' } },
      ],
      media: [],
    })
    const writeOrder: string[] = []
    const orderStore: PortableStore = {
      read: async () => null,
      write: async (collection, id) => {
        writeOrder.push(`${collection}/${id}`)
        return 'created'
      },
    }
    const report = await importPortableManifest(ordered, orderStore, {
      runId: 'order',
      dryRun: false,
    })
    expect(report.failedRows).toEqual([])
    expect(writeOrder).toEqual([
      'authors/author-1',
      'publications/publication-1',
      'categories/category-1',
      'content/content-1',
    ])
  })

  it('retries a failed row once after the main pass before reporting it', async () => {
    const flaky = createPortableManifest({
      createdAt: '2026-08-29T00:00:00Z',
      records: [
        { collection: 'categories', id: 'child', data: { name: 'Child', parent: 'parent' } },
        { collection: 'categories', id: 'parent', data: { name: 'Parent' } },
        { collection: 'tags', id: 'tag-1', data: { name: 'Doomed' } },
      ],
      media: [],
    })
    const written = new Set<string>()
    const flakyStore: PortableStore = {
      read: async () => null,
      write: async (collection, id, data) => {
        if (collection === 'tags') throw new Error('permanent failure')
        if (id === 'child' && !written.has('categories/parent'))
          throw new Error('parent does not exist yet')
        written.add(`${collection}/${id}`)
        void data
        return 'created'
      },
    }
    const report = await importPortableManifest(flaky, flakyStore, {
      runId: 'retry',
      dryRun: false,
    })
    expect(written.has('categories/child')).toBe(true)
    expect(report.created).toBe(2)
    expect(report.failedRows).toEqual([
      { sourceId: 'tags/tag-1', collection: 'tags', message: 'permanent failure' },
    ])
  })

  it('rejects an archive that crosses the selected tenant boundary', () => {
    const crossTenant = createPortableManifest({
      createdAt: '2026-08-30T00:00:00Z',
      records: [
        { collection: 'sites', id: 'site-1', data: { name: 'One' } },
        { collection: 'content', id: 'content-1', data: { site: 'site-2', title: 'Leaked' } },
      ],
      media: [],
    })
    expect(() => assertPortableSiteBoundary(crossTenant, 'site-1')).toThrow('tenant boundary')
  })
})
