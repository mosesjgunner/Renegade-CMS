import type { Payload } from 'payload'
import { readFile } from 'node:fs/promises'

import type { AppConfig } from '../core/config'
import { mediaStorage } from './storage'
import { validatePodcastFeed } from './publishing'
import {
  assertMediaPermission,
  deleteOrphanedMedia,
  MediaWorkflowError,
  previewReplacementImpact,
  updateMediaMetadata,
} from './workflow'
import { queueVideoProcessing } from './video-workflow'

export type HonestMediaState =
  | 'uploaded'
  | 'verifying'
  | 'processing'
  | 'ready'
  | 'degraded'
  | 'blocked'
  | 'failed'
  | 'archived'

export type StorageHealthReport = {
  driver: 'local' | 's3'
  status: 'healthy' | 'degraded' | 'unhealthy'
  target: string
  capabilities: {
    atomicWrite: boolean
    privateObjects: boolean
    checksumAddressed: boolean
    rangeRequests: boolean
  }
}

export type WorkerHealthReport = {
  activeProfile: 'default' | 'media-heavy'
  status: 'online' | 'stale' | 'offline'
  lastHeartbeat: string | null
  pid: number | null
  concurrency: number
  queues: {
    operations: number
    media: number
    'media-heavy': number
  }
}

export type MediaAssetSummary = {
  id: string
  title: string
  kind: 'image' | 'audio' | 'video' | 'document'
  mimeType: string
  sizeBytes: number
  checksum: string
  honestState: HonestMediaState
  processingState: string
  altText: string
  caption: string
  creatorCredit: string
  source: string
  licenseType: string
  rightsExpiresAt: string | null
  usagesCount: number
  isOrphan: boolean
  hasVariants: boolean
  url: string
  createdAt: string
  updatedAt: string
}

export type PodcastShowReport = {
  id: string
  title: string
  slug: string
  language: string
  explicit: boolean
  author: string
  artworkAttached: boolean
  feedUrl: string
  feedValid: boolean
  feedError: string | null
  episodeCount: number
  publishedEpisodeCount: number
}

export type PodcastEpisodeReadiness = {
  id: string
  title: string
  slug: string
  showTitle: string
  showSlug: string
  season: number | null
  episode: number | null
  status: string
  audioAttached: boolean
  audioDuration: number | null
  audioSizeBytes: number | null
  audioMimeType: string | null
  loudnessRecipeApplied: boolean
  transcriptAttached: boolean
  chaptersCount: number
  isReadyForFeed: boolean
  url: string
  playerUrl: string
  issues: string[]
}

export type VideoAssetReadiness = {
  id: string
  title: string
  sourceAssetId: string
  processingState: string
  progress: number
  durationSeconds: number | null
  width: number | null
  height: number | null
  hasFastStartMp4: boolean
  hasHls: boolean
  hasPoster: boolean
  hasContactSheet: boolean
  captionsCount: number
  isPlayerReady: boolean
  failure: string | null
  cancelRequested: boolean
  url: string
}

export type CommandCenterOverview = {
  storage: StorageHealthReport
  worker: WorkerHealthReport
  stats: {
    totalAssets: number
    totalBytes: number
    variantSavingsBytes: number
    variantSavingsPercent: number
    bytesByType: {
      image: number
      audio: number
      video: number
      document: number
    }
    stateCounts: Record<HonestMediaState, number>
    usageCounts: {
      public: number
      draft: number
      orphan: number
    }
    issueCounts: {
      missingAlt: number
      missingCredit: number
      expiringRights: number
      duplicateChecksum: number
      failures: number
    }
  }
  recentSessions: Array<{
    id: string
    filename: string
    size: number
    chunks: number
    state: string
    expiresAt: string
    createdAt: string
  }>
  recentJobs: Array<{
    id: string
    task: string
    status: string
    progress: number
    attempts: number
    failure: string | null
    createdAt: string
    updatedAt: string
  }>
  recentFailures: Array<{
    id: string
    type: 'job' | 'video' | 'session' | 'incident'
    summary: string
    details: string
    timestamp: string
    retryable: boolean
  }>
  assets: MediaAssetSummary[]
  podcasts: {
    shows: PodcastShowReport[]
    episodes: PodcastEpisodeReadiness[]
  }
  videos: VideoAssetReadiness[]
}

const id = (value: unknown) => String((value as { id?: string } | null)?.id ?? value ?? '')

/** Sanitizes any secret or credential before reporting storage targets. */
export function sanitizeStorageTarget(config: AppConfig): string {
  if (config.storage.driver === 's3' && config.storage.s3) {
    const bucket = config.storage.s3.bucket || 'renegade-media'
    const region = config.storage.s3.region || 'us-east-1'
    const endpoint = config.storage.s3.endpoint
      ? new URL(config.storage.s3.endpoint).host
      : 's3.amazonaws.com'
    return `s3://${bucket} (${region} via ${endpoint})`
  }
  return `local:[media-root]`
}

export async function checkStorageHealth(config: AppConfig): Promise<StorageHealthReport> {
  const driver = config.storage.driver === 's3' ? 's3' : 'local'
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

  try {
    const storage = mediaStorage(config)
    // Probe write and immediate cleanup of probe key
    const probeKey = `__health_probe_${Date.now()}.tmp`
    const probeBytes = new Uint8Array([0x52, 0x45, 0x4e, 0x45]) // 'RENE'
    await storage.put(probeKey, probeBytes, 'application/octet-stream')
    const read = await storage.get(probeKey)
    await storage.remove(probeKey)
    if (!read || read.byteLength !== 4) {
      status = 'degraded'
    }
  } catch {
    status = 'unhealthy'
  }

  return {
    driver,
    status,
    target: sanitizeStorageTarget(config),
    capabilities: {
      atomicWrite: true,
      privateObjects: true,
      checksumAddressed: true,
      rangeRequests: true,
    },
  }
}

export async function checkWorkerHealth(payload: Payload): Promise<WorkerHealthReport> {
  const activeProfile = (process.env.WORKER_PROFILE as 'media-heavy') || 'default'
  const heartbeatFile = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/renegade-worker/heartbeat.json'
  const maxAgeMs = Number(process.env.WORKER_HEARTBEAT_MAX_AGE_MS ?? 45_000)

  let status: 'online' | 'stale' | 'offline' = 'offline'
  let lastHeartbeat: string | null = null
  let pid: number | null = null

  try {
    const content = await readFile(/*turbopackIgnore: true*/ heartbeatFile, 'utf-8')
    const parsed = JSON.parse(content) as { observedAt?: string; pid?: number }
    if (parsed.observedAt) {
      lastHeartbeat = parsed.observedAt
      pid = typeof parsed.pid === 'number' ? parsed.pid : null
      const age = Date.now() - new Date(parsed.observedAt).getTime()
      status = age <= maxAgeMs ? 'online' : 'stale'
    }
  } catch {
    // If heartbeat file is missing, worker has not reported yet or is offline
    status = 'offline'
  }

  const queueCounts = {
    operations: 0,
    media: 0,
    'media-heavy': 0,
  }

  try {
    const jobs = await payload.find({
      collection: 'payload-jobs' as never,
      where: {
        and: [{ hasError: { equals: false } }, { completed: { equals: false } }],
      },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    for (const job of jobs.docs as Array<Record<string, unknown>>) {
      const q = String(job.queue ?? 'operations')
      if (q === 'media') queueCounts.media++
      else if (q === 'media-heavy') queueCounts['media-heavy']++
      else queueCounts.operations++
    }
  } catch {
    // payload-jobs collection might not have records yet
  }

  return {
    activeProfile,
    status,
    lastHeartbeat,
    pid,
    concurrency: activeProfile === 'media-heavy' ? 2 : 4,
    queues: queueCounts,
  }
}

/** Determines the honest media state across the 8 lifecycle boundaries. */
export function evaluateHonestState(
  asset: Record<string, unknown>,
  context: {
    hasVariants?: boolean
    hasActiveJob?: boolean
    usagesCount: number
    isExpired?: boolean
    isEmbargoed?: boolean
    hasFailedJob?: boolean
  },
): HonestMediaState {
  // 1. Archived
  if (asset.retentionMode === 'tombstone' || asset.lifecycle === 'archived') {
    return 'archived'
  }

  // 2. Failed
  if (asset.processingState === 'failed' || context.hasFailedJob) {
    return 'failed'
  }

  // 3. Blocked (expired rights, embargoed, or explicitly blocked)
  if (context.isExpired || context.isEmbargoed || asset.rightsStatus === 'restricted') {
    return 'blocked'
  }

  // 4. Processing
  if (
    context.hasActiveJob ||
    ['queued', 'probing', 'processing', 'retrying'].includes(String(asset.processingState ?? ''))
  ) {
    return 'processing'
  }

  // 5. Verifying
  if (asset.processingState === 'verifying') {
    return 'verifying'
  }

  // 6. Uploaded (raw original uploaded, initial processing not yet started)
  if (asset.processingState === 'uploaded' || !asset.processingState) {
    return 'uploaded'
  }

  // 7. Degraded (ready but has minor issues: missing alt text, missing credit, expiring within 30 days, or partial variants)
  const isImage = asset.kind === 'image'
  const isAudio = asset.kind === 'audio'
  const isVideo = asset.kind === 'video'
  const missingAlt = isImage && !String(asset.altText ?? '').trim()
  const missingCredit = !String(asset.creatorCredit ?? asset.credits ?? '').trim()

  if (missingAlt || missingCredit) {
    return 'degraded'
  }

  if (isImage && !context.hasVariants && !['image/svg+xml'].includes(String(asset.mimeType))) {
    return 'degraded'
  }

  if (isAudio && !asset.audioMetadata) {
    return 'degraded'
  }

  if (isVideo && asset.processingState !== 'ready') {
    return 'degraded'
  }

  // 8. Ready
  return 'ready'
}

export async function getMediaCommandCenterOverview(
  payload: Payload,
  config: AppConfig,
  siteId: string,
): Promise<CommandCenterOverview> {
  const [
    storage,
    worker,
    assetsResult,
    usagesResult,
    sessionsResult,
    jobsResult,
    videoAssetsResult,
  ] = await Promise.all([
    checkStorageHealth(config),
    checkWorkerHealth(payload),
    payload.find({
      collection: 'media-assets',
      where: { site: { equals: siteId } },
      limit: 1000,
      sort: '-updatedAt',
      depth: 0,
      overrideAccess: true,
    } as never),
    payload.find({
      collection: 'media-usages',
      where: { site: { equals: siteId } },
      limit: 2000,
      depth: 0,
      overrideAccess: true,
    } as never),
    payload.find({
      collection: 'media-upload-sessions' as never,
      where: { site: { equals: siteId } },
      limit: 50,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    } as never),
    payload.find({
      collection: 'media-jobs' as never,
      limit: 50,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    } as never),
    payload.find({
      collection: 'video-assets' as never,
      limit: 50,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    } as never),
  ])

  const assets = assetsResult.docs as unknown as Array<Record<string, unknown>>
  const usages = usagesResult.docs as unknown as Array<Record<string, unknown>>
  const sessions = sessionsResult.docs as unknown as Array<Record<string, unknown>>
  const jobs = jobsResult.docs as unknown as Array<Record<string, unknown>>
  const videoAssets = videoAssetsResult.docs as unknown as Array<Record<string, unknown>>

  // Build usage indexes
  const usagesByMedia = new Map<string, Array<Record<string, unknown>>>()
  for (const usage of usages) {
    const mediaId = id(usage.media)
    const list = usagesByMedia.get(mediaId) ?? []
    list.push(usage)
    usagesByMedia.set(mediaId, list)
  }

  // Build duplicate checksum index
  const checksumCounts = new Map<string, number>()
  for (const asset of assets) {
    const chk = String(asset.checksum ?? '')
    if (chk) checksumCounts.set(chk, (checksumCounts.get(chk) ?? 0) + 1)
  }

  // Active and failed job sets
  const activeJobsByMedia = new Set<string>()
  const failedJobsByMedia = new Set<string>()
  for (const job of jobs) {
    const input = job.input as Record<string, unknown> | undefined
    const mediaId = id(input?.mediaAssetId)
    if (mediaId) {
      if (['running', 'queued', 'retrying'].includes(String(job.status))) {
        activeJobsByMedia.add(mediaId)
      } else if (job.status === 'failed') {
        failedJobsByMedia.add(mediaId)
      }
    }
  }

  const now = new Date()
  const expiringWindow = new Date(now.getTime() + 30 * 86_400_000)

  let totalBytes = 0
  let variantSavingsBytes = 0
  const bytesByType = { image: 0, audio: 0, video: 0, document: 0 }
  const stateCounts: Record<HonestMediaState, number> = {
    uploaded: 0,
    verifying: 0,
    processing: 0,
    ready: 0,
    degraded: 0,
    blocked: 0,
    failed: 0,
    archived: 0,
  }
  const usageCounts = { public: 0, draft: 0, orphan: 0 }
  const issueCounts = {
    missingAlt: 0,
    missingCredit: 0,
    expiringRights: 0,
    duplicateChecksum: 0,
    failures: 0,
  }

  const enrichedAssets: MediaAssetSummary[] = assets.map((asset) => {
    const assetId = id(asset.id)
    const assetUsages = usagesByMedia.get(assetId) ?? []
    const isOrphan = assetUsages.length === 0
    const hasPublicUsage = assetUsages.some((u) => u.lifecycle === 'public')
    const hasDraftUsage = assetUsages.some((u) => u.lifecycle === 'draft')

    if (hasPublicUsage) usageCounts.public++
    else if (hasDraftUsage) usageCounts.draft++
    else usageCounts.orphan++

    const size = Number(asset.sizeBytes ?? 0)
    totalBytes += size
    const kind = (asset.kind as 'image' | 'audio' | 'video' | 'document') || 'image'
    if (kind in bytesByType) bytesByType[kind] += size

    const isExpired =
      Boolean(asset.rightsExpiresAt) && new Date(String(asset.rightsExpiresAt)) < now
    const isExpiringSoon =
      Boolean(asset.rightsExpiresAt) &&
      new Date(String(asset.rightsExpiresAt)) <= expiringWindow &&
      !isExpired

    if (kind === 'image' && !String(asset.altText ?? '').trim()) issueCounts.missingAlt++
    if (!String(asset.creatorCredit ?? asset.credits ?? '').trim()) issueCounts.missingCredit++
    if (isExpired || isExpiringSoon) issueCounts.expiringRights++
    if ((checksumCounts.get(String(asset.checksum ?? '')) ?? 0) > 1) issueCounts.duplicateChecksum++

    const variants = (asset.variants as unknown[]) ?? []
    const hasVariants = variants.length > 0
    if (asset.variantSavingsBytes) {
      variantSavingsBytes += Number(asset.variantSavingsBytes)
    }

    const honestState = evaluateHonestState(asset, {
      hasVariants,
      hasActiveJob: activeJobsByMedia.has(assetId),
      hasFailedJob: failedJobsByMedia.has(assetId),
      usagesCount: assetUsages.length,
      isExpired,
      isEmbargoed: Boolean(asset.embargoUntil) && new Date(String(asset.embargoUntil)) > now,
    })
    stateCounts[honestState]++
    if (honestState === 'failed') issueCounts.failures++

    return {
      id: assetId,
      title: String(asset.title ?? 'Untitled'),
      kind,
      mimeType: String(asset.mimeType ?? ''),
      sizeBytes: size,
      checksum: String(asset.checksum ?? ''),
      honestState,
      processingState: String(asset.processingState ?? 'uploaded'),
      altText: String(asset.altText ?? ''),
      caption: String(asset.caption ?? ''),
      creatorCredit: String(asset.creatorCredit ?? asset.credits ?? ''),
      source: String(asset.source ?? ''),
      licenseType: String(asset.licenseType ?? ''),
      rightsExpiresAt: asset.rightsExpiresAt ? String(asset.rightsExpiresAt) : null,
      usagesCount: assetUsages.length,
      isOrphan,
      hasVariants,
      url: `/media/${assetId}`,
      createdAt: String(asset.createdAt ?? ''),
      updatedAt: String(asset.updatedAt ?? ''),
    }
  })

  // Recent Failures list
  const recentFailures: CommandCenterOverview['recentFailures'] = []

  for (const job of jobs) {
    if (job.status === 'failed' || job.status === 'retrying') {
      const failureObj = job.failure as { message?: string } | undefined
      recentFailures.push({
        id: id(job.id),
        type: 'job',
        summary: `Job ${String(job.task ?? 'media-task')} failed`,
        details: String(failureObj?.message ?? 'Unknown job error'),
        timestamp: String(job.updatedAt ?? job.createdAt ?? ''),
        retryable: Number(job.attempts ?? 0) < 5,
      })
    }
  }

  for (const va of videoAssets) {
    if (va.processingState === 'failed') {
      const failureObj = va.failure as { message?: string } | undefined
      recentFailures.push({
        id: id(va.id),
        type: 'video',
        summary: `Video processing failed: ${String(va.title ?? va.id)}`,
        details: String(failureObj?.message ?? 'Video recipe failed.'),
        timestamp: String(va.updatedAt ?? va.createdAt ?? ''),
        retryable: true,
      })
    }
  }

  for (const session of sessions) {
    if (session.state === 'aborted') {
      recentFailures.push({
        id: id(session.id),
        type: 'session',
        summary: `Upload session aborted: ${String(session.filename ?? session.id)}`,
        details: `Upload session was cancelled or timed out.`,
        timestamp: String(session.updatedAt ?? session.createdAt ?? ''),
        retryable: false,
      })
    }
  }

  // Podcast shows & episodes
  const [podcastShowsResult, podcastEpisodesResult] = await Promise.all([
    payload
      .find({
        collection: 'podcast-shows' as never,
        where: { site: { equals: siteId } },
        limit: 50,
        depth: 1,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] })),
    payload
      .find({
        collection: 'podcast-episodes' as never,
        where: { site: { equals: siteId } },
        limit: 100,
        sort: '-publishedAt',
        depth: 1,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] })),
  ])

  const shows = podcastShowsResult.docs as unknown as Array<Record<string, unknown>>
  const episodes = podcastEpisodesResult.docs as unknown as Array<Record<string, unknown>>

  const podcastShows: PodcastShowReport[] = []
  for (const show of shows) {
    const showId = id(show.id)
    const showEpisodes = episodes.filter((ep) => id(ep.show) === showId)
    const publishedCount = showEpisodes.filter((ep) => ep.status === 'published').length
    const artwork = Boolean(show.artwork)
    const slug = String(show.slug ?? '')
    const feedUrl = `/podcasts/${slug}/feed.xml`

    let feedValid = true
    let feedError: string | null = null

    if (!artwork) {
      feedValid = false
      feedError = 'Show artwork is missing.'
    } else if (!slug) {
      feedValid = false
      feedError = 'Show slug is missing.'
    }

    podcastShows.push({
      id: showId,
      title: String(show.title ?? 'Untitled Show'),
      slug,
      language: String(show.language ?? 'en'),
      explicit: Boolean(show.explicit),
      author: String(show.author ?? ''),
      artworkAttached: artwork,
      feedUrl,
      feedValid,
      feedError,
      episodeCount: showEpisodes.length,
      publishedEpisodeCount: publishedCount,
    })
  }

  const podcastEpisodes: PodcastEpisodeReadiness[] = []
  for (const ep of episodes) {
    const epId = id(ep.id)
    const showObj =
      typeof ep.show === 'object' && ep.show ? (ep.show as Record<string, unknown>) : null
    const audioObj =
      typeof ep.audioMedia === 'object' && ep.audioMedia
        ? (ep.audioMedia as Record<string, unknown>)
        : null
    const audioAttached = Boolean(ep.audioMedia)
    const audioMimeType = audioObj ? String(audioObj.mimeType ?? '') : null
    const audioDuration = audioObj ? Number(audioObj.durationSeconds ?? 0) || null : null
    const audioSizeBytes = audioObj ? Number(audioObj.sizeBytes ?? 0) || null : null
    const loudnessRecipeApplied = Boolean(audioObj?.loudnessNormalized || audioObj?.audioMetadata)
    const transcriptAttached = Boolean(ep.transcriptRevision || ep.transcript)
    const chapters = Array.isArray(ep.chapters) ? ep.chapters : []
    const chaptersCount = chapters.length

    const issues: string[] = []
    if (!audioAttached) issues.push('Audio file not attached.')
    if (audioAttached && !audioDuration) issues.push('Audio duration missing/unprobed.')
    if (
      audioAttached &&
      !['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg'].includes(audioMimeType || '')
    ) {
      issues.push('Audio format not standard podcast enclosure (must be MP3, M4A, OGG, or WAV).')
    }

    const isReadyForFeed = issues.length === 0 && ep.status === 'published'

    podcastEpisodes.push({
      id: epId,
      title: String(ep.title ?? 'Untitled Episode'),
      slug: String(ep.slug ?? ''),
      showTitle: String(showObj?.title ?? 'Unknown Show'),
      showSlug: String(showObj?.slug ?? ''),
      season: typeof ep.season === 'number' ? ep.season : null,
      episode: typeof ep.episodeNumber === 'number' ? ep.episodeNumber : null,
      status: String(ep.status ?? 'draft'),
      audioAttached,
      audioDuration,
      audioSizeBytes,
      audioMimeType,
      loudnessRecipeApplied,
      transcriptAttached,
      chaptersCount,
      isReadyForFeed,
      url: `/podcasts/episodes/${String(ep.slug ?? '')}`,
      playerUrl: `/podcasts/episodes/${String(ep.slug ?? '')}`,
      issues,
    })
  }

  // Video assets readiness
  const videoReadiness: VideoAssetReadiness[] = videoAssets.map((va) => {
    const outputs = Array.isArray(va.outputs) ? (va.outputs as Array<Record<string, unknown>>) : []
    const hasFastStartMp4 = outputs.some((o) => o.mimeType === 'video/mp4')
    const hasHls = outputs.some((o) => o.mimeType === 'application/vnd.apple.mpegurl')
    const hasPoster = outputs.some((o) => o.key === 'poster')
    const hasContactSheet = outputs.some((o) => o.key === 'contact-sheet')
    const captions = Array.isArray(va.captions) ? va.captions : []
    const isPlayerReady = va.processingState === 'ready' && hasFastStartMp4

    const failureObj = va.failure as { message?: string } | undefined

    return {
      id: id(va.id),
      title: String(va.title ?? `Video ${id(va.id).slice(0, 8)}`),
      sourceAssetId: id(va.sourceAsset),
      processingState: String(va.processingState ?? 'uploaded'),
      progress: Number(va.progress ?? 0),
      durationSeconds: va.metadata
        ? Number((va.metadata as { durationSeconds?: number }).durationSeconds ?? 0)
        : null,
      width: va.metadata ? Number((va.metadata as { width?: number }).width ?? 0) : null,
      height: va.metadata ? Number((va.metadata as { height?: number }).height ?? 0) : null,
      hasFastStartMp4,
      hasHls,
      hasPoster,
      hasContactSheet,
      captionsCount: captions.length,
      isPlayerReady,
      failure: failureObj?.message ?? null,
      cancelRequested: Boolean(va.cancelRequested),
      url: `/videos/${String(va.slug ?? va.id)}`,
    }
  })

  return {
    storage,
    worker,
    stats: {
      totalAssets: assets.length,
      totalBytes,
      variantSavingsBytes,
      variantSavingsPercent:
        totalBytes > 0
          ? Math.round((variantSavingsBytes / (totalBytes + variantSavingsBytes)) * 100)
          : 0,
      bytesByType,
      stateCounts,
      usageCounts,
      issueCounts,
    },
    recentSessions: sessions.slice(0, 10).map((s) => ({
      id: id(s.id),
      filename: String(s.filename ?? ''),
      size: Number(s.size ?? 0),
      chunks: Array.isArray(s.chunks) ? s.chunks.length : 0,
      state: String(s.state ?? 'uploading'),
      expiresAt: String(s.expiresAt ?? ''),
      createdAt: String(s.createdAt ?? ''),
    })),
    recentJobs: jobs.slice(0, 15).map((j) => ({
      id: id(j.id),
      task: String(j.task ?? 'task'),
      status: String(j.status ?? 'queued'),
      progress: Number(j.progress ?? 0),
      attempts: Number(j.attempts ?? 0),
      failure: (j.failure as { message?: string })?.message ?? null,
      createdAt: String(j.createdAt ?? ''),
      updatedAt: String(j.updatedAt ?? ''),
    })),
    recentFailures,
    assets: enrichedAssets,
    podcasts: {
      shows: podcastShows,
      episodes: podcastEpisodes,
    },
    videos: videoReadiness,
  }
}

/** Executes direct actions from the unified Media Command Center. */
export async function executeCommandCenterAction(
  payload: Payload,
  config: AppConfig,
  user: unknown,
  siteId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const scope = { kind: 'site' as const, siteId }

  switch (action) {
    case 'retry-job': {
      await assertMediaPermission(payload, user as never, scope, 'content.edit')
      const jobId = String(params.jobId ?? '')
      const job = await payload.findByID({
        collection: 'media-jobs' as never,
        id: jobId,
        depth: 0,
        overrideAccess: true,
      })
      if (!job) throw new MediaWorkflowError('Media job not found.')
      const input = (job as { input?: Record<string, unknown> }).input ?? {}
      const task = String((job as { task?: string }).task ?? 'media-variant-generate')

      const queued = await payload.jobs.queue({
        task: task as never,
        queue: 'media',
        input: {
          ...input,
          mediaJobId: jobId,
          idempotencyKey: `${input.idempotencyKey || jobId}:retry:${Date.now()}`,
        },
      } as never)

      await payload.update({
        collection: 'media-jobs' as never,
        id: jobId,
        data: { status: 'queued', progress: 0, failure: null } as never,
        overrideAccess: true,
      })

      return { retried: true, job: queued }
    }

    case 'cancel-job': {
      await assertMediaPermission(payload, user as never, scope, 'content.edit')
      const { jobId, videoAssetId, sessionId } = params

      if (videoAssetId) {
        await payload.update({
          collection: 'video-assets' as never,
          id: String(videoAssetId),
          data: { cancelRequested: true } as never,
          overrideAccess: true,
        })
        return { cancelled: true, target: 'video-asset' }
      }

      if (jobId) {
        await payload.update({
          collection: 'media-jobs' as never,
          id: String(jobId),
          data: { status: 'cancelled' } as never,
          overrideAccess: true,
        })
        return { cancelled: true, target: 'media-job' }
      }

      if (sessionId) {
        await payload.update({
          collection: 'media-upload-sessions' as never,
          id: String(sessionId),
          data: { state: 'aborted' } as never,
          overrideAccess: true,
        })
        return { cancelled: true, target: 'upload-session' }
      }

      throw new MediaWorkflowError('No valid cancellable target specified.')
    }

    case 'repair-metadata': {
      await assertMediaPermission(payload, user as never, scope, 'content.edit')
      const mediaId = String(params.mediaId ?? '')
      const updated = await updateMediaMetadata(payload, user as never, {
        mediaId,
        scope,
        title: typeof params.title === 'string' ? params.title : undefined,
        altText: typeof params.altText === 'string' ? params.altText : undefined,
        caption: typeof params.caption === 'string' ? params.caption : undefined,
        creatorCredit: typeof params.creatorCredit === 'string' ? params.creatorCredit : undefined,
        source: typeof params.source === 'string' ? params.source : undefined,
        licenseType: typeof params.licenseType === 'string' ? params.licenseType : undefined,
        licenseUrl: typeof params.licenseUrl === 'string' ? params.licenseUrl : undefined,
        rightsExpiresAt:
          typeof params.rightsExpiresAt === 'string' ? params.rightsExpiresAt : undefined,
      })
      return { repaired: true, media: updated }
    }

    case 'impact-preview': {
      await assertMediaPermission(payload, user as never, scope, 'content.read')
      const mediaId = String(params.mediaId ?? '')
      const impact = await previewReplacementImpact(payload, siteId, mediaId)
      return { impact }
    }

    case 'inspect-usages': {
      await assertMediaPermission(payload, user as never, scope, 'content.read')
      const mediaId = String(params.mediaId ?? '')
      const usages = await payload.find({
        collection: 'media-usages',
        where: {
          and: [{ site: { equals: siteId } }, { media: { equals: mediaId } }],
        },
        depth: 0,
        limit: 100,
        overrideAccess: true,
      })
      return {
        usages: usages.docs.map((u) => {
          const usage = u as unknown as Record<string, unknown>
          return {
            id: id(usage.id),
            targetType: String(usage.targetType ?? ''),
            targetId: String(usage.targetId ?? ''),
            field: String(usage.field ?? ''),
            slot: String(usage.slot ?? ''),
            lifecycle: String(usage.lifecycle ?? 'draft'),
            publication: usage.publication ? id(usage.publication) : null,
            purpose: String(usage.purpose ?? 'inline'),
          }
        }),
      }
    }

    case 'regenerate-variants': {
      await assertMediaPermission(payload, user as never, scope, 'content.edit')
      const mediaId = String(params.mediaId ?? '')
      const asset = await payload.findByID({
        collection: 'media-assets',
        id: mediaId,
        depth: 0,
        overrideAccess: true,
      })
      if (!asset) throw new MediaWorkflowError('Media asset not found.')

      if (asset.kind === 'video') {
        const videoAsset = await payload.find({
          collection: 'video-assets' as never,
          where: { sourceAsset: { equals: mediaId } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const firstDoc = videoAsset.docs[0] as { id?: string } | undefined
        if (firstDoc?.id) {
          const queued = await queueVideoProcessing(payload, String(firstDoc.id), true)
          return { queued: true, videoAssetId: firstDoc.id, job: queued }
        }
      }

      // Default: Image variants
      const queuedJob = await payload.jobs.queue({
        task: 'media-variant-generate',
        queue: 'media',
        input: {
          mediaAssetId: mediaId,
          idempotencyKey: `variants:${mediaId}:force:${Date.now()}`,
          recipeKeys: Array.isArray(params.recipeKeys) ? params.recipeKeys.map(String) : undefined,
        },
      } as never)

      return { queued: true, mediaId, job: queuedJob }
    }

    case 'archive-asset': {
      await assertMediaPermission(payload, user as never, scope, 'content.edit')
      const mediaId = String(params.mediaId ?? '')
      const updated = await payload.update({
        collection: 'media-assets',
        id: mediaId,
        data: {
          retentionMode: 'tombstone',
          processingState: 'archived',
        } as never,
        overrideAccess: true,
      })
      return { archived: true, id: id(updated.id) }
    }

    case 'delete-orphan': {
      await assertMediaPermission(payload, user as never, scope, 'content.edit')
      const mediaId = String(params.mediaId ?? '')
      await deleteOrphanedMedia(payload, config, user as never, {
        mediaId,
        scope,
      })
      return { deleted: true, id: mediaId }
    }

    case 'validate-feed': {
      await assertMediaPermission(payload, user as never, scope, 'content.read')
      const slug = String(params.slug ?? '')
      const feedRes = await fetch(`${config.appUrl}/podcasts/${slug}/feed.xml`)
      const xml = await feedRes.text()
      const validation = validatePodcastFeed(xml)
      return { valid: true, validation, status: feedRes.status }
    }

    default:
      throw new MediaWorkflowError(`Unknown command center action: ${action}`)
  }
}
