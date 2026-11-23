import type { Payload } from 'payload'
import type { MediaAsset } from '@/payload-types'
import { loadConfig } from '../core/config'
import { mediaStorage } from '../media/storage'
import { assertMediaPublishable, MediaWorkflowError } from '../media/workflow'
import { authorizeCreator } from './policy'
import { relationId, uuid, type SubmissionActor } from './submission-targets'

const access = { depth: 0, overrideAccess: true } as const
const missing = () => new MediaWorkflowError('Video export unavailable.', 404)

export function videoAssetBody(asset: MediaAsset) {
  const size = asset.sizeBytes
  const key = asset.storageLocation
  const mimeType = asset.mimeType
  const storage = mediaStorage(loadConfig())
  if (
    asset.kind !== 'video' ||
    asset.processingState !== 'ready' ||
    !size ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    !key ||
    !mimeType ||
    !/^video\/[a-z0-9.-]+$/i.test(mimeType) ||
    asset.storageProvider !== storage.provider ||
    asset.originalExportAllowed === false ||
    (asset.retentionMode && !['permanent', 'expire-at'].includes(asset.retentionMode)) ||
    (asset.retentionMode === 'expire-at' &&
      (!asset.retentionExpiresAt || Date.parse(asset.retentionExpiresAt) <= Date.now())) ||
    asset.retentionHold === 'moderation'
  )
    throw missing()
  assertMediaPublishable({
    rightsStatus: asset.rightsStatus ?? undefined,
    rightsExpiresAt: asset.rightsExpiresAt,
    embargoUntil: asset.embargoUntil,
  })
  return {
    size,
    mimeType,
    async open(start: number, end: number) {
      const stream = await storage.open(key, start, end)
      if (!stream) throw missing()
      return stream
    },
  }
}

export async function listVideoExports(payload: Payload, actor: SubmissionActor) {
  await authorizeCreator(payload, { ...actor, capability: 'media.publish-own' })
  const { docs } = await payload.find({
    collection: 'media-assets',
    ...access,
    limit: 100,
    sort: '-updatedAt',
    where: {
      and: [
        { site: { equals: actor.siteId } },
        { owner: { equals: actor.memberId } },
        { kind: { equals: 'video' } },
        { processingState: { equals: 'ready' } },
      ],
    },
  })
  return docs.map(({ id, title }) => ({ id, title }))
}

export async function downloadVideoExport(payload: Payload, actor: SubmissionActor, id: string) {
  if (!uuid.test(id)) throw missing()
  await authorizeCreator(payload, { ...actor, capability: 'media.publish-own' }).catch(() => {
    throw missing()
  })
  const asset = await payload.findByID({
    collection: 'media-assets',
    ...access,
    id,
    disableErrors: true,
  })
  if (
    !asset ||
    relationId(asset.site) !== actor.siteId ||
    relationId(asset.owner) !== actor.memberId
  )
    throw missing()
  const video = videoAssetBody(asset)
  const filename = (asset.originalFilename || 'video').replace(/[^a-z0-9._-]/gi, '_').slice(0, 160)
  return new Response(await video.open(0, video.size - 1), {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': video.mimeType,
      'content-length': String(video.size),
      'content-disposition': `attachment; filename="${filename || 'video'}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  })
}
