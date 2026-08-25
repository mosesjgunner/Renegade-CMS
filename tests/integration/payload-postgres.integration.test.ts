import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'

let payload: Payload

afterAll(async () => {
  if (payload?.db.destroy) await payload.db.destroy()
})

describe('Payload PostgreSQL integration', () => {
  it('writes and reads a scoped publication record through Payload', async () => {
    payload = await getPayload({ config })
    const slug = `integration-${randomUUID()}`
    const created = await payload.create({
      collection: 'sites',
      data: { name: 'Integration Publication', slug, lifecycle: 'active' },
    })

    const read = await payload.find({
      collection: 'sites',
      where: { slug: { equals: slug } },
      limit: 1,
    })

    expect(String(created.id)).toMatch(/^[0-9a-f-]{36}$/i)
    expect(read.docs[0]?.name).toBe('Integration Publication')
    await payload.delete({ collection: 'sites', id: created.id })
  })
})
