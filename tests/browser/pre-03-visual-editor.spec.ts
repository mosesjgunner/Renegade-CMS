import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import type { PageLayout } from '@/modules/public/page-builder'

test('PRE-03: controlled editor preview, publish, conflict recovery, theme switch and draft isolation', async ({
  page,
  context,
  playwright,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)
  const path = `/pre-03-${suffix}`
  const site = await payload.create({
    collection: 'sites',
    data: { name: `PRE-03 ${suffix}`, slug: `pre-03-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)
  const publication = await payload.create({
    collection: 'publications',
    data: {
      site: site.id,
      name: `PRE-03 ${suffix}`,
      slug: `pre-03-${suffix}`,
      canonicalBasePath: '/',
      status: 'active',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)
  const user = (
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string | number; email?: string }
  expect(user).toBeTruthy()
  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sessionId, user.id, expiresAt],
      )
    },
  )
  await context.addCookies([
    { name: 'renegade-passkey', value: session.token, url: 'http://localhost:3110' },
  ])
  const components = [
    'publisher.hero',
    'publisher.rich-content',
    'publisher.image',
    'publisher.feature-grid',
    'publisher.cta',
    'publisher.article-list',
  ]
  const created = (await payload.create({
    collection: 'page-layouts',
    data: {
      site: site.id,
      path,
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      layoutVersion: 1,
      status: 'draft',
      visibility: 'public',
      blocks: components.map((component, index) => ({
        id: `section-${index}`,
        component,
        componentVersion: 1,
        props: {
          title: ['Welcome', 'Our story', 'Selected image', 'Features', 'Join us', 'Latest'][index],
          alignment: 'left',
          spacing: 'normal',
          variant: 'default',
          ...(component.includes('list') || component.includes('grid')
            ? { query: { collection: 'content', limit: 6, sort: 'newest' } }
            : {}),
        },
      })),
      unknownBlocks: [],
      revision: 1,
      revisionHistory: [],
    },
    overrideAccess: true,
  } as never)) as unknown as { id: string | number; blocks: PageLayout['blocks'] }

  const layout = (
    revision: number,
    title = 'Welcome',
    themeId = 'neutral-starter',
  ): PageLayout => ({
    version: 1,
    id: String(created.id),
    siteId: String(site.id),
    path,
    status: revision > 1 ? 'published' : 'draft',
    themeId,
    surface: 'page',
    slot: 'main',
    blocks: (created.blocks as PageLayout['blocks']).map((block, index) =>
      index === 0 ? { ...block, props: { ...block.props, title } } : block,
    ),
    unknownBlocks: [],
    revision,
  })

  try {
    await page.goto(`/builder/${created.id}`)
    await expect(page.getByText('Renegade visual editor')).toBeVisible()
    await expect(page.getByText('Hero', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Feature grid', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /undo/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /redo/i })).toBeVisible()

    await page.goto(`/builder/${created.id}/preview`)
    await expect(page.locator('[data-authenticated-draft-preview]')).toContainText('Welcome')

    const publish = await page.request.patch(`/api/layouts/${created.id}`, {
      data: { layout: layout(1), publish: true, expectedRevision: 1 },
    })
    expect(publish.status()).toBe(200)
    const anonymous = await playwright.request.newContext({ baseURL: 'http://localhost:3110' })
    await expect((await anonymous.get(path)).text()).resolves.toContain('Welcome')

    const draft = await page.request.patch(`/api/layouts/${created.id}`, {
      data: { layout: layout(2, 'PRIVATE NEWER DRAFT'), publish: false, expectedRevision: 2 },
    })
    expect(draft.status()).toBe(200)
    await expect((await anonymous.get(path)).text()).resolves.not.toContain('PRIVATE NEWER DRAFT')
    expect((await anonymous.get(`/builder/${created.id}/preview`)).status()).toBe(404)

    const switched = await page.request.patch(`/api/layouts/${created.id}`, {
      data: {
        layout: layout(3, 'PRIVATE NEWER DRAFT', 'renegade-party'),
        publish: false,
        expectedRevision: 3,
      },
    })
    expect(switched.status()).toBe(200)
    await page.goto(`/builder/${created.id}`)
    await expect(page.getByLabel('Compatible theme')).toHaveValue('renegade-party')

    const stale = await page.request.patch(`/api/layouts/${created.id}`, {
      data: { layout: layout(2, 'STALE WRITE'), publish: false, expectedRevision: 2 },
    })
    expect(stale.status()).toBe(409)
    expect((await stale.json()).current.revision).toBe(4)
    await anonymous.dispose()
  } finally {
    await payload.delete({ collection: 'page-layouts', id: created.id, overrideAccess: true })
    await payload.delete({ collection: 'publications', id: publication.id, overrideAccess: true })
    await payload.db.pool.query('DELETE FROM admin_sessions WHERE id=$1', [session.sessionId])
    await payload.delete({ collection: 'sites', id: site.id, overrideAccess: true })
    await payload.db.destroy?.()
  }
})
