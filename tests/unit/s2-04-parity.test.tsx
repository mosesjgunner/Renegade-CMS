/**
 * S2-04 regression tests: preview/public rendering parity.
 *
 * One visibility policy serves every path: public HTML (snapshot and
 * record paths) carries responsive CSS wrappers, the authenticated
 * preview's per-viewport server rendering filters with the same map, and
 * both must agree on which blocks each viewport sees. Hydrated query
 * results must stay inside the public boundary: same site, publicly
 * discoverable, no entitlement-gated records, no drafts.
 */
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { renderPresentation } from '@/modules/presentation/document'
import type { PresentationDocument } from '@/modules/presentation/contracts'
import { hydratePublicQueries } from '@/modules/presentation/public-queries'
import { resolveTheme } from '@/modules/presentation/registry'
import { PublicLayout } from '@/modules/public/PublicLayout'
import { renderLayout, type PageLayout } from '@/modules/public/page-builder'

const block = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  component: 'publisher.rich-content',
  componentVersion: 1,
  props: {
    title: `MARKER-${id}`,
    body: 'Body.',
    alignment: 'left',
    spacing: 'normal',
    width: 'standard',
    background: 'canvas',
    emphasis: 'normal',
    variant: 'contained',
  },
  ...over,
})

const blocks = [
  block('plain'),
  block('no-mobile', { visible: { mobile: false } }),
  block('no-desktop', { visible: { desktop: false } }),
  block('gone', { hidden: true }),
]

const layout: PageLayout = {
  version: 1,
  id: 'l1',
  siteId: 'site-a',
  path: '/',
  status: 'published',
  themeId: 'neutral-starter',
  surface: 'page',
  slot: 'main',
  blocks: blocks as never,
  unknownBlocks: [],
  revision: 1,
}

const theme = resolveTheme('neutral-starter')
const document: PresentationDocument = {
  version: 1,
  siteId: 'site-a',
  theme: { id: theme.id, version: theme.version },
  template: { id: 'layout', version: '1.0.0' },
  surface: 'layout',
  slots: { main: blocks as never },
}

describe('S2-04 responsive visibility parity', () => {
  it('public snapshot rendering wraps restricted blocks and drops hidden ones', () => {
    const html = renderToStaticMarkup(renderPresentation(document, theme))
    expect(html).toContain('MARKER-plain')
    expect(html).toContain('MARKER-no-mobile')
    expect(html).toContain('rg-hide-mobile')
    expect(html).toContain('MARKER-no-desktop')
    expect(html).toContain('rg-hide-desktop')
    expect(html).not.toContain('MARKER-gone')
    // The unrestricted block renders without any wrapper.
    expect(html).not.toContain('data-block-id="plain"')
  })

  it('public record rendering (renderLayout all) matches the snapshot path', () => {
    const html = renderToStaticMarkup(renderLayout(layout, 'all'))
    expect(html).toContain('rg-hide-mobile')
    expect(html).toContain('rg-hide-desktop')
    expect(html).not.toContain('MARKER-gone')
  })

  it('per-viewport preview rendering agrees with the CSS policy at every width', () => {
    const expectations: Record<string, Record<string, boolean>> = {
      mobile: { plain: true, 'no-mobile': false, 'no-desktop': true },
      tablet: { plain: true, 'no-mobile': true, 'no-desktop': true },
      desktop: { plain: true, 'no-mobile': true, 'no-desktop': false },
    }
    for (const [viewport, blocksExpected] of Object.entries(expectations)) {
      const html = renderToStaticMarkup(
        renderLayout(layout, viewport as 'mobile' | 'tablet' | 'desktop'),
      )
      for (const [id, visible] of Object.entries(blocksExpected)) {
        expect(html.includes(`MARKER-${id}`), `${viewport}/${id}`).toBe(visible)
      }
      // Preview emulation must not leave CSS wrappers behind.
      expect(html).not.toContain('rg-hide-')
    }
  })

  it('ships the matching media queries in the shared stylesheet', () => {
    const css = readFileSync('src/modules/presentation/themes/starter.css', 'utf8')
    expect(css).toContain('.rg-visibility')
    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toContain('.rg-visibility.rg-hide-mobile')
    expect(css).toContain('@media (min-width: 768px) and (max-width: 1279px)')
    expect(css).toContain('.rg-visibility.rg-hide-tablet')
    expect(css).toContain('@media (min-width: 1280px)')
    expect(css).toContain('.rg-visibility.rg-hide-desktop')
  })

  it('PublicLayout record path uses the all-viewport mode', () => {
    const html = renderToStaticMarkup(
      <PublicLayout
        record={{
          id: 'l1',
          site: 'site-a',
          path: '/',
          themeId: 'neutral-starter',
          layoutVersion: 1,
          blocks,
          unknownBlocks: [],
          revision: 1,
        }}
        path="/"
      />,
    )
    expect(html).toContain('MARKER-no-mobile')
    expect(html).toContain('rg-hide-mobile')
  })
})

describe('S2-04 public hydration boundary', () => {
  const rows = [
    {
      id: 'ok-1',
      site: 'site-a',
      status: 'published',
      visibility: 'public',
      contentType: 'article',
      title: 'Public Article',
      canonicalPath: '/articles/public',
    },
    {
      id: 'draft-1',
      site: 'site-a',
      status: 'draft',
      visibility: 'public',
      contentType: 'article',
      title: 'Draft Article',
      canonicalPath: '/articles/draft',
    },
    {
      id: 'foreign-1',
      site: 'site-b',
      status: 'published',
      visibility: 'public',
      contentType: 'article',
      title: 'Foreign Article',
      canonicalPath: '/articles/foreign',
    },
    {
      id: 'gated-1',
      site: 'site-a',
      status: 'published',
      visibility: 'public',
      contentType: 'article',
      title: 'Gated Article',
      canonicalPath: '/articles/gated',
      requiredEntitlement: 'members',
    },
    {
      id: 'unlisted-1',
      site: 'site-a',
      status: 'published',
      visibility: 'unlisted',
      contentType: 'article',
      title: 'Unlisted Article',
      canonicalPath: '/articles/unlisted',
    },
  ]

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (key === 'and')
        return (cond as Array<Record<string, unknown>>).every((c) => matches(row, c))
      const c = cond as { equals?: unknown; in?: unknown[] }
      if (c.equals !== undefined) return row[key] === c.equals
      if (c.in) return c.in.includes(row[key])
      return true
    })

  const payload = {
    collections: { content: {} },
    find: async ({
      collection,
      where,
    }: {
      collection: string
      where: Record<string, unknown>
    }) => ({
      docs: rows.filter(
        (row) => collection === 'content' && matches(row as Record<string, unknown>, where),
      ),
    }),
  }

  const queryDocument = (blockOver: Record<string, unknown> = {}): PresentationDocument => ({
    version: 1,
    siteId: 'site-a',
    theme: { id: theme.id, version: theme.version },
    template: { id: 'layout', version: '1.0.0' },
    surface: 'layout',
    slots: {
      main: [
        {
          id: 'list-1',
          component: 'publisher.article-list',
          componentVersion: 1,
          props: { query: { collection: 'content', limit: 6, sort: 'newest' } },
          ...blockOver,
        },
      ] as never,
    },
  })

  it('includes only public, same-site, ungated articles', async () => {
    const hydrated = await hydratePublicQueries(payload as never, queryDocument())
    const results = (hydrated.slots.main![0].props as { queryResults: Array<{ id: string }> })
      .queryResults
    expect(results.map((r) => r.id)).toEqual(['ok-1'])
  })

  it('does not run queries for a block hidden on every viewport', async () => {
    const hydrated = await hydratePublicQueries(
      payload as never,
      queryDocument({ visible: { mobile: false, tablet: false, desktop: false } }),
    )
    expect(
      (hydrated.slots.main![0].props as { queryResults?: unknown }).queryResults,
    ).toBeUndefined()
  })
})
