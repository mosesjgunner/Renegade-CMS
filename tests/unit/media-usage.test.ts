import { describe, expect, it, vi } from 'vitest'

import { recordMediaUsage } from '@/modules/media/usage'

// RC2-H-03: the media-usages write seam — one find-by-usageKey →
// update-or-create path shared by the media workflow, graphics, and
// profile writers (previously hand-rolled three times, two as bare
// creates that could duplicate the row on a repeat write).
describe('recordMediaUsage', () => {
  it('creates the row when the usageKey is new', async () => {
    const payload = {
      find: vi.fn(async () => ({ docs: [] })),
      create: vi.fn(async () => ({ id: 'u1' })),
      update: vi.fn(async () => ({ id: 'u1' })),
    }
    const data = { site: 's1', media: 'm1', usageKey: 'profile:p1:avatar:m1', purpose: 'avatar' }
    await recordMediaUsage(payload as never, data)
    expect(payload.find).toHaveBeenCalledTimes(1)
    expect(payload.create).toHaveBeenCalledTimes(1)
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'media-usages', data }),
    )
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('updates the existing row when the usageKey already exists', async () => {
    const payload = {
      find: vi.fn(async () => ({ docs: [{ id: 'u-existing' }] })),
      create: vi.fn(async () => ({ id: 'u2' })),
      update: vi.fn(async () => ({ id: 'u-existing' })),
    }
    const data = { site: 's1', media: 'm1', usageKey: 'graphic:d1', usageType: 'graphic-source' }
    await recordMediaUsage(payload as never, data)
    expect(payload.update).toHaveBeenCalledTimes(1)
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'media-usages', id: 'u-existing', data }),
    )
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('looks up by usageKey only, with no depth and access override', async () => {
    const payload = {
      find: vi.fn(async () => ({ docs: [] })),
      create: vi.fn(async () => ({ id: 'u1' })),
      update: vi.fn(async () => ({ id: 'u1' })),
    }
    await recordMediaUsage(payload as never, { usageKey: 'content:c1:hero' })
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media-usages',
        where: { usageKey: { equals: 'content:c1:hero' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      }),
    )
  })
})
