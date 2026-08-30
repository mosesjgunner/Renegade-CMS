import { describe, expect, it } from 'vitest'
import { createPortableManifest } from '../../src/modules/portability/contracts'
import {
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
})
