/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  applyLayoutAction,
  installRecipe,
  publishLayout,
  renderLayout,
  validateLayout,
} from '../../src/modules/public/page-builder'
import { normalizeNavigation } from '../../src/modules/public/navigation'
import { seed } from '../../src/scripts/seed'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
})
afterAll(async () => payload?.db.destroy?.())

describe('visual builder acceptance', () => {
  it('installs a starter, replaces its guided image, saves a draft, previews, publishes, and protects drafts', async () => {
    const site = (
      await payload.find({
        collection: 'sites',
        where: { slug: { equals: 'demo-publication' } },
        limit: 1,
        overrideAccess: true,
      } as never)
    ).docs[0] as any
    let layout = installRecipe(undefined, 'writer-blogger', String(site.id))
    layout = applyLayoutAction(layout, {
      type: 'replace-placeholder',
      id: layout.blocks[0].id,
      mediaId: 'guided-media',
    })
    layout = applyLayoutAction(layout, { type: 'move', id: layout.blocks[2].id, to: 0 })
    const created = (await payload.create({
      collection: 'page-layouts',
      data: {
        site: site.id,
        path: `/builder-${randomUUID()}`,
        themeId: layout.themeId,
        layoutVersion: layout.version,
        status: 'draft',
        visibility: 'public',
        blocks: layout.blocks,
        unknownBlocks: [],
        revision: layout.revision,
        revisionHistory: [{ revision: layout.revision }],
      },
      overrideAccess: true,
    } as never)) as any
    const anonymousDraft = await payload.find({
      collection: 'page-layouts',
      where: { id: { equals: created.id } },
      limit: 1,
      overrideAccess: false,
    } as never)
    expect(anonymousDraft.docs).toHaveLength(0)
    const preview = renderLayout(layout, 'mobile')
    expect(Array.isArray(preview)).toBe(true)
    const published = publishLayout(layout, ['layout:edit', 'layout:publish'])
    await payload.update({
      collection: 'page-layouts',
      id: created.id,
      data: {
        status: published.status,
        blocks: published.blocks,
        revision: published.revision,
        publishedRevision: published.publishedRevision,
      },
      overrideAccess: true,
    } as never)
    const anonymousPublished = await payload.find({
      collection: 'page-layouts',
      where: { id: { equals: created.id } },
      limit: 1,
      overrideAccess: false,
    } as never)
    expect(anonymousPublished.docs).toHaveLength(1)
  })

  it('keeps removed components recoverable and renders the same portable layout in both themes', () => {
    const layout = installRecipe(undefined, 'organization', 'site')
    expect(renderLayout({ ...layout, themeId: 'neutral-starter' })).toBeTruthy()
    expect(renderLayout({ ...layout, themeId: 'renegade-party' })).toBeTruthy()
    const checked = validateLayout({
      ...layout,
      blocks: [{ id: 'legacy', component: 'retired.component', componentVersion: 9, props: {} }],
    })
    expect(checked.layout.unknownBlocks).toHaveLength(1)
    expect(checked.errors[0]).toContain('preserved')
  })

  it('stores the representative published navigation contract alongside public layouts', async () => {
    const publication = (
      await payload.find({
        collection: 'publications',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs[0] as any
    await payload.update({
      collection: 'publications',
      id: publication.id,
      data: {
        navigation: {
          primary: [
            { label: 'Home', href: '/' },
            {
              label: 'Journal',
              href: '/articles',
              children: [{ label: 'Welcome', href: '/articles/welcome' }],
            },
          ],
          secondary: [{ label: 'About', href: '/about' }],
          footer: [{ label: 'Privacy', href: '/privacy' }],
        },
      },
      overrideAccess: true,
    } as never)
    const updated = (await payload.findByID({
      collection: 'publications',
      id: publication.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    const navigation = normalizeNavigation(updated.navigation)
    expect(navigation.primary[1]?.children[0]?.href).toBe('/articles/welcome')
    expect(navigation.footer[0]?.label).toBe('Privacy')
  })
})
