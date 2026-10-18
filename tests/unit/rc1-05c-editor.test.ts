import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../../src/modules/core/config'
import { replaceMedia } from '../../src/modules/media/workflow'

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  PAYLOAD_SECRET: 'a'.repeat(48),
  APP_URL: 'http://localhost:3000',
})

describe('05C editor replacement authorization', () => {
  it.each([null, { role: 'member' }, { role: 'staff' }])(
    'refuses %j before reading protected source or parsing bytes',
    async (user) => {
      const findByID = vi.fn(),
        create = vi.fn()
      await expect(
        replaceMedia({ findByID, create } as never, config, {
          user,
          scope: { kind: 'site', siteId: 'site-a' },
          replacedMediaId: 'protected',
          title: 'Edited',
          bytes: new Uint8Array(),
          mode: 'new-asset',
        }),
      ).rejects.toMatchObject({ status: 403 })
      expect(findByID).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )
})
