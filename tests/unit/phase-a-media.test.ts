/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'

import { publicMedia, resolveMediaReplacement } from '../../src/modules/media/workflow'

const asset = (id: string, replaceGloballyWith?: string) => ({
  id,
  site: 'site-a',
  storageLocation: `site-a/${id}.png`,
  ...(replaceGloballyWith ? { replaceGloballyWith } : {}),
})

describe('A-02 replacement semantics', () => {
  it('resolves a bounded, same-site replacement chain while retaining the original identity', async () => {
    const records: Record<string, any> = { old: asset('old', 'new'), new: asset('new') }
    const payload = { findByID: async ({ id }: any) => records[id] }
    await expect(resolveMediaReplacement(payload as never, records.old)).resolves.toEqual(
      records.new,
    )
  })

  it('refuses replacement cycles and cross-site targets', async () => {
    const loop: Record<string, any> = { one: asset('one', 'two'), two: asset('two', 'one') }
    const crossSite = { ...asset('other'), site: 'site-b' }
    const payload = { findByID: async ({ id }: any) => (id === 'other' ? crossSite : loop[id]) }
    await expect(resolveMediaReplacement(payload as never, loop.one)).resolves.toBeUndefined()
    await expect(
      resolveMediaReplacement(payload as never, asset('old', 'other')),
    ).resolves.toBeUndefined()
  })

  it('makes a published canonical use serve its replacement, but never makes an orphan public', async () => {
    const records: Record<string, any> = {
      old: asset('old', 'new'),
      new: asset('new'),
      orphan: asset('orphan'),
    }
    const payload = {
      findByID: async ({ id }: any) => records[id],
      find: async ({ collection, where }: any) => ({
        docs:
          collection === 'content' && where.and?.[0]?.heroMedia?.equals === 'old'
            ? [{ id: 'post' }]
            : [],
      }),
    }
    await expect(publicMedia(payload as never, 'old')).resolves.toEqual(records.new)
    await expect(publicMedia(payload as never, 'orphan')).resolves.toBeUndefined()
  })
})
