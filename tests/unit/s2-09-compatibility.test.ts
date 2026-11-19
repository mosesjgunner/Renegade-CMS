/**
 * S2-09 regression tests: declarative theme extensions, site
 * compatibility preflight, and the A → B → A activation lifecycle.
 *
 * Packages gain three optional declarative extensions (responsive
 * policy, template defaults, component variants) — references only,
 * never code — while existing packages validate unchanged. The site
 * preflight inventories real published output and blocks candidates
 * that cannot render required domain content. The lifecycle proof runs
 * the real changeTheme/resolveConfiguration over a SQL double: draft,
 * activate, roll back, stale-revision refusal, and recovery when the
 * active package goes missing. Concurrent activation on real
 * PostgreSQL rides the S2-15 rig pass.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { preflightSiteCompatibility } from '@/modules/presentation/compatibility'
import {
  changeTheme,
  readThemeState,
  resolveConfiguration,
  type Configuration,
  type ThemePool,
} from '@/modules/presentation/lifecycle'
import { discoverThemes, validatePackage } from '@/modules/presentation/packages'
import { resolveTheme } from '@/modules/presentation/registry'
import { themeStyle } from '@/modules/presentation/runtime'
import { renderLayout, type LayoutBlock, type PageLayout } from '@/modules/public/page-builder'

type Doc = Record<string, any>

const minimalManifest = {
  id: 'neutral-starter',
  version: '1.0.0',
  label: 'Neutral Starter',
  renegade: '^1.0.0',
  renderer: 'neutral-starter',
  tokens: {},
  assets: [],
  migrations: [],
}

describe('S2-09 declarative package extensions', () => {
  it('validates existing packages unchanged and accepts the declarative extensions', () => {
    expect(validatePackage(structuredClone(minimalManifest)).responsivePolicy).toBeUndefined()
    const extended = validatePackage({
      ...minimalManifest,
      responsivePolicy: 'core-responsive-v1',
      templateDefaults: { article: 'article', page: 'page' },
      componentVariants: { 'publisher.hero': ['default', 'split'] },
    })
    expect(extended.templateDefaults?.article).toBe('article')
    expect(extended.componentVariants?.['publisher.hero']).toEqual(['default', 'split'])
  })

  it('refuses unregistered policies, foreign template/component references, and unknown keys', () => {
    expect(() =>
      validatePackage({ ...minimalManifest, responsivePolicy: 'raw-css-forever' }),
    ).toThrow('not registered')
    expect(() =>
      validatePackage({ ...minimalManifest, templateDefaults: { article: 'no-such-template' } }),
    ).toThrow('unregistered template')
    expect(() =>
      validatePackage({ ...minimalManifest, componentVariants: { 'acme.widget': ['x'] } }),
    ).toThrow('unregistered component')
    expect(() => validatePackage({ ...minimalManifest, executable: 'yes' })).toThrow(
      'unknown or missing fields',
    )
  })
})

const richBlock = (id: string, component: string, componentVersion = 1): LayoutBlock =>
  ({
    id,
    component,
    componentVersion,
    props: { title: id, body: 'x', alignment: 'left', spacing: 'normal' },
  }) as LayoutBlock

const snapshot = (blocks: LayoutBlock[], slots?: Record<string, LayoutBlock[]>) => ({
  version: 1,
  path: '/x',
  document: {
    version: 1,
    siteId: 'site-a',
    theme: { id: 'neutral-starter', version: '1.0.0' },
    template: { id: 'layout', version: '1.0.0' },
    surface: 'layout',
    slots: slots ?? { main: blocks },
  },
})

describe('S2-09 site compatibility preflight', () => {
  it('inventories published output and blocks only what cannot render required content', async () => {
    const installed = await discoverThemes()
    const item = installed.find((entry) => entry.package?.id === 'neutral-starter')!
    const configuration: Configuration = {
      id: item.package!.id,
      version: item.package!.version,
      digest: item.digest!,
      renderer: item.package!.renderer,
      tokens: item.package!.tokens,
    }
    const records: Doc[] = [
      {
        id: 'page-1',
        site: 'site-a',
        surface: 'page',
        path: '/story',
        publishedRevision: 1,
        revision: 1,
        publishedPresentation: snapshot([
          richBlock('ok-1', 'publisher.rich-content'),
          richBlock('future-1', 'acme.future-widget'),
          richBlock('body-1', 'publisher.editorial', 99),
          {
            id: 'pat-1',
            component: 'publisher.pattern',
            componentVersion: 1,
            props: {
              patternId: 'pat-missing',
              patternName: 'Gone',
              patternVersion: 1,
              mode: 'linked',
            },
          } as LayoutBlock,
        ]),
      },
      {
        id: 'page-2',
        site: 'site-a',
        surface: 'page',
        path: '/broken',
        publishedRevision: 1,
        revision: 1,
        publishedPresentation: snapshot([], {}),
      },
      {
        id: 'region-1',
        site: 'site-a',
        surface: 'global',
        path: '__global__/header',
        publishedRevision: 1,
        revision: 1,
        blocks: [richBlock('g-1', 'publisher.rich-content')],
      },
      { id: 'tpl-1', site: 'site-a', surface: 'template', path: '__template__/t', revision: 1 },
      {
        id: 'pat-real',
        site: 'site-a',
        surface: 'pattern',
        path: '__pattern__/real',
        publishedRevision: 1,
        revision: 1,
      },
      { id: 'draft-1', site: 'site-a', surface: 'page', path: '/draft', revision: 1 },
      { id: 'foreign-1', site: 'site-b', surface: 'page', path: '/x', publishedRevision: 1 },
    ]
    const payload: any = {
      find: async () => ({ docs: records.filter((doc) => doc.site === 'site-a') }),
    }
    const report = await preflightSiteCompatibility(payload, 'site-a', configuration, installed)
    expect(report.inventory.publishedPages).toBe(2)
    expect(report.inventory.globalRegions).toBe(1)
    expect(report.inventory.templates).toBe(1)
    expect(report.inventory.patterns).toBe(1)
    expect(report.inventory.linkedPatternInstances).toBe(1)
    expect(report.assets).toEqual({ declared: 0, verified: true })
    // Blockers: the canonical body at an unmigratable version, and the
    // page whose published output lost its required main slot.
    expect(report.blockers.map((issue) => issue.reason)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('no migration to candidate version'),
        expect.stringContaining('Required slot missing'),
      ]),
    )
    expect(report.blockers).toHaveLength(2)
    // Warnings: the unknown optional block and the missing pattern.
    expect(report.warnings.map((issue) => issue.reason)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('not registered in the candidate theme'),
        expect.stringContaining('Linked pattern is missing'),
      ]),
    )
  })
})

/* ------------------------------------------------------------------ */
/* Lifecycle over a SQL double                                         */
/* ------------------------------------------------------------------ */

function makePool() {
  const state = {
    revision: 0,
    active: null as Doc | null,
    draft: null as Doc | null,
    previous: null as Doc | null,
  }
  const audit: unknown[][] = []
  const handle = async (sql: string, values: unknown[] = []) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
    if (sql.startsWith('INSERT INTO presentation_theme_state')) return { rows: [], rowCount: 1 }
    if (sql.includes('FROM presentation_theme_state') && sql.includes('FOR UPDATE'))
      return { rows: [structuredClone(state)], rowCount: 1 }
    if (sql.startsWith('SELECT revision, active, draft, previous FROM presentation_theme_state'))
      return { rows: [structuredClone(state)], rowCount: 1 }
    if (sql.startsWith('SELECT theme_id FROM site_settings'))
      return { rows: [{ theme_id: 'neutral-starter' }], rowCount: 1 }
    if (sql.startsWith('UPDATE presentation_theme_state')) {
      state.revision = values[1] as number
      state.active = JSON.parse(values[2] as string)
      state.draft = JSON.parse(values[3] as string)
      state.previous = JSON.parse(values[4] as string)
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith('INSERT INTO presentation_theme_audit')) {
      audit.push(values)
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith('DELETE FROM presentation_theme_previews')) return { rows: [], rowCount: 0 }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  const pool = {
    query: handle,
    connect: async () => ({ query: handle, release: () => {} }),
  }
  return { pool: pool as unknown as ThemePool, state, audit }
}

const layoutFixture = (): PageLayout => ({
  version: 1,
  id: 'home',
  siteId: 'site-a',
  path: '/',
  status: 'published',
  themeId: 'neutral-starter',
  surface: 'page',
  slot: 'main',
  blocks: [richBlock('hero-1', 'publisher.hero')],
  unknownBlocks: [],
  revision: 1,
})

const styleFor = (renderer: string) =>
  JSON.stringify(themeStyle(resolveTheme(renderer)) as unknown as Record<string, string>)

describe('S2-09 theme lifecycle A → B → A', () => {
  it('drafts, activates, rolls back to the identical configuration, and refuses stale revisions', async () => {
    const { pool, state, audit } = makePool()
    const installed = await discoverThemes()

    const drafted = await changeTheme(
      pool,
      {
        site: 'site-a',
        actor: 'owner-1',
        revision: 0,
        action: 'draft',
        id: 'renegade-party',
        version: '1.0.0',
      },
      installed,
    )
    // Legacy bootstrap pinned neutral-starter as the initial active (A).
    const configA = drafted.active!
    expect(configA.id).toBe('neutral-starter')
    const htmlA = renderToStaticMarkup(renderLayout(layoutFixture(), 'all'))
    const styleA = styleFor(configA.renderer)

    const activated = await changeTheme(
      pool,
      { site: 'site-a', actor: 'owner-1', revision: 1, action: 'activate' },
      installed,
    )
    expect(activated.active?.id).toBe('renegade-party')
    expect(activated.previous).toEqual(configA)
    // B is visually distinct: different renderer tokens drive the frame.
    expect(styleFor('renegade-party')).not.toBe(styleA)

    const rolledBack = await changeTheme(
      pool,
      { site: 'site-a', actor: 'owner-1', revision: 2, action: 'rollback' },
      installed,
    )
    expect(rolledBack.active).toEqual(configA)
    expect(renderToStaticMarkup(renderLayout(layoutFixture(), 'all'))).toBe(htmlA)
    expect(audit.length).toBe(3)

    // A writer holding the pre-rollback revision is refused (CAS).
    await expect(
      changeTheme(
        pool,
        { site: 'site-a', actor: 'owner-2', revision: 2, action: 'activate' },
        installed,
      ),
    ).rejects.toThrow('Theme changed in another session')
    expect(state.revision).toBe(3)
  })

  it('recovers to the previous configuration when the active package goes missing', async () => {
    const { pool, state } = makePool()
    const installed = await discoverThemes()
    const good = installed.find((entry) => entry.package?.id === 'neutral-starter')!
    const previous: Configuration = {
      id: good.package!.id,
      version: good.package!.version,
      digest: good.digest!,
      renderer: good.package!.renderer,
      tokens: good.package!.tokens,
    }
    state.revision = 5
    state.active = {
      id: 'ghost-theme',
      version: '9.9.9',
      digest: 'deadbeef',
      renderer: 'neutral-starter',
      tokens: {},
    }
    state.previous = { ...previous }
    const resolved = await resolveConfiguration(pool, 'site-a')
    expect(resolved?.id).toBe('neutral-starter')
    const after = await readThemeState(pool, 'site-a')
    expect(after.active?.id).toBe('neutral-starter')
    expect(after.revision).toBe(6)
  })
})
