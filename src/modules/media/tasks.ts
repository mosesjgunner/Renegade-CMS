import { ownedEditSource, requireEdit } from '../creator-studio/media-edit-projects'
import type { TaskConfig } from 'payload'

import { loadConfig } from '../core/config'
import { migrateEpisodeEnclosure } from '../podcast-studio/import-media'
import {
  cleanupExpiredRecordings,
  DirectoryChunkStorage,
  finalizeRecordingFromStorage,
} from '../podcast-studio/recording/finalize'
import { runGuestConformJob } from '../podcast-studio/recording/conform-service'
import { renderProject } from '../podcast-studio/render/render-service'
import type { RenderProfileName } from '../podcast-studio/render/render'
import { runTranscriptionJob } from '../podcast-studio/intelligence/service'
import {
  TranscriptionError,
  createCommandTranscriptionProvider,
  createHttpTranscriptionProvider,
  fixtureTranscriptionProvider,
  transcriptionConfigFromEnv,
} from '../podcast-studio/intelligence/transcription'
import type { TrackDefinition } from '../podcast-studio/recording/multitrack'
import { generatePeaksForAsset } from './peaks'
import { processAssetVariants } from './variants'
import { createPublicMediaIncidents, reconcileMediaUsages } from './workflow'
import { processVideoAsset } from './video-workflow'

type MediaTask = {
  input: {
    mediaJobId?: string
    mediaAssetId?: string
    idempotencyKey: string
    recipeKeys?: string[]
  }
  output: { mediaJobId?: string; mediaAssetId?: string; completed: boolean; count?: number }
}
type ReconciliationTask = {
  input: { siteId: string }
  output: { created: number; updated: number; removed: number; incidents: number }
}

const task = (slug: string, label: string): TaskConfig<MediaTask> => ({
  slug,
  label,
  inputSchema: [
    { name: 'mediaJobId', type: 'text' },
    { name: 'mediaAssetId', type: 'text' },
    { name: 'idempotencyKey', type: 'text', required: true },
    { name: 'recipeKeys', type: 'json' },
  ],
  outputSchema: [
    { name: 'mediaJobId', type: 'text' },
    { name: 'mediaAssetId', type: 'text' },
    { name: 'completed', type: 'checkbox', required: true },
    { name: 'count', type: 'number' },
  ],
  // Sharp is CPU/memory intensive. Payload's per-asset concurrency key and
  // exponential retry prevent duplicate decodes and a transient object-store
  // failure from becoming a web-request failure.
  retries: { attempts: 4, backoff: { delay: 1_000, type: 'exponential' } },
  concurrency: ({ input }) =>
    `media.${slug}:${String(input.mediaAssetId || input.idempotencyKey || 'global')}`,
  handler: async ({ input, req }) => {
    // 1. Check job cancellation if mediaJobId is provided
    if (input.mediaJobId) {
      const job = await req.payload
        .findByID({
          collection: 'media-jobs' as never,
          id: input.mediaJobId,
          depth: 0,
        })
        .catch(() => null)

      if (!job || (job as { status?: string }).status === 'cancelled') {
        return {
          output: {
            mediaJobId: input.mediaJobId,
            mediaAssetId: input.mediaAssetId,
            completed: false,
          },
        }
      }

      await req.payload
        .update({
          collection: 'media-jobs' as never,
          id: input.mediaJobId,
          data: { status: 'running', progress: 20 } as never,
        })
        .catch(() => undefined)
    }

    // 2. Execute variant generation if mediaAssetId is provided
    let count = 0
    try {
      if (input.mediaAssetId) {
        // Check cancellation on deletion
        const asset = await req.payload
          .findByID({
            collection: 'media-assets',
            id: input.mediaAssetId,
            depth: 0,
          })
          .catch(() => null)

        if (!asset || (asset as { retentionMode?: string }).retentionMode === 'tombstone') {
          return {
            output: {
              mediaJobId: input.mediaJobId,
              mediaAssetId: input.mediaAssetId,
              completed: false,
            },
          }
        }

        const config = loadConfig()
        const results = await processAssetVariants(req.payload, config, input.mediaAssetId, {
          recipeKeys: input.recipeKeys,
        })
        count = results.length
      }

      // 3. Mark media-jobs completed if present
      if (input.mediaJobId) {
        await req.payload
          .update({
            collection: 'media-jobs' as never,
            id: input.mediaJobId,
            data: { status: 'completed', progress: 100, output: { variantCount: count } } as never,
          })
          .catch(() => undefined)
      }

      return {
        output: {
          mediaJobId: input.mediaJobId,
          mediaAssetId: input.mediaAssetId,
          completed: true,
          count,
        },
      }
    } catch (error) {
      if (input.mediaJobId) {
        await req.payload
          .update({
            collection: 'media-jobs' as never,
            id: input.mediaJobId,
            data: {
              status: 'retrying',
              failure: {
                message:
                  error instanceof Error
                    ? error.message.slice(0, 500)
                    : 'Variant processing failed.',
              },
            } as never,
          })
          .catch(() => undefined)
      }
      throw error
    }
  },
})

/**
 * Perf Pass 0, lane 05: recover media-variant jobs whose worker died after
 * claiming them. Payload's runner only claims rows with processing=false
 * and has no stale-claim timeout, so a worker killed mid-generation leaves
 * the job claimed forever — the asset's variants never finish, and the
 * idempotency check in queueAssetVariantGeneration keeps handing back the
 * same stuck job. Commerce already resets stale claims for its own tasks
 * (recoverStaleCommerceJobs); this is the media-queue equivalent, scoped
 * to media-variant-generate only.
 *
 * Safety: the stale threshold (15 min by default) is far longer than any
 * legitimate variant run, the task's per-asset concurrency key serializes
 * re-runs, and the handler preserves ready variants, so a reset can never
 * double-generate. The recovery budget is bounded by the task's own retry
 * attempts: each reset consumes one attempt (with the task's exponential
 * backoff as waitUntil), and a job that exhausts the budget is marked
 * hasError — terminal in Payload's claim query — instead of looping.
 */
export async function recoverStaleMediaVariantJobs(
  payload: {
    find: (...args: never[]) => Promise<{ docs: Record<string, unknown>[] }>
    update: (...args: never[]) => Promise<unknown>
    collections?: Record<string, unknown>
  },
  staleMs = 15 * 60_000,
): Promise<number> {
  if (!payload.collections?.['payload-jobs']) return 0
  const maxAttempts = 4 // mirrors the media task retries config above
  const threshold = new Date(Date.now() - staleMs).toISOString()
  const stale = await payload
    .find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: 'media-variant-generate' } },
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
    // Payload stores job errors as a JSON object ({ name, message, ... });
    // a plain string fails the field's validation and the update is lost.
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
                    'Media variant job abandoned: the worker died mid-run and the stale-claim recovery budget is exhausted.',
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
    // Only count recoveries that actually landed — a swallowed update
    // failure would otherwise masquerade as a working reconciler.
    if (updated) recovered++
  }
  return recovered
}

export const mediaTasks = [
  task('media-import', 'Media import'),
  task('media-render', 'Media rendering'),
  task('media-variant-generate', 'Generate media variants'),
  task('media-transcribe', 'Media transcription'),
  task('media-tts', 'Text-to-speech generation'),
  {
    slug: 'video-process',
    label: 'Process native video',
    inputSchema: [
      { name: 'videoAssetId', type: 'text', required: true },
      { name: 'idempotencyKey', type: 'text', required: true },
    ],
    outputSchema: [
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'count', type: 'number' },
    ],
    retries: { attempts: 4, backoff: { delay: 10_000, type: 'exponential' } },
    concurrency: () => 'media.video-process:global',
    handler: async ({
      input,
      req,
    }: {
      input: { videoAssetId: string }
      req: { payload: import('payload').Payload }
    }) => ({ output: await processVideoAsset(req.payload, loadConfig(), input.videoAssetId) }),
  } as unknown as TaskConfig<MediaTask>,
  {
    slug: 'media-usage-reconcile',
    label: 'Reconcile media usage graph',
    inputSchema: [{ name: 'siteId', type: 'text', required: true }],
    outputSchema: [
      { name: 'created', type: 'number', required: true },
      { name: 'updated', type: 'number', required: true },
      { name: 'removed', type: 'number', required: true },
      { name: 'incidents', type: 'number', required: true },
    ],
    retries: { attempts: 3, backoff: { delay: 1_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { siteId: string } }) =>
      `media.usage-reconcile:${input.siteId}`,
    handler: async ({
      input,
      req,
    }: {
      input: { siteId: string }
      req: { payload: import('payload').Payload }
    }) => {
      const reconciliation = await reconcileMediaUsages(req.payload, input.siteId)
      const incidents = await createPublicMediaIncidents(req.payload, input.siteId)
      if (reconciliation.failures.length)
        throw new Error(
          `Usage reconciliation left ${reconciliation.failures.length} rows unresolved.`,
        )
      return {
        output: {
          created: reconciliation.created,
          updated: reconciliation.updated,
          removed: reconciliation.removed,
          incidents: incidents.created,
        },
      }
    },
  } as TaskConfig<ReconciliationTask>,
  {
    // POD-02 (POD-REQ-06): fetch one imported episode's enclosure into
    // local media. Thin wrapper over migrateEpisodeEnclosure — the core
    // function owns the per-episode state machine and is directly
    // callable in tests and reconciliation. Deterministic per-item
    // failures (corrupt/short enclosure, non-audio bytes) are recorded on
    // the episode and returned as completed:false without throwing, so
    // retries are spent only on transient fetch/network errors, which
    // the core rethrows after marking the episode failed.
    slug: 'podcast-import-media',
    label: 'Migrate imported podcast enclosure',
    inputSchema: [
      { name: 'episodeId', type: 'text', required: true },
      { name: 'idempotencyKey', type: 'text', required: true },
    ],
    outputSchema: [
      { name: 'episodeId', type: 'text', required: true },
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'mediaAssetId', type: 'text' },
      { name: 'error', type: 'text' },
    ],
    retries: { attempts: 3, backoff: { delay: 5_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { episodeId: string } }) =>
      `media.podcast-import-media:${input.episodeId}`,
    handler: async ({
      input,
      req,
    }: {
      input: { episodeId: string; idempotencyKey: string }
      req: { payload: import('payload').Payload }
    }) => {
      const result = await migrateEpisodeEnclosure(req.payload as never, input.episodeId)
      return {
        output: {
          episodeId: input.episodeId,
          completed: result.completed,
          mediaAssetId: result.mediaAssetId,
          error: result.error,
        },
      }
    },
  } as unknown as TaskConfig<MediaTask>,
  {
    // POD-09 (POD-REQ-19/20): finalize one multitrack recording session
    // from a local chunk directory (the DirectoryChunkStorage layout the
    // POD-06 journal writes). Thin wrapper over
    // finalizeRecordingFromStorage — assembly is deterministic, so a
    // retried/interrupted finalize completes with byte-identical
    // outputs and no duplicate assets (checksum dedupe).
    slug: 'podcast-recording-finalize',
    label: 'Finalize multitrack podcast recording',
    inputSchema: [
      { name: 'sessionId', type: 'text', required: true },
      { name: 'sessionRecordId', type: 'text' },
      { name: 'siteId', type: 'text', required: true },
      { name: 'showId', type: 'text', required: true },
      { name: 'episodeId', type: 'text' },
      { name: 'storageRoot', type: 'text', required: true },
      { name: 'trackDefinitions', type: 'json', required: true },
      { name: 'markers', type: 'json' },
      { name: 'playedClipLog', type: 'json' },
      { name: 'sessionLog', type: 'json' },
      { name: 'idempotencyKey', type: 'text', required: true },
    ],
    outputSchema: [
      { name: 'recordingId', type: 'text', required: true },
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'state', type: 'text' },
      { name: 'episodeTransition', type: 'text' },
    ],
    retries: { attempts: 3, backoff: { delay: 5_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { sessionId: string } }) =>
      `media.podcast-recording-finalize:${input.sessionId}`,
    handler: async ({
      input,
      req,
    }: {
      input: {
        sessionId: string
        sessionRecordId?: string
        siteId: string
        showId: string
        episodeId?: string
        storageRoot: string
        trackDefinitions: TrackDefinition[]
        markers?: unknown[]
        playedClipLog?: unknown[]
        sessionLog?: unknown[]
        idempotencyKey: string
      }
      req: { payload: import('payload').Payload }
    }) => {
      const result = await finalizeRecordingFromStorage(req.payload as never, undefined, {
        sessionId: input.sessionId,
        sessionRecordId: input.sessionRecordId ?? null,
        siteId: input.siteId,
        showId: input.showId,
        episodeId: input.episodeId ?? null,
        storage: new DirectoryChunkStorage(input.storageRoot),
        trackDefinitions: input.trackDefinitions,
        markers: input.markers ?? [],
        playedClipLog: input.playedClipLog ?? [],
        sessionLog: input.sessionLog ?? [],
      })
      return {
        output: {
          recordingId: result.recordingId,
          completed: true,
          state: result.state,
          episodeTransition: result.episodeTransition,
        },
      }
    },
  } as unknown as TaskConfig<MediaTask>,
  {
    // POD-11 (POD-REQ-25): conform one guest's uploaded local track
    // onto the session timeline. Thin wrapper over conformGuestTrack —
    // the pure conform core computes the PT-F plan, ffmpeg applies
    // the rate correction, the fallback ladder guarantees a manifest
    // track for the guest in every outcome. Runs AFTER the POD-09
    // finalize for the session (it updates the finalized manifest).
    slug: 'podcast-conform-track',
    label: 'Conform guest local track to the session timeline',
    inputSchema: [
      { name: 'sessionRecordId', type: 'text', required: true },
      { name: 'inviteId', type: 'text', required: true },
      { name: 'storageRoot', type: 'text', required: true },
      { name: 'sessionFrames', type: 'number', required: true },
      { name: 'sampleRate', type: 'number' },
      { name: 'liveCapture', type: 'json' },
      { name: 'idempotencyKey', type: 'text', required: true },
    ],
    outputSchema: [
      { name: 'trackId', type: 'text', required: true },
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'state', type: 'text' },
      { name: 'mediaAssetId', type: 'text' },
    ],
    retries: { attempts: 3, backoff: { delay: 5_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { sessionRecordId: string; inviteId: string } }) =>
      `media.podcast-conform-track:${input.sessionRecordId}:${input.inviteId}`,
    handler: async ({
      input,
      req,
    }: {
      input: {
        sessionRecordId: string
        inviteId: string
        storageRoot: string
        sessionFrames: number
        sampleRate?: number
        liveCapture?: { definition: TrackDefinition; storageRoot: string } | null
        idempotencyKey: string
      }
      req: { payload: import('payload').Payload }
    }) => {
      const result = await runGuestConformJob(req.payload as never, undefined, {
        sessionRecordId: input.sessionRecordId,
        inviteId: input.inviteId,
        storage: new DirectoryChunkStorage(input.storageRoot),
        liveCapture: input.liveCapture
          ? {
              definition: input.liveCapture.definition,
              storage: new DirectoryChunkStorage(input.liveCapture.storageRoot),
            }
          : null,
        sessionFrames: input.sessionFrames,
        sampleRate: input.sampleRate,
      })
      return {
        output: {
          trackId: result.trackId,
          completed: true,
          state: result.decision.state,
          mediaAssetId: result.mediaAssetId ?? undefined,
        },
      }
    },
  } as unknown as TaskConfig<MediaTask>,
  {
    // POD-13 (POD-REQ-28/29): render one POD-12 edit project to a
    // publishable master. Thin wrapper over renderProject — the core
    // owns the ffmpeg graph, the loudness gate, idempotency (record
    // keyed by project+EDL hash+profile+range) and promotion, so a
    // retried or recovered job completes in place and never
    // duplicates assets. Deterministic failures (missing source,
    // loudness gate) are recorded on the render record by the core;
    // the handler returns completed:false for them instead of
    // burning retries, and rethrows only transient errors.
    slug: 'podcast-render',
    label: 'Render podcast edit project (EDL → master)',
    inputSchema: [
      { name: 'projectId', type: 'text', required: true },
      { name: 'profile', type: 'text' },
      { name: 'range', type: 'json' },
      { name: 'attachToEpisode', type: 'checkbox' },
      { name: 'faultAtStage', type: 'text' },
      { name: 'idempotencyKey', type: 'text', required: true },
    ],
    outputSchema: [
      { name: 'renderId', type: 'text' },
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'state', type: 'text' },
      { name: 'error', type: 'text' },
    ],
    retries: { attempts: 3, backoff: { delay: 5_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { projectId: string } }) =>
      `media.podcast-render:${input.projectId}`,
    handler: async ({
      input,
      req,
      job,
    }: {
      input: {
        projectId: string
        profile?: string
        range?: { startSec: number; durationSec: number }
        attachToEpisode?: boolean
        faultAtStage?: string
        idempotencyKey: string
      }
      req: { payload: import('payload').Payload }
      job?: { id: string | number }
    }) => {
      try {
        const result = await renderProject(req.payload as never, undefined, {
          projectId: input.projectId,
          profile: (input.profile as RenderProfileName | undefined) ?? 'master',
          range: input.range,
          attachToEpisode: input.attachToEpisode,
          faultAtStage: input.faultAtStage,
          jobId: job?.id != null ? String(job.id) : undefined,
        })
        return {
          output: { renderId: result.renderId, completed: true, state: result.state },
        }
      } catch (error) {
        const code = (error as { code?: string }).code ?? ''
        if (
          code === 'RENDER_SOURCE_MISSING' ||
          code === 'RENDER_LOUDNESS_GATE' ||
          code === 'RENDER_NO_AUDIBLE_LANES' ||
          code === 'RENDER_RANGE_EMPTY' ||
          code === 'RENDER_EXPORT_PROFILE_INVALID'
        ) {
          return {
            output: {
              completed: false,
              state: 'failed',
              error: error instanceof Error ? error.message.slice(0, 500) : 'Render failed.',
            },
          }
        }
        throw error
      }
    },
  } as unknown as TaskConfig<MediaTask>,
  {
    // POD-14 (POD-REQ-30): transcribe one media asset behind the
    // provider seam. Thin wrapper over runTranscriptionJob — the
    // service owns the media-jobs visibility record, the DRAFT
    // transcript-revision output and idempotency (asset + audio
    // checksum). Deterministic failures (provider not configured,
    // provider failed, audio missing) are recorded on the media-jobs
    // row by the service; the handler returns completed:false for
    // them instead of burning retries, and rethrows only transient
    // errors. A retry after a config fix completes in place.
    slug: 'podcast-transcribe',
    label: 'Transcribe podcast audio (provider seam → draft revision)',
    inputSchema: [
      { name: 'mediaAssetId', type: 'text', required: true },
      { name: 'episodeId', type: 'text' },
      { name: 'providerId', type: 'text' },
      { name: 'creatorSite', type: 'text' },
      { name: 'creatorMember', type: 'text' },
      { name: 'idempotencyKey', type: 'text', required: true },
    ],
    outputSchema: [
      { name: 'mediaJobId', type: 'text' },
      { name: 'transcriptRevisionId', type: 'text' },
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'error', type: 'text' },
    ],
    retries: { attempts: 3, backoff: { delay: 5_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { mediaAssetId: string } }) =>
      `media.podcast-transcribe:${input.mediaAssetId}`,
    handler: async ({
      input,
      req,
    }: {
      input: {
        mediaAssetId: string
        episodeId?: string
        providerId?: string
        creatorSite?: string
        creatorMember?: string
        idempotencyKey: string
      }
      req: { payload: import('payload').Payload }
    }) => {
      const creator =
        input.creatorSite && input.creatorMember
          ? { siteId: input.creatorSite, memberId: input.creatorMember }
          : null
      if (creator) {
        try {
          await requireEdit(req.payload, creator)
          await ownedEditSource(req.payload, creator, input.mediaAssetId)
        } catch {
          return { output: { completed: false, error: 'Creator transcription access expired.' } }
        }
      }
      const envConfig = transcriptionConfigFromEnv()
      const providerId = input.providerId ?? envConfig.providerId
      const provider =
        providerId === 'fixture-provider'
          ? fixtureTranscriptionProvider
          : providerId === 'command-provider'
            ? createCommandTranscriptionProvider({ command: envConfig.command })
            : providerId === 'http-provider'
              ? createHttpTranscriptionProvider({
                  endpoint: envConfig.endpoint,
                  apiKey: envConfig.apiKey,
                  fetchImpl: (url, options) =>
                    fetch(url, {
                      ...options,
                      redirect: 'error',
                      signal: AbortSignal.timeout(180_000),
                    }),
                  readBytes: async (filePath: string) => {
                    const { readFile } = await import('node:fs/promises')
                    return readFile(filePath)
                  },
                })
              : undefined
      try {
        const result = await runTranscriptionJob(req.payload as never, undefined, {
          mediaAssetId: input.mediaAssetId,
          episodeId: input.episodeId,
          provider,
          providerConfig: envConfig,
          ...(creator ? { creatorVideo: true, createdBy: creator.memberId } : {}),
        })
        return {
          output: {
            mediaJobId: result.mediaJobId,
            transcriptRevisionId: result.transcriptRevisionId ?? undefined,
            completed: true,
          },
        }
      } catch (error) {
        if (error instanceof TranscriptionError) {
          return {
            output: {
              completed: false,
              error: `${error.code}: ${error.message}`.slice(0, 500),
            },
          }
        }
        throw error
      }
    },
  } as unknown as TaskConfig<MediaTask>,
  {
    // POD-09 storage policy: expire raw multitrack recordings past
    // their retainUntil (episode published + the show's grace window,
    // default 30 days). DRY-RUN BY DEFAULT — the scheduled run and any
    // run without an explicit dryRun:false only counts and logs what
    // WOULD expire; deletion happens solely on an explicit real run.
    slug: 'podcast-recording-cleanup',
    label: 'Expire raw podcast multitrack recordings (dry-run by default)',
    inputSchema: [{ name: 'dryRun', type: 'checkbox' }],
    outputSchema: [
      { name: 'dryRun', type: 'checkbox', required: true },
      { name: 'scanned', type: 'number', required: true },
      { name: 'expired', type: 'number', required: true },
      { name: 'deleted', type: 'number', required: true },
      { name: 'observedAt', type: 'date', required: true },
    ],
    retries: { attempts: 2, backoff: { delay: 1_000, type: 'exponential' } },
    concurrency: () => 'media.podcast-recording-cleanup',
    schedule: [{ cron: '41 3 * * *', queue: 'media' }],
    handler: async ({
      input,
      req,
    }: {
      input: { dryRun?: boolean }
      req: { payload: import('payload').Payload }
    }) => {
      const result = await cleanupExpiredRecordings(req.payload as never, undefined, {
        dryRun: input?.dryRun !== false,
      })
      return {
        output: {
          dryRun: result.dryRun,
          scanned: result.scanned,
          expired: result.expired,
          deleted: result.deleted,
          observedAt: result.observedAt,
        },
      }
    },
  } as unknown as TaskConfig<MediaTask>,
  {
    // POD-08: server waveform peaks for one audio asset. Thin wrapper
    // over generatePeaksForAsset — idempotent per asset checksum, so
    // retries and duplicate queueing are harmless.
    slug: 'media-peaks',
    label: 'Generate waveform peaks',
    inputSchema: [
      { name: 'mediaAssetId', type: 'text', required: true },
      { name: 'idempotencyKey', type: 'text', required: true },
      { name: 'creatorSite', type: 'text' },
      { name: 'creatorMember', type: 'text' },
    ],
    outputSchema: [
      { name: 'mediaAssetId', type: 'text', required: true },
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'peakCount', type: 'number' },
    ],
    retries: { attempts: 3, backoff: { delay: 1_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { mediaAssetId: string } }) =>
      `media.media-peaks:${input.mediaAssetId}`,
    handler: async ({
      input,
      req,
    }: {
      input: {
        mediaAssetId: string
        idempotencyKey: string
        creatorSite?: string
        creatorMember?: string
      }
      req: { payload: import('payload').Payload }
    }) => {
      if (input.creatorSite && input.creatorMember) {
        const actor = { siteId: input.creatorSite, memberId: input.creatorMember }
        await requireEdit(req.payload, actor)
        await ownedEditSource(req.payload, actor, input.mediaAssetId)
      }
      const peaks = await generatePeaksForAsset(req.payload, loadConfig(), input.mediaAssetId)
      return {
        output: { mediaAssetId: input.mediaAssetId, completed: true, peakCount: peaks.min.length },
      }
    },
  } as unknown as TaskConfig<MediaTask>,
  {
    slug: 'audio-recipe-task',
    label: 'Process audio recipe and loudness',
    inputSchema: [
      { name: 'mediaAssetId', type: 'text', required: true },
      { name: 'recipeKey', type: 'text' },
      { name: 'idempotencyKey', type: 'text', required: true },
    ],
    outputSchema: [
      { name: 'mediaAssetId', type: 'text', required: true },
      { name: 'completed', type: 'checkbox', required: true },
      { name: 'loudness', type: 'json' },
    ],
    retries: { attempts: 3, backoff: { delay: 1_000, type: 'exponential' } },
    concurrency: ({ input }: { input: { mediaAssetId: string } }) =>
      `media.audio-recipe:${input.mediaAssetId}`,
    handler: async ({
      input,
      req,
    }: {
      input: { mediaAssetId: string; recipeKey?: string; idempotencyKey: string }
      req: { payload: import('payload').Payload }
    }) => {
      const config = loadConfig()
      const { processAudioRecipe } = await import('./audio')
      const metadata = await processAudioRecipe(
        req.payload,
        config,
        input.mediaAssetId,
        input.recipeKey || 'podcast-standard-lufs16',
      )
      return {
        output: {
          mediaAssetId: input.mediaAssetId,
          completed: true,
          loudness: metadata.loudness,
        },
      }
    },
  } as unknown as TaskConfig<MediaTask>,
]
