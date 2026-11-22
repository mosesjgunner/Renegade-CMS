import type { Payload } from 'payload'
import type { Album, MediaAsset } from '@/payload-types'
import { catalogSiteForHost } from '../commerce/site-scope'
import { currentMember, readMemberSession } from '../identity/member-identity'
import { publicMediaPolicyAllows, resolveMediaReplacement } from '../media/workflow'
import { canDiscoverPublic, canRenderPublic } from '../public/contracts'
import { resolvePublicSiteAccess } from '../public/site-visibility'
import {
  emptyPortfolio,
  portfolioMediaIds,
  type Portfolio,
  type PortfolioCollection,
} from './portfolio-contract'
import {
  findPortfolio,
  ownPortfolio,
  portfolioAccess,
  portfolioCollection,
  portfolioMediaKind,
  type PortfolioDocument,
} from './portfolio-service'
import { parsePortfolio } from './portfolio-validation'
import { relationId, uuid } from './submission-targets'

export type PortfolioPage = {
  doc: PortfolioDocument
  collection: PortfolioCollection
  draft: Portfolio
  preview: boolean
}

function legacyAlbum(doc: Album): Portfolio {
  return {
    ...emptyPortfolio(),
    title: doc.title,
    summary: doc.description ?? '',
    visibility: doc.visibility === 'friends' ? 'private' : doc.visibility,
    cover: relationId(doc.cover),
    sections: [
      {
        id: doc.id,
        title: '',
        blocks: [...(doc.items ?? [])]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((item, index) => ({
            id: item.id ?? String(index),
            kind: 'image',
            title: '',
            text: '',
            url: '',
            media: relationId(item.media),
            alt: item.altText ?? '',
            caption: item.caption ?? '',
            credit: item.credits ?? '',
            rights: item.license ?? '',
          })),
      },
    ],
  }
}

export async function publishedPortfolio(
  payload: Payload,
  collection: PortfolioCollection,
  doc: PortfolioDocument,
  siteId: string,
  headers?: Headers,
): Promise<PortfolioPage | null> {
  if (relationId(doc.site) !== siteId) return null
  if (
    'kind' in doc &&
    !canRenderPublic({
      ...doc,
      visibility: 'public',
      removeFromDiscovery: doc.removeFromDiscovery ?? undefined,
    })
  )
    return null
  if (!doc.portfolioPublished && (doc.portfolioDraft || !('kind' in doc))) return null
  const draft = doc.portfolioPublished
    ? parsePortfolio(doc.portfolioPublished)
    : legacyAlbum(doc as Album)
  const visibility =
    'kind' in doc && doc.visibility !== 'public' ? doc.visibility : draft.visibility
  if (visibility === 'private' || visibility === 'friends') return null
  if (visibility === 'members') {
    if (!headers) return null
    const memberId = await currentMember(payload as never, readMemberSession(headers))
    if (!memberId) return null
    const role = await payload.count({
      collection: 'member-site-roles',
      overrideAccess: true,
      where: { and: [{ site: { equals: siteId } }, { member: { equals: memberId } }] },
    })
    if (!role.totalDocs) return null
  }
  if (doc.portfolioDraft) {
    const spaceId = relationId(doc.space)
    if (!spaceId) return null
    const space = await payload.findByID({
      collection: 'spaces',
      id: spaceId,
      ...portfolioAccess,
      disableErrors: true,
    })
    if (
      !space ||
      relationId(space.site) !== siteId ||
      space.moderationState !== 'clear' ||
      space.suspendedAt
    )
      return null
  }
  return { doc, collection, draft: { ...draft, visibility }, preview: false }
}

export async function lookupPortfolio(
  payload: Payload,
  path: string,
  siteId: string,
  headers: Headers,
) {
  if (!payload.collections.albums) return { found: false, page: null }
  const collection = path.startsWith('/creator-projects/') ? 'creator-projects' : 'albums'
  if (!payload.collections[collection]) return { found: false, page: null }
  const {
    docs: [doc],
  } = await payload.find({
    collection,
    ...portfolioAccess,
    limit: 1,
    where: { and: [{ canonicalPath: { equals: path } }, { site: { equals: siteId } }] },
  })
  if (!doc) return { found: false, page: null }
  return { found: true, page: await publishedPortfolio(payload, collection, doc, siteId, headers) }
}

export async function previewPortfolio(
  payload: Payload,
  headers: Headers,
  kind: unknown,
  id: string,
): Promise<PortfolioPage | null> {
  try {
    const collection = portfolioCollection(kind)
    const memberId = await currentMember(payload as never, readMemberSession(headers))
    if (!memberId) return null
    const siteId = await catalogSiteForHost(payload, headers.get('host'))
    const doc = await ownPortfolio(payload, { siteId, memberId }, collection, id)
    return { doc, collection, draft: parsePortfolio(doc.portfolioDraft), preview: true }
  } catch {
    return null
  }
}

export async function resolvePortfolioAsset(
  payload: Payload,
  page: PortfolioPage,
  asset: MediaAsset,
) {
  if (
    relationId(asset.site) !== relationId(page.doc.site) ||
    !portfolioMediaKind(asset) ||
    asset.processingState !== 'ready' ||
    asset.retentionMode === 'tombstone'
  )
    return undefined
  if (
    page.doc.portfolioDraft &&
    (relationId(asset.owner) !== relationId(page.doc.owner) ||
      (relationId(asset.space) && relationId(asset.space) !== relationId(page.doc.space)))
  )
    return undefined
  if (page.preview) return asset
  if (!publicMediaPolicyAllows({ ...asset })) return undefined
  const resolved = await resolveMediaReplacement(payload, { ...asset }, true)
  return resolved &&
    portfolioMediaKind(resolved as unknown as MediaAsset) === portfolioMediaKind(asset)
    ? (resolved as unknown as MediaAsset)
    : undefined
}

export async function fetchPortfolioMedia(
  payload: Payload,
  headers: Headers,
  scope: string,
  id: string,
  preview: boolean,
) {
  const [kind, docId, extra] = scope.split(':')
  if (extra !== undefined || !uuid.test(docId ?? '') || !uuid.test(id)) return undefined
  if (kind !== 'albums' && kind !== 'creator-projects') return undefined
  if (!payload.collections[kind]) return undefined
  let page: PortfolioPage | null
  if (preview) page = await previewPortfolio(payload, headers, kind, docId)
  else {
    const siteId = await catalogSiteForHost(payload, headers.get('host')).catch(() => null)
    if (!siteId || !(await resolvePublicSiteAccess(payload, { siteId, headers })).allowed)
      return undefined
    const doc = await findPortfolio(payload, kind, docId)
    page = doc ? await publishedPortfolio(payload, kind, doc, siteId, headers) : null
  }
  if (!page || !portfolioMediaIds(page.draft).includes(id)) return undefined
  const asset = await payload.findByID({
    collection: 'media-assets',
    id,
    ...portfolioAccess,
    disableErrors: true,
  })
  return asset ? resolvePortfolioAsset(payload, page, asset) : undefined
}

export function portfolioMediaUrl(
  page: PortfolioPage,
  id: string,
  params?: Record<string, string>,
) {
  const query = new URLSearchParams({ portfolio: `${page.collection}:${page.doc.id}`, ...params })
  if (page.preview) query.set('preview', '1')
  return `/media/${id}?${query}`
}

export function discoverPortfolio(page: PortfolioPage) {
  return (
    !page.preview &&
    page.draft.visibility === 'public' &&
    (!('kind' in page.doc) ||
      canDiscoverPublic({
        ...page.doc,
        removeFromDiscovery: page.doc.removeFromDiscovery ?? undefined,
      }))
  )
}
