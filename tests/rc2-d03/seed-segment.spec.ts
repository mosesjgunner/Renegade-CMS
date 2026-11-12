import { writeFileSync } from 'node:fs'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import config from '../../src/payload.config'

// RC2-D-03 seed: one audience segment on Site A matching consented newsletter
// subscribers. Everything else in the journey goes through public/operator
// HTTP surfaces.
describe('rc2-d03 seed', () => {
  it('creates the Site A segment and records ids', async () => {
    const payload = await getPayload({ config })
    const world = JSON.parse(
      (await import('node:fs')).readFileSync('/tmp/b01-world.json', 'utf8'),
    ) as any
    const siteId = String(world.siteA.siteId)
    const name = `D03 Newsletter Audience ${world.suffix}`
    const existing = await (payload as any).find({
      collection: 'audience-segments',
      where: { and: [{ site: { equals: siteId } }, { name: { equals: name } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const segment =
      existing.docs[0] ??
      (await (payload as any).create({
        collection: 'audience-segments',
        data: {
          site: siteId,
          name,
          version: 'd03-v1',
          status: 'active',
          definition: {
            all: [{ predicate: { field: 'consentPurpose', op: 'is', value: 'newsletter' } }],
          },
        },
        overrideAccess: true,
      }))
    writeFileSync(
      '/tmp/d03-seed.json',
      JSON.stringify({ segmentId: String(segment.id), siteA: siteId, siteB: world.siteB.siteId }),
    )
    expect(segment.id).toBeTruthy()
  }, 120_000)
})
