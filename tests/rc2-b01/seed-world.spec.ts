/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  buildRc2World,
  operatorSession,
  type Rc2Principal,
  type Rc2World,
} from '../fixtures/rc2-world'

/**
 * RC2-B-01 seed: builds the A-04 standard world into the served
 * acceptance database (no teardown — the browser journey runs against
 * it) and writes the session/world manifest the journey runner reads.
 * Run once per served environment; not part of any suite sweep.
 */
describe('RC2-B-01 seed', () => {
  it('builds the world and mints real sessions', async () => {
    const payload: Payload = await getPayload({ config })
    const world: Rc2World = await buildRc2World(payload)

    const tokenOf = async (principal: Rc2Principal) => {
      const headers = await operatorSession(payload, principal)
      const cookie = headers.get('cookie') ?? ''
      return cookie.replace('renegade-passkey=', '')
    }

    // The world builder's shared media carries no alt text, which the
    // editorial quality gate treats as publication-blocking; a journey
    // article using it could never be approved. Give it real alt text.
    await (payload as any).update({
      collection: 'media-assets',
      id: world.siteA.mediaAssetId,
      data: { altText: 'Diagram of the Renegade publishing workflow' },
      overrideAccess: true,
    })

    const category = await (payload as any).create({
      collection: 'categories',
      data: {
        site: world.siteA.siteId,
        scope: 'site',
        name: `Journey Category ${world.suffix}`,
        slug: `journey-category-${world.suffix}`,
      },
      overrideAccess: true,
    })

    const published = await (payload as any).findByID({
      collection: 'content',
      id: world.siteA.publishedArticleId,
      depth: 0,
      overrideAccess: true,
    })
    const manifest = {
      suffix: world.suffix,
      siteA: {
        siteId: world.siteA.siteId,
        host: world.siteA.host,
        origin: world.siteA.origin,
        blogPublicationId: world.siteA.blogPublicationId,
        publishedArticleId: world.siteA.publishedArticleId,
        publishedCanonicalPath: published?.canonicalPath ?? null,
        draftArticleId: world.siteA.draftArticleId,
        mediaAssetId: world.siteA.mediaAssetId,
        memberSpaceId: world.siteA.memberSpaceId,
      },
      siteB: { siteId: world.siteB.siteId, host: world.siteB.host },
      categoryAId: String(category.id),
      categoryAName: `Journey Category ${world.suffix}`,
      cookies: {
        editorA: await tokenOf(world.siteA.editor),
        adminA: await tokenOf(world.siteA.admin),
        outsiderB: await tokenOf(world.outsider),
      },
      ids: {
        editorAUserId: world.siteA.editor.userId,
        adminAUserId: world.siteA.admin.userId,
      },
    }
    writeFileSync('/tmp/b01-world.json', JSON.stringify(manifest, null, 2))
    expect(manifest.siteA.publishedCanonicalPath).toBeTruthy()
  }, 300_000)
})
