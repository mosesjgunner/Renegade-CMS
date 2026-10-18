/* eslint-disable @typescript-eslint/no-explicit-any -- focused canonical projection fixture */
import { describe, expect, it } from 'vitest'
import { publicMedia } from '../../src/modules/media/workflow'

describe('05C public version URLs', () => {
  it.each(['public', 'private', 'expired', 'foreign', 'cycle', 'orphan'])(
    'derives %s version access from live ancestors',
    async (mode) => {
      const source: any = {
        id: 'source',
        site: mode === 'foreign' ? 'other' : 'site-a',
        replaceGloballyWith: 'edited',
        publicPolicy: mode === 'private' ? 'private' : 'published-use',
        ...(mode === 'expired' ? { rightsExpiresAt: '2000-01-01T00:00:00Z' } : {}),
      }
      const edited: any = {
        id: 'edited',
        site: 'site-a',
        ...(mode === 'cycle' ? { replaceGloballyWith: 'source' } : {}),
      }
      const payload = {
        findByID: async ({ id }: any) => (id === 'source' ? source : edited),
        find: async ({ collection, where }: any) => ({
          docs:
            collection === 'media-assets'
              ? mode !== 'orphan' && where.and[1].replaceGloballyWith.equals === 'edited'
                ? [source]
                : []
              : collection === 'content' &&
                  where.and[0].heroMedia.equals === 'source' &&
                  mode !== 'cycle'
                ? [{ id: 'article', status: 'published', visibility: 'public' }]
                : [],
        }),
      }
      const result = await publicMedia(payload as never, 'edited')
      if (mode === 'public') expect(result).toBe(edited)
      else expect(result).toBeUndefined()
    },
  )
})
