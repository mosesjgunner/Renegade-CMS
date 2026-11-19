/**
 * S2-08 regression tests: templates connected to domain content types.
 *
 * The adapter registry binds each domain key to its surface, its real
 * domain renderer and its canonical body slot; the shared resolver
 * carries the adapter; template application validates the canonical
 * slot; template sync is a three-way merge that never overwrites local
 * overrides or the canonical body and never touches published state;
 * detach ends inheritance explicitly.
 */
import { describe, expect, it } from 'vitest'

import {
  createPageFromTemplate,
  createTemplate,
  detachPageFromTemplate,
  syncPageWithTemplate,
} from '@/modules/presentation/composition'
import {
  adapterForContentType,
  registerDomainTemplateAdapter,
  registeredContentTypeKeys,
} from '@/modules/presentation/domain-templates'
import type { Configuration } from '@/modules/presentation/lifecycle'
import {
  resolvePresentationSelection,
  surfaceForContentType,
} from '@/modules/presentation/selection'
import type { LayoutBlock } from '@/modules/public/page-builder'

type Doc = Record<string, any>

const block = (id: string, component: string, title: string): LayoutBlock =>
  ({
    id,
    component,
    componentVersion: 1,
    props: { title, body: `${title} body`, alignment: 'left', spacing: 'normal' },
  }) as LayoutBlock

function makeStore() {
  const docs = new Map<string, Doc>()
  let sequence = 0
  const payload: any = {
    create: async ({ data }: any) => {
      const doc = { id: `doc-${++sequence}`, ...structuredClone(data) }
      docs.set(doc.id, doc)
      return structuredClone(doc)
    },
    findByID: async ({ id }: any) => {
      const doc = docs.get(String(id))
      if (!doc) throw new Error('not found')
      return structuredClone(doc)
    },
    update: async ({ id, data }: any) => {
      const doc = docs.get(String(id))
      if (!doc) throw new Error('not found')
      Object.assign(doc, structuredClone(data))
      return structuredClone(doc)
    },
    find: async () => ({ docs: [] }),
  }
  return { payload, docs }
}

describe('S2-08 domain adapter registry', () => {
  it('binds every required type to its surface and real domain renderer', () => {
    const matrix = Object.fromEntries(
      ['article', 'page', 'directory', 'product', 'profile', 'podcast'].map((key) => {
        const adapter = adapterForContentType(key)
        return [key, `${adapter.surface}:${adapter.rendererId}:${adapter.rendererStatus}`]
      }),
    )
    expect(matrix).toEqual({
      article: 'article:editorial.article-view:registered',
      page: 'page:presentation.layout:registered',
      directory: 'page:public.hierarchy-view:registered',
      product: 'page:commerce.product-detail:registered',
      profile: 'page:community.member-profile:registered',
      podcast: 'page:media.podcast-show:registered',
    })
    expect(adapterForContentType('article').canonicalBlockComponent).toBe('publisher.editorial')
    expect(registeredContentTypeKeys()).toEqual(
      expect.arrayContaining(['article', 'page', 'directory', 'product', 'profile', 'podcast']),
    )
  })

  it('gives unregistered keys the documented generic fallback and lets new keys register', () => {
    const fallback = adapterForContentType('event')
    expect(fallback.rendererStatus).toBe('fallback')
    expect(fallback.surface).toBe('page')
    expect(fallback.rendererId).toBe('presentation.generic-content')
    registerDomainTemplateAdapter({
      contentTypeKey: 's2-08-probe-type',
      surface: 'page',
      rendererId: 'probe.renderer',
      rendererStatus: 'registered',
      requiredSlots: ['main'],
      notes: 'probe',
    })
    expect(adapterForContentType('s2-08-probe-type').rendererId).toBe('probe.renderer')
    expect(() =>
      registerDomainTemplateAdapter({
        contentTypeKey: 'article',
        surface: 'page',
        rendererId: 'dupe',
        rendererStatus: 'registered',
        requiredSlots: ['main'],
        notes: 'dupe',
      }),
    ).toThrow('conflict')
  })

  it('keeps surface resolution semantics: domain keys via adapters, frames via the table', () => {
    expect(surfaceForContentType('article')).toBe('article')
    expect(surfaceForContentType('product')).toBe('page')
    expect(surfaceForContentType('podcast')).toBe('page')
    expect(surfaceForContentType('search')).toBe('search')
    expect(surfaceForContentType('something-new')).toBe('page')
    expect(surfaceForContentType(undefined)).toBe('page')
  })

  it('carries the domain adapter through the shared selection resolver', async () => {
    const configuration = {
      id: 'neutral-starter',
      version: '1.0.0',
      digest: 'd',
      renderer: 'neutral-starter',
      tokens: {},
    } as Configuration
    const result = await resolvePresentationSelection({
      siteId: 'site-a',
      configuration,
      surface: 'article',
      contentTypeKey: 'article',
      siteContentTypeDefaults: { article: 'tpl-1' },
      loadTemplateDocument: async (id) => ({
        id,
        siteId: 'site-a',
        surface: 'template',
        revision: 2,
        blocks: [block('body-1', 'publisher.editorial', 'Body')],
      }),
    })
    expect(result.templateSource).toBe('site-content-type-default')
    expect(result.templateDocumentId).toBe('tpl-1')
    expect(result.domainAdapter?.rendererId).toBe('editorial.article-view')
    expect(result.domainAdapter?.canonicalBlockComponent).toBe('publisher.editorial')
  })
})

describe('S2-08 template application and sync', () => {
  it('applies with stable block identity, validates the canonical slot, and syncs as a three-way merge', async () => {
    const { payload, docs } = makeStore()
    const template = await createTemplate(payload, {
      siteId: 'site-a',
      name: 'Article Standard',
      themeId: 'neutral-starter',
      blocks: [
        block('hero-1', 'publisher.hero', 'Hero v1'),
        block('body-1', 'publisher.editorial', 'Template body'),
        block('cta-1', 'publisher.cta', 'CTA v1'),
      ],
    })

    // A template without the canonical body cannot serve an article.
    const bare = await createTemplate(payload, {
      siteId: 'site-a',
      name: 'Bare',
      themeId: 'neutral-starter',
      blocks: [block('hero-9', 'publisher.hero', 'Hero')],
    })
    await expect(
      createPageFromTemplate(payload, {
        siteId: 'site-a',
        path: '/bare-article',
        name: 'Bare Article',
        templateId: bare.id,
        contentTypeKey: 'article',
      }),
    ).rejects.toThrow('canonical article body slot')
    const barePage = await createPageFromTemplate(payload, {
      siteId: 'site-a',
      path: '/bare-page',
      name: 'Bare Page',
      templateId: bare.id,
      contentTypeKey: 'page',
    })
    expect(barePage.blocks.map((b) => b.id)).toEqual(['hero-9'])

    const page = await createPageFromTemplate(payload, {
      siteId: 'site-a',
      path: '/story',
      name: 'Story',
      templateId: template.id,
      templateMode: 'inherited',
      contentTypeKey: 'article',
    })
    expect(page.blocks.map((b) => b.id)).toEqual(['hero-1', 'body-1', 'cta-1'])
    expect(page.status).toBe('draft')

    // The operator edits the hero, writes the article body, adds a local
    // block, and publishes. Template then changes: hero + body edited by
    // the template author, cta removed, promo added.
    const pageDoc = docs.get(page.id)!
    pageDoc.blocks = [
      block('hero-1', 'publisher.hero', 'Hero LOCAL'),
      block('body-1', 'publisher.editorial', 'My article body'),
      block('cta-1', 'publisher.cta', 'CTA v1'),
      block('local-1', 'publisher.rich-content', 'Local addition'),
    ]
    pageDoc.status = 'published'
    pageDoc.publishedRevision = pageDoc.revision
    const templateDoc = docs.get(template.id)!
    templateDoc.blocks = [
      block('hero-1', 'publisher.hero', 'Hero v2'),
      block('body-1', 'publisher.editorial', 'Template body v2'),
      block('promo-1', 'publisher.rich-content', 'Promo'),
    ]
    templateDoc.revision = 2
    templateDoc.revisionHistory = [
      ...(templateDoc.revisionHistory ?? []),
      { revision: 2, blocks: templateDoc.blocks, action: 'edit' },
    ]

    const sync = await syncPageWithTemplate(payload, page.id)
    expect(sync.updated).toBe(true)
    const byId = new Map(sync.page.blocks.map((b) => [b.id, b]))
    // Locally modified hero wins and is reported.
    expect(byId.get('hero-1')?.props.title).toBe('Hero LOCAL')
    expect(sync.conflicts).toContainEqual({
      blockId: 'hero-1',
      component: 'publisher.hero',
      reason: 'locally-modified',
    })
    // The canonical body is always the page's own.
    expect(byId.get('body-1')?.props.title).toBe('My article body')
    expect(sync.conflicts).toContainEqual({
      blockId: 'body-1',
      component: 'publisher.editorial',
      reason: 'canonical-body-preserved',
    })
    // Untouched cta follows the template removal; promo arrives; local stays.
    expect(byId.has('cta-1')).toBe(false)
    expect(sync.changes.removed).toContain('cta-1')
    expect(byId.get('promo-1')?.props.title).toBe('Promo')
    expect(sync.changes.added).toContain('promo-1')
    expect(byId.get('local-1')?.props.title).toBe('Local addition')
    // Draft-only: the published revision pointer never moved.
    expect(docs.get(page.id)!.publishedRevision).toBe(1)
    expect(sync.page.templateVersion).toBe(2)

    // A second sync with no template change is a no-op.
    const again = await syncPageWithTemplate(payload, page.id)
    expect(again.updated).toBe(false)
  })

  it('detach ends inheritance explicitly and sync then ignores template changes', async () => {
    const { payload, docs } = makeStore()
    const template = await createTemplate(payload, {
      siteId: 'site-a',
      name: 'Detachable',
      themeId: 'neutral-starter',
      blocks: [block('hero-1', 'publisher.hero', 'Hero v1')],
    })
    const page = await createPageFromTemplate(payload, {
      siteId: 'site-a',
      path: '/detach-me',
      name: 'Detach Me',
      templateId: template.id,
    })
    const detached = await detachPageFromTemplate(payload, page.id)
    expect(detached.templateMode).toBe('detached')
    expect(detached.blocks.map((b) => b.id)).toEqual(['hero-1'])
    const templateDoc = docs.get(template.id)!
    templateDoc.blocks = [block('hero-1', 'publisher.hero', 'Hero v2')]
    templateDoc.revision = 2
    const sync = await syncPageWithTemplate(payload, page.id)
    expect(sync.updated).toBe(false)
    expect(sync.message).toContain('detached')
    expect(docs.get(page.id)!.blocks[0].props.title).toBe('Hero v1')
  })
})
