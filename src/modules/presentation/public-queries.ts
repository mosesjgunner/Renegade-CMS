import type { Album, MediaAsset } from '@/payload-types'
import { publishedPortfolio, resolvePortfolioAsset } from '../creator-studio/portfolio-public'
import { portfolioMediaKind } from '../creator-studio/portfolio-service'
import type { Payload } from 'payload'
import type { HydratedGalleryItem, PresentationDocument } from './contracts'
import { canDiscoverPublic } from '../public/contracts'
import { isRegisteredCollection } from '../public/registered-collections'
import { slotFieldNames, type LayoutBlock } from '../public/page-builder'
import { resolveTheme } from './registry'
import { isHiddenEverywhere } from './responsive'
import { readPublishedPresentation } from './snapshots'
import { loadPublicForm } from '../audience/form-runtime'
import { publicVideo } from '../media/publishing'

export async function hydratePublicLayoutRecord(payload: Payload, record: Record<string, unknown>) {
  const snapshot = readPublishedPresentation(record.publishedPresentation)
  if (!snapshot) return record
  const site = typeof record.site === 'string' ? record.site : (record.site as { id?: string })?.id
  if (snapshot.document.siteId !== site) throw new Error('Published presentation scope mismatch.')
  return {
    ...record,
    publishedPresentation: {
      ...snapshot,
      document: await hydratePublicComposition(
        payload,
        await hydratePublicQueries(payload, snapshot.document),
      ),
    },
  }
}

/** Resolve public query blocks on a copy, never in the stored presentation. */
export async function hydratePublicQueries(payload: Payload, document: PresentationDocument) {
  const next = structuredClone(document)
  for (const blocks of Object.values(next.slots)) {
    for (const block of blocks ?? []) {
      if (
        isHiddenEverywhere(block) ||
        ![
          'publisher.article-list',
          'publisher.feature-grid',
          'publisher.article-grid',
          'publisher.event-list',
        ].includes(block.component)
      )
        continue
      const query =
        block.props.query && typeof block.props.query === 'object'
          ? (block.props.query as Record<string, unknown>)
          : {}
      const collection = String(
        query.collection ?? (block.component === 'publisher.event-list' ? 'events' : 'content'),
      )
      block.props.queryResults = []
      if (
        !['content', 'events', 'albums', 'discussions'].includes(collection) ||
        !isRegisteredCollection(payload, collection)
      )
        continue
      const limit = Math.min(24, Math.max(1, Math.trunc(Number(query.limit)) || 6))
      const statuses =
        collection === 'content'
          ? ['published', 'updated', 'scheduled']
          : collection === 'events'
            ? ['published', 'scheduled']
            : collection === 'discussions'
              ? ['open']
              : undefined
      const result = await payload.find({
        collection,
        where: {
          and: [
            { site: { equals: document.siteId } },
            ...(collection === 'content' &&
            ['publisher.article-list', 'publisher.article-grid'].includes(block.component)
              ? [{ contentType: { equals: 'article' } }]
              : []),
            ...(statuses ? [{ status: { in: statuses } }] : []),
          ],
        },
        limit: limit * 4,
        sort:
          query.sort === 'oldest' ? 'createdAt' : query.sort === 'title' ? 'title' : '-createdAt',
        depth: 1,
        overrideAccess: true,
      } as never)
      block.props.queryResults = (result.docs as unknown as Record<string, unknown>[])
        .filter((row) => {
          const site = typeof row.site === 'string' ? row.site : (row.site as { id?: string })?.id
          const forum =
            row.forum && typeof row.forum === 'object'
              ? (row.forum as Record<string, unknown>)
              : undefined
          return (
            site === document.siteId &&
            canDiscoverPublic(row) &&
            !row.requiredEntitlement &&
            (!forum || canDiscoverPublic(forum)) &&
            typeof row.canonicalPath === 'string' &&
            row.canonicalPath.startsWith('/') &&
            !row.canonicalPath.startsWith('//')
          )
        })
        .slice(0, limit)
        .map((row) => ({
          id: String(row.id),
          title: String(row.title ?? row.name),
          href: row.canonicalPath,
        }))
    }
  }
  return next
}

type StoreDoc = Record<string, unknown>

const referenceOf = (value: unknown): { id: string; siteId: string } | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as StoreDoc
  return {
    id: typeof record.id === 'string' ? record.id : '',
    siteId: typeof record.siteId === 'string' ? record.siteId : '',
  }
}

const docSite = (doc: StoreDoc): string =>
  typeof doc.site === 'string' ? doc.site : String((doc.site as { id?: unknown })?.id ?? '')

const MAX_GALLERY_ITEMS = 60

/**
 * Resolve a gallery block's album into bounded media projections (S2-06).
 * The album and every asset must belong to the document's site; foreign
 * items are dropped, and a missing/foreign/non-public album resolves to
 * an explicit unavailable reason instead of invented content.
 */
async function resolveGalleryBlock(payload: Payload, siteId: string, block: LayoutBlock) {
  const reference = referenceOf(block.props.album)
  if (!reference?.id) return
  if (reference.siteId && reference.siteId !== siteId) {
    block.props.galleryUnavailable = 'The selected album belongs to another site.'
    return
  }
  const found = await payload.find({
    collection: 'albums',
    where: { and: [{ id: { equals: reference.id } }, { site: { equals: siteId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const album = (found.docs as unknown as StoreDoc[])[0]
  const page =
    album && (await publishedPortfolio(payload, 'albums', album as unknown as Album, siteId))
  if (!page || page.draft.visibility !== 'public') {
    block.props.galleryUnavailable = 'The selected album is not available on this site.'
    return
  }
  const items = page.draft.sections
    .flatMap((section) => section.blocks)
    .filter((block) => block.kind === 'image')
  const galleryItems: HydratedGalleryItem[] = []
  for (const item of items.slice(0, MAX_GALLERY_ITEMS)) {
    const mediaId = item.media
    if (!mediaId) continue
    const rawAsset = (await payload
      .findByID({
        collection: 'media-assets',
        id: mediaId,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => null)) as StoreDoc | null
    const asset =
      rawAsset && (await resolvePortfolioAsset(payload, page, rawAsset as unknown as MediaAsset))
    if (!asset || portfolioMediaKind(asset) !== 'image') continue
    const variantResult = await payload.find({
      collection: 'media-variants',
      where: { asset: { equals: asset.id } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    } as never)
    galleryItems.push({
      accessQuery: new URLSearchParams({ portfolio: `albums:${page.doc.id}` }).toString(),
      media: {
        id: mediaId,
        title: typeof asset.title === 'string' ? asset.title : null,
        altText:
          (typeof item.alt === 'string' && item.alt) ||
          (typeof asset.altText === 'string' ? asset.altText : null),
        width: typeof asset.width === 'number' ? asset.width : null,
        height: typeof asset.height === 'number' ? asset.height : null,
        mimeType: typeof asset.mimeType === 'string' ? asset.mimeType : null,
        variants: (variantResult.docs as unknown as StoreDoc[]).map((variant) => ({
          recipeKey: typeof variant.recipeKey === 'string' ? variant.recipeKey : null,
          format: typeof variant.format === 'string' ? variant.format : null,
          width: typeof variant.width === 'number' ? variant.width : null,
          height: typeof variant.height === 'number' ? variant.height : null,
          processingState:
            typeof variant.processingState === 'string' ? variant.processingState : null,
        })),
      },
      caption:
        (typeof item.caption === 'string' && item.caption) ||
        (typeof asset.caption === 'string' ? asset.caption : undefined),
      credits: typeof item.credit === 'string' && item.credit ? item.credit : undefined,
    })
  }
  if (!galleryItems.length) {
    block.props.galleryUnavailable = 'The selected album has no public media yet.'
    return
  }
  block.props.galleryItems = galleryItems
}

/** Resolve a form block through the audience runtime: published, site-scoped, consent intact. */
async function resolveFormBlock(payload: Payload, siteId: string, block: LayoutBlock) {
  const reference = referenceOf(block.props.form)
  if (!reference?.id) return
  const loaded = await loadPublicForm(payload, reference.id, siteId).catch(() => null)
  if (!loaded) {
    block.props.formUnavailable = 'The selected form is not published on this site.'
    return
  }
  block.props.formDefinition = {
    id: String(loaded.form.id),
    title: String(loaded.form.title ?? loaded.form.name ?? 'Form'),
    fields: loaded.snapshot.fields,
    consentText: loaded.snapshot.consentText,
    endpoint: `/api/forms/${String(loaded.form.id)}`,
  }
}

/** Resolve an embed block through the media publishing policy: approved providers only. */
async function resolveEmbedBlock(payload: Payload, siteId: string, block: LayoutBlock) {
  const reference = referenceOf(block.props.link)
  if (!reference?.id) return
  const found = await payload.find({
    collection: 'videos',
    where: { and: [{ id: { equals: reference.id } }, { site: { equals: siteId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const record = (found.docs as unknown as StoreDoc[])[0]
  if (!record) {
    block.props.embedUnavailable = 'The selected video is not available on this site.'
    return
  }
  try {
    const video = publicVideo(record)
    if (!video.available) block.props.embedUnavailable = video.message
    else if (video.kind !== 'embed')
      block.props.embedUnavailable = 'This video is hosted natively and cannot be embedded here.'
    else
      block.props.embed = {
        url: video.embedUrl,
        title: typeof record.title === 'string' ? record.title : 'Video',
      }
  } catch {
    block.props.embedUnavailable = 'This video is not an approved embed.'
  }
}

const compositionResolvers: Record<
  string,
  (payload: Payload, siteId: string, block: LayoutBlock) => Promise<void>
> = {
  'publisher.album-and-gallery': resolveGalleryBlock,
  'publisher.form': resolveFormBlock,
  'publisher.custom-embed': resolveEmbedBlock,
}

const MAX_PATTERN_DEPTH = 5

/** The blocks a pattern published: its frozen snapshot first, then the
 * revision-history entry at the published revision, then the record's own
 * blocks when the record itself is the published revision. Draft state
 * (any newer revision) is never read. */
function publishedPatternBlocks(record: StoreDoc): LayoutBlock[] | null {
  const publishedRevision =
    typeof record.publishedRevision === 'number' ? record.publishedRevision : null
  if (!publishedRevision || publishedRevision < 1) return null
  const snapshot = readPublishedPresentation(record.publishedPresentation)
  if (snapshot) {
    const blocks = snapshot.document.slots.main ?? Object.values(snapshot.document.slots)[0]
    if (Array.isArray(blocks)) return structuredClone(blocks) as LayoutBlock[]
  }
  const history = Array.isArray(record.revisionHistory)
    ? (record.revisionHistory as StoreDoc[])
    : []
  const entry = history.find((item) => item.revision === publishedRevision)
  if (entry && Array.isArray(entry.blocks)) return structuredClone(entry.blocks) as LayoutBlock[]
  if (record.revision === publishedRevision && Array.isArray(record.blocks))
    return structuredClone(record.blocks) as LayoutBlock[]
  return null
}

type VisitContext = {
  payload: Payload
  siteId: string
  theme: ReturnType<typeof resolveTheme>
}

/**
 * Resolve one linked pattern block (S2-07). Policy: linked instances
 * follow the pattern's latest published revision. The chain carries the
 * pattern ids already open on this branch, so cycles terminate with an
 * explicit reason on the innermost instance instead of recursing.
 * Broken-link metadata (patternId/patternName/patternVersion) is never
 * rewritten — only `patternResolution` or `patternUnavailable` is added.
 */
async function resolvePatternBlock(
  context: VisitContext,
  block: LayoutBlock,
  chain: string[],
): Promise<void> {
  if (block.props.mode === 'snapshot') return
  const patternId = typeof block.props.patternId === 'string' ? block.props.patternId : ''
  if (!patternId) {
    block.props.patternUnavailable = 'Pattern reference is missing.'
    return
  }
  if (chain.includes(patternId)) {
    block.props.patternUnavailable = 'Pattern cycle detected.'
    return
  }
  if (chain.length >= MAX_PATTERN_DEPTH) {
    block.props.patternUnavailable = 'Pattern nesting limit reached.'
    return
  }
  const found = await context.payload.find({
    collection: 'page-layouts',
    where: {
      and: [
        { id: { equals: patternId } },
        { site: { equals: context.siteId } },
        { surface: { equals: 'pattern' } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const record = (found.docs as unknown as StoreDoc[])[0]
  if (!record || (record.visibility !== undefined && record.visibility !== 'public')) {
    block.props.patternUnavailable = 'The linked pattern is not available on this site.'
    return
  }
  const blocks = publishedPatternBlocks(record)
  if (!blocks) {
    block.props.patternUnavailable = 'The linked pattern has no published revision.'
    return
  }
  const nextChain = [...chain, patternId]
  for (const inner of blocks) await visitBlock(context, inner, nextChain)
  block.props.patternResolution = {
    name: typeof record.name === 'string' ? record.name : patternId,
    version: record.publishedRevision as number,
    blocks,
  }
}

/** Visit one block: composition resolvers, pattern resolution, then one
 * level into container slot children. Sibling branches keep separate
 * pattern chains. */
async function visitBlock(
  context: VisitContext,
  block: LayoutBlock,
  chain: string[],
): Promise<void> {
  if (isHiddenEverywhere(block)) return
  const resolver = compositionResolvers[block.component]
  if (resolver) await resolver(context.payload, context.siteId, block)
  if (block.component === 'publisher.pattern') await resolvePatternBlock(context, block, chain)
  const definition = context.theme.componentRegistry[block.component]
  if (!definition) return
  for (const field of slotFieldNames(definition)) {
    const children = block.props[field]
    if (!Array.isArray(children)) continue
    for (const child of children as LayoutBlock[]) await visitBlock(context, child, chain)
  }
}

/**
 * Resolve media/form/embed composition blocks and linked patterns on a
 * copy of the document (S2-06/S2-07), descending into container slot
 * children and resolved pattern bodies. References stay in the stored
 * props; only bounded projections are added, so theme changes never
 * lose the canonical records a block points at.
 */
export async function hydratePublicComposition(
  payload: Payload,
  document: PresentationDocument,
): Promise<PresentationDocument> {
  const next = structuredClone(document)
  const context: VisitContext = {
    payload,
    siteId: document.siteId,
    theme: resolveTheme(document.theme.id),
  }
  for (const blocks of Object.values(next.slots))
    for (const block of blocks ?? []) await visitBlock(context, block, [])
  return next
}

/**
 * The same resolution for a builder PageLayout (draft preview parity):
 * preview output follows the identical published-only pattern policy as
 * public output, so what an operator previews is what publishes.
 */
export async function hydrateLayoutPatterns(
  payload: Payload,
  layout: { siteId: string; themeId: string; blocks: LayoutBlock[] },
): Promise<LayoutBlock[]> {
  const blocks = structuredClone(layout.blocks)
  const context: VisitContext = {
    payload,
    siteId: layout.siteId,
    theme: resolveTheme(layout.themeId),
  }
  for (const block of blocks) await visitBlock(context, block, [])
  return blocks
}
