import { describe, expect, it } from 'vitest'
import { publicMedia } from '../../src/modules/media/workflow'
const asset = {
  id: 'image',
  site: 'alpha',
  publicPolicy: 'published-use',
  storageLocation: 'alpha/image.png',
}
const block = {
  id: 'photo',
  component: 'publisher.image',
  componentVersion: 1,
  props: { media: { id: 'image', siteId: 'alpha', href: '/media/image', label: 'Photo' } },
}
const page = () => ({
  id: 'layout',
  site: 'alpha',
  path: '/page',
  surface: 'page',
  status: 'published',
  visibility: 'public',
  blocks: [],
  publishedPresentation: {
    version: 1,
    visibility: 'public',
    document: {
      version: 1,
      siteId: 'alpha',
      theme: { id: 'neutral-starter', version: '1.0.0' },
      slots: { main: [block] },
    },
  },
})
const store = (layouts: unknown[]) => ({
  findByID: async () => asset,
  find: async ({ collection }: { collection: string }) => ({
    docs: collection === 'page-layouts' ? layouts : [],
  }),
})
describe('04A published layout media authorization', () => {
  it('serves the published image independently of usage reconciliation and a newer private draft', async () => {
    const layout = {
      ...page(),
      blocks: [{ ...block, props: { media: { ...block.props.media, id: 'private-draft-image' } } }],
    }
    await expect(publicMedia(store([layout]) as never, 'image')).resolves.toEqual(asset)
  })
  it('keeps an image referenced only by a newer draft private', async () => {
    const draftImage = { ...asset, id: 'private-draft-image' }
    const layout = {
      ...page(),
      blocks: [{ ...block, props: { media: { ...block.props.media, id: draftImage.id } } }],
    }
    const payload = { ...store([layout]), findByID: async () => draftImage }
    await expect(publicMedia(payload as never, draftImage.id)).resolves.toBeUndefined()
  })
  it.each([
    { status: 'draft' },
    { visibility: 'private' },
    { site: 'foreign' },
    { retentionMode: 'tombstone' },
    { surface: 'pattern', path: '__pattern__/test' },
    { publishedPresentation: null },
    { publishedPresentation: { ...page().publishedPresentation, visibility: 'private' } },
    {
      publishedPresentation: {
        ...page().publishedPresentation,
        document: { ...page().publishedPresentation.document, siteId: 'foreign' },
      },
    },
    {
      publishedPresentation: {
        ...page().publishedPresentation,
        document: { ...page().publishedPresentation.document, slots: { main: [] } },
      },
    },
    {
      publishedPresentation: {
        ...page().publishedPresentation,
        document: {
          ...page().publishedPresentation.document,
          slots: { main: [{ ...block, hidden: true }] },
        },
      },
    },
    {
      publishedPresentation: {
        ...page().publishedPresentation,
        document: {
          ...page().publishedPresentation.document,
          slots: { main: [{ ...block, component: 'removed.block' }] },
        },
      },
    },
  ])(
    'refuses unpublished, private, foreign, removed and unused layout references: %j',
    async (changes) => {
      await expect(
        publicMedia(store([{ ...page(), ...changes }]) as never, 'image'),
      ).resolves.toBeUndefined()
    },
  )
})
