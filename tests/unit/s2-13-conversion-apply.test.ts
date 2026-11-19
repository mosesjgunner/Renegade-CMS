/**
 * S2-13 regression tests: safe apply / re-import of converted graphs.
 *
 * The full operator workflow runs against a transactional store double:
 * apply, rerun unchanged (idempotent, no duplicates), edit a target,
 * change the source, re-import (local edit preserved + conflict),
 * resolve the conflict explicitly, delete source regions (untouched
 * removed, edited kept), inject a database failure (complete rollback
 * + orphan media reconciled), a moved expected revision (refused),
 * and a foreign operator (denied before any write).
 */
import { describe, expect, it } from 'vitest'

import {
  applyWordpressConversion,
  ConversionApplyAccessError,
  readConversionBinding,
} from '@/modules/portability/legacy-migration/conversion-apply'
import type { MediaStoreBoundary } from '@/modules/portability/legacy-migration/media'
import type { LayoutBlock } from '@/modules/public/page-builder'

type Row = Record<string, unknown> & { id: string }

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
])

function makeWorld() {
  const layouts: Row[] = []
  const mediaByKey = new Map<string, { id: string; url: string }>()
  const state = { rollbacks: 0, commits: 0, failUpdates: false, revisionLie: false }
  let layoutSeq = 0
  let mediaSeq = 0

  const matches = (doc: Row, where: Record<string, unknown> = {}): boolean => {
    if (where.and) {
      return (where.and as Array<Record<string, unknown>>).every((clause) => matches(doc, clause))
    }
    return Object.entries(where).every(([field, condition]) => {
      const equals = (condition as { equals?: unknown }).equals
      const value = doc[field]
      const valueId =
        value && typeof value === 'object' ? String((value as { id?: unknown }).id ?? '') : value
      return String(valueId ?? value) === String(equals)
    })
  }

  const payload = {
    find: async ({
      collection,
      where,
      limit,
    }: {
      collection: string
      where?: Record<string, unknown>
      limit?: number
    }) => {
      if (collection !== 'page-layouts') return { docs: [] }
      const docs = layouts.filter((doc) => matches(doc, where)).slice(0, limit ?? 10)
      return { docs: structuredClone(docs) }
    },
    findByID: async ({ id }: { id: string }) => {
      const doc = layouts.find((candidate) => candidate.id === String(id))
      if (!doc) throw new Error('not found')
      const copy = structuredClone(doc)
      if (state.revisionLie) copy.revision = 99
      return copy
    },
    create: async ({ collection, data }: { collection: string; data: Row }) => {
      if (collection !== 'page-layouts') throw new Error(`unexpected ${collection}`)
      const row: Row = { ...structuredClone(data), id: `layout-${++layoutSeq}` }
      layouts.push(row)
      return structuredClone(row)
    },
    update: async ({ id, data }: { id: string; data: Partial<Row> }) => {
      if (state.failUpdates) throw new Error('injected database failure')
      const row = layouts.find((candidate) => candidate.id === String(id))
      if (!row) throw new Error('not found')
      Object.assign(row, structuredClone(data))
      return structuredClone(row)
    },
    jobs: { queue: async () => ({}) },
    db: {
      beginTransaction: async () => 'tx-1',
      commitTransaction: async () => {
        state.commits += 1
      },
      rollbackTransaction: async () => {
        state.rollbacks += 1
      },
    },
  }

  const store: MediaStoreBoundary = {
    createMedia: async ({ siteId, sha256, fileName }) => {
      const key = `${siteId}:${sha256}`
      const existing = mediaByKey.get(key)
      if (existing) return existing
      const created = { id: `media-${++mediaSeq}`, url: `/media/${fileName}` }
      mediaByKey.set(key, created)
      return created
    },
    findMediaBySha256: async (siteId, sha256) => mediaByKey.get(`${siteId}:${sha256}`) ?? null,
  }

  return { payload: payload as never, layouts, store, state, mediaByKey }
}

const OWNER = { id: 'op-1', role: 'owner', email: 'op@example.test' }

const SOURCE_V1 =
  '<!-- wp:heading --><h2>Title A</h2><!-- /wp:heading -->' +
  '<!-- wp:paragraph --><p>First body.</p><!-- /wp:paragraph -->' +
  '<!-- wp:image --><figure class="wp-block-image"><img src="https://old.example.com/kept.png" alt="Kept"/></figure><!-- /wp:image -->'
const SOURCE_V2 =
  '<!-- wp:heading --><h2>Title A</h2><!-- /wp:heading -->' +
  '<!-- wp:paragraph --><p>First body, revised.</p><!-- /wp:paragraph -->' +
  '<!-- wp:image --><figure class="wp-block-image"><img src="https://old.example.com/kept.png" alt="Kept"/></figure><!-- /wp:image -->'

const mediaArgs = (store: MediaStoreBoundary) => ({
  items: [
    {
      id: 'att-1',
      title: 'Kept',
      sourceUrl: 'https://old.example.com/kept.png',
      fileName: 'kept.png',
      mimeType: 'image/png',
    },
  ],
  store,
  localMediaFiles: {
    'https://old.example.com/kept.png': {
      buffer: PNG,
      fileName: 'kept.png',
      mimeType: 'image/png',
    },
  },
})

const baseArgs = (world: ReturnType<typeof makeWorld>) => ({
  siteId: 'site-a',
  user: OWNER,
  sourceId: 'wxr-page-1',
  path: '/converted',
  name: 'Converted',
  themeId: 'neutral-starter',
  media: mediaArgs(world.store),
})

const richBody = (blocks: LayoutBlock[], body: string) =>
  blocks.find((block) => block.component === 'publisher.rich-content' && block.props.body === body)

describe('S2-13 conversion apply and re-import', () => {
  it('runs the full workflow: apply, idempotent rerun, edit, source change, conflict, resolution, deletion', async () => {
    const world = makeWorld()
    const args = baseArgs(world)

    /* Apply: draft created, binding recorded, media staged once. */
    const first = await applyWordpressConversion(world.payload, {
      ...args,
      source: SOURCE_V1,
    })
    expect(first.applied).toBe(true)
    expect(first.conflicts).toEqual([])
    expect(first.media.createdIds).toHaveLength(1)
    let record = world.layouts.find((row) => row.path === '/converted')!
    expect(record.status).toBe('draft')
    expect(record.publishedRevision).toBeUndefined()
    const binding = readConversionBinding(record as { revisionHistory?: unknown })!
    expect(binding.regions.length).toBeGreaterThanOrEqual(3)
    const paragraphLocation = first.report.find(
      (entry) => entry.blockName === 'core/paragraph',
    )!.location
    const paragraphId = richBody(record.blocks as LayoutBlock[], 'First body.')!.id
    const imageBlock = (record.blocks as LayoutBlock[]).find(
      (block) => block.component === 'publisher.image',
    )!
    expect((imageBlock.props.media as { id: string }).id).toBe(first.media.createdIds[0])

    /* Rerun unchanged: no write, no duplicates, media reused. */
    const historyLength = (record.revisionHistory as unknown[]).length
    const rerun = await applyWordpressConversion(world.payload, { ...args, source: SOURCE_V1 })
    expect(rerun.applied).toBe(false)
    expect(rerun.media.createdIds).toEqual([])
    expect(rerun.media.reusedIds).toEqual(first.media.createdIds)
    record = world.layouts.find((row) => row.path === '/converted')!
    expect((record.revisionHistory as unknown[]).length).toBe(historyLength)
    expect((record.blocks as LayoutBlock[]).length).toBe(3)

    /* Operator edits the paragraph in the builder. */
    const edited = structuredClone(record.blocks) as LayoutBlock[]
    richBody(edited, 'First body.')!.props.body = 'Operator rewrote this.'
    record.blocks = edited

    /* Source changes the same region: local edit wins, conflict surfaces,
       and the untouched heading keeps its stable target id. */
    const conflicted = await applyWordpressConversion(world.payload, {
      ...args,
      source: SOURCE_V2,
    })
    expect(conflicted.applied).toBe(true)
    expect(conflicted.conflicts).toEqual([
      expect.objectContaining({ location: paragraphLocation, kind: 'local-edit-source-changed' }),
    ])
    record = world.layouts.find((row) => row.path === '/converted')!
    expect(richBody(record.blocks as LayoutBlock[], 'Operator rewrote this.')).toBeTruthy()
    expect(richBody(record.blocks as LayoutBlock[], 'First body, revised.')).toBeUndefined()
    expect(richBody(record.blocks as LayoutBlock[], 'Operator rewrote this.')!.id).toBe(paragraphId)

    /* The conflict persists on rerun until explicitly resolved. */
    const stillConflicted = await applyWordpressConversion(world.payload, {
      ...args,
      source: SOURCE_V2,
    })
    expect(stillConflicted.conflicts).toHaveLength(1)
    const resolved = await applyWordpressConversion(world.payload, {
      ...args,
      source: SOURCE_V2,
      resolutions: { [paragraphLocation]: 'accept-source' },
    })
    expect(resolved.conflicts).toEqual([])
    record = world.layouts.find((row) => row.path === '/converted')!
    const resolvedBlock = richBody(record.blocks as LayoutBlock[], 'First body, revised.')!
    expect(resolvedBlock.id).toBe(paragraphId) // stable target id across resolution

    /* Deleting regions from the source: the in-sync paragraph is removed;
       the image block is edited first, so it is kept with a conflict. */
    const withImageEdit = structuredClone(record.blocks) as LayoutBlock[]
    ;(withImageEdit.find((block) => block.component === 'publisher.image')!.props as Row).title =
      'Operator caption'
    record.blocks = withImageEdit
    const headingOnly = '<!-- wp:heading --><h2>Title A</h2><!-- /wp:heading -->'
    const deleted = await applyWordpressConversion(world.payload, {
      ...args,
      source: headingOnly,
    })
    record = world.layouts.find((row) => row.path === '/converted')!
    const remaining = record.blocks as LayoutBlock[]
    expect(remaining.some((block) => block.id === paragraphId)).toBe(false)
    expect(remaining.some((block) => block.component === 'publisher.image')).toBe(true)
    expect(deleted.conflicts).toEqual([expect.objectContaining({ kind: 'deleted-in-source' })])
    expect(deleted.decisions).toEqual(
      expect.arrayContaining([expect.objectContaining({ outcome: 'removed' })]),
    )
  })

  it('rolls back completely on database failure and reconciles orphaned staged media', async () => {
    const world = makeWorld()
    const discarded: string[] = []
    world.state.failUpdates = false
    /* Create succeeds path uses create, so fail on the SECOND apply's update. */
    const args = { ...baseArgs(world), path: '/fail-page' }
    const first = await applyWordpressConversion(world.payload, { ...args, source: SOURCE_V1 })
    expect(first.applied).toBe(true)
    const before = structuredClone(world.layouts.find((row) => row.path === '/fail-page')!)

    world.state.failUpdates = true
    const PNG2 = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 9),
    ])
    await expect(
      applyWordpressConversion(world.payload, {
        ...args,
        source:
          '<!-- wp:heading --><h2>Title B</h2><!-- /wp:heading -->' +
          '<!-- wp:image --><figure><img src="https://old.example.com/new.png" alt="New"/></figure><!-- /wp:image -->',
        media: {
          items: [
            ...mediaArgs(world.store).items,
            {
              id: 'att-2',
              title: 'New',
              sourceUrl: 'https://old.example.com/new.png',
              fileName: 'new.png',
              mimeType: 'image/png',
            },
          ],
          store: world.store,
          localMediaFiles: {
            ...mediaArgs(world.store).localMediaFiles,
            'https://old.example.com/new.png': {
              buffer: PNG2,
              fileName: 'new.png',
              mimeType: 'image/png',
            },
          },
        },
        discardMedia: async (ids) => {
          discarded.push(...ids)
        },
      }),
    ).rejects.toThrow('injected database failure')
    expect(world.state.rollbacks).toBeGreaterThan(0)
    /* The newly staged media is orphaned by the rollback and discarded;
       the previously applied media is referenced and kept. */
    expect(discarded).toHaveLength(1)
    expect(discarded[0]).not.toBe(first.media.createdIds[0])
    const after = world.layouts.find((row) => row.path === '/fail-page')!
    expect(after.blocks).toEqual(before.blocks)
    expect(after.revisionHistory).toEqual(before.revisionHistory)
  })

  it('refuses when the expected target revision moved, and denies foreign operators', async () => {
    const world = makeWorld()
    const args = baseArgs(world)
    await applyWordpressConversion(world.payload, { ...args, source: SOURCE_V1 })
    world.state.revisionLie = true
    await expect(
      applyWordpressConversion(world.payload, { ...args, source: SOURCE_V2 }),
    ).rejects.toThrow(/revision moved/)
    world.state.revisionLie = false

    const layoutsBefore = world.layouts.length
    await expect(
      applyWordpressConversion(world.payload, {
        ...args,
        user: { id: 'intruder', role: 'member', email: 'intruder@example.test' },
        source: SOURCE_V1,
      }),
    ).rejects.toBeInstanceOf(ConversionApplyAccessError)
    expect(world.layouts.length).toBe(layoutsBefore)
  })
})
