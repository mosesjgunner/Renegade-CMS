import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'
import { assertTeamPermission, type TeamScope } from '../collaboration/service'
import { findIfRegistered } from '../public/registered-collections'
import { inspectAudioMetadata, inspectMedia, mediaObjectKey, mediaStorage } from './storage'
import { queueAssetVariantGeneration } from './variants'
import { validateWebVtt } from './video'

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
export type MediaLifecycle = 'draft' | 'scheduled' | 'public'
export type ReplacementMode = 'new-asset' | 'selected-usages' | 'all-usages'
export type DamMetadata = {
  title?: string
  altText?: string
  caption?: string
  description?: string
  creatorCredit?: string
  source?: string
  copyrightOwner?: string
  license?: string
  licenseType?: string
  licenseUrl?: string
  usageRestrictions?: string
  consentReference?: string
  modelReleaseReference?: string
  propertyReleaseReference?: string
  embargoUntil?: string | null
  rightsExpiresAt?: string | null
  rightsStatus?: string
  governanceEnabled?: boolean
  customMetadata?: Record<string, unknown>
}

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
  if (inspection.mimeType === 'text/vtt') validateWebVtt(input.bytes)
  const audioMetadata = inspection.kind === 'audio' ? inspectAudioMetadata(input.bytes) : undefined
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
  const known = await payload
    .find({
      collection: 'media-blobs',
      where: {
        and: [
          { site: { equals: input.scope.siteId } },
          { checksum: { equals: inspection.sha256 } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => ({ docs: [] as Doc[] }))
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
      const concurrent = await payload
        .find({
          collection: 'media-blobs',
          where: {
            and: [
              { site: { equals: input.scope.siteId } },
              { checksum: { equals: inspection.sha256 } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        } as never)
        .catch(() => ({ docs: [] as Doc[] }))
      blob = (concurrent.docs as unknown as Doc[])[0]
      if (!blob) throw error
      wroteObject = false
    }
  } else {
    const existingBytes = await storage.get(String(blob.storageKey)).catch(() => undefined)
    if (!existingBytes) {
      await storage.put(String(blob.storageKey), input.bytes, inspection.mimeType)
    }
  }
  try {
    const asset = await payload.create({
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
        durationSeconds: audioMetadata?.durationSeconds,
        audioMetadata: audioMetadata
          ? {
              ...audioMetadata,
              mimeType: inspection.mimeType,
              sizeBytes: input.bytes.byteLength,
              checksum: inspection.sha256,
            }
          : undefined,
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
    if (
      inspection.kind === 'image' &&
      inspection.mimeType !== 'image/svg+xml' &&
      typeof payload.jobs?.queue === 'function'
    ) {
      // The original is committed and remains private before any expensive
      // decode starts.  Variant work is durable and worker-owned.
      await queueAssetVariantGeneration(payload, {
        assetId: String((asset as unknown as Doc).id),
      }).catch(() => undefined)
    }
    return asset
  } catch (error) {
    if (wroteObject) {
      await storage.remove(key).catch(() => undefined)
      if (payload.delete)
        await payload
          .delete({ collection: 'media-blobs', id: blob.id, overrideAccess: true } as never)
          .catch(() => undefined)
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
    targetType: 'content',
    targetId: input.contentId,
    field: 'heroMedia',
    lifecycle: ['published', 'updated'].includes(String(content.status))
      ? 'public'
      : String(content.status) === 'scheduled'
        ? 'scheduled'
        : 'draft',
    publication: id(content.publication) || null,
    lastReconciledAt: new Date().toISOString(),
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
  input: Parameters<typeof uploadMedia>[2] & {
    replacedMediaId: string
    mode?: ReplacementMode
    usageIds?: string[]
    reason?: string
  },
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
  const mode = input.mode ?? 'new-asset'
  const impact = await previewReplacementImpact(
    payload,
    input.scope.siteId,
    input.replacedMediaId,
    input.usageIds,
  )
  if (mode === 'all-usages')
    await payload.update({
      collection: 'media-assets',
      id: original.id,
      overrideAccess: true,
      data: { replaceGloballyWith: replacement.id },
    } as never)
  if (mode === 'selected-usages') {
    if (!input.usageIds?.length)
      throw new MediaWorkflowError('Choose at least one usage to rewire.', 400)
    for (const usage of impact.usages.filter((item) => input.usageIds!.includes(item.id)))
      await payload.update({
        collection: 'media-usages',
        id: usage.id,
        data: { media: replacement.id, lastReconciledAt: new Date().toISOString() },
        overrideAccess: true,
      } as never)
  }
  await payload.create({
    collection: 'media-asset-versions',
    overrideAccess: true,
    data: {
      site: input.scope.siteId,
      publication: input.scope.publicationId ?? null,
      space: input.scope.spaceId ?? null,
      asset: replacement.id,
      replacesAsset: original.id,
      versionLabel: `replacement-${new Date().toISOString()}`,
      mode,
      replacedUsageIds: input.usageIds ?? [],
      impactCount: mode === 'new-asset' ? 0 : impact.usages.length,
      reason: cleanText(input.reason, 'Replacement reason', 1000) || null,
    },
  } as never)
  if (replacement && (replacement as unknown as Doc).kind === 'image') {
    if (typeof payload.jobs?.queue === 'function')
      await queueAssetVariantGeneration(payload, {
        assetId: String((replacement as unknown as Doc).id),
        force: true,
      }).catch(() => undefined)
  }
  return replacement
}

/** Preview is deliberately required before rewiring; it never changes a usage. */
export async function previewReplacementImpact(
  payload: Payload,
  siteId: string,
  mediaId: string,
  selectedIds?: string[],
) {
  const result = await payload.find({
    collection: 'media-usages',
    where: { and: [{ site: { equals: siteId } }, { media: { equals: mediaId } }] },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  } as never)
  const usages = (result.docs as unknown as Doc[]).map((usage) => ({
    id: id(usage.id),
    targetType: String(usage.targetType ?? ''),
    targetId: String(usage.targetId ?? ''),
    field: String(usage.field ?? ''),
    slot: String(usage.slot ?? ''),
    lifecycle: String(usage.lifecycle ?? 'draft'),
    selected: Boolean(selectedIds?.includes(id(usage.id))),
  }))
  return {
    usages,
    affected: selectedIds ? usages.filter((item) => item.selected).length : usages.length,
  }
}

export const mediaRightsIssue = (media: DamMetadata, now = new Date()) => {
  if (media.rightsStatus && media.rightsStatus !== 'approved') return 'Rights approval is required.'
  if (media.rightsExpiresAt && new Date(media.rightsExpiresAt) <= now)
    return 'Media rights have expired.'
  if (media.embargoUntil && new Date(media.embargoUntil) > now) return 'Media is under embargo.'
  return undefined
}

/** Used by release and distribution callers before a new public reference is created. */
export const assertMediaPublishable = (media: DamMetadata, now = new Date()) => {
  const issue = mediaRightsIssue(media, now)
  if (issue) throw new MediaWorkflowError(issue, 409)
}

/** Resolve and validate every explicit asset before a release/distribution mutation. */
export async function assertMediaIdsPublishable(payload: Payload, mediaIds: readonly string[]) {
  for (const mediaId of mediaIds) {
    const media = (await payload.findByID({
      collection: 'media-assets',
      id: mediaId,
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as DamMetadata
    assertMediaPublishable(media)
  }
}

/** Small, actionable governance queue; no enterprise review workflow is required to use it. */
export async function mediaGovernanceDashboard(payload: Payload, siteId: string, now = new Date()) {
  const [assetsResult, usagesResult] = await Promise.all([
    payload.find({
      collection: 'media-assets',
      where: { site: { equals: siteId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    } as never),
    payload.find({
      collection: 'media-usages',
      where: { site: { equals: siteId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    } as never),
  ])
  const assets = assetsResult.docs as unknown as Doc[]
  const usages = usagesResult.docs as unknown as Doc[]
  const used = new Set(usages.map((usage) => id(usage.media)))
  const duplicates = new Map<string, number>()
  for (const asset of assets)
    duplicates.set(
      String(asset.checksum ?? ''),
      (duplicates.get(String(asset.checksum ?? '')) ?? 0) + 1,
    )
  const expiringWindow = new Date(now.valueOf() + 30 * 86_400_000)
  const ids = (predicate: (asset: Doc) => boolean) =>
    assets.filter(predicate).map((asset) => id(asset.id))
  const incidents = await findIfRegistered<Doc>(payload, {
    collection: 'media-governance-incidents' as never,
    where: { and: [{ site: { equals: siteId } }, { status: { in: ['open', 'investigating'] } }] },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  } as never)
  return {
    missingAlt: ids((asset) => asset.kind === 'image' && !String(asset.altText ?? '').trim()),
    missingCredit: ids((asset) => !String(asset.creatorCredit ?? asset.credits ?? '').trim()),
    expiringRights: ids(
      (asset) =>
        Boolean(asset.rightsExpiresAt) && new Date(String(asset.rightsExpiresAt)) <= expiringWindow,
    ),
    unusedOrOrphan: ids((asset) => !used.has(id(asset.id))),
    processingFailures: ids((asset) => asset.processingState === 'failed'),
    exactDuplicates: ids((asset) => (duplicates.get(String(asset.checksum ?? '')) ?? 0) > 1),
    highImpactReplacements: usages
      .filter((usage) => usage.lifecycle === 'public' && Boolean(usage.replaceGlobally))
      .map((usage) => id(usage.media)),
    incidents: incidents.docs.map((incident) => ({
      id: id(incident.id),
      assetId: id(incident.asset),
      summary: String(incident.summary ?? ''),
      status: String(incident.status ?? 'open'),
    })),
  }
}

/** Release-time graph gate: validates every reconciled editorial/layout/SEO/distribution reference, not just hero media. */
export async function assertUsageTargetsPublishable(
  payload: Payload,
  targetIds: readonly string[],
) {
  if (!targetIds.length) return
  const result = await payload.find({
    collection: 'media-usages',
    where: { targetId: { in: [...new Set(targetIds)] } },
    depth: 0,
    limit: 5000,
    overrideAccess: true,
  } as never)
  await assertMediaIdsPublishable(payload, [
    ...new Set((result.docs as unknown as Doc[]).map((usage) => id(usage.media)).filter(Boolean)),
  ])
}

type UsageCandidate = {
  usageKey: string
  mediaId: string
  usedBy: { relationTo: string; value: string }
  targetType: string
  targetId: string
  targetRevision?: string
  field: string
  slot?: string
  lifecycle: MediaLifecycle
  publication?: string | null
  channel?: string | null
  purpose: 'hero' | 'inline' | 'layout' | 'theme' | 'seo' | 'distribution'
}

const mediaReferenceKeys = new Set([
  'heroMedia',
  'media',
  'mediaId',
  'image',
  'imageId',
  'socialImage',
  'seoImage',
  'attachment',
  'attachments',
])

/** Extract only relationship-shaped media values; arbitrary UUID text is never treated as a use. */
function referencedMedia(
  value: unknown,
  field = '',
  found: Array<{ id: string; field: string }> = [],
) {
  if (Array.isArray(value)) {
    for (const child of value) referencedMedia(child, field, found)
    return found
  }
  if (!value || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value as Doc)) {
    if (mediaReferenceKeys.has(key)) {
      const values = Array.isArray(child) ? child : [child]
      for (const item of values) {
        const valueId = id(item)
        if (valueId) found.push({ id: valueId, field: key })
      }
    }
    if (child && typeof child === 'object') referencedMedia(child, key, found)
  }
  return found
}

const lifecycleFor = (status: unknown): MediaLifecycle =>
  ['published', 'updated', 'released'].includes(String(status))
    ? 'public'
    : ['scheduled', 'queued', 'publishing'].includes(String(status))
      ? 'scheduled'
      : 'draft'

/**
 * Rebuild the materialized graph from canonical records. It deliberately has no automatic
 * replacement/merge behavior: it only creates, refreshes, or removes stale graph projections.
 */
export async function reconcileMediaUsages(payload: Payload, siteId: string, now = new Date()) {
  const candidates: UsageCandidate[] = []
  const add = (
    record: Doc,
    relationTo: string,
    targetType: string,
    purpose: UsageCandidate['purpose'],
    refs: Array<{ id: string; field: string }>,
    channel?: string | null,
  ) => {
    const targetId = id(record.id)
    const lifecycle = lifecycleFor(record.status)
    for (const ref of refs) {
      const usageKey = `dam:${relationTo}:${targetId}:${ref.field}:${ref.id}`
      candidates.push({
        usageKey,
        mediaId: ref.id,
        usedBy: { relationTo, value: targetId },
        targetType,
        targetId,
        targetRevision: record.revision ? String(record.revision) : undefined,
        field: ref.field,
        lifecycle,
        publication: id(record.publication) || null,
        channel: channel ?? null,
        purpose,
      })
    }
  }
  const [content, layouts, variants] = await Promise.all([
    findIfRegistered<Doc>(payload, {
      collection: 'content',
      where: { site: { equals: siteId } },
      depth: 0,
      limit: 1000,
      overrideAccess: true,
    } as never),
    findIfRegistered<Doc>(payload, {
      collection: 'page-layouts',
      where: { site: { equals: siteId } },
      depth: 0,
      limit: 1000,
      overrideAccess: true,
    } as never),
    findIfRegistered<Doc>(payload, {
      collection: 'social-network-variants' as never,
      depth: 1,
      limit: 1000,
      overrideAccess: true,
    } as never),
  ])
  for (const record of content.docs) {
    const refs = referencedMedia({
      heroMedia: record.heroMedia,
      richText: record.richText,
      seoImage: record.seoImage,
      seoOverride: record.seoOverride,
      socialOverride: record.socialOverride,
    })
    add(record, 'content', 'content', 'inline', refs)
  }
  for (const record of layouts.docs) {
    const refs = referencedMedia({
      blocks: record.blocks,
      publishedPresentation: record.publishedPresentation,
    })
    add(record, 'page-layouts', 'page-layout', 'layout', refs)
  }
  for (const record of variants.docs) {
    const refs = referencedMedia({ attachments: record.attachments })
    add(
      record,
      'social-network-variants',
      'social-network-variant',
      'distribution',
      refs,
      String(record.network ?? ''),
    )
  }
  const existing = await payload.find({
    collection: 'media-usages',
    where: { site: { equals: siteId } },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  } as never)
  const byKey = new Map(
    (existing.docs as unknown as Doc[]).map((row) => [String(row.usageKey), row]),
  )
  const wanted = new Set(candidates.map((candidate) => candidate.usageKey))
  let created = 0
  let updated = 0
  let removed = 0
  const failures: Array<{ key: string; error: string }> = []
  for (const candidate of candidates) {
    const data = {
      site: siteId,
      media: candidate.mediaId,
      usageKey: candidate.usageKey,
      usedBy: candidate.usedBy,
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      targetRevision: candidate.targetRevision ?? null,
      field: candidate.field,
      slot: candidate.slot ?? null,
      lifecycle: candidate.lifecycle,
      publication: candidate.publication ?? null,
      channel: candidate.channel ?? null,
      purpose: candidate.purpose,
      approvedForPublic: candidate.lifecycle === 'public',
      replaceGlobally: false,
      lastReconciledAt: now.toISOString(),
    }
    try {
      const prior = byKey.get(candidate.usageKey)
      if (prior) {
        await payload.update({
          collection: 'media-usages',
          id: prior.id,
          data,
          overrideAccess: true,
        } as never)
        updated++
      } else {
        await payload.create({ collection: 'media-usages', data, overrideAccess: true } as never)
        created++
      }
    } catch (error) {
      failures.push({
        key: candidate.usageKey,
        error: error instanceof Error ? error.message : 'Write failed.',
      })
    }
  }
  // Only delete records owned by this reconciler. Hand-authored legacy usages remain untouched.
  for (const row of existing.docs as unknown as Doc[]) {
    const key = String(row.usageKey ?? '')
    if (!key.startsWith('dam:') || wanted.has(key)) continue
    try {
      await payload.delete({
        collection: 'media-usages',
        id: row.id,
        overrideAccess: true,
      } as never)
      removed++
    } catch (error) {
      failures.push({ key, error: error instanceof Error ? error.message : 'Delete failed.' })
    }
  }
  return {
    scanned: content.docs.length + layouts.docs.length + variants.docs.length,
    created,
    updated,
    removed,
    failures,
  }
}

export async function createPublicMediaIncidents(
  payload: Payload,
  siteId: string,
  now = new Date(),
) {
  const dashboard = await mediaGovernanceDashboard(payload, siteId, now)
  const risky = new Set([...dashboard.expiringRights, ...dashboard.processingFailures])
  const open = new Set(dashboard.incidents.map((incident) => incident.assetId))
  let created = 0
  for (const assetId of risky) {
    if (open.has(assetId)) continue
    const uses = (await payload.find({
      collection: 'media-usages',
      where: {
        and: [
          { site: { equals: siteId } },
          { media: { equals: assetId } },
          { lifecycle: { equals: 'public' } },
        ],
      },
      depth: 0,
      limit: 500,
      overrideAccess: true,
    } as never)) as unknown as { docs: Doc[] }
    if (!uses.docs.length) continue
    await payload.create({
      collection: 'media-governance-incidents' as never,
      data: {
        site: siteId,
        asset: assetId,
        summary: 'Public media requires governance remediation',
        reason: dashboard.processingFailures.includes(assetId)
          ? 'Media processing failed.'
          : 'Rights have expired or are expiring.',
        status: 'open',
        affectedUsageIds: uses.docs.map((usage) => id(usage.id)),
        openedAt: now.toISOString(),
        audit: [
          { action: 'incident.opened', at: now.toISOString(), source: 'media-reconciliation' },
        ],
      },
      overrideAccess: true,
    } as never)
    created++
  }
  return { created }
}

export type MediaBulkAction = 'tag' | 'move' | 'metadata' | 'archive' | 'export'
type BulkInput = {
  scope: TeamScope
  assetIds: string[]
  action: MediaBulkAction
  tagIds?: string[]
  collectionIds?: string[]
  metadata?: DamMetadata
}

/** Bulk edits are independently authorized per asset and return a usable partial-failure/undo report. */
export async function bulkMediaOperation(
  payload: Payload,
  user: Doc | null | undefined,
  input: BulkInput,
) {
  await assertMediaPermission(payload, user, input.scope, 'content.edit')
  const requested = [...new Set(input.assetIds.filter(Boolean))].slice(0, 100)
  if (!requested.length) throw new MediaWorkflowError('Select at least one media asset.')
  const successes: Array<{ id: string; undo: Record<string, unknown> }> = []
  const failures: Array<{ id: string; error: string }> = []
  const exported: Doc[] = []
  for (const assetId of requested) {
    try {
      const asset = (await payload.findByID({
        collection: 'media-assets',
        id: assetId,
        depth: 0,
        overrideAccess: true,
      } as never)) as unknown as Doc
      if (id(asset.site) !== input.scope.siteId)
        throw new MediaWorkflowError('Cross-site media operation is not allowed.', 403)
      if (input.action === 'export') {
        exported.push({
          id: id(asset.id),
          title: asset.title,
          mimeType: asset.mimeType,
          checksum: asset.checksum,
          tags: asset.tags ?? [],
          collections: asset.collections ?? [],
          rightsStatus: asset.rightsStatus,
          rightsExpiresAt: asset.rightsExpiresAt ?? null,
          usageRestrictions: asset.usageRestrictions ?? null,
        })
        successes.push({ id: assetId, undo: {} })
        continue
      }
      const data: Doc = {}
      if (input.action === 'tag') data.tags = [...new Set(input.tagIds ?? [])]
      if (input.action === 'move') data.collections = [...new Set(input.collectionIds ?? [])]
      if (input.action === 'metadata') {
        if (!input.metadata)
          throw new MediaWorkflowError('Metadata is required for this bulk operation.')
        for (const [key, value] of Object.entries(input.metadata))
          if (value !== undefined) data[key] = value
      }
      if (input.action === 'archive') {
        data.retentionMode = 'archive'
        data.removeFromDiscovery = true
      }
      const undo: Doc = {}
      for (const key of Object.keys(data)) undo[key] = asset[key]
      await payload.update({
        collection: 'media-assets',
        id: assetId,
        data,
        overrideAccess: true,
      } as never)
      successes.push({ id: assetId, undo })
    } catch (error) {
      failures.push({
        id: assetId,
        error: error instanceof Error ? error.message : 'Operation failed.',
      })
    }
  }
  return { action: input.action, requested: requested.length, successes, failures, exported }
}

export async function undoBulkMediaOperation(
  payload: Payload,
  user: Doc | null | undefined,
  input: { scope: TeamScope; operations: Array<{ id: string; undo: Record<string, unknown> }> },
) {
  await assertMediaPermission(payload, user, input.scope, 'content.edit')
  const restored: string[] = []
  const failures: Array<{ id: string; error: string }> = []
  for (const operation of input.operations.slice(0, 100)) {
    try {
      const asset = (await payload.findByID({
        collection: 'media-assets',
        id: operation.id,
        depth: 0,
        overrideAccess: true,
      } as never)) as unknown as Doc
      if (id(asset.site) !== input.scope.siteId)
        throw new MediaWorkflowError('Cross-site media operation is not allowed.', 403)
      await payload.update({
        collection: 'media-assets',
        id: operation.id,
        data: operation.undo,
        overrideAccess: true,
      } as never)
      restored.push(operation.id)
    } catch (error) {
      failures.push({
        id: operation.id,
        error: error instanceof Error ? error.message : 'Undo failed.',
      })
    }
  }
  return { restored, failures }
}

/** Candidates are checksum groups only; no request can merge them implicitly. */
export async function duplicateMediaCandidates(payload: Payload, siteId: string) {
  const result = await payload.find({
    collection: 'media-assets',
    where: { site: { equals: siteId } },
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  } as never)
  const groups = new Map<string, Doc[]>()
  for (const asset of result.docs as unknown as Doc[]) {
    const checksum = String(asset.checksum ?? '')
    if (!checksum) continue
    groups.set(checksum, [...(groups.get(checksum) ?? []), asset])
  }
  return [...groups.entries()]
    .filter(([, assets]) => assets.length > 1)
    .map(([checksum, assets]) => ({
      checksum,
      assets: assets.map((asset) => ({
        id: id(asset.id),
        title: String(asset.title ?? ''),
        createdAt: asset.createdAt ?? null,
      })),
    }))
}

export async function reviewDuplicateMedia(
  payload: Payload,
  user: Doc | null | undefined,
  input: {
    scope: TeamScope
    checksum: string
    keepId: string
    discardIds: string[]
    action: 'keep' | 'merge'
    reason?: string
  },
) {
  await assertMediaPermission(payload, user, input.scope, 'content.edit')
  const candidateIds = [...new Set([input.keepId, ...input.discardIds])]
  if (candidateIds.length < 2)
    throw new MediaWorkflowError('Choose a keeper and at least one duplicate.')
  const assets = await Promise.all(
    candidateIds.map(
      async (assetId) =>
        (await payload.findByID({
          collection: 'media-assets',
          id: assetId,
          depth: 0,
          overrideAccess: true,
        } as never)) as unknown as Doc,
    ),
  )
  if (
    assets.some(
      (asset) =>
        id(asset.site) !== input.scope.siteId || String(asset.checksum ?? '') !== input.checksum,
    )
  )
    throw new MediaWorkflowError(
      'Duplicate review candidates must be same-site assets with the selected checksum.',
      409,
    )
  const audit = {
    action: `duplicate.${input.action}`,
    keepId: input.keepId,
    at: new Date().toISOString(),
    reason: cleanText(input.reason, 'Reason', 1000) || null,
  }
  for (const asset of assets) {
    if (id(asset.id) === input.keepId) continue
    if (input.action === 'merge') {
      const resolved = await resolveMediaReplacement(
        payload,
        assets.find((item) => id(item.id) === input.keepId)!,
      )
      if (!resolved || id(resolved.id) !== input.keepId)
        throw new MediaWorkflowError('Replacement loop detected; duplicate merge refused.', 409)
      await payload.update({
        collection: 'media-assets',
        id: asset.id,
        data: { replaceGloballyWith: input.keepId },
        overrideAccess: true,
      } as never)
      await payload.create({
        collection: 'media-asset-versions',
        data: {
          site: input.scope.siteId,
          asset: input.keepId,
          replacesAsset: asset.id,
          versionLabel: `duplicate-merge-${new Date().toISOString()}`,
          mode: 'all-usages',
          replacedUsageIds: [],
          impactCount: 0,
          reason: audit.reason,
        },
        overrideAccess: true,
      } as never)
    }
    await payload.update({
      collection: 'media-assets',
      id: asset.id,
      data: {
        customMetadata: { ...((asset.customMetadata as Doc) ?? {}), duplicateReview: audit },
      },
      overrideAccess: true,
    } as never)
  }
  return { action: input.action, keepId: input.keepId, reviewedIds: input.discardIds }
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
  input: { scope: TeamScope; mediaId: string } & DamMetadata,
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
  const data: Record<string, unknown> = {}
  if (input.title !== undefined) {
    const title = cleanText(input.title, 'Media title', 180)
    if (!title) throw new MediaWorkflowError('A media title is required.')
    data.title = title
  }
  if (input.altText !== undefined) data.altText = cleanText(input.altText, 'Alt text', 500) || null
  if (input.caption !== undefined) data.caption = cleanText(input.caption, 'Caption', 2_000) || null
  const textFields: Array<[keyof DamMetadata, number]> = [
    ['description', 5000],
    ['creatorCredit', 500],
    ['source', 1000],
    ['copyrightOwner', 500],
    ['license', 300],
    ['licenseType', 80],
    ['licenseUrl', 2000],
    ['usageRestrictions', 5000],
    ['consentReference', 500],
    ['modelReleaseReference', 500],
    ['propertyReleaseReference', 500],
  ]
  for (const [field, max] of textFields)
    if (input[field] !== undefined)
      data[field] = cleanText(String(input[field] ?? ''), String(field), max) || null
  for (const field of ['embargoUntil', 'rightsExpiresAt'] as const)
    if (input[field] !== undefined) data[field] = input[field]
  if (input.rightsStatus !== undefined) data.rightsStatus = input.rightsStatus
  if (input.governanceEnabled !== undefined) data.governanceEnabled = input.governanceEnabled
  if (input.customMetadata !== undefined) data.customMetadata = input.customMetadata
  if ((input as Record<string, unknown>).focalPoint !== undefined)
    data.focalPoint = (input as Record<string, unknown>).focalPoint
  if ((input as Record<string, unknown>).cropSettings !== undefined)
    data.cropSettings = (input as Record<string, unknown>).cropSettings
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
  // Cancellation is durable rather than relying on a best-effort process
  // signal. A worker rechecks both this state and the asset before decode.
  const queuedJobs = await payload
    .find({
      collection: 'media-jobs' as never,
      where: { status: { in: ['queued', 'running', 'retrying'] } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => ({ docs: [] }))
  for (const job of queuedJobs.docs as unknown as Doc[]) {
    const jobInput = job.input as { assetId?: string } | undefined
    if (jobInput?.assetId === input.mediaId)
      await payload
        .update({
          collection: 'media-jobs' as never,
          id: String(job.id),
          overrideAccess: true,
          data: {
            status: 'cancelled',
            failure: { message: 'Cancelled because the asset was deleted.' },
          },
        } as never)
        .catch(() => undefined)
  }
  const storage = mediaStorage(config)
  const blob = await resolveMediaBlob(payload, media)
  const storageKey = String(blob?.storageKey ?? media.storageLocation ?? '')
  if (!storageKey) throw new MediaWorkflowError('Media has no stored object.', 409)
  const siblingAssets = blob?.id
    ? await payload.find({
        collection: 'media-assets',
        where: { originalBlob: { equals: blob.id } },
        limit: 2,
        depth: 0,
        overrideAccess: true,
      } as never)
    : { docs: [media] }
  if (siblingAssets.docs.length > 1)
    throw new MediaWorkflowError(
      'This media shares a blob with another asset and cannot be deleted.',
      409,
    )
  const bytes = await storage.get(storageKey)
  await storage.remove(storageKey)
  try {
    await payload.delete({
      collection: 'media-assets',
      id: input.mediaId,
      overrideAccess: true,
    } as never)
    if (blob?.id)
      await payload.delete({
        collection: 'media-blobs',
        id: blob.id,
        overrideAccess: true,
      } as never)
    const variants = await payload
      .find({
        collection: 'media-variants',
        where: { asset: { equals: input.mediaId } },
        limit: 100,
        depth: 1,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [] }))
    for (const rawV of variants.docs as unknown as Doc[]) {
      const v = rawV
      const renditionBlobs = [v.blob, v.previousBlob] as unknown as Array<Doc | undefined>
      for (const vBlob of renditionBlobs) {
        if (vBlob?.storageKey) {
          await storage.remove(String(vBlob.storageKey)).catch(() => undefined)
        }
        if (vBlob?.id) {
          await payload
            .delete({
              collection: 'media-blobs',
              id: String(vBlob.id),
              overrideAccess: true,
            } as never)
            .catch(() => undefined)
        }
      }
      await payload
        .delete({
          collection: 'media-variants',
          id: String(v.id),
          overrideAccess: true,
        } as never)
        .catch(() => undefined)
    }
  } catch {
    if (bytes)
      await storage
        .put(storageKey, bytes, String(media.mimeType || 'application/octet-stream'))
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
  if (
    !media ||
    media.removeFromDiscovery ||
    media.retentionMode === 'tombstone' ||
    media.processingState === 'quarantined' ||
    media.processingState === 'failed' ||
    media.publicPolicy === 'private'
  )
    return undefined
  // Safe public policy: a rights expiry withdraws delivery rather than extending
  // a licence by accident. The governance dashboard exposes it for remediation.
  if (mediaRightsIssue(media as DamMetadata)) return undefined

  // Site settings logo, default social image, and favicon are public by site definition.
  const siteSettings =
    typeof payload.findGlobal === 'function'
      ? ((await payload
          .findGlobal({
            slug: 'site-settings',
            depth: 0,
            overrideAccess: true,
          } as never)
          .catch(() => null)) as unknown as Doc | null)
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
          {
            or: [{ audio: { equals: mediaId } }, { artwork: { equals: mediaId } }],
          },
          { status: { in: ['published', 'updated'] } },
          { site: { equals: id(media.site) } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never),
    findIfRegistered(payload, {
      collection: 'podcast-shows',
      where: {
        and: [
          { artwork: { equals: mediaId } },
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
          {
            or: [
              { nativeMedia: { equals: mediaId } },
              { sourceAsset: { equals: mediaId } },
              { poster: { equals: mediaId } },
              { thumbnail: { equals: mediaId } },
            ],
          },
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
  const blob = (await payload
    .findByID({ collection: 'media-blobs', id: blobId, depth: 0, overrideAccess: true } as never)
    .catch(() => undefined)) as unknown as Doc | undefined
  if (!blob || blob.state !== 'ready' || id(blob.site) !== id(media.site)) return undefined
  return blob
}

export async function mediaStorageKey(payload: Payload, media: Doc): Promise<string | undefined> {
  const blob = await resolveMediaBlob(payload, media)
  return blob
    ? String(blob.storageKey)
    : typeof media.storageLocation === 'string' && !media.storageLocation.startsWith('local://')
      ? media.storageLocation
      : undefined
}

export { garbageCollectMediaVariants } from './variants'

export async function regenerateVariants(
  payload: Payload,
  user: Doc | null | undefined,
  input: {
    scope: TeamScope
    mediaId: string
    focalPoint?: { x: number; y: number }
    cropSettings?: { x: number; y: number; width: number; height: number }
    recipeKeys?: string[]
  },
) {
  await assertMediaPermission(payload, user, input.scope, 'content.edit')
  if (!payload.jobs?.queue)
    throw new MediaWorkflowError('The media worker queue is unavailable.', 503)
  if (input.focalPoint || input.cropSettings) {
    await payload.update({
      collection: 'media-assets',
      id: input.mediaId,
      overrideAccess: true,
      data: {
        ...(input.focalPoint ? { focalPoint: input.focalPoint } : {}),
        ...(input.cropSettings ? { cropSettings: input.cropSettings } : {}),
      },
    } as never)
  }
  return queueAssetVariantGeneration(payload, {
    assetId: input.mediaId,
    recipeKeys: input.recipeKeys,
    force: true,
  })
}
