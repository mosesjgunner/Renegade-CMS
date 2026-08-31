import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'
import { assertTeamPermission, type TeamScope } from '../collaboration/service'
import { inspectMedia, mediaObjectKey, mediaStorage } from './storage'

type Doc = Record<string, unknown>
const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: string } | undefined)?.id ?? '')

export class MediaWorkflowError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

export async function assertMediaPermission(
  payload: Payload,
  user: Doc | null | undefined,
  scope: TeamScope,
  permission: 'content.read' | 'content.edit',
) {
  if (!user || !['owner', 'staff', 'administrator'].includes(String(user.role)))
    throw new MediaWorkflowError('Staff access is required.', 403)
  const memberId = id(user.member)
  if (!memberId) throw new MediaWorkflowError('A staff member identity is required.', 403)
  try {
    await assertTeamPermission(payload as never, memberId, scope, permission)
  } catch {
    throw new MediaWorkflowError('Site scope access denied.', 403)
  }
}

export async function uploadMedia(
  payload: Payload,
  config: AppConfig,
  input: {
    user: Doc | null | undefined
    scope: TeamScope
    title: string
    altText?: string
    caption?: string
    focalPoint?: { x: number; y: number }
    bytes: Uint8Array
  },
) {
  await assertMediaPermission(payload, input.user, input.scope, 'content.edit')
  if (!input.title.trim()) throw new MediaWorkflowError('A media title is required.')
  if (input.bytes.byteLength > config.storage.maxUploadBytes)
    throw new MediaWorkflowError('Media exceeds the configured upload limit.', 413)
  const inspection = inspectMedia(input.bytes)
  if (
    input.focalPoint &&
    (input.focalPoint.x < 0 ||
      input.focalPoint.x > 1 ||
      input.focalPoint.y < 0 ||
      input.focalPoint.y > 1)
  )
    throw new MediaWorkflowError('Focal point coordinates must be between 0 and 1.')
  const key = mediaObjectKey(input.scope.siteId, inspection.extension)
  const storage = mediaStorage(config)
  await storage.put(key, input.bytes, inspection.mimeType)
  try {
    return await payload.create({
      collection: 'media-assets',
      overrideAccess: true,
      data: {
        site: input.scope.siteId,
        publication: input.scope.publicationId ?? null,
        space: input.scope.spaceId ?? null,
        owner: id(input.user?.member) || null,
        title: input.title.trim(),
        kind: inspection.kind,
        storageLocation: key,
        storageProvider: storage.provider,
        mimeType: inspection.mimeType,
        sizeBytes: input.bytes.byteLength,
        width: inspection.width,
        height: inspection.height,
        checksum: inspection.sha256,
        altText: input.altText?.trim() || null,
        caption: input.caption?.trim() || null,
        focalPoint: input.focalPoint ?? null,
        retentionMode: 'permanent',
        retentionHold: 'none',
        removeFromDiscovery: false,
      },
    } as never)
  } catch (error) {
    await storage.remove(key).catch(() => undefined)
    throw error
  }
}

export async function attachMediaToContent(
  payload: Payload,
  user: Doc | null | undefined,
  input: { scope: TeamScope; mediaId: string; contentId: string },
) {
  await assertMediaPermission(payload, user, input.scope, 'content.edit')
  const [media, content] = await Promise.all([
    payload.findByID({
      collection: 'media-assets',
      id: input.mediaId,
      depth: 0,
      overrideAccess: true,
    } as never) as unknown as Promise<Doc>,
    payload.findByID({
      collection: 'content',
      id: input.contentId,
      depth: 0,
      overrideAccess: true,
    } as never) as unknown as Promise<Doc>,
  ])
  if (id(media.site) !== input.scope.siteId || id(content.site) !== input.scope.siteId)
    throw new MediaWorkflowError('Cross-site media attachment is not allowed.', 403)
  const updated = await payload.update({
    collection: 'content',
    id: input.contentId,
    overrideAccess: true,
    data: { heroMedia: input.mediaId },
  } as never)
  const usageKey = `content:${input.contentId}:hero`
  const existing = await payload.find({
    collection: 'media-usages',
    where: { usageKey: { equals: usageKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const usage = (existing.docs as unknown as Doc[])[0]
  const data = {
    media: input.mediaId,
    usageKey,
    usageType: 'hero',
    targetCollection: 'content',
    targetId: input.contentId,
    approved: content.status === 'published',
  }
  if (usage)
    await payload.update({
      collection: 'media-usages',
      id: usage.id,
      data,
      overrideAccess: true,
    } as never)
  else await payload.create({ collection: 'media-usages', data, overrideAccess: true } as never)
  return updated
}

export async function replaceMedia(
  payload: Payload,
  config: AppConfig,
  input: Parameters<typeof uploadMedia>[2] & { replacedMediaId: string },
) {
  const original = (await payload.findByID({
    collection: 'media-assets',
    id: input.replacedMediaId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc
  if (id(original.site) !== input.scope.siteId)
    throw new MediaWorkflowError('Cross-site replacement is not allowed.', 403)
  const replacement = (await uploadMedia(payload, config, input)) as unknown as Doc
  await payload.update({
    collection: 'media-assets',
    id: original.id,
    overrideAccess: true,
    data: { replaceGloballyWith: replacement.id },
  } as never)
  return replacement
}

export async function deleteOrphanedMedia(
  payload: Payload,
  config: AppConfig,
  user: Doc | null | undefined,
  input: { scope: TeamScope; mediaId: string },
) {
  await assertMediaPermission(payload, user, input.scope, 'content.edit')
  const media = (await payload.findByID({
    collection: 'media-assets',
    id: input.mediaId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc
  if (id(media.site) !== input.scope.siteId)
    throw new MediaWorkflowError('Cross-site deletion is not allowed.', 403)
  const [uses, heroReferences] = await Promise.all([
    payload.find({
      collection: 'media-usages',
      where: { media: { equals: input.mediaId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never),
    payload.find({
      collection: 'content',
      where: { heroMedia: { equals: input.mediaId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never),
  ])
  if (uses.docs.length || heroReferences.docs.length)
    throw new MediaWorkflowError(
      'Referenced media cannot be deleted. Replace it or detach every use first.',
      409,
    )
  await mediaStorage(config).remove(String(media.storageLocation))
  await payload.delete({
    collection: 'media-assets',
    id: input.mediaId,
    overrideAccess: true,
  } as never)
}

export async function publicMedia(payload: Payload, mediaId: string): Promise<Doc | undefined> {
  const media = (await payload
    .findByID({ collection: 'media-assets', id: mediaId, depth: 0, overrideAccess: true } as never)
    .catch(() => undefined)) as unknown as Doc | undefined
  if (!media || media.removeFromDiscovery || media.retentionMode === 'tombstone') return undefined
  const references = await Promise.all([
    payload.find({ collection: 'content', where: { and: [{ heroMedia: { equals: mediaId } }, { status: { in: ['published', 'updated'] } }, { site: { equals: id(media.site) } }] }, limit: 1, depth: 0, overrideAccess: true } as never),
    payload.find({ collection: 'podcast-episodes', where: { and: [{ audio: { equals: mediaId } }, { status: { in: ['published', 'updated'] } }, { site: { equals: id(media.site) } }] }, limit: 1, depth: 0, overrideAccess: true } as never),
    payload.find({ collection: 'videos', where: { and: [{ nativeMedia: { equals: mediaId } }, { status: { in: ['published', 'updated'] } }, { site: { equals: id(media.site) } }] }, limit: 1, depth: 0, overrideAccess: true } as never),
  ])
  return references.some((reference) => reference.docs.length) ? media : undefined
}
