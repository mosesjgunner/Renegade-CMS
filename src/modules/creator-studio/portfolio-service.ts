import { randomUUID } from 'node:crypto'
import type { Payload, Where } from 'payload'
import type { Album, CreatorProject, MediaAsset } from '@/payload-types'
import { withExecutionLock } from '../operations/execution-lock'
import { publicMediaPolicyAllows } from '../media/workflow'
import { assertSemanticPathAvailable } from '../public/semantic-url-service'
import { revalidateDiscoveryOutputs } from '../public/revalidation'
import { authorizeCreator } from './policy'
import {
  portfolioKinds,
  portfolioMediaIds,
  type Portfolio,
  type PortfolioCollection,
} from './portfolio-contract'
import { parsePortfolio, PortfolioError, record } from './portfolio-validation'
import { listPortfolioSubmissions } from './submissions'
import { relationId, uuid } from './submission-targets'

export type PortfolioDocument = Album | CreatorProject
export type PortfolioActor = { siteId: string; memberId: string }
export const portfolioAccess = { depth: 0, overrideAccess: true } as const

export const portfolioMissing = () => new PortfolioError('Portfolio unavailable.', 404)
const denied = () => new PortfolioError('Portfolio access denied.', 403)

export function portfolioCollection(kind: unknown): PortfolioCollection {
  if (kind === 'albums' || kind === 'creator-projects') return kind
  throw portfolioMissing()
}

async function authorize(
  payload: Payload,
  actor: PortfolioActor,
  spaceId?: string,
  publish = false,
) {
  try {
    await authorizeCreator(payload, { ...actor, spaceId, capability: 'portfolio.manage-own' })
    if (publish)
      await authorizeCreator(payload, { ...actor, spaceId, capability: 'media.publish-own' })
  } catch {
    throw denied()
  }
}

export async function portfolioSpace(payload: Payload, actor: PortfolioActor) {
  await authorize(payload, actor)
  const {
    docs: [profile],
  } = await payload.find({
    collection: 'profiles',
    ...portfolioAccess,
    limit: 1,
    where: { member: { equals: actor.memberId } },
  })
  if (!profile) throw denied()
  const {
    docs: [space],
  } = await payload.find({
    collection: 'spaces',
    ...portfolioAccess,
    limit: 1,
    where: { and: [{ site: { equals: actor.siteId } }, { profile: { equals: profile.id } }] },
  })
  if (!space) throw new PortfolioError('Create your Space in Creator Studio first.', 403)
  await authorize(payload, actor, space.id)
  return space.id
}

export async function findPortfolio(payload: Payload, collection: PortfolioCollection, id: string) {
  if (!uuid.test(id)) return null
  return payload.findByID({ collection, id, ...portfolioAccess, disableErrors: true })
}

export async function ownPortfolio(
  payload: Payload,
  actor: PortfolioActor,
  collection: PortfolioCollection,
  id: string,
) {
  const doc = await findPortfolio(payload, collection, id)
  if (
    !doc?.portfolioDraft ||
    relationId(doc.site) !== actor.siteId ||
    relationId(doc.owner) !== actor.memberId ||
    !relationId(doc.space)
  )
    throw portfolioMissing()
  await authorize(payload, actor, relationId(doc.space))
  return doc
}

export async function listPortfolios(payload: Payload, actor: PortfolioActor) {
  const space = await portfolioSpace(payload, actor)
  const where: Where = {
    and: [
      { site: { equals: actor.siteId } },
      { space: { equals: space } },
      { owner: { equals: actor.memberId } },
      { portfolioDraft: { exists: true } },
    ],
  }
  const [albums, projects, media, content, products, submissions] = await Promise.all([
    payload.find({
      collection: 'albums',
      ...portfolioAccess,
      limit: 100,
      where,
      sort: '-updatedAt',
    }),
    payload.find({
      collection: 'creator-projects',
      ...portfolioAccess,
      limit: 100,
      where,
      sort: '-updatedAt',
    }),
    payload.find({
      collection: 'media-assets',
      ...portfolioAccess,
      limit: 500,
      sort: 'title',
      where: {
        and: [
          { site: { equals: actor.siteId } },
          { owner: { equals: actor.memberId } },
          { processingState: { equals: 'ready' } },
        ],
      },
    }),
    payload.find({
      collection: 'content',
      ...portfolioAccess,
      limit: 200,
      sort: 'title',
      where: { and: [{ site: { equals: actor.siteId } }, { owner: { equals: actor.memberId } }] },
    }),
    payload.collections.products
      ? payload.find({
          collection: 'products',
          ...portfolioAccess,
          limit: 200,
          sort: 'name',
          where: { and: [{ site: { equals: actor.siteId } }, { state: { equals: 'published' } }] },
        })
      : null,
    listPortfolioSubmissions(payload, actor),
  ])
  const entries = [
    ...albums.docs.map((doc) => portfolioListEntry(doc, 'albums')),
    ...projects.docs.map((doc) => portfolioListEntry(doc, 'creator-projects')),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return {
    entries,
    submissions,
    media: media.docs
      .filter(
        (asset) =>
          portfolioMediaKind(asset) &&
          (!relationId(asset.space) || relationId(asset.space) === space),
      )
      .map(({ id, title, kind, altText }) => ({ id, title, kind, altText })),
    content: content.docs.map(({ id, title }) => ({ id, title })),
    products: products?.docs.map(({ id, name }) => ({ id, title: name })) ?? [],
  }
}

function portfolioListEntry(doc: PortfolioDocument, collection: PortfolioCollection) {
  return {
    collection,
    id: doc.id,
    kind: 'kind' in doc ? doc.kind : 'project',
    title: record(doc.portfolioDraft).title || doc.title,
    updatedAt: doc.updatedAt,
    published: Boolean(doc.portfolioPublished),
    path: doc.canonicalPath,
  }
}

export function portfolioEditorEntry(doc: PortfolioDocument, collection: PortfolioCollection) {
  return { ...portfolioListEntry(doc, collection), draft: parsePortfolio(doc.portfolioDraft) }
}

const allowedMime: Record<string, RegExp> = {
  image: /^image\/(jpeg|png|gif|webp|avif)$/,
  audio: /^audio\/(mpeg|mp4|aac|ogg|opus|wav|x-wav|flac|webm)$/,
  video: /^video\/(mp4|webm|ogg|quicktime)$/,
}
export const portfolioImageKinds = ['image', 'cover', 'thumbnail', 'graphic']
export function portfolioMediaKind(asset: MediaAsset) {
  const kind = portfolioImageKinds.includes(asset.kind) ? 'image' : asset.kind
  return allowedMime[kind]?.test(asset.mimeType ?? '') ? kind : null
}

async function checkReferences(
  payload: Payload,
  actor: PortfolioActor,
  space: string,
  draft: Portfolio,
  publish: boolean,
) {
  const ids = portfolioMediaIds(draft)
  const media = ids.length
    ? (
        await payload.find({
          collection: 'media-assets',
          ...portfolioAccess,
          limit: ids.length,
          where: {
            and: [
              { id: { in: ids } },
              { site: { equals: actor.siteId } },
              { owner: { equals: actor.memberId } },
            ],
          },
        })
      ).docs
    : []
  const assets = new Map(media.map((asset) => [asset.id, asset]))
  if (
    assets.size !== ids.length ||
    media.some(
      (asset) =>
        (relationId(asset.space) && relationId(asset.space) !== space) ||
        !portfolioMediaKind(asset) ||
        asset.processingState !== 'ready' ||
        (publish && !publicMediaPolicyAllows({ ...asset })),
    )
  )
    throw new PortfolioError('A selected asset is unavailable for this portfolio.')
  const cover = assets.get(draft.cover)
  if (cover && portfolioMediaKind(cover) !== 'image')
    throw new PortfolioError('Choose an image for the cover.')
  if (publish && cover && !cover.altText?.trim())
    throw new PortfolioError('Add alt text to the cover image in the media library.')
  for (const { blocks } of draft.sections) {
    for (const block of blocks) {
      const asset = assets.get(block.media)
      if (asset && portfolioMediaKind(asset) !== block.kind)
        throw new PortfolioError('The selected asset does not match the block type.')
      if (
        publish &&
        ((['image', 'audio', 'video'].includes(block.kind) && !asset) ||
          (block.kind === 'embed' && (!block.url || !block.title)) ||
          (block.kind === 'text' && !block.text) ||
          (block.kind === 'image' && !(block.alt || asset?.altText?.trim())))
      )
        throw new PortfolioError(
          'Complete each block and add alt text to images before publishing.',
        )
    }
  }
  const references = [...new Set([draft.canonicalContent, ...draft.relatedContent].filter(Boolean))]
  if (references.length) {
    const count = await payload.count({
      collection: 'content',
      overrideAccess: true,
      where: {
        and: [
          { id: { in: references } },
          { site: { equals: actor.siteId } },
          { owner: { equals: actor.memberId } },
        ],
      },
    })
    if (count.totalDocs !== references.length)
      throw new PortfolioError('A content reference is unavailable.')
  }
  if (draft.relatedProducts.length) {
    if (!payload.collections.products)
      throw new PortfolioError('The product catalog is unavailable.')
    const count = await payload.count({
      collection: 'products',
      overrideAccess: true,
      where: {
        and: [
          { id: { in: draft.relatedProducts } },
          { site: { equals: actor.siteId } },
          { state: { equals: 'published' } },
        ],
      },
    })
    if (count.totalDocs !== draft.relatedProducts.length)
      throw new PortfolioError('A product reference is unavailable.')
  }
}

export async function savePortfolio(
  payload: Payload,
  actor: PortfolioActor,
  input: Record<string, unknown>,
) {
  const collection = portfolioCollection(input.collection)
  const id = typeof input.id === 'string' ? input.id : ''
  const publish = input.action === 'publish'
  const withdraw = input.action === 'unpublish'
  if ((publish || withdraw) && !id) throw new PortfolioError('Save a draft first.')
  if (id && !uuid.test(id)) throw portfolioMissing()
  return withExecutionLock(
    payload,
    `creator-portfolio:${actor.siteId}:${id || actor.memberId}`,
    async () => {
      const existing = id ? await ownPortfolio(payload, actor, collection, id) : null
      if (existing && existing.updatedAt !== input.updatedAt)
        throw new PortfolioError('This portfolio changed. Reopen it before saving.', 409)
      const space = existing ? relationId(existing.space) : await portfolioSpace(payload, actor)
      if (publish) await authorize(payload, actor, space, true)
      const draft = parsePortfolio(withdraw ? existing?.portfolioDraft : input.draft)
      if (!withdraw) await checkReferences(payload, actor, space, draft, publish)
      const slug =
        existing?.slug ??
        `${
          draft.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 65)
            .replace(/-$/, '') || 'portfolio'
        }-${randomUUID().slice(0, 12)}`
      const base = {
        title: publish || !existing?.portfolioPublished ? draft.title : existing.title,
        portfolioDraft: draft,
        ...(publish ? { portfolioPublished: draft } : withdraw ? { portfolioPublished: null } : {}),
      }
      const ownership = { site: actor.siteId, space, owner: actor.memberId, slug }
      if (collection === 'albums') {
        const selected = input.kind ?? 'portfolio'
        if (!portfolioKinds.includes(selected as never))
          throw new PortfolioError('Select a collection type.')
        const kind = selected as (typeof portfolioKinds)[number]
        const data = {
          ...base,
          kind,
          ...(publish
            ? {
                description: draft.summary,
                visibility: draft.visibility,
                cover: draft.cover || null,
              }
            : withdraw || !existing
              ? { visibility: 'private' as const }
              : {}),
        }
        const doc = existing
          ? await payload.update({ collection, id, ...portfolioAccess, data })
          : await payload.create({
              collection,
              ...portfolioAccess,
              data: {
                ...data,
                ...ownership,
                canonicalPath: `/albums/${slug}`,
                visibility: 'private',
                originalDownloadPolicy: 'disallowed',
                exifPolicy: 'strip',
                commentsPolicy: 'open',
                moderationState: 'clear',
                retentionMode: 'permanent',
                retentionHold: 'none',
              },
            })
        if (publish || withdraw) await revalidateDiscoveryOutputs()
        return portfolioEditorEntry(doc, collection)
      }
      const canonicalPath = `/creator-projects/${slug}`
      if (!existing)
        await assertSemanticPathAvailable({
          payload,
          collection,
          siteId: actor.siteId,
          path: canonicalPath,
        })
      const doc = existing
        ? await payload.update({ collection, id, ...portfolioAccess, data: base })
        : await payload.create({
            collection,
            ...portfolioAccess,
            data: { ...base, ...ownership, canonicalPath },
          })
      if (publish || withdraw) await revalidateDiscoveryOutputs()
      return portfolioEditorEntry(doc, collection)
    },
  )
}
