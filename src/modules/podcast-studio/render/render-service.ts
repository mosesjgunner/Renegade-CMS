/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-13 (POD-REQ-28, POD-REQ-29) — render service (Payload layer).
 *
 * The thin service over the render core in render.ts, following the
 * POD-09 finalizer pattern:
 *
 * - Resolves a POD-12 edit project's EDL sources to local files
 *   (media-asset bytes materialised to a temp dir through the media
 *   storage layer; `file` sources read from disk). A source whose
 *   asset is gone fails the render with the core's named
 *   `RENDER_SOURCE_MISSING` error BEFORE anything is registered.
 * - Idempotency: the render record's key is SHA-256 over
 *   project + EDL hash + profile + range. A completed render for the
 *   key is returned as-is (no re-render, no duplicate assets); a
 *   failed/interrupted render retries IN PLACE on the same record.
 * - Promotion discipline: outputs register as media assets (POD-02
 *   blob/asset checksum dedupe) ONLY after the core returns a
 *   gate-passing result. A failed render — missing source, loudness
 *   gate, worker killed mid-render via the fault hook — registers
 *   nothing and leaves the record `failed` with the named error (and
 *   the gate measurements when the gate refused the master).
 * - Attach (master profile, episode-bound projects): the MP3 becomes
 *   the episode's audio through POD-04's `replaceEpisodeAudio` (GUID
 *   preserved, enclosure refreshed), the episode's canonical chapter
 *   list is synced from the rendered EDL chapters (so feed chapters,
 *   the MP3's ID3 CHAP frames and the Podcast JSON sidecar all read
 *   the SAME list — the POD-01 agreement property), render
 *   provenance is stored on the episode, and an episode in `editing`
 *   moves to `review` through the POD-04 guarded state machine.
 *   Publishing itself stays behind POD-04's approval gate.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { loadConfig, type AppConfig } from '../../core/config'
import { AUDIO_ENGINE_MISSING, AUDIO_ENGINE_MISSING_MESSAGE } from '../../media/ffmpeg'
import { ensureAudioEngine } from '../../media/audio-engine-guard'
import type { MediaPublishingStore } from '../../media/publishing'
import { mediaObjectKey, mediaStorage, type MediaStorage } from '../../media/storage'
import { edlHash } from '../edit/edl-engine'
import { loadEditProjectRecord } from '../edit/projects-service'
import { replaceEpisodeAudio, transitionProductionState } from '../production'
import {
  PodcastRenderError,
  PODCAST_RENDER_RECIPE,
  probeAudioFile,
  renderEdlToFiles,
  resolveExportProfile,
  renderTemplate,
  slugifyTemplatePart,
  type RenderProfileName,
  type RenderResult,
  type RenderSourceFile,
} from './render'

export const PODCAST_RENDER_COLLECTION = 'podcast-renders'
export const PODCAST_RENDER_TASK = 'podcast-render'

type Doc = Record<string, any>
const relationId = (value: unknown): string =>
  typeof value === 'string' ? value : String((value as Doc)?.id ?? '')

export type RenderProjectInput = {
  projectId: string
  profile?: RenderProfileName
  range?: { startSec: number; durationSec: number }
  /** Attach a completed master to the bound episode (default: true for master). */
  attachToEpisode?: boolean
  jobId?: string
  /** Test seam: stage name at which a simulated worker kill throws (see render.ts faultHook). */
  faultAtStage?: string
  faultHook?: (stage: string) => Promise<void> | void
  /** POD-14 cleanup chain options forwarded to the render graph. */
  cleanup?: import('../intelligence/cleanup').CleanupOptions
  /** Audio pass — per-lane denoise default forwarded to the render graph. */
  denoise?: { enabled: boolean; strengthDb?: number; floorDb?: number }
  /** Audio pass — per-speaker leveling forwarded to the render core. */
  leveling?: import('./leveling').LevelingOptions
  /**
   * POD-21: range-retimed SRT burned into an audiogram render (see
   * render.ts `captionsSrt`). Part of the idempotency key — a
   * captioned render never dedupes against the uncaptioned one.
   */
  captionsSrt?: string | null
}

export type RenderProjectResult = {
  renderId: string
  state: 'completed' | 'failed'
  deduplicated: boolean
  idempotencyKey: string
  edlHash: string
  outputs: Record<string, any>
  report: Record<string, any> | null
  episodeTransition: string
}

export const renderIdempotencyKey = (
  projectId: string,
  hash: string,
  profile: RenderProfileName,
  range?: { startSec: number; durationSec: number },
  captions = false,
): string =>
  createHash('sha256')
    .update(
      `${projectId}|${hash}|${profile}|${range ? `${range.startSec}:${range.durationSec}` : 'full'}${captions ? '|captions' : ''}`,
    )
    .digest('hex')

// ---------------------------------------------------------------------------
// Media asset resolution / registration (POD-02 + POD-09 patterns)
// ---------------------------------------------------------------------------

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/json': 'json',
}

async function loadAssetBytes(
  payload: MediaPublishingStore,
  storage: MediaStorage,
  assetId: string,
): Promise<{ asset: Doc; bytes: Uint8Array } | null> {
  const asset = await payload
    .findByID({ collection: 'media-assets', id: assetId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!asset) return null
  let key = String(asset.storageLocation || '')
  if (asset.originalBlob) {
    const blob = await payload
      .findByID({
        collection: 'media-blobs',
        id: relationId(asset.originalBlob),
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (blob?.storageKey) key = String(blob.storageKey)
  }
  if (key.startsWith('local://')) key = key.slice('local://'.length)
  const bytes = key ? await storage.get(key).catch(() => undefined) : undefined
  if (!bytes) return null
  return { asset, bytes }
}

/** Registers rendered bytes as a media asset (site+checksum blob dedupe, POD-09 pattern). */
export async function storeRenderAsset(
  payload: MediaPublishingStore,
  config: AppConfig,
  input: {
    siteId: string
    title: string
    kind: 'audio' | 'video' | 'document' | 'image'
    mimeType: string
    filename: string
    bytes: Uint8Array
    checksumSha256: string
    durationSec?: number
  },
): Promise<string> {
  const storage = mediaStorage(config)
  const prefixedChecksum = `sha256:${input.checksumSha256}`
  const scope = { site: input.siteId, publication: null, space: null }
  const knownBlobs = await payload
    .find({
      collection: 'media-blobs',
      where: {
        and: [{ site: { equals: input.siteId } }, { checksum: { equals: prefixedChecksum } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  let blob = knownBlobs.docs[0]
  if (!blob) {
    const extension = EXTENSION_BY_MIME[input.mimeType] ?? 'bin'
    const key = mediaObjectKey(input.siteId, extension)
    await storage.put(key, input.bytes, input.mimeType)
    try {
      blob = await payload.create({
        collection: 'media-blobs',
        data: {
          ...scope,
          checksum: prefixedChecksum,
          storageKey: key,
          storageProvider: storage.provider,
          mimeType: input.mimeType,
          sizeBytes: input.bytes.byteLength,
          state: 'ready',
        },
        overrideAccess: true,
      })
    } catch (error) {
      await storage.remove(key).catch(() => undefined)
      throw error
    }
  } else {
    const existingBytes = await storage.get(String(blob.storageKey)).catch(() => undefined)
    if (!existingBytes) await storage.put(String(blob.storageKey), input.bytes, input.mimeType)
  }
  const knownAssets = await payload
    .find({
      collection: 'media-assets',
      where: {
        and: [{ site: { equals: input.siteId } }, { originalBlob: { equals: relationId(blob) } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  const existing = knownAssets.docs[0]
  if (existing) return relationId(existing)
  const asset = await payload.create({
    collection: 'media-assets',
    data: {
      ...scope,
      owner: null,
      title: input.title,
      kind: input.kind,
      storageLocation: String(blob.storageKey),
      storageProvider: storage.provider,
      originalBlob: relationId(blob),
      originalFilename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      checksum: prefixedChecksum,
      durationSeconds: input.durationSec,
    },
    overrideAccess: true,
  })
  return relationId(asset)
}

// ---------------------------------------------------------------------------
// The render job core (the `podcast-render` task is a thin wrapper)
// ---------------------------------------------------------------------------

export async function renderProject(
  payload: MediaPublishingStore,
  config: AppConfig | undefined,
  input: RenderProjectInput,
): Promise<RenderProjectResult> {
  const resolvedConfig = config ?? loadConfig()
  const profile: RenderProfileName = input.profile ?? 'master'
  const project = await loadEditProjectRecord(payload as never, input.projectId)
  if (!project)
    throw new PodcastRenderError(
      'RENDER_PROJECT_NOT_FOUND',
      `Edit project ${input.projectId} not found.`,
    )
  const hash = edlHash(project.project.edl)
  const idempotencyKey = renderIdempotencyKey(
    input.projectId,
    hash,
    profile,
    input.range,
    Boolean(input.captionsSrt?.trim()),
  )

  const existing = await payload
    .find({
      collection: PODCAST_RENDER_COLLECTION,
      where: { idempotencyKey: { equals: idempotencyKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .then((found) => found.docs[0] ?? null)
    .catch(() => null)
  if (existing && existing.state === 'completed') {
    return {
      renderId: relationId(existing),
      state: 'completed',
      deduplicated: true,
      idempotencyKey,
      edlHash: hash,
      outputs: (existing.outputs as Record<string, any>) ?? {},
      report: (existing.report as Record<string, any>) ?? null,
      episodeTransition: 'already-attached',
    }
  }

  const show = await payload
    .findByID({ collection: 'podcast-shows', id: project.showId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const episode = project.project.episodeId
    ? await payload
        .findByID({
          collection: 'podcast-episodes',
          id: project.project.episodeId,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
    : null

  const recordData: Doc = {
    site: project.siteId,
    show: project.showId,
    project: input.projectId,
    episode: project.project.episodeId ?? null,
    profile,
    state: 'rendering',
    idempotencyKey,
    edlHash: hash,
    edlVersion: project.project.edl.version,
    range: input.range ?? null,
    jobId: input.jobId ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    errorMessage: null,
  }
  const record = existing
    ? await payload.update({
        collection: PODCAST_RENDER_COLLECTION,
        id: relationId(existing),
        data: recordData,
        overrideAccess: true,
      })
    : await payload.create({
        collection: PODCAST_RENDER_COLLECTION,
        data: recordData,
        overrideAccess: true,
      })
  const renderId = relationId(record)

  const storage = mediaStorage(resolvedConfig)
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-podcast-render-'))
  try {
    // Fail-soft preflight: no ffmpeg work (source probing included)
    // starts when the audio engine is missing. Thrown inside the try so
    // the catch below records it on the render record as the named
    // deterministic failure AUDIO_ENGINE_MISSING, exactly like
    // RENDER_SOURCE_MISSING — no spawn error ever surfaces.
    await ensureAudioEngine().catch(() => {
      throw new PodcastRenderError(AUDIO_ENGINE_MISSING, AUDIO_ENGINE_MISSING_MESSAGE)
    })
    // Resolve sources to local files.
    const sources: RenderSourceFile[] = []
    for (const source of project.project.edl.sources) {
      const assetId = source.mediaAssetId ?? source.assetId
      if (assetId) {
        const loaded = await loadAssetBytes(payload, storage, assetId)
        if (!loaded)
          throw new PodcastRenderError(
            'RENDER_SOURCE_MISSING',
            `EDL source "${source.id}" references media asset ${assetId}, which is missing or whose bytes are unavailable — no render was started and nothing was registered.`,
          )
        const extension = EXTENSION_BY_MIME[String(loaded.asset.mimeType ?? 'audio/wav')] ?? 'wav'
        const filePath = path.join(workDir, `source-${source.id}.${extension}`)
        await writeFile(filePath, loaded.bytes)
        const probe = await probeAudioFile(filePath)
        sources.push({
          sourceId: source.id,
          path: filePath,
          channels: probe.channels || 1,
          sampleRate: probe.sampleRate || project.project.edl.sessionRate,
          origin: `media asset ${assetId}`,
        })
      } else if (source.file) {
        const probe = await probeAudioFile(source.file).catch(() => null)
        if (!probe)
          throw new PodcastRenderError(
            'RENDER_SOURCE_MISSING',
            `EDL source "${source.id}" references file ${source.file}, which is missing — no render was started and nothing was registered.`,
          )
        sources.push({
          sourceId: source.id,
          path: source.file,
          channels: probe.channels || 1,
          sampleRate: probe.sampleRate || project.project.edl.sessionRate,
          origin: `file ${source.file}`,
        })
      }
    }

    // Artwork (episode first, then show) for MP3 embedding / audiograms.
    let artworkPath: string | null = null
    const artworkId = relationId(episode?.artwork) || relationId(show?.artwork)
    if (artworkId) {
      const loaded = await loadAssetBytes(payload, storage, artworkId).catch(() => null)
      if (loaded) {
        const extension = EXTENSION_BY_MIME[String(loaded.asset.mimeType ?? 'image/jpeg')] ?? 'jpg'
        artworkPath = path.join(workDir, `artwork.${extension}`)
        await writeFile(artworkPath, loaded.bytes)
      }
    }

    // Export profile + tags from the show's templating.
    const exportProfile = resolveExportProfile(show?.exportProfile)
    const context: Record<string, string> = {
      'show-title': String(show?.title ?? ''),
      'show-slug': String(show?.slug ?? ''),
      'episode-title': String(episode?.title ?? project.title),
      'episode-slug': String(episode?.slug ?? slugifyTemplatePart(project.title)),
      'episode-number': episode?.episodeNumber != null ? String(episode.episodeNumber) : '',
      date: new Date().toISOString().slice(0, 10),
    }
    const outputName = slugifyTemplatePart(renderTemplate(exportProfile.filenameTemplate, context))
    const tags = {
      title: renderTemplate(exportProfile.titleTemplate, context),
      artist: renderTemplate(exportProfile.artistTemplate, context),
      album: renderTemplate(exportProfile.albumTemplate, context),
      description:
        renderTemplate(exportProfile.descriptionTemplate, {
          ...context,
          'episode-description': String(episode?.description ?? episode?.body ?? ''),
        }) || undefined,
      date: context.date,
      track: context['episode-number'] || undefined,
    }

    const faultHook =
      input.faultHook ??
      (input.faultAtStage
        ? async (stage: string) => {
            if (stage === input.faultAtStage)
              throw new PodcastRenderError(
                'RENDER_INTERRUPTED',
                `Render interrupted at stage "${stage}" (simulated worker kill). No master was promoted; retry the job to complete the render.`,
              )
          }
        : undefined)

    const result: RenderResult = await renderEdlToFiles({
      edl: project.project.edl,
      sources,
      workDir,
      profile,
      range: input.range,
      tags,
      artworkPath,
      outputName,
      mp3BitrateKbps: exportProfile.mp3BitrateKbps,
      opusBitrateKbps: exportProfile.opusBitrateKbps,
      cleanup: input.cleanup,
      // Audio pass defaults: a master render a user touches nothing
      // on gets per-lane denoise (conservative preset) and per-speaker
      // leveling. Callers can disable or tune both per render; other
      // profiles keep the previous behaviour unless asked.
      denoise:
        input.denoise ??
        (profile === 'master' ? { enabled: true, strengthDb: 9, floorDb: -55 } : undefined),
      leveling: input.leveling ?? (profile === 'master' ? { enabled: true } : undefined),
      captionsSrt: input.captionsSrt ?? null,
      faultHook,
    })

    // Promotion: register outputs only now that the gate has passed.
    const { readFile } = await import('node:fs/promises')
    const outputs: Record<string, any> = {}
    const kindByKey: Record<string, 'audio' | 'video' | 'document'> = {
      wavMaster: 'audio',
      mp3: 'audio',
      opus: 'audio',
      chaptersJson: 'document',
      audiogramMp4: 'video',
    }
    for (const [key, file] of Object.entries(result.outputs)) {
      if (!file) continue
      const bytes = await readFile(file.path)
      const mediaAssetId = await storeRenderAsset(payload, resolvedConfig, {
        siteId: project.siteId,
        title: `${project.title} — ${key} (${profile})`,
        kind: kindByKey[key] ?? 'audio',
        mimeType: file.mimeType,
        filename: file.filename,
        bytes,
        checksumSha256: file.checksumSha256,
        durationSec: file.durationSec,
      })
      outputs[key] = {
        mediaAssetId,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksumSha256: file.checksumSha256,
        durationSec: file.durationSec,
      }
    }

    // POD-21: the caption variant is recorded on the audiogram output
    // entry itself, so the asset's provenance says which variant it is.
    if (outputs.audiogramMp4) outputs.audiogramMp4.captionsBurnedIn = result.captionsBurnedIn

    const report: Record<string, any> = {
      recipe: PODCAST_RENDER_RECIPE,
      durationSec: result.durationSec,
      frames: result.frames,
      sampleRate: result.sampleRate,
      channels: result.channels,
      loudnessTarget: result.loudnessTarget,
      pass1: result.pass1,
      measurements: result.measurements,
      gate: result.gate,
      chapters: result.chapters,
      captionsBurnedIn: result.captionsBurnedIn,
      leveling: result.leveling,
      audioHealth: result.audioHealth,
      filterGraph: result.filterGraph,
      approximations: result.approximations,
      loudnormLinearFallback: result.loudnormLinearFallback,
      exportProfile,
      renderedAt: new Date().toISOString(),
    }

    // Attach a master to its episode through the POD-04 publish path.
    let episodeTransition = 'not-bound'
    const shouldAttach =
      profile === 'master' &&
      input.attachToEpisode !== false &&
      Boolean(project.project.episodeId) &&
      Boolean(outputs.mp3)
    if (shouldAttach && episode) {
      await replaceEpisodeAudio(payload as never, String(episode.id), outputs.mp3.mediaAssetId)
      const provenance = {
        renderId,
        edlHash: hash,
        edlVersion: project.project.edl.version,
        projectVersion:
          project.project.versions[project.project.versions.length - 1]?.version ?? null,
        recipe: PODCAST_RENDER_RECIPE,
        profile,
        loudnessTarget: result.loudnessTarget,
        measurements: result.measurements,
        chaptersSource: 'edl',
        renderedAt: report.renderedAt,
        jobId: input.jobId ?? null,
        outputs: Object.fromEntries(
          Object.entries(outputs).map(([key, value]) => [key, value.mediaAssetId]),
        ),
        masterChecksumSha256: outputs.wavMaster?.checksumSha256 ?? null,
      }
      await payload.update({
        collection: 'podcast-episodes',
        id: String(episode.id),
        data: {
          chapters: result.chapters.map((chapter) => ({
            startTime: chapter.startTime,
            title: chapter.title,
          })),
          renderProvenance: provenance,
        },
        overrideAccess: true,
      })
      const state = String(episode.productionState ?? 'idea')
      if (state === 'editing') {
        await transitionProductionState(payload as never, String(episode.id), 'review')
        episodeTransition = 'editing-to-review'
      } else {
        episodeTransition = `left-in-${state}`
      }
    } else if (project.project.episodeId) {
      episodeTransition = 'not-attached'
    }

    await payload.update({
      collection: PODCAST_RENDER_COLLECTION,
      id: renderId,
      data: {
        state: 'completed',
        report,
        outputs,
        finishedAt: new Date().toISOString(),
        errorMessage: null,
      },
      overrideAccess: true,
    })

    return {
      renderId,
      state: 'completed',
      deduplicated: false,
      idempotencyKey,
      edlHash: hash,
      outputs,
      report,
      episodeTransition,
    }
  } catch (error) {
    const renderError =
      error instanceof PodcastRenderError
        ? error
        : new PodcastRenderError(
            'RENDER_FAILED',
            error instanceof Error ? error.message : 'Podcast render failed.',
          )
    await payload
      .update({
        collection: PODCAST_RENDER_COLLECTION,
        id: renderId,
        data: {
          state: 'failed',
          errorMessage: `${renderError.code}: ${renderError.message}`.slice(0, 2000),
          finishedAt: new Date().toISOString(),
          ...(renderError.measurements
            ? {
                report: {
                  recipe: PODCAST_RENDER_RECIPE,
                  gate: { enforced: true, passed: false },
                  measurements: renderError.measurements,
                },
              }
            : {}),
        },
        overrideAccess: true,
      })
      .catch(() => undefined)
    throw renderError
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// Queueing + stale-claim recovery (media-task patterns)
// ---------------------------------------------------------------------------

/** Enqueues the render task for one project render, deduplicated by the render idempotency key. */
export async function queuePodcastRenderTask(
  payload: MediaPublishingStore & {
    jobs: { queue: (args: any) => Promise<{ id: string | number }> }
  },
  input: {
    projectId: string
    edlHash: string
    profile?: RenderProfileName
    range?: { startSec: number; durationSec: number }
    attachToEpisode?: boolean
  },
): Promise<{ id: string; queued: boolean; idempotencyKey: string }> {
  const profile = input.profile ?? 'master'
  const idempotencyKey = renderIdempotencyKey(input.projectId, input.edlHash, profile, input.range)
  const existing = await payload
    .find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: PODCAST_RENDER_TASK } },
          { 'input.idempotencyKey': { equals: idempotencyKey } },
        ],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  const active = existing.docs.find((job) => !job.hasError && !job.completedAt)
  if (active) return { id: String(active.id), queued: false, idempotencyKey }
  const job = await payload.jobs.queue({
    task: PODCAST_RENDER_TASK,
    queue: 'media',
    input: {
      projectId: input.projectId,
      profile,
      range: input.range,
      attachToEpisode: input.attachToEpisode,
      idempotencyKey,
    },
  } as never)
  return { id: String(job.id), queued: true, idempotencyKey }
}

/**
 * Recovers `podcast-render` jobs whose worker died after claiming
 * them — the media stale-claim pattern of
 * `recoverStaleMediaVariantJobs`, scoped to this task: a stale claim
 * is reset for a retry (consuming one attempt against the task's
 * retry budget) or marked hasError once the budget is exhausted.
 * A recovered render is safe to re-run: the render record's
 * idempotency key makes the retry complete in place with no
 * duplicate assets.
 */
export async function recoverStalePodcastRenderJobs(
  payload: {
    find: (...args: never[]) => Promise<{ docs: Record<string, unknown>[] }>
    update: (...args: never[]) => Promise<unknown>
    collections?: Record<string, unknown>
  },
  staleMs = 30 * 60_000,
): Promise<number> {
  if (!payload.collections?.['payload-jobs']) return 0
  const maxAttempts = 3 // mirrors the podcast-render task retries config
  const threshold = new Date(Date.now() - staleMs).toISOString()
  const stale = await payload
    .find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: PODCAST_RENDER_TASK } },
          { processing: { equals: true } },
          { updatedAt: { less_than_equal: threshold } },
          { completedAt: { exists: false } },
        ],
      },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!stale) return 0

  let recovered = 0
  for (const job of stale.docs) {
    const totalTried = Number(job.totalTried ?? 0)
    const updated = await payload
      .update({
        collection: 'payload-jobs',
        id: job.id,
        data:
          totalTried >= maxAttempts
            ? {
                processing: false,
                hasError: true,
                error: {
                  name: 'StaleClaimRecoveryExhausted',
                  message:
                    'Podcast render job abandoned: the worker died mid-render and the stale-claim recovery budget is exhausted.',
                },
              }
            : {
                processing: false,
                totalTried: totalTried + 1,
                waitUntil: new Date(Date.now() + 1_000 * 2 ** totalTried).toISOString(),
              },
        overrideAccess: true,
      } as never)
      .then(() => true)
      .catch(() => false)
    if (updated) recovered++
  }
  return recovered
}
