/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import {
  queueTranscriptionTask,
  runTranscriptionJob,
} from '@/modules/podcast-studio/intelligence/service'
import {
  TranscriptionError,
  fixtureTranscriptionProvider,
} from '@/modules/podcast-studio/intelligence/transcription'
import { episodeContext, privateJson, readJson, relationId } from '../../../production/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ episodeId: string }> }

/**
 * POD-14 transcription surface for one episode.
 *
 * GET  — the episode's media-jobs transcription records (newest
 *        first): visible job state, named failures, retry surface.
 * POST — `{ providerId?, runInline? }`: queues the `podcast-transcribe`
 *        task for the episode's audio asset (default), or runs the
 *        job inline when `runInline: true`. The result lands as a
 *        DRAFT transcript revision — nothing is served publicly
 *        until the revision is accepted (see the assists route).
 */
export async function GET(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { episodeId } = await params
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  const audioId = relationId(context.episode.audio)
  const jobs = await payload.find({
    collection: 'media-jobs' as never,
    where: {
      and: [{ kind: { equals: 'transcribe' } }, { 'input.mediaAssetId': { equals: audioId } }],
    },
    sort: '-createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  } as never)
  return privateJson({ jobs: (jobs as any).docs })
}

export async function POST(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { episodeId } = await params
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  const audioId = relationId(context.episode.audio)
  if (!audioId) return privateJson({ error: 'Episode has no audio asset to transcribe.' }, 400)
  const body = await readJson(request)
  try {
    if (body.runInline === true) {
      const result = await runTranscriptionJob(payload as never, undefined, {
        mediaAssetId: audioId,
        episodeId,
        provider: body.providerId === 'fixture-provider' ? fixtureTranscriptionProvider : undefined,
        createdBy: String(context.user.id ?? 'staff'),
      })
      return privateJson({ ...result })
    }
    const queued = await queueTranscriptionTask(payload as never, {
      mediaAssetId: audioId,
      episodeId,
      providerId: typeof body.providerId === 'string' ? body.providerId : undefined,
    })
    return privateJson({
      jobId: queued.id,
      queued: queued.queued,
      idempotencyKey: queued.idempotencyKey,
    })
  } catch (error) {
    if (error instanceof TranscriptionError)
      return privateJson({ error: error.message, code: error.code }, 409)
    return privateJson(
      { error: error instanceof Error ? error.message : 'Transcription request failed.' },
      500,
    )
  }
}
