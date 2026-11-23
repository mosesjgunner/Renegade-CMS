/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-14 (POD-REQ-30, POD-REQ-31) — intelligence service (Payload layer).
 *
 * Transcription: `runTranscriptionJob` resolves the episode/recording
 * audio asset to a temp file, runs the configured provider behind the
 * seam in transcription.ts, and lands the result as a DRAFT
 * transcript-revision (`reviewState: 'draft'`, source 'provider')
 * that is NOT linked from the episode. A `media-jobs` row (kind
 * 'transcribe') tracks the run: queued → running → completed/failed
 * with the failure's named code + message — visible and retryable
 * (re-running with a fixed config completes in place; the
 * idempotency key is media asset + audio checksum).
 *
 * Publish-flow integrity: the POD-01 transcript routes and the
 * episode page serve ONLY the revision linked from
 * `episode.transcript`. A draft revision changes nothing public
 * until `acceptTranscriptRevision` — an explicit user action — marks
 * it reviewed and links it. Draft revisions are editable
 * (`editTranscriptRevision`); reviewed revisions are immutable.
 *
 * Assists: `generateAssistDrafts` builds draft rows in
 * `podcast-assist-drafts` from the episode's REVIEWED transcript.
 * `acceptAssistDraft` is the only path that writes an episode:
 * chapters → the canonical chapter list, show-notes/summary → the
 * episode's showNotes json. Highlights accept into clip definitions
 * (POD-13 consumes them); audiograms render through POD-13's
 * audiogram profile into a media draft attached to the episode —
 * the episode itself is never touched by a render.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { loadConfig, type AppConfig } from '../../core/config'
import { transcriptChecksum } from '../../media/contracts'
import { resolveFfmpegBinary } from '../../media/ffmpeg'
import type { MediaPublishingStore } from '../../media/publishing'
import { mediaStorage, type MediaStorage } from '../../media/storage'
import { renderProject } from '../render/render-service'
import {
  draftShowNotes,
  extractHighlights,
  maybeEnhance,
  suggestChapters,
  type AssistKind,
  type HighlightClip,
  type TextAssistEnhancer,
} from './assists'
import { normalizeChapters, type ManagedChapter } from './chapters'
import { probeDurationSec } from './cleanup'
import {
  TranscriptionError,
  resolveTranscriptionProvider,
  segmentsToClipSrt,
  transcriptionConfigFromEnv,
  type TimedSegment,
  type TranscriptionConfig,
  type TranscriptionProvider,
} from './transcription'

export const PODCAST_ASSIST_DRAFTS_COLLECTION = 'podcast-assist-drafts'
export const PODCAST_TRANSCRIBE_TASK = 'podcast-transcribe'

type Doc = Record<string, any>
const relationId = (value: unknown): string =>
  typeof value === 'string' ? value : String((value as Doc)?.id ?? '')

export class PodcastIntelligenceError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PodcastIntelligenceError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Asset resolution (POD-02/POD-13 pattern)
// ---------------------------------------------------------------------------

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
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

// ---------------------------------------------------------------------------
// Transcription job
// ---------------------------------------------------------------------------

export const transcriptionIdempotencyKey = (mediaAssetId: string, audioChecksum: string) =>
  `transcribe:${mediaAssetId}:${createHash('sha256').update(audioChecksum).digest('hex').slice(0, 24)}`

export type TranscriptionJobResult = {
  mediaJobId: string
  state: 'completed' | 'failed'
  transcriptRevisionId: string | null
  providerId: string
  language: string | null
  segmentCount: number
  deduplicated: boolean
  error: { code: string; message: string } | null
}

async function findMediaJob(payload: MediaPublishingStore, idempotencyKey: string) {
  const found = await payload
    .find({
      collection: 'media-jobs',
      where: { idempotencyKey: { equals: idempotencyKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  return (found.docs[0] as Doc | undefined) ?? null
}

export async function runTranscriptionJob(
  payload: MediaPublishingStore,
  config: AppConfig | undefined,
  input: {
    mediaAssetId: string
    episodeId?: string
    provider?: TranscriptionProvider
    providerConfig?: TranscriptionConfig
    createdBy?: string
    creatorVideo?: boolean
  },
): Promise<TranscriptionJobResult> {
  const appConfig = config ?? loadConfig()
  const storage = mediaStorage(appConfig)
  const loaded = await loadAssetBytes(payload, storage, input.mediaAssetId)
  if (!loaded)
    throw new TranscriptionError(
      'TRANSCRIPTION_AUDIO_MISSING',
      `Media asset "${input.mediaAssetId}" has no readable bytes to transcribe.`,
    )
  const audioChecksum = createHash('sha256').update(loaded.bytes).digest('hex')
  const idempotencyKey =
    transcriptionIdempotencyKey(input.mediaAssetId, audioChecksum) +
    (input.creatorVideo
      ? `:creator-audio:${input.provider?.id ?? input.providerConfig?.providerId ?? 'configured'}`
      : '')

  const existing = await findMediaJob(payload, idempotencyKey)
  if (existing && existing.status === 'completed' && existing.output?.transcriptRevisionId) {
    return {
      mediaJobId: String(existing.id),
      state: 'completed',
      transcriptRevisionId: String(existing.output.transcriptRevisionId),
      providerId: String(existing.output.providerId ?? ''),
      language: existing.output.language ?? null,
      segmentCount: Number(existing.output.segmentCount ?? 0),
      deduplicated: true,
      error: null,
    }
  }

  const provider =
    input.provider ??
    resolveTranscriptionProvider(input.providerConfig ?? transcriptionConfigFromEnv(), {
      readBytes: async (filePath) => {
        const { readFile } = await import('node:fs/promises')
        return readFile(filePath)
      },
    })

  const jobData = {
    title: `Transcribe media asset ${input.mediaAssetId}`,
    kind: 'transcribe',
    idempotencyKey,
    input: {
      mediaAssetId: input.mediaAssetId,
      ...(input.episodeId ? { episodeId: input.episodeId } : {}),
      providerId: provider.id,
      audioChecksum,
    },
  }
  const job = existing
    ? await payload.update({
        collection: 'media-jobs',
        id: String(existing.id),
        data: { ...jobData, status: 'running', progress: 10, failure: null },
        overrideAccess: true,
      } as never)
    : await payload.create({
        collection: 'media-jobs',
        data: { ...jobData, status: 'running', progress: 10 },
        overrideAccess: true,
      } as never)

  const fail = async (error: TranscriptionError): Promise<never> => {
    await payload
      .update({
        collection: 'media-jobs',
        id: String((job as Doc).id),
        data: {
          status: 'failed',
          progress: 0,
          failure: { code: error.code, message: error.message.slice(0, 500) },
          output: { providerId: provider.id },
        },
        overrideAccess: true,
      } as never)
      .catch(() => undefined)
    throw error
  }

  const extension = EXTENSION_BY_MIME[String(loaded.asset.mimeType ?? '')] ?? 'audio'
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'pod14-transcribe-'))
  try {
    let audioPath = path.join(tempDir, `source.${extension}`)
    let mimeType = String(loaded.asset.mimeType ?? '')
    await writeFile(audioPath, loaded.bytes)
    if (input.creatorVideo && mimeType.startsWith('video/')) {
      const wav = path.join(tempDir, 'audio.wav')
      try {
        const demuxer =
          mimeType === 'video/mp4' ? 'mov' : mimeType === 'video/webm' ? 'matroska' : null
        if (!demuxer) throw new Error('Unsupported video type.')
        await promisify(execFile)(
          resolveFfmpegBinary(),
          [
            '-nostdin',
            '-v',
            'error',
            '-protocol_whitelist',
            'file',
            '-f',
            demuxer,
            ...(demuxer === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []),
            '-i',
            audioPath,
            '-map',
            '0:a:0',
            '-t',
            '120',
            '-vn',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-c:a',
            'pcm_s16le',
            wav,
          ],
          { timeout: 120_000, maxBuffer: 16_384 },
        )
      } catch {
        return await fail(
          new TranscriptionError(
            'TRANSCRIPTION_AUDIO_MISSING',
            'Unable to extract audio from the selected video.',
          ),
        )
      }
      audioPath = wav
      mimeType = 'audio/wav'
    }
    const durationSec = await probeDurationSec(audioPath).catch(() => {
      const declared = Number(loaded.asset.durationSeconds ?? loaded.asset.durationSec ?? 0)
      return declared > 0 ? declared : 0
    })
    let result: Awaited<ReturnType<TranscriptionProvider['transcribe']>>
    try {
      result = await provider.transcribe({
        path: audioPath,
        durationSec,
        mimeType,
        origin: input.mediaAssetId,
      })
    } catch (error) {
      return await fail(
        error instanceof TranscriptionError
          ? error
          : new TranscriptionError(
              'TRANSCRIPTION_PROVIDER_FAILED',
              error instanceof Error ? error.message : String(error),
            ),
      )
    }
    const segments = result.segments as TimedSegment[]
    const prior = await payload
      .find({
        collection: 'transcript-revisions',
        where: { media: { equals: input.mediaAssetId } },
        limit: 200,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as Doc[] }))
    const version = prior.docs.reduce((max, doc) => Math.max(max, Number(doc.version ?? 0)), 0) + 1
    const revision = await payload.create({
      collection: 'transcript-revisions',
      data: {
        title: `Transcript (draft, ${provider.id}) — asset ${input.mediaAssetId}`,
        media: input.mediaAssetId,
        version,
        source: 'provider',
        reviewState: 'draft',
        segments,
        checksum: transcriptChecksum(segments),
        immutable: false,
      },
      overrideAccess: true,
    } as never)
    await payload.update({
      collection: 'media-jobs',
      id: String((job as Doc).id),
      data: {
        status: 'completed',
        progress: 100,
        failure: null,
        output: {
          transcriptRevisionId: String((revision as Doc).id),
          providerId: provider.id,
          language: result.language,
          segmentCount: segments.length,
          ...(input.episodeId ? { episodeId: input.episodeId } : {}),
          createdBy: input.createdBy ?? 'job:podcast-transcribe',
        },
      },
      overrideAccess: true,
    } as never)
    return {
      mediaJobId: String((job as Doc).id),
      state: 'completed',
      transcriptRevisionId: String((revision as Doc).id),
      providerId: provider.id,
      language: result.language,
      segmentCount: segments.length,
      deduplicated: false,
      error: null,
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function queueTranscriptionTask(
  payload: MediaPublishingStore & {
    jobs: { queue: (args: any) => Promise<{ id: string | number }> }
  },
  input: {
    mediaAssetId: string
    episodeId?: string
    providerId?: string
    queue?: string
    creator?: { siteId: string; memberId: string }
  },
): Promise<{ id: string; queued: boolean; idempotencyKey: string }> {
  // The job-level key is asset-scoped here; the run re-derives the
  // checksum-precise key for the media-jobs record.
  const idempotencyKey =
    `transcribe-task:${input.mediaAssetId}:${input.providerId ?? 'configured'}` +
    (input.creator ? `:${input.creator.siteId}:${input.creator.memberId}` : '')
  const existing = await payload
    .find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: PODCAST_TRANSCRIBE_TASK } },
          { 'input.idempotencyKey': { equals: idempotencyKey } },
        ],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  const active = existing.docs.find((job: Doc) => !job.hasError && !job.completedAt)
  if (active) return { id: String(active.id), queued: false, idempotencyKey }
  const job = await payload.jobs.queue({
    task: PODCAST_TRANSCRIBE_TASK,
    ...(input.queue ? { queue: input.queue } : {}),
    input: {
      mediaAssetId: input.mediaAssetId,
      episodeId: input.episodeId,
      providerId: input.providerId,
      idempotencyKey,
      ...(input.creator
        ? { creatorSite: input.creator.siteId, creatorMember: input.creator.memberId }
        : {}),
    },
  } as never)
  return { id: String(job.id), queued: true, idempotencyKey }
}

// ---------------------------------------------------------------------------
// Transcript review (draft → reviewed → linked)
// ---------------------------------------------------------------------------

export const revisionSegments = (revision: Doc | null | undefined): TimedSegment[] => {
  const raw = Array.isArray(revision?.segments) ? revision.segments : []
  return raw.map((segment: Doc, index: number) => ({
    id: String(segment.id ?? `seg-${index + 1}`),
    startSeconds: Number(segment.startSeconds ?? segment.startTime ?? 0),
    endSeconds: Number(segment.endSeconds ?? segment.endTime ?? 0),
    text: String(segment.text ?? segment.body ?? ''),
    ...(segment.speaker ? { speaker: String(segment.speaker) } : {}),
    ...(Array.isArray(segment.words) ? { words: segment.words } : {}),
  }))
}

/** Loads an episode + the segments of its LINKED (reviewed) revision only. */
export async function loadEpisodeReviewedTranscript(
  payload: MediaPublishingStore,
  episodeId: string,
): Promise<{ episode: Doc; segments: TimedSegment[]; revision: Doc | null }> {
  const episode = await payload
    .findByID({
      collection: 'podcast-episodes',
      id: episodeId,
      depth: 2,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!episode)
    throw new PodcastIntelligenceError(
      'EPISODE_NOT_FOUND',
      `Podcast episode "${episodeId}" was not found.`,
    )
  const revision =
    episode.transcript && typeof episode.transcript === 'object'
      ? (episode.transcript as Doc)
      : null
  return { episode, segments: revisionSegments(revision), revision }
}

/** Edits a DRAFT revision's segments. Reviewed revisions are immutable. */
export async function editTranscriptRevision(
  payload: MediaPublishingStore,
  revisionId: string,
  segments: TimedSegment[],
) {
  const revision = await payload
    .findByID({
      collection: 'transcript-revisions',
      id: revisionId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!revision)
    throw new PodcastIntelligenceError(
      'TRANSCRIPT_REVISION_NOT_FOUND',
      `Transcript revision "${revisionId}" was not found.`,
    )
  if (String((revision as Doc).reviewState ?? 'reviewed') !== 'draft')
    throw new PodcastIntelligenceError(
      'TRANSCRIPT_REVISION_IMMUTABLE',
      `Transcript revision "${revisionId}" is already reviewed and immutable; edit a draft revision instead.`,
    )
  return payload.update({
    collection: 'transcript-revisions',
    id: revisionId,
    data: { segments, checksum: transcriptChecksum(segments) },
    overrideAccess: true,
  } as never)
}

/**
 * The explicit human accept: marks the revision reviewed and links it
 * from the episode. Only now do the POD-01 routes / episode page /
 * feed serve its segments.
 */
export async function acceptTranscriptRevision(
  payload: MediaPublishingStore,
  input: { episodeId: string; revisionId: string },
) {
  const revision = await payload
    .findByID({
      collection: 'transcript-revisions',
      id: input.revisionId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!revision)
    throw new PodcastIntelligenceError(
      'TRANSCRIPT_REVISION_NOT_FOUND',
      `Transcript revision "${input.revisionId}" was not found.`,
    )
  await payload.update({
    collection: 'transcript-revisions',
    id: input.revisionId,
    data: { reviewState: 'reviewed', immutable: true },
    overrideAccess: true,
  } as never)
  return payload.update({
    collection: 'podcast-episodes',
    id: input.episodeId,
    data: { transcript: input.revisionId },
    overrideAccess: true,
  } as never)
}

// ---------------------------------------------------------------------------
// Assist drafts
// ---------------------------------------------------------------------------

export type AssistDraftDoc = Doc & {
  kind: AssistKind
  state: 'draft' | 'accepted' | 'discarded'
  payload: Doc
}

async function createDraft(
  payload: MediaPublishingStore,
  input: {
    episode: Doc
    kind: AssistKind
    title: string
    payload: Doc
    createdBy: string
  },
) {
  return payload.create({
    collection: PODCAST_ASSIST_DRAFTS_COLLECTION,
    data: {
      title: input.title,
      episode: String(input.episode.id),
      show: relationId(input.episode.show) || undefined,
      site: relationId(input.episode.site) || undefined,
      kind: input.kind,
      state: 'draft',
      payload: input.payload,
      createdBy: input.createdBy,
    },
    overrideAccess: true,
  } as never)
}

export async function generateAssistDrafts(
  payload: MediaPublishingStore,
  input: {
    episodeId: string
    kinds?: AssistKind[]
    markers?: { start: number; title?: string; label?: string; type?: string }[]
    playedLog?: Record<string, unknown>[]
    markedRanges?: { startSec: number; endSec: number; label?: string }[]
    createdBy?: string
    enhancer?: TextAssistEnhancer | null
  },
): Promise<AssistDraftDoc[]> {
  const { episode, segments, revision } = await loadEpisodeReviewedTranscript(
    payload,
    input.episodeId,
  )
  if (!revision || segments.length === 0)
    throw new PodcastIntelligenceError(
      'ASSIST_TRANSCRIPT_MISSING',
      `Episode "${input.episodeId}" has no reviewed transcript revision to assist from. Transcribe and accept a revision first.`,
    )
  const kinds = input.kinds ?? ['chapters', 'show-notes', 'summary', 'highlight']
  const createdBy = input.createdBy ?? 'job:podcast-assists'
  const drafts: AssistDraftDoc[] = []
  const durationSec = segments.reduce((max, segment) => Math.max(max, segment.endSeconds), 0)
  const episodeTitle = String(episode.title ?? 'Episode')
  const transcriptText = segments.map((segment) => segment.text).join(' ')

  let chapterSuggestions: ReturnType<typeof suggestChapters> | null = null
  if (kinds.includes('chapters') || kinds.includes('show-notes')) {
    chapterSuggestions = suggestChapters({
      segments,
      markers: input.markers,
      playedLog: input.playedLog,
      durationSec,
    })
  }
  if (kinds.includes('chapters')) {
    drafts.push(
      (await createDraft(payload, {
        episode,
        kind: 'chapters',
        title: `Chapter suggestions — ${episodeTitle}`,
        payload: { chapters: chapterSuggestions, basis: 'markers+played-log+transcript-gaps' },
        createdBy,
      })) as AssistDraftDoc,
    )
  }
  if (kinds.includes('show-notes') || kinds.includes('summary')) {
    const notes = draftShowNotes({
      episodeTitle,
      segments,
      chapters: (chapterSuggestions ?? []) as ManagedChapter[],
    })
    const enhanced = await maybeEnhance(input.enhancer, {
      kind: 'summary',
      baseline: notes.summary,
      context: { episodeTitle, transcriptText },
    })
    if (kinds.includes('show-notes')) {
      drafts.push(
        (await createDraft(payload, {
          episode,
          kind: 'show-notes',
          title: `Show-note draft — ${episodeTitle}`,
          payload: {
            summary: enhanced.text,
            showNotes: notes.showNotes,
            chapterList: notes.chapterList,
            basis: notes.basis,
            enhancedBy: enhanced.enhancedBy,
            ...(enhanced.enhancerError ? { enhancerError: enhanced.enhancerError } : {}),
          },
          createdBy,
        })) as AssistDraftDoc,
      )
    }
    if (kinds.includes('summary')) {
      drafts.push(
        (await createDraft(payload, {
          episode,
          kind: 'summary',
          title: `Summary draft — ${episodeTitle}`,
          payload: {
            summary: enhanced.text,
            basis: notes.basis,
            enhancedBy: enhanced.enhancedBy,
            ...(enhanced.enhancerError ? { enhancerError: enhanced.enhancerError } : {}),
          },
          createdBy,
        })) as AssistDraftDoc,
      )
    }
  }
  if (kinds.includes('highlight')) {
    const highlights = extractHighlights({ segments, markedRanges: input.markedRanges })
    drafts.push(
      (await createDraft(payload, {
        episode,
        kind: 'highlight',
        title: `Highlight candidates — ${episodeTitle}`,
        payload: { highlights },
        createdBy,
      })) as AssistDraftDoc,
    )
  }
  return drafts
}

export async function listAssistDrafts(payload: MediaPublishingStore, episodeId: string) {
  const found = await payload.find({
    collection: PODCAST_ASSIST_DRAFTS_COLLECTION,
    where: { episode: { equals: episodeId } },
    sort: '-createdAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  } as never)
  return found.docs as AssistDraftDoc[]
}

async function loadDraft(payload: MediaPublishingStore, draftId: string): Promise<AssistDraftDoc> {
  const draft = await payload
    .findByID({
      collection: PODCAST_ASSIST_DRAFTS_COLLECTION,
      id: draftId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!draft)
    throw new PodcastIntelligenceError(
      'ASSIST_DRAFT_NOT_FOUND',
      `Assist draft "${draftId}" was not found.`,
    )
  return draft as AssistDraftDoc
}

/**
 * The explicit human accept — the ONLY assist path that writes an
 * episode. Chapters land on the canonical list; show-notes/summary
 * land in the episode showNotes json; highlights accept into clip
 * definitions for POD-13 (no episode write); audiograms are media
 * drafts already attached by payload reference.
 */
export async function acceptAssistDraft(
  payload: MediaPublishingStore,
  draftId: string,
  options: { by?: string } = {},
) {
  const draft = await loadDraft(payload, draftId)
  if (draft.state !== 'draft')
    throw new PodcastIntelligenceError(
      'ASSIST_DRAFT_NOT_DRAFT',
      `Assist draft "${draftId}" is "${draft.state}", not a draft.`,
    )
  const episodeId = relationId(draft.episode)
  const draftPayload = (draft.payload ?? {}) as Doc
  if (draft.kind === 'chapters') {
    const chapters = normalizeChapters((draftPayload.chapters ?? []) as ManagedChapter[])
    await payload.update({
      collection: 'podcast-episodes',
      id: episodeId,
      data: { chapters },
      overrideAccess: true,
    } as never)
  } else if (draft.kind === 'show-notes') {
    await payload.update({
      collection: 'podcast-episodes',
      id: episodeId,
      data: {
        showNotes: {
          summary: draftPayload.summary ?? '',
          showNotes: draftPayload.showNotes ?? '',
          chapterList: draftPayload.chapterList ?? [],
          source: 'pod-14-assist',
        },
      },
      overrideAccess: true,
    } as never)
  } else if (draft.kind === 'summary') {
    const episode = await payload
      .findByID({
        collection: 'podcast-episodes',
        id: episodeId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    const existing = ((episode as Doc)?.showNotes ?? {}) as Doc
    await payload.update({
      collection: 'podcast-episodes',
      id: episodeId,
      data: { showNotes: { ...existing, summary: draftPayload.summary ?? '' } },
      overrideAccess: true,
    } as never)
  }
  const updated = await payload.update({
    collection: PODCAST_ASSIST_DRAFTS_COLLECTION,
    id: draftId,
    data: {
      state: 'accepted',
      payload: {
        ...draftPayload,
        acceptedBy: options.by ?? 'staff',
        acceptedAt: new Date().toISOString(),
      },
    },
    overrideAccess: true,
  } as never)
  return updated as AssistDraftDoc
}

export async function discardAssistDraft(payload: MediaPublishingStore, draftId: string) {
  const draft = await loadDraft(payload, draftId)
  if (draft.state !== 'draft')
    throw new PodcastIntelligenceError(
      'ASSIST_DRAFT_NOT_DRAFT',
      `Assist draft "${draftId}" is "${draft.state}", not a draft.`,
    )
  return payload.update({
    collection: PODCAST_ASSIST_DRAFTS_COLLECTION,
    id: draftId,
    data: { state: 'discarded' },
    overrideAccess: true,
  } as never) as Promise<AssistDraftDoc>
}

/**
 * Audiogram from a highlight: POD-13's audiogram profile renders the
 * range off the episode's edit project; the MP4 registers as a media
 * asset and lands as a DRAFT assist record attached to the episode.
 * The episode's audio/chapters are untouched.
 */
export async function createAudiogramFromHighlight(
  payload: MediaPublishingStore,
  config: AppConfig | undefined,
  input: {
    episodeId: string
    projectId: string
    highlight: HighlightClip
    createdBy?: string
  },
) {
  const episode = await payload
    .findByID({
      collection: 'podcast-episodes',
      id: input.episodeId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!episode)
    throw new PodcastIntelligenceError(
      'EPISODE_NOT_FOUND',
      `Podcast episode "${input.episodeId}" was not found.`,
    )
  // POD-21 (POD-18 gap): when the episode carries a reviewed POD-01
  // transcript, the audiogram renders in its CAPTIONED variant — the
  // transcript segments for the clip range, re-timed to the clip
  // start, burned in by the POD-13 profile. No transcript (or no
  // segment overlapping the range) → the uncaptioned variant, and
  // either way the variant is recorded on the draft's provenance.
  const { segments } = await loadEpisodeReviewedTranscript(payload, input.episodeId)
  const captions = segmentsToClipSrt(segments, {
    startSec: input.highlight.startSec,
    endSec: input.highlight.endSec,
  })
  const captioned = captions.segmentCount > 0
  const result = await renderProject(payload, config, {
    projectId: input.projectId,
    profile: 'audiogram',
    range: {
      startSec: input.highlight.startSec,
      durationSec: Math.max(0.1, input.highlight.endSec - input.highlight.startSec),
    },
    attachToEpisode: false,
    captionsSrt: captioned ? captions.srt : null,
  })
  if (result.state !== 'completed' || !result.outputs?.audiogramMp4?.mediaAssetId)
    throw new PodcastIntelligenceError(
      'AUDIOGRAM_RENDER_FAILED',
      `Audiogram render for episode "${input.episodeId}" did not complete: ${result.report?.error ?? result.state}.`,
    )
  return createDraft(payload, {
    episode: episode as Doc,
    kind: 'audiogram',
    title: `Audiogram draft — ${input.highlight.label}`,
    payload: {
      renderId: result.renderId,
      mediaAssetId: result.outputs.audiogramMp4.mediaAssetId,
      ...(result.outputs.mp3?.mediaAssetId
        ? { mp3MediaAssetId: result.outputs.mp3.mediaAssetId }
        : {}),
      range: { startSec: input.highlight.startSec, endSec: input.highlight.endSec },
      label: input.highlight.label,
      source: 'pod-13-audiogram-profile',
      captionsBurnedIn: captioned,
      ...(captioned ? { captionSegments: captions.segmentCount, captionsSrt: captions.srt } : {}),
    },
    createdBy: input.createdBy ?? 'job:podcast-assists',
  }) as Promise<AssistDraftDoc>
}
