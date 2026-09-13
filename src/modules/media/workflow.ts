import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'
import { assertTeamPermission, type TeamScope } from '../collaboration/service'
import { findIfRegistered } from '../public/registered-collections'
import { inspectMedia, mediaObjectKey, mediaStorage } from './storage'

type Doc = Record<string, unknown>
const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: string } | undefined)?.id ?? '')
const cleanText = (value: string | undefined, label: string, maxLength: number) => {
  const cleaned = (value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length > maxLength) throw new MediaWorkflowError(`${label} is too long.`)
  return cleaned
}
const replacementLimit = 8

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
  if (user.role === 'owner') return
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
    originalFilename?: string
    bytes: Uint8Array
  },
) {
  await assertMediaPermission(payload, input.user, input.scope, 'content.edit')
  const title = cleanText(input.title, 'Media title', 180)
  if (!title) throw new MediaWorkflowError('A media title is required.')
  const altText = cleanText(input.altText, 'Alt text', 500)
  const caption = cleanText(input.caption, 'Caption', 2_000)
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
  // A blob is the physical object; an asset is the editorial identity. Dedup is
  // deliberately site-scoped so one tenant cannot infer another tenant's files.
  const known = await payload.find({
    collection: 'media-blobs',
    where: { and: [{ site: { equals: input.scope.siteId } }, { checksum: { equals: inspection.sha256 } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never).catch(() => ({ docs: [] as Doc[] }))
  let blob = (known.docs as unknown as Doc[])[0]
  let wroteObject = false
  if (!blob) {
    await storage.put(key, input.bytes, inspection.mimeType)
    wroteObject = true
    try {
      blob = (await payload.create({
        collection: 'media-blobs',
        overrideAccess: true,
        data: {
          site: input.scope.siteId,
          publication: input.scope.publicationId ?? null,
          space: input.scope.spaceId ?? null,
          checksum: inspection.sha256,
          storageKey: key,
          storageProvider: storage.provider,
          mimeType: inspection.mimeType,
          sizeBytes: input.bytes.byteLength,
          state: 'ready',
        },
      } as never)) as unknown as Doc
    } catch (error) {
      await storage.remove(key).catch(() => undefined)
      // A concurrent upload may have won the per-site checksum race.
      const concurrent = await payload.find({
        collection: 'media-blobs',
        where: { and: [{ site: { equals: input.scope.siteId } }, { checksum: { equals: inspection.sha256 } }] },
        limit: 1, depth: 0, overrideAccess: true,
      } as never).catch(() => ({ docs: [] as Doc[] }))
      blob = (concurrent.docs as unknown as Doc[])[0]
      if (!blob) throw error
      wroteObject = false
    }
  }
  try {
    return await payload.create({
      collection: 'media-assets',
      overrideAccess: true,
      data: {
        site: input.scope.siteId,
        publication: input.scope.publicationId ?? null,
        space: input.scope.spaceId ?? null,
        owner: id(input.user?.member) || null,
        title,
        kind: inspection.kind,
        storageLocation: String(blob.storageKey),
        storageProvider: storage.provider,
        originalBlob: blob.id,
        originalFilename: cleanText(input.originalFilename, 'Original filename', 255) || null,
        mimeType: inspection.mimeType,
        sizeBytes: input.bytes.byteLength,
        width: inspection.width,
        height: inspection.height,
        checksum: inspection.sha256,
        altText: altText || null,
        caption: caption || null,
        ...(input.focalPoint ? { focalPoint: input.focalPoint } : {}),
        retentionMode: 'permanent',
        retentionHold: 'none',
        removeFromDiscovery: false,
        processingState: 'ready',
        publicPolicy: 'published-use',
      },
    } as never)
  } catch (error) {
    if (wroteObject) {
      await storage.remove(key).catch(() => undefined)
      if (payload.delete)
        await payload.delete({ collection: 'media-blobs', id: blob.id, overrideAccess: true } as never).catch(() => undefined)
    }
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
    site: input.scope.siteId,
    media: input.mediaId,
    usageKey,
    usedBy: { relationTo: 'content', value: input.contentId },
    purpose: 'hero',
    replaceGlobally: true,
    approvedForPublic: true,
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

/**
 * Replacement is a bounded, site-scoped chain: old records remain audit evidence and all
 * readers resolve at most eight links. A cycle, missing target, or cross-site target is invalid.
 */
export async function resolveMediaReplacement(
  payload: Payload,
  media: Doc,
): Promise<Doc | undefined> {
  const siteId = id(media.site)
  const seen = new Set<string>()
  let current = media
  for (let hops = 0; hops < replacementLimit; hops++) {
    const currentId = id(current.id)
    if (!currentId || seen.has(currentId)) return undefined
    seen.add(currentId)
    const nextId = id(current.replaceGloballyWith)
    if (!nextId) return current
    const next = (await payload
      .findByID({ collection: 'media-assets', id: nextId, depth: 0, overrideAccess: true } as never)
      .catch(() => undefined)) as unknown as Doc | undefined
    if (!next || id(next.site) !== siteId) return undefined
    current = next
  }
  return undefined
}

export async function updateMediaMetadata(
  payload: Payload,
  user: Doc | null | undefined,
  input: { scope: TeamScope; mediaId: string; title?: string; altText?: string; caption?: string },
) {
  await assertMediaPermission(payload, user, input.scope, 'content.edit')
  const media = (await payload.findByID({
    collection: 'media-assets',
    id: input.mediaId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc
  if (id(media.site) !== input.scope.siteId)
    throw new MediaWorkflowError('Cross-site media update is not allowed.', 403)
  const data: Record<string, string | null> = {}
  if (input.title !== undefined) {
    const title = cleanText(input.title, 'Media title', 180)
    if (!title) throw new MediaWorkflowError('A media title is required.')
    data.title = title
  }
  if (input.altText !== undefined) data.altText = cleanText(input.altText, 'Alt text', 500) || null
  if (input.caption !== undefined) data.caption = cleanText(input.caption, 'Caption', 2_000) || null
  return payload.update({
    collection: 'media-assets',
    id: input.mediaId,
    data,
    overrideAccess: true,
  } as never)
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
  const [uses, heroReferences, siteSettings] = await Promise.all([
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
    typeof payload.findGlobal === 'function'
      ? (payload
          .findGlobal({
            slug: 'site-settings',
            depth: 0,
            overrideAccess: true,
          } as never)
          .catch(() => null) as unknown as Promise<Doc | null>)
      : Promise.resolve(null),
  ])
  const siteSettingsMedia = siteSettings
    ? [id(siteSettings.logo), id(siteSettings.defaultSocialImage), id(siteSettings.favicon)].filter(
        Boolean,
      )
    : []
  if (uses.docs.length || heroReferences.docs.length || siteSettingsMedia.includes(input.mediaId))
    throw new MediaWorkflowError(
      'Referenced media cannot be deleted. Replace it or detach every use first.',
      409,
    )
  const storage = mediaStorage(config)
  const blob = await resolveMediaBlob(payload, media)
  const storageKey = String(blob?.storageKey ?? media.storageLocation ?? '')
  if (!storageKey) throw new MediaWorkflowError('Media has no stored object.', 409)
  const siblingAssets = blob?.id
    ? await payload.find({ collection: 'media-assets', where: { originalBlob: { equals: blob.id } }, limit: 2, depth: 0, overrideAccess: true } as never)
    : { docs: [media] }
  if (siblingAssets.docs.length > 1)
    throw new MediaWorkflowError('This media shares a blob with another asset and cannot be deleted.', 409)
  const bytes = await storage.get(storageKey)
  await storage.remove(storageKey)
  try {
    await payload.delete({
      collection: 'media-assets',
      id: input.mediaId,
      overrideAccess: true,
    } as never)
    if (blob?.id)
      await payload.delete({ collection: 'media-blobs', id: blob.id, overrideAccess: true } as never)
  } catch {
    if (bytes)
      await storage
        .put(
          storageKey,
          bytes,
          String(media.mimeType || 'application/octet-stream'),
        )
      .catch(() => undefined)
    throw new MediaWorkflowError(
      'Media deletion could not be completed; bytes were restored for recovery.',
      500,
    )
  }
}

export async function publicMedia(payload: Payload, mediaId: string): Promise<Doc | undefined> {
  const media = (await payload
    .findByID({ collection: 'media-assets', id: mediaId, depth: 0, overrideAccess: true } as never)
    .catch(() => undefined)) as unknown as Doc | undefined
  if (!media || media.removeFromDiscovery || media.retentionMode === 'tombstone' || media.processingState === 'quarantined' || media.processingState === 'failed' || media.publicPolicy === 'private') return undefined

  // Site settings logo, default social image, and favicon are public by site definition.
  const siteSettings =
    typeof payload.findGlobal === 'function'
      ? (((await payload
          .findGlobal({
            slug: 'site-settings',
            depth: 0,
            overrideAccess: true,
          } as never)
          .catch(() => null)) as unknown) as Doc | null)
      : null
  if (
    siteSettings &&
    [id(siteSettings.logo), id(siteSettings.defaultSocialImage), id(siteSettings.favicon)].includes(
      mediaId,
    )
  ) {
    return resolveMediaReplacement(payload, media)
  }

  const references = await Promise.all([
    findIfRegistered(payload, {
      collection: 'content',
      where: {
        and: [
          { heroMedia: { equals: mediaId } },
          { status: { in: ['published', 'updated'] } },
          { site: { equals: id(media.site) } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never),
    findIfRegistered(payload, {
      collection: 'media-usages',
      where: {
        and: [
          { media: { equals: mediaId } },
          { site: { equals: id(media.site) } },
          { approvedForPublic: { equals: true } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never),
    findIfRegistered(payload, {
      collection: 'podcast-episodes',
      where: {
        and: [
          { audio: { equals: mediaId } },
          { status: { in: ['published', 'updated'] } },
          { site: { equals: id(media.site) } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never),
    findIfRegistered(payload, {
      collection: 'videos',
      where: {
        and: [
          { nativeMedia: { equals: mediaId } },
          { status: { in: ['published', 'updated'] } },
          { site: { equals: id(media.site) } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never),
    findIfRegistered(payload, {
      collection: 'brands',
      where: {
        and: [
          { site: { equals: id(media.site) } },
          { or: [{ logo: { equals: mediaId } }, { favicon: { equals: mediaId } }] },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never),
    findIfRegistered(payload, {
      collection: 'authors',
      where: { avatar: { equals: mediaId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never),
  ])
  if (!references.some((reference) => reference.docs.length)) return undefined
  return resolveMediaReplacement(payload, media)
}

/** Resolves MED-00 blobs while retaining read-only compatibility for pre-MED records. */
export async function resolveMediaBlob(payload: Payload, media: Doc): Promise<Doc | undefined> {
  const blobId = id(media.originalBlob)
  if (!blobId) return undefined
  const blob = (await payload.findByID({ collection: 'media-blobs', id: blobId, depth: 0, overrideAccess: true } as never)
    .catch(() => undefined)) as unknown as Doc | undefined
  if (!blob || blob.state !== 'ready' || id(blob.site) !== id(media.site)) return undefined
  return blob
}

export async function mediaStorageKey(payload: Payload, media: Doc): Promise<string | undefined> {
  const blob = await resolveMediaBlob(payload, media)
  return blob ? String(blob.storageKey) : typeof media.storageLocation === 'string' && !media.storageLocation.startsWith('local://') ? media.storageLocation : undefined
}
