/**
 * S2-07 regression tests: linked patterns render published content.
 *
 * Policy under test: a linked instance follows the pattern's latest
 * PUBLISHED revision — draft pattern edits stay private, publishing the
 * pattern moves every linked instance, cycles terminate with an explicit
 * reason, foreign patterns never resolve, and broken-link metadata is
 * preserved for recovery. Snapshot insertion stays a detached copy.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { PresentationDocument } from '@/modules/presentation/contracts'
import { renderPresentation } from '@/modules/presentation/document'
import { instantiatePattern } from '@/modules/presentation/composition'
import {
  hydrateLayoutPatterns,
  hydratePublicComposition,
} from '@/modules/presentation/public-queries'
import { resolveTheme } from '@/modules/presentation/registry'
import { renderLayout, type LayoutBlock, type PageLayout } from '@/modules/public/page-builder'

type Doc = Record<string, any>

const rich = (id: string, title: string): LayoutBlock =>
  ({
    id,
    component: 'publisher.rich-content',
    componentVersion: 1,
    props: {
      title,
      body: `${title} body`,
      alignment: 'left',
      spacing: 'normal',
      width: 'standard',
      background: 'canvas',
      emphasis: 'normal',
      variant: 'contained',
    },
  }) as LayoutBlock

const linked = (id: string, patternId: string, patternVersion = 1): LayoutBlock =>
  ({
    id,
    component: 'publisher.pattern',
    componentVersion: 1,
    props: { patternId, patternName: patternId, patternVersion, mode: 'linked' },
  }) as LayoutBlock

function makeStore() {
  const patterns: Doc[] = [
    {
      id: 'pat-1',
      site: 'site-a',
      surface: 'pattern',
      name: 'Ethics Pledge',
      visibility: 'public',
      status: 'published',
      revision: 3,
      publishedRevision: 2,
      blocks: [rich('draft-block', 'DRAFT MARKER')],
      revisionHistory: [
        { revision: 2, blocks: [rich('pub-block', 'PUBLISHED BODY')], action: 'published' },
        { revision: 3, blocks: [rich('draft-block', 'DRAFT MARKER')], action: 'edit' },
      ],
    },
    {
      id: 'pat-2',
      site: 'site-a',
      surface: 'pattern',
      name: 'Snapshot Pattern',
      visibility: 'public',
      status: 'published',
      revision: 1,
      publishedRevision: 1,
      blocks: [rich('snap-block', 'SNAPSHOT BODY')],
      publishedPresentation: {
        version: 1,
        path: '__pattern__/snapshot-pattern',
        document: {
          version: 1,
          siteId: 'site-a',
          theme: { id: 'neutral-starter', version: '1.0.0' },
          template: { id: 'layout', version: '1.0.0' },
          surface: 'layout',
          slots: { main: [rich('snap-block', 'SNAPSHOT BODY')] },
        },
      },
      revisionHistory: [],
    },
    {
      id: 'pat-a',
      site: 'site-a',
      surface: 'pattern',
      name: 'Cycle A',
      visibility: 'public',
      status: 'published',
      revision: 1,
      publishedRevision: 1,
      blocks: [linked('a-to-b', 'pat-b')],
      revisionHistory: [{ revision: 1, blocks: [linked('a-to-b', 'pat-b')] }],
    },
    {
      id: 'pat-b',
      site: 'site-a',
      surface: 'pattern',
      name: 'Cycle B',
      visibility: 'public',
      status: 'published',
      revision: 1,
      publishedRevision: 1,
      blocks: [rich('b-body', 'B BODY'), linked('b-to-a', 'pat-a')],
      revisionHistory: [
        { revision: 1, blocks: [rich('b-body', 'B BODY'), linked('b-to-a', 'pat-a')] },
      ],
    },
    {
      id: 'pat-outer',
      site: 'site-a',
      surface: 'pattern',
      name: 'Outer',
      visibility: 'public',
      status: 'published',
      revision: 1,
      publishedRevision: 1,
      blocks: [linked('outer-to-1', 'pat-1', 2)],
      revisionHistory: [{ revision: 1, blocks: [linked('outer-to-1', 'pat-1', 2)] }],
    },
    {
      id: 'pat-foreign',
      site: 'site-b',
      surface: 'pattern',
      name: 'Foreign',
      visibility: 'public',
      status: 'published',
      revision: 1,
      publishedRevision: 1,
      blocks: [rich('foreign-body', 'FOREIGN BODY')],
      revisionHistory: [{ revision: 1, blocks: [rich('foreign-body', 'FOREIGN BODY')] }],
    },
    {
      id: 'pat-draft',
      site: 'site-a',
      surface: 'pattern',
      name: 'Never Published',
      visibility: 'public',
      status: 'draft',
      revision: 1,
      publishedRevision: null,
      blocks: [rich('np-body', 'NEVER PUBLISHED BODY')],
      revisionHistory: [{ revision: 1, blocks: [rich('np-body', 'NEVER PUBLISHED BODY')] }],
    },
  ]
  const payload: any = {
    find: async ({ collection, where, limit }: any) => {
      if (collection !== 'page-layouts') return { docs: [] }
      const clauses = where?.and ?? []
      const docs = patterns.filter((doc) =>
        clauses.every((clause: any) => {
          const [field, condition] = Object.entries(clause)[0] as [string, any]
          return String(doc[field] ?? '') === String(condition.equals)
        }),
      )
      return { docs: typeof limit === 'number' ? docs.slice(0, limit) : docs }
    },
  }
  return { payload, patterns }
}

const document = (blocks: LayoutBlock[]): PresentationDocument => ({
  version: 1,
  siteId: 'site-a',
  theme: { id: 'neutral-starter', version: '1.0.0' },
  template: { id: 'layout', version: '1.0.0' },
  surface: 'layout',
  slots: { main: blocks },
})

const render = (doc: PresentationDocument) =>
  renderToStaticMarkup(renderPresentation(doc, resolveTheme('neutral-starter')))

describe('S2-07 linked pattern resolution', () => {
  it('renders the latest published revision on every instance; draft edits stay private', async () => {
    const { payload } = makeStore()
    const page = document([linked('i1', 'pat-1', 2), linked('i2', 'pat-1', 2)])
    const hydrated = await hydratePublicComposition(payload, page)
    const html = render(hydrated)
    expect(html.match(/data-pattern-instance="pat-1"/g)).toHaveLength(2)
    expect(html).toContain('PUBLISHED BODY')
    expect(html).not.toContain('DRAFT MARKER')
    expect(html).toContain('data-pattern-policy="latest-published"')
    expect(html).toContain('data-pattern-version="2"')
    // Stored page data is untouched by hydration.
    expect(page.slots.main![0].props.patternResolution).toBeUndefined()
  })

  it('follows the pattern when the pattern itself is published', async () => {
    const { payload, patterns } = makeStore()
    patterns.find((p) => p.id === 'pat-1')!.publishedRevision = 3
    const hydrated = await hydratePublicComposition(payload, document([linked('i1', 'pat-1', 2)]))
    const html = render(hydrated)
    expect(html).toContain('DRAFT MARKER')
    expect(html).toContain('data-pattern-version="3"')
  })

  it('resolves patterns published through a frozen snapshot', async () => {
    const { payload } = makeStore()
    const hydrated = await hydratePublicComposition(payload, document([linked('i1', 'pat-2', 1)]))
    expect(render(hydrated)).toContain('SNAPSHOT BODY')
  })

  it('resolves patterns nested inside patterns', async () => {
    const { payload } = makeStore()
    const hydrated = await hydratePublicComposition(
      payload,
      document([linked('i1', 'pat-outer', 1)]),
    )
    const html = render(hydrated)
    expect(html).toContain('PUBLISHED BODY')
    expect(html).not.toContain('DRAFT MARKER')
  })

  it('terminates cycles with an explicit reason and still renders the acyclic body', async () => {
    const { payload } = makeStore()
    const hydrated = await hydratePublicComposition(payload, document([linked('i1', 'pat-a', 1)]))
    const html = render(hydrated)
    expect(html).toContain('B BODY')
    expect(html).toContain('Pattern cycle detected.')
  })

  it('denies foreign and unpublished patterns and preserves broken-link metadata', async () => {
    const { payload } = makeStore()
    const foreign = await hydratePublicComposition(
      payload,
      document([linked('i1', 'pat-foreign', 1)]),
    )
    expect(foreign.slots.main![0].props.patternUnavailable).toContain('not available on this site')
    expect(render(foreign)).not.toContain('FOREIGN BODY')
    expect(foreign.slots.main![0].props.patternId).toBe('pat-foreign')
    expect(foreign.slots.main![0].props.patternVersion).toBe(1)

    const draft = await hydratePublicComposition(payload, document([linked('i1', 'pat-draft', 1)]))
    expect(draft.slots.main![0].props.patternUnavailable).toContain('no published revision')
    expect(render(draft)).not.toContain('NEVER PUBLISHED BODY')
  })

  it('keeps snapshot insertion detached and preview output on the same policy', async () => {
    const { payload } = makeStore()
    const pattern = {
      id: 'pat-1',
      name: 'Ethics Pledge',
      revision: 2,
      blocks: [rich('pub-block', 'PUBLISHED BODY')],
    } as unknown as PageLayout
    const snapshotBlocks = instantiatePattern(pattern, 'snapshot')
    expect(snapshotBlocks).toHaveLength(1)
    expect(snapshotBlocks[0].component).toBe('publisher.rich-content')
    expect(snapshotBlocks[0].id).not.toBe('pub-block')
    const linkedBlocks = instantiatePattern(pattern, 'linked')
    expect(linkedBlocks[0].component).toBe('publisher.pattern')

    const layout: PageLayout = {
      version: 1,
      id: 'page-1',
      siteId: 'site-a',
      path: '/',
      status: 'draft',
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      blocks: [linked('i1', 'pat-1', 2)],
      unknownBlocks: [],
      revision: 1,
    }
    const resolved = await hydrateLayoutPatterns(payload, layout)
    const html = renderToStaticMarkup(renderLayout({ ...layout, blocks: resolved }, 'all'))
    expect(html).toContain('PUBLISHED BODY')
    expect(html).not.toContain('DRAFT MARKER')
  })
})
