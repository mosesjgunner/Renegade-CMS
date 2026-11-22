/**
 * S2-06 regression tests: media, forms and embed composition.
 *
 * Gallery, form and embed blocks reference canonical records; the public
 * hydration pass resolves them under the document's site scope into
 * bounded projections. Foreign records never resolve, unpublished forms
 * never resolve, tampered embed URLs are rejected by the media policy,
 * and a rendered form submits through the audience service the public
 * endpoint itself calls.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { PresentationDocument } from '@/modules/presentation/contracts'
import { renderPresentation } from '@/modules/presentation/document'
import { hydratePublicComposition } from '@/modules/presentation/public-queries'
import { resolveTheme } from '@/modules/presentation/registry'
import { loadPublicForm } from '@/modules/audience/form-runtime'
import { submitPublicForm } from '@/modules/audience/service'
import type { LayoutBlock } from '@/modules/public/page-builder'

type Doc = Record<string, any>

const FORM_ID = '11111111-1111-4111-8111-111111111111'

function matches(doc: Doc, where: any): boolean {
  if (!where) return true
  if (Array.isArray(where.and)) return where.and.every((w: any) => matches(doc, w))
  if (Array.isArray(where.or)) return where.or.some((w: any) => matches(doc, w))
  return Object.entries(where).every(([field, condition]) => {
    const value = doc[field]
    const c = condition as any
    if (c.equals !== undefined) return String(value ?? '') === String(c.equals)
    if (Array.isArray(c.in)) return c.in.map(String).includes(String(value ?? ''))
    return true
  })
}

function makeStore() {
  const data: Record<string, Doc[]> = {
    albums: [
      {
        id: 'album-1',
        site: 'site-a',
        visibility: 'public',
        title: 'Field work',
        kind: 'album',
        items: [
          { media: 'media-2', displayOrder: 2 },
          { media: 'media-1', displayOrder: 1, altText: 'Override alt', credits: 'Jane' },
        ],
      },
      { id: 'album-9', site: 'site-b', visibility: 'public', title: 'Foreign', items: [] },
    ],
    'media-assets': [
      {
        id: 'media-1',
        site: 'site-a',
        title: 'Sunset',
        kind: 'image',
        processingState: 'ready',
        altText: 'Asset alt',
        caption: 'Asset caption',
        width: 800,
        height: 600,
        mimeType: 'image/jpeg',
      },
      {
        id: 'media-2',
        site: 'site-a',
        title: 'Crew',
        altText: 'Second alt',
        kind: 'image',
        mimeType: 'image/jpeg',
        processingState: 'ready',
      },
    ],
    'media-variants': [
      {
        id: 'variant-1',
        asset: 'media-1',
        recipeKey: 'inline',
        format: 'webp',
        width: 800,
        height: 600,
        processingState: 'ready',
      },
    ],
    videos: [
      {
        id: 'video-1',
        site: 'site-a',
        title: 'Launch video',
        provider: 'youtube',
        externalId: 'abc123XYZ',
        embedUrl: 'https://www.youtube-nocookie.com/embed/abc123XYZ',
        availability: 'available',
        visibility: 'public',
        status: 'published',
      },
      {
        id: 'video-2',
        site: 'site-a',
        title: 'Tampered',
        provider: 'youtube',
        externalId: 'abc123XYZ',
        embedUrl: 'https://evil.example.com/embed/abc123XYZ',
        availability: 'available',
        visibility: 'public',
        status: 'published',
      },
      {
        id: 'video-3',
        site: 'site-a',
        title: 'Gone',
        provider: 'youtube',
        externalId: 'abc123XYZ',
        embedUrl: 'https://www.youtube-nocookie.com/embed/abc123XYZ',
        availability: 'removed',
        visibility: 'public',
        status: 'published',
      },
      { id: 'video-4', site: 'site-b', title: 'Foreign', availability: 'available' },
    ],
    'form-definitions': [
      {
        id: FORM_ID,
        site: 'site-a',
        visibility: 'public',
        name: 'contact',
        title: 'Contact us',
        activeSchema: 'schema-1',
        actions: [],
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        site: 'site-a',
        visibility: 'public',
        name: 'drafty',
        title: 'Draft form',
        activeSchema: 'schema-2',
        actions: [],
      },
    ],
    'form-schemas': [
      {
        id: 'schema-1',
        form: FORM_ID,
        state: 'published',
        version: 3,
        locale: 'en',
        consentText: 'We reply by email.',
        consentRevision: 'r1',
        schema: {
          fields: [
            { key: 'name', type: 'text', label: 'Your name', required: true },
            { key: 'email', type: 'email', label: 'Email', required: true },
            {
              key: 'topic',
              type: 'select',
              label: 'Topic',
              validation: { options: ['Sales', 'Support'] },
            },
            { key: 'message', type: 'textarea', label: 'Message' },
          ],
        },
      },
      {
        id: 'schema-2',
        form: '22222222-2222-4222-8222-222222222222',
        state: 'draft',
        version: 1,
        locale: 'en',
        consentText: 'Draft consent.',
        consentRevision: 'r0',
        schema: { fields: [{ key: 'name', type: 'text', label: 'Name' }] },
      },
    ],
    'form-submissions': [],
  }
  const payload: any = {
    collections: { 'form-definitions': {}, 'form-schemas': {} },
    find: async ({ collection, where, limit }: any) => {
      const docs = (data[collection] ?? []).filter((doc) => matches(doc, where))
      return { docs: typeof limit === 'number' ? docs.slice(0, limit) : docs }
    },
    findByID: async ({ collection, id }: any) => {
      const doc = (data[collection] ?? []).find((entry) => String(entry.id) === String(id))
      if (!doc) throw new Error('not found')
      return doc
    },
    create: async ({ collection, data: input }: any) => {
      const doc = { id: `created-${data[collection].length + 1}`, ...input }
      data[collection].push(doc)
      return doc
    },
    update: async ({ collection, id, data: input }: any) => {
      const doc = (data[collection] ?? []).find((entry) => String(entry.id) === String(id))
      if (doc) Object.assign(doc, input)
      return doc
    },
  }
  return { payload, data }
}

const block = (component: string, props: Doc, id = 'b1'): LayoutBlock =>
  ({ id, component, componentVersion: 1, props }) as LayoutBlock

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

const ref = (id: string, siteId = 'site-a', label = 'Ref') => ({ id, siteId, label, href: '/' })

describe('S2-06 gallery composition', () => {
  it('hydrates album media in display order with alt precedence and variants, references preserved', async () => {
    const { payload } = makeStore()
    const original = document([
      block('publisher.album-and-gallery', {
        title: 'Shots',
        album: ref('album-1', 'site-a', 'Field work'),
      }),
    ])
    const hydrated = await hydratePublicComposition(payload, original)
    const galleryBlock = hydrated.slots.main![0]
    const items = galleryBlock.props.galleryItems as any[]
    expect(items.map((item) => item.media.id)).toEqual(['media-1', 'media-2'])
    expect(items[0].media.altText).toBe('Override alt')
    expect(items[1].media.altText).toBe('Second alt')
    expect(items[0].media.variants[0].format).toBe('webp')
    expect(galleryBlock.props.album).toEqual(ref('album-1', 'site-a', 'Field work'))
    expect(original.slots.main![0].props.galleryItems).toBeUndefined()

    const html = render(hydrated)
    expect(html).toContain('alt="Override alt"')
    expect(html).toContain('Asset caption')
    expect(html).toContain('Jane')
    expect(html).toContain('/media/media-1')
  })

  it('denies foreign albums both by reference site and by record site', async () => {
    const { payload } = makeStore()
    const byReference = await hydratePublicComposition(
      payload,
      document([block('publisher.album-and-gallery', { album: ref('album-9', 'site-b') })]),
    )
    expect(byReference.slots.main![0].props.galleryUnavailable).toContain('another site')
    const byRecord = await hydratePublicComposition(
      payload,
      document([block('publisher.album-and-gallery', { album: ref('album-9', 'site-a') })]),
    )
    expect(byRecord.slots.main![0].props.galleryUnavailable).toContain('not available')
    expect(render(byRecord)).toContain('data-gallery-unavailable')
  })

  it('hydrates composition blocks nested in columns children', async () => {
    const { payload } = makeStore()
    const columns = block('publisher.columns', {
      title: 'Cols',
      column0: [block('publisher.album-and-gallery', { album: ref('album-1') }, 'kid')],
      column1: [],
    })
    const hydrated = await hydratePublicComposition(payload, document([columns]))
    const child = (hydrated.slots.main![0].props.column0 as LayoutBlock[])[0]
    expect(Array.isArray(child.props.galleryItems)).toBe(true)
  })
})

describe('S2-06 form composition', () => {
  it('renders the published schema with consent, honeypot and the normal endpoint, then persists a submission', async () => {
    const { payload, data } = makeStore()
    const hydrated = await hydratePublicComposition(
      payload,
      document([block('publisher.form', { form: ref(FORM_ID, 'site-a', 'Contact') })]),
    )
    const definition = hydrated.slots.main![0].props.formDefinition as any
    expect(definition.endpoint).toBe(`/api/forms/${FORM_ID}`)
    const html = render(hydrated)
    expect(html).toContain(`action="/api/forms/${FORM_ID}"`)
    expect(html).toContain('name="email"')
    expect(html).toContain('name="topic"')
    expect(html).toContain('We reply by email.')
    expect(html).toContain('name="honeypot"')

    const loaded = await loadPublicForm(payload, FORM_ID, 'site-a')
    expect(loaded).not.toBeNull()
    const submitted = await submitPublicForm(payload, {
      formId: FORM_ID,
      schema: loaded!.snapshot as never,
      values: { name: 'Jo', email: 'jo@example.com', topic: 'Sales', message: 'Hi' },
      siteId: 'site-a',
      ipDigest: 'digest',
      idempotencyKey: 'key-1',
    })
    expect(submitted.errors).toBeUndefined()
    expect(data['form-submissions']).toHaveLength(1)
    const replay = await submitPublicForm(payload, {
      formId: FORM_ID,
      schema: loaded!.snapshot as never,
      values: { name: 'Jo', email: 'jo@example.com', topic: 'Sales', message: 'Hi' },
      siteId: 'site-a',
      ipDigest: 'digest',
      idempotencyKey: 'key-1',
    })
    expect(replay.replay).toBe(true)
    expect(data['form-submissions']).toHaveLength(1)
    const invalid = await submitPublicForm(payload, {
      formId: FORM_ID,
      schema: loaded!.snapshot as never,
      values: { name: 'Jo', email: 'not-an-email' },
      siteId: 'site-a',
      ipDigest: 'digest',
      idempotencyKey: 'key-2',
    })
    expect(invalid.errors?.email).toBeTruthy()
  })

  it('never resolves draft-schema or foreign forms', async () => {
    const { payload } = makeStore()
    const draft = await hydratePublicComposition(
      payload,
      document([
        block('publisher.form', {
          form: ref('22222222-2222-4222-8222-222222222222', 'site-a'),
        }),
      ]),
    )
    expect(draft.slots.main![0].props.formUnavailable).toContain('not published')
    expect(await loadPublicForm(payload, FORM_ID, 'site-b')).toBeNull()
  })
})

describe('S2-06 bounded embed composition', () => {
  it('renders only the approved provider URL in a sandboxed frame', async () => {
    const { payload } = makeStore()
    const hydrated = await hydratePublicComposition(
      payload,
      document([block('publisher.custom-embed', { link: ref('video-1', 'site-a', 'Launch') })]),
    )
    expect((hydrated.slots.main![0].props.embed as any).url).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XYZ',
    )
    const html = render(hydrated)
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/abc123XYZ"')
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"')
  })

  it('rejects tampered URLs, reports removed videos, and denies foreign records', async () => {
    const { payload } = makeStore()
    const tampered = await hydratePublicComposition(
      payload,
      document([block('publisher.custom-embed', { link: ref('video-2') })]),
    )
    expect(tampered.slots.main![0].props.embedUnavailable).toContain('not an approved embed')
    expect(render(tampered)).not.toContain('evil.example.com')
    const removed = await hydratePublicComposition(
      payload,
      document([block('publisher.custom-embed', { link: ref('video-3') })]),
    )
    expect(removed.slots.main![0].props.embedUnavailable).toContain('has been removed')
    const foreign = await hydratePublicComposition(
      payload,
      document([block('publisher.custom-embed', { link: ref('video-4', 'site-a') })]),
    )
    expect(foreign.slots.main![0].props.embedUnavailable).toContain('not available on this site')
  })
})
