import type { Payload } from 'payload'

import { transcriptChecksum } from '../media/contracts'
import type { WaveformPeaksData } from '../media/peaks'
import { withUploadLock } from '../media/upload-staging'
import { MediaWorkflowError } from '../media/workflow'
import { queueTranscriptionTask, revisionSegments } from '../podcast-studio/intelligence/service'
import { transcriptionConfigFromEnv } from '../podcast-studio/intelligence/transcription'
import { editAccessOptions, editNotFound, ownedEditSource } from './media-edit-projects'
import { mediaEditQueue, recipeSchema } from './media-edit-recipe'
import { dubAction, voiceOptions } from './synthetic-dub'
import { queueTranscriptAssist } from './transcript-assist'
import type { SubmissionActor } from './submission-targets'

async function source(payload: Payload, actor: SubmissionActor, id: string) {
  const { asset } = await ownedEditSource(payload, actor, id)
  if (asset.kind !== 'video' && asset.kind !== 'audio') throw editNotFound()
  return asset
}

export async function captionSource(payload: Payload, actor: SubmissionActor, id: string) {
  const asset = await source(payload, actor, id)
  const { docs } = await payload.find({
    collection: 'transcript-revisions',
    ...editAccessOptions,
    where: { media: { equals: id } },
    sort: '-version',
    limit: 20,
  })
  const { docs: assists } = await payload.find({
    collection: 'media-jobs',
    ...editAccessOptions,
    limit: 12,
    sort: '-createdAt',
    where: {
      and: [
        { 'input.purpose': { equals: 'creator-transcript-assist' } },
        { 'input.media': { equals: id } },
        { 'input.siteId': { equals: actor.siteId } },
        { 'input.memberId': { equals: actor.memberId } },
      ],
    },
  })
  const { docs: jobs } = await payload.find({
    collection: 'payload-jobs',
    ...editAccessOptions,
    limit: 10,
    sort: '-createdAt',
    where: {
      and: [
        { queue: { equals: mediaEditQueue } },
        { taskSlug: { in: ['podcast-transcribe', 'media-peaks'] } },
        { 'input.mediaAssetId': { equals: id } },
        { 'input.creatorSite': { equals: actor.siteId } },
        { 'input.creatorMember': { equals: actor.memberId } },
      ],
    },
  })
  const peaks = asset.waveformPeaks as WaveformPeaksData | null
  return {
    jobs: jobs.map(({ id, taskSlug, completedAt, hasError, processing, log }) => ({
      id,
      task: taskSlug === 'media-peaks' ? 'Waveform' : 'Transcription',
      status:
        hasError ||
        log?.some(
          ({ output }) =>
            output &&
            typeof output === 'object' &&
            'completed' in output &&
            output.completed === false,
        )
          ? 'failed'
          : completedAt
            ? 'completed'
            : processing
              ? 'running'
              : 'queued',
    })),
    synthetic: await voiceOptions(payload, actor, id),
    assists: assists.map(({ id, title, status, output }) => ({ id, title, status, output })),
    revisions: docs.map((revision) => ({
      id: revision.id,
      title: revision.title,
      source: revision.source,
      review: revision.reviewState ?? 'reviewed',
      segments: revisionSegments(revision),
    })),
    peaks: peaks?.sourceChecksum === asset.checksum ? peaks : null,
  }
}

export async function captionAction(
  payload: Payload,
  actor: SubmissionActor,
  id: string,
  input: Record<string, unknown>,
) {
  if (input.action === 'revoke-dub') return dubAction(payload, actor, id, input)
  const asset = await source(payload, actor, id)
  if (input.action === 'translate-subtitles' || input.action === 'suggest-clips')
    return queueTranscriptAssist(payload, actor, id, input)
  if (['synthetic-dub', 'grant-dub-consent', 'review-dub'].includes(String(input.action)))
    return dubAction(payload, actor, id, input)
  if (input.action === 'voice-conversion' || input.action === 'lip-sync')
    throw new MediaWorkflowError('Voice conversion and lip-sync are unavailable.', 503)
  if (input.action === 'transcribe' && input.optIn === true) {
    if (!(Number(asset.durationSeconds) > 0 && Number(asset.durationSeconds) <= 120))
      throw new MediaWorkflowError('Creator transcription requires a source up to 120 seconds.')
    const provider = transcriptionConfigFromEnv()
    if (
      !(
        (provider.providerId === 'http-provider' && provider.endpoint) ||
        ((!provider.providerId || provider.providerId === 'command-provider') && provider.command)
      )
    )
      throw new MediaWorkflowError('Local or BYO transcription is unavailable.', 503)
    return withUploadLock(payload, 'creator-asr:' + id, () =>
      queueTranscriptionTask(payload as never, {
        mediaAssetId: id,
        providerId: provider.providerId || 'command-provider',
        queue: mediaEditQueue,
        creator: actor,
      }),
    )
  }
  if (input.action === 'waveform') {
    if (!(Number(asset.durationSeconds) > 0 && Number(asset.durationSeconds) <= 120))
      throw new MediaWorkflowError('Waveform generation requires a source up to 120 seconds.')
    if ((asset.waveformPeaks as WaveformPeaksData | null)?.sourceChecksum === asset.checksum)
      return { status: 'completed' }
    const idempotencyKey = 'creator-waveform:' + id + ':' + asset.checksum
    return withUploadLock(payload, idempotencyKey, async () => {
      const { docs } = await payload.find({
        collection: 'payload-jobs',
        ...editAccessOptions,
        limit: 1,
        where: {
          and: [
            { taskSlug: { equals: 'media-peaks' } },
            { 'input.idempotencyKey': { equals: idempotencyKey } },
            { completedAt: { exists: false } },
            { hasError: { not_equals: true } },
          ],
        },
      })
      if (docs[0]) return { id: docs[0].id }
      const { id: jobId } = await payload.jobs.queue({
        task: 'media-peaks',
        queue: mediaEditQueue,
        input: {
          mediaAssetId: id,
          idempotencyKey,
          creatorSite: actor.siteId,
          creatorMember: actor.memberId,
        },
      } as never)
      return { id: jobId }
    })
  }
  if (input.action === 'save-transcript') {
    const checked = recipeSchema.safeParse(input.recipe)
    if (
      !checked.success ||
      checked.data.clips.length !== 1 ||
      checked.data.clips[0].asset !== id ||
      !checked.data.captions.length
    )
      throw new MediaWorkflowError(
        'Save a source transcript from a single clip with valid captions.',
      )
    const {
      clips: [clip],
      captions,
    } = checked.data
    if (clip.out > Number(asset.durationSeconds) + 0.1 || !asset.durationSeconds)
      throw new MediaWorkflowError('The clip exceeds the available source.')
    const segments = captions.map(({ start, end, text }, index) => ({
      id: 'seg-' + (index + 1),
      startSeconds: start + clip.in,
      endSeconds: end + clip.in,
      text,
    }))
    const checksum = transcriptChecksum(segments)
    return withUploadLock(payload, 'creator-transcript:' + id, async () => {
      const { docs } = await payload.find({
        collection: 'transcript-revisions',
        ...editAccessOptions,
        where: { media: { equals: id } },
        sort: '-version',
        limit: 1,
      })
      if (docs[0]?.source === 'manual' && docs[0].checksum === checksum) return { id: docs[0].id }
      const revision = await payload.create({
        collection: 'transcript-revisions',
        ...editAccessOptions,
        data: {
          title: 'Creator reviewed captions',
          media: id,
          version: (docs[0]?.version ?? 0) + 1,
          source: 'manual',
          reviewState: 'reviewed',
          checksum,
          segments,
          immutable: true,
        },
      })
      return { id: revision.id }
    })
  }
  throw new MediaWorkflowError('Select a caption action and opt in before provider processing.')
}
