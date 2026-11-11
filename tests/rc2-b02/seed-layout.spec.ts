/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'

/**
 * RC2-B-02 seed: prepares the page layout the builder journey composes,
 * on Site A of the already-seeded RC2 world
 * (tests/rc2-b01/seed-world.spec.ts). Resets the layout to a clean
 * draft on every run so journey runs are deterministic. Also resolves
 * the publication the public shell binds to (the site's most recently
 * created active publication, per the frontend layout) for the
 * navigation stage. Run once per served environment; not part of any
 * suite sweep.
 */
describe('RC2-B-02 seed', () => {
  it('prepares the showcase page layout on Site A', async () => {
    const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
    const payload: Payload = await getPayload({ config })
    const path = `/b02-showcase-${world.suffix}`
    const existing = await (payload as any).find({
      collection: 'page-layouts',
      where: {
        and: [{ path: { equals: path } }, { site: { equals: world.siteA.siteId } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    const created =
      existing.docs[0] ??
      (await (payload as any).create({
        collection: 'page-layouts',
        data: {
          site: world.siteA.siteId,
          name: 'B02 Showcase Page',
          path,
          themeId: 'neutral-starter',
          surface: 'page',
          slot: 'main',
          layoutVersion: 1,
          status: 'draft',
          visibility: 'public',
          blocks: [],
          revision: 1,
        },
        overrideAccess: true,
      }))
    const layout = await (payload as any).update({
      collection: 'page-layouts',
      id: created.id,
      data: { blocks: [], themeId: 'neutral-starter', status: 'draft' },
      overrideAccess: true,
    })
    const pubs = await (payload as any).find({
      collection: 'publications',
      where: {
        and: [
          { site: { equals: world.siteA.siteId } },
          { status: { equals: 'active' } },
          { visibility: { equals: 'public' } },
        ],
      },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    })
    writeFileSync(
      '/tmp/b02-layout.json',
      JSON.stringify(
        {
          layoutId: String(layout.id),
          siteId: world.siteA.siteId,
          path,
          shellPublicationId: pubs.docs[0] ? String(pubs.docs[0].id) : null,
          shellPublicationName: pubs.docs[0]?.name ?? null,
        },
        null,
        2,
      ),
    )
    expect(layout.id).toBeTruthy()
    expect(pubs.docs[0]).toBeTruthy()
  }, 300_000)
})
