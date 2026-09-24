import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicLayout } from '../../src/modules/public/PublicLayout'
import { installRecipe } from '../../src/modules/public/page-builder'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import {
  changeTheme,
  createThemePreview,
  readThemeState,
  resolveConfiguration,
  themePool,
  type ThemePool,
} from '../../src/modules/presentation/lifecycle'
import { discoverThemes } from '../../src/modules/presentation/packages'
let payload: Payload, pool: ThemePool
const site = randomUUID(),
  other = randomUUID()
beforeAll(async () => {
  payload = await getPayload({ config })
  pool = themePool(payload)
  await pool.query(
    "INSERT INTO sites (id,name,slug,lifecycle) VALUES ($1::uuid,$1::text,$1::text,'active'),($2::uuid,$2::text,$2::text,'active')",
    [site, other],
  )
}, 120000)
afterAll(async () => {
  if (pool) await pool.query('DELETE FROM sites WHERE id IN ($1,$2)', [site, other])
  await payload?.db.destroy?.()
})
describe('PRE-01 durable lifecycle', () => {
  it('isolates previews, serializes activation, preserves audit, upgrades, rolls back, and recovers after package failure', async () => {
    const initial = await readThemeState(pool, site)
    expect(initial.revision).toBe(0)
    let state = await changeTheme(pool, {
      site,
      actor: 'owner',
      revision: 0,
      action: 'draft',
      id: 'neutral-starter',
      version: '1.0.0',
      tokens: { 'color.canvas': '#ffffff' },
    })
    const token = await createThemePreview(pool, site, 'owner', state.revision)
    expect(
      (await resolveConfiguration(pool, site, { actor: 'owner', token }))?.tokens['color.canvas'],
    ).toBe('#ffffff')
    expect((await resolveConfiguration(pool, site))?.tokens['color.canvas']).toBeUndefined()
    expect(
      (await resolveConfiguration(pool, site, { actor: 'intruder', token }))?.tokens[
        'color.canvas'
      ],
    ).toBeUndefined()
    expect(await resolveConfiguration(pool, other, { actor: 'owner', token })).toBeNull()
    await expect(
      changeTheme(
        pool,
        {
          site,
          actor: 'owner',
          revision: state.revision,
          action: 'draft',
          id: 'neutral-starter',
          version: '1.1.0',
        },
        (await discoverThemes()).map((item) =>
          item.package?.version === '1.1.0'
            ? { ...item, package: { ...item.package, migrations: [] } }
            : item,
        ),
      ),
    ).rejects.toThrow('migration')
    expect(await readThemeState(pool, site)).toEqual(state)
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        changeTheme(pool, { site, actor: 'owner', revision: state.revision, action: 'activate' }),
      ),
    )
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    state = await readThemeState(pool, site)
    expect(state.active?.tokens['color.canvas']).toBe('#ffffff')
    state = await changeTheme(pool, {
      site,
      actor: 'owner',
      revision: state.revision,
      action: 'draft',
      id: 'neutral-starter',
      version: '1.1.0',
    })
    const installed = await discoverThemes()
    await expect(
      changeTheme(
        pool,
        { site, actor: 'owner', revision: state.revision, action: 'activate' },
        installed.map((p) => ({ ...p, digest: 'tampered' })),
      ),
    ).rejects.toThrow('changed on disk')
    expect((await readThemeState(pool, site)).revision).toBe(state.revision)
    state = await changeTheme(pool, {
      site,
      actor: 'owner',
      revision: state.revision,
      action: 'activate',
    })
    expect(state.active?.version).toBe('1.1.0')
    state = await changeTheme(pool, {
      site,
      actor: 'owner',
      revision: state.revision,
      action: 'rollback',
    })
    expect(state.active?.version).toBe('1.0.0')
    await pool.query(
      `UPDATE presentation_theme_state SET active=jsonb_set(active,'{digest}','"broken"') WHERE site_id=$1`,
      [site],
    )
    expect((await resolveConfiguration(pool, site))?.version).toBe('1.1.0')
    const audit = await pool.query('SELECT action FROM presentation_theme_audit WHERE site_id=$1', [
      site,
    ])
    expect(audit.rows).toHaveLength(6)
    expect((await readThemeState(pool, other)).revision).toBe(0)
  }, 120000)
  it('publishes a complete layout snapshot and keeps later draft edits private', async () => {
    const layout = installRecipe(undefined, 'writer-blogger', site)
    const created = (await payload.create({
      collection: 'page-layouts',
      overrideAccess: true,
      data: {
        site,
        path: '/pre-01-snapshot',
        themeId: 'neutral-starter',
        retentionMode: 'permanent',
        retentionHold: 'none',
        layoutVersion: 1,
        status: 'published',
        visibility: 'public',
        blocks: layout.blocks,
        unknownBlocks: [],
        revision: 1,
        publishedRevision: 1,
        revisionHistory: [],
      },
    } as never)) as unknown as Record<string, unknown>
    try {
      const publicBefore = renderToStaticMarkup(
        createElement(PublicLayout, {
          record: created,
          path: '/pre-01-snapshot',
        }),
      )
      const edited = (await payload.update({
        collection: 'page-layouts',
        id: created.id as string,
        overrideAccess: true,
        context: { publishPresentation: false },
        data: {
          revision: 2,
          blocks: layout.blocks.map((block) => ({
            ...block,
            props: { ...block.props, title: 'UNPUBLISHED THEME DRAFT' },
          })),
        },
      } as never)) as unknown as Record<string, unknown>
      expect(edited.publishedPresentation).toEqual(created.publishedPresentation)
      expect(
        renderToStaticMarkup(
          createElement(PublicLayout, {
            record: edited,
            path: '/pre-01-snapshot',
          }),
        ),
      ).toBe(publicBefore)
      const anonymous = (await payload.findByID({
        collection: 'page-layouts',
        id: created.id as string,
        overrideAccess: false,
      } as never)) as unknown as Record<string, unknown>
      expect(anonymous.blocks).toBeUndefined()
      expect(anonymous.revisionHistory).toBeUndefined()
      const published = (await payload.update({
        collection: 'page-layouts',
        id: created.id as string,
        overrideAccess: true,
        context: { publishPresentation: true },
        data: { publishedRevision: 2 },
      } as never)) as unknown as Record<string, unknown>
      expect(published.publishedPresentation).not.toEqual(created.publishedPresentation)
      expect(
        renderToStaticMarkup(
          createElement(PublicLayout, {
            record: published,
            path: '/pre-01-snapshot',
          }),
        ),
      ).toContain('UNPUBLISHED THEME DRAFT')
    } finally {
      await payload.delete({
        collection: 'page-layouts',
        id: created.id as string,
        overrideAccess: true,
      })
    }
  })
})
