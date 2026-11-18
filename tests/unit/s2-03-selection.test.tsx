/**
 * S2-03 regression tests: one presentation selection policy.
 *
 * The durable resolver (resolvePresentationSelection) implements the
 * precedence — active package → authorized document theme override →
 * document template → site content-type default → theme content-type
 * default → core fallback — over the durable theme state, and the
 * snapshot compatibility reader keeps older persisted snapshots
 * rendering exactly as published.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Configuration } from '@/modules/presentation/lifecycle'
import {
  resolvePresentationSelection,
  surfaceForContentType,
  type TemplateDocumentFacts,
} from '@/modules/presentation/selection'
import { readPublishedPresentation, snapshotLayout } from '@/modules/presentation/snapshots'
import { PublicLayout } from '@/modules/public/PublicLayout'

const configuration = (over: Partial<Configuration> = {}): Configuration =>
  ({
    id: 'neutral-starter',
    version: '1.0.0',
    digest: 'digest-1',
    renderer: 'neutral-starter',
    tokens: {},
    ...over,
  }) as Configuration

const templateDoc = (over: Partial<TemplateDocumentFacts> = {}): TemplateDocumentFacts => ({
  id: 'tpl-1',
  siteId: 'site-a',
  surface: 'template',
  revision: 4,
  blocks: [
    {
      id: 'b1',
      component: 'publisher.rich-content',
      componentVersion: 1,
      props: { title: 'T', body: 'B' },
    },
  ],
  ...over,
})

const loader = (docs: Record<string, TemplateDocumentFacts | undefined>) => async (id: string) =>
  docs[id]

describe('S2-03 durable selection precedence', () => {
  it('resolves the active package and theme content-type default', async () => {
    const result = await resolvePresentationSelection({
      siteId: 'site-a',
      configuration: configuration(),
      surface: 'article',
      contentTypeKey: 'article',
    })
    expect(result.theme.id).toBe('neutral-starter')
    expect(result.themeSource).toBe('active-configuration')
    expect(result.templateSource).toBe('theme-content-type-default')
    expect(result.template.id).toBe('article')
    expect(result.versions).toEqual({
      package: '1.0.0',
      theme: '1.0.0',
      rendererContract: 1,
      template: '1.0.0',
      templateDocumentRevision: undefined,
    })
  })

  it('applies an authorized document theme override and ignores an unpermitted one', async () => {
    const permitted = await resolvePresentationSelection({
      siteId: 'site-a',
      configuration: configuration(),
      surface: 'page',
      documentThemeOverride: { id: 'renegade-party', version: '1.0.0' },
      permittedThemeOverrides: [{ id: 'renegade-party', version: '1.0.0' }],
    })
    expect(permitted.theme.id).toBe('renegade-party')
    expect(permitted.themeSource).toBe('document-override')

    const unpermitted = await resolvePresentationSelection({
      siteId: 'site-a',
      configuration: configuration(),
      surface: 'page',
      documentThemeOverride: { id: 'renegade-party', version: '1.0.0' },
      permittedThemeOverrides: [],
    })
    expect(unpermitted.theme.id).toBe('neutral-starter')
    expect(unpermitted.themeSource).toBe('active-configuration')
  })

  it('selects an authorized explicit document template over every default', async () => {
    const result = await resolvePresentationSelection({
      siteId: 'site-a',
      configuration: configuration(),
      surface: 'article',
      contentTypeKey: 'article',
      documentTemplateId: 'tpl-1',
      documentTemplateMode: 'explicit',
      siteContentTypeDefaults: { article: 'tpl-9' },
      loadTemplateDocument: loader({
        'tpl-1': templateDoc(),
        'tpl-9': templateDoc({ id: 'tpl-9' }),
      }),
    })
    expect(result.templateSource).toBe('document-override')
    expect(result.templateDocumentId).toBe('tpl-1')
    expect(result.versions.templateDocumentRevision).toBe(4)
  })

  it('labels an inherited document template as the document tier', async () => {
    const result = await resolvePresentationSelection({
      siteId: 'site-a',
      configuration: configuration(),
      surface: 'page',
      documentTemplateId: 'tpl-1',
      documentTemplateMode: 'inherited',
      loadTemplateDocument: loader({ 'tpl-1': templateDoc() }),
    })
    expect(result.templateSource).toBe('document-template')
    expect(result.templateDocumentId).toBe('tpl-1')
  })

  it('falls through a foreign, retired, or incompatible template to the site default', async () => {
    for (const bad of [
      templateDoc({ siteId: 'site-b' }),
      templateDoc({ isRetired: true }),
      templateDoc({
        blocks: [{ id: 'x', component: 'acme.unknown', componentVersion: 1, props: {} }],
      }),
    ]) {
      const result = await resolvePresentationSelection({
        siteId: 'site-a',
        configuration: configuration(),
        surface: 'article',
        contentTypeKey: 'article',
        documentTemplateId: 'tpl-1',
        documentTemplateMode: 'explicit',
        siteContentTypeDefaults: { article: 'tpl-9' },
        loadTemplateDocument: loader({
          'tpl-1': bad,
          'tpl-9': templateDoc({ id: 'tpl-9' }),
        }),
      })
      expect(result.templateSource).toBe('site-content-type-default')
      expect(result.templateDocumentId).toBe('tpl-9')
    }
  })

  it('ignores the document template entirely when detached, and keeps content-type keys distinct from surfaces', async () => {
    const result = await resolvePresentationSelection({
      siteId: 'site-a',
      configuration: configuration(),
      surface: 'page',
      documentTemplateId: 'tpl-1',
      documentTemplateMode: 'detached',
      loadTemplateDocument: loader({ 'tpl-1': templateDoc() }),
    })
    expect(result.templateDocumentId).toBeUndefined()
    expect(result.templateSource).toBe('theme-content-type-default')

    expect(surfaceForContentType('article')).toBe('article')
    expect(surfaceForContentType('page')).toBe('page')
    // Domain keys are not surfaces: unlisted keys use the page surface.
    expect(surfaceForContentType('product')).toBe('page')
    expect(surfaceForContentType('podcast')).toBe('page')
    expect(surfaceForContentType(undefined)).toBe('page')
  })
})

describe('S2-03 published snapshot compatibility reader', () => {
  const record = {
    id: 'layout-1',
    site: 'site-a',
    path: '/landing',
    themeId: 'neutral-starter',
    layoutVersion: 1,
    visibility: 'public',
    revision: 2,
    blocks: [
      {
        id: 'b1',
        component: 'publisher.rich-content',
        componentVersion: 1,
        props: { title: 'Snapshot Title', body: 'Snapshot body.' },
      },
    ],
    unknownBlocks: [],
  }

  it('reads a current snapshot unchanged in substance', () => {
    const snapshot = snapshotLayout(record)
    const read = readPublishedPresentation(snapshot)
    expect(read).not.toBeNull()
    expect(read!.document.theme.id).toBe('neutral-starter')
    expect(read!.revision).toBe(2)
    expect(read!.document.slots.main).toBeDefined()
  })

  it('accepts a legacy snapshot without version fields and normalizes it', () => {
    const snapshot = snapshotLayout(record) as unknown as Record<string, unknown>
    const legacy = { ...snapshot }
    delete legacy.version
    const legacyDocument = { ...(legacy.document as Record<string, unknown>) }
    delete legacyDocument.version
    legacy.document = legacyDocument
    const read = readPublishedPresentation(legacy)
    expect(read).not.toBeNull()
    expect(read!.version).toBe(1)
    expect(read!.document.version).toBe(1)
  })

  it('rejects malformed or future-version snapshots', () => {
    expect(readPublishedPresentation(null)).toBeNull()
    expect(readPublishedPresentation('nope')).toBeNull()
    expect(readPublishedPresentation({ version: 2, path: '/x', document: {} })).toBeNull()
    const snapshot = snapshotLayout(record) as unknown as Record<string, unknown>
    expect(readPublishedPresentation({ ...snapshot, document: { siteId: 'site-a' } })).toBeNull()
  })

  it('PublicLayout renders a legacy snapshot and falls back for a malformed one', () => {
    const snapshot = snapshotLayout(record) as unknown as Record<string, unknown>
    const legacyDocument = { ...(snapshot.document as Record<string, unknown>) }
    delete legacyDocument.version
    const legacy = { ...snapshot, document: legacyDocument }
    delete (legacy as { version?: unknown }).version

    const html = renderToStaticMarkup(
      <PublicLayout record={{ ...record, publishedPresentation: legacy }} path="/landing" />,
    )
    expect(html).toContain('Snapshot Title')

    const fallbackHtml = renderToStaticMarkup(
      <PublicLayout
        record={{ ...record, publishedPresentation: { version: 99 } }}
        path="/landing"
      />,
    )
    expect(fallbackHtml).toContain('Snapshot Title')
  })
})
