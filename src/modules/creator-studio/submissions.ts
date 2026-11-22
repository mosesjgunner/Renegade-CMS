import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Payload, Where } from 'payload'
import type { MediaUploadSession } from '@/payload-types'
import type { AppConfig } from '../core/config'
import { releaseTransaction } from '../releases/transaction'
import {
  assembleUpload,
  creatorAssetDirectory,
  sha256,
  stageUploadChunk,
  uploadChunkSize,
  uploadDirectory,
  uploadLifetimeMs,
  uploadSessionLock,
  withUploadLock,
} from '../media/upload-staging'
import { MediaWorkflowError } from '../media/workflow'
import { authorizeCreator, type CreatorCapability } from './policy'
import { prepareSubmissionSource, scanSubmissionSource, type SourceScan } from './submission-source'
import {
  canReviewSubmissions,
  relationId,
  submissionSite,
  submissionTarget,
  uuid,
  type SubmissionActor,
} from './submission-targets'

const collection = 'media-upload-sessions' as const
const access = { depth: 0, overrideAccess: true } as const
const unavailable = () => new MediaWorkflowError('Submission unavailable.', 404)
const denied = () => new MediaWorkflowError('Submission access denied.', 403)
type Details = {
  claimedType?: string
  targetTitle?: string
  source?: Awaited<ReturnType<typeof prepareSubmissionSource>> & { checksum: string }
  history?: { state: string; reason: string; actor: string; at: string }[]
}
const details = (session: MediaUploadSession) => (session.creatorDetails ?? {}) as Details
const chunks = (session: MediaUploadSession) =>
  Array.isArray(session.receivedChunks) ? (session.receivedChunks as number[]) : []
const openStates = ['open', 'failed', 'finalizing']
const actorWhere = (actor: SubmissionActor): Where[] => [
  { site: { equals: actor.siteId } },
  { owner: { equals: actor.memberId } },
  { creatorKey: { exists: true } },
]
const clean = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max)
    : ''

async function authorize(payload: Payload, actor: SubmissionActor, capability: CreatorCapability) {
  try {
    return await authorizeCreator(payload, { ...actor, capability })
  } catch {
    throw denied()
  }
}

async function findSubmission(payload: Payload, siteId: string, id: string) {
  if (!uuid.test(id)) throw unavailable()
  const row = await payload.findByID({ collection, id, ...access }).catch(() => null)
  if (!row?.creatorKey || relationId(row.site) !== siteId) throw unavailable()
  return row
}

async function owned(payload: Payload, actor: SubmissionActor, id: string, active = false) {
  const row = await findSubmission(payload, actor.siteId, id)
  if (relationId(row.owner) !== actor.memberId) throw unavailable()
  await authorize(payload, actor, 'media.upload')
  if (active) {
    if (Date.parse(row.expiresAt) <= Date.now())
      throw new MediaWorkflowError('Upload expired. Start a new upload.', 410)
    await authorize(payload, actor, 'media.submit')
    await submissionTarget(payload, actor, row.creatorTarget ?? '', 'write')
  }
  return row
}

function view(row: MediaUploadSession) {
  const { source, history, targetTitle } = details(row)
  return {
    id: row.id,
    filename: row.filename,
    title: row.title,
    altText: row.altText,
    caption: row.caption,
    target: row.creatorTarget,
    targetTitle,
    state: row.state,
    reviewStatus: row.reviewStatus,
    reason: history?.at(-1)?.reason ?? row.failureReason,
    history: history?.map(({ state, reason, at }) => ({ state, reason, at })),
    receivedBytes: row.receivedBytes,
    receivedChunks: chunks(row),
    chunkSize: row.chunkSize,
    expectedSize: row.expectedSize,
    expiresAt: row.expiresAt,
    kind: source?.kind,
    mimeType: source?.mimeType,
    preview:
      row.state === 'completed' ? `/api/creator-studio/submissions/${row.id}?preview=1` : undefined,
  }
}

const resumeView = (row: MediaUploadSession) => ({
  ...view(row),
  manifest: row.chunkManifest ?? {},
})

export async function createSubmission(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  input: Record<string, unknown>,
) {
  const size = Number(input.size)
  const filename = clean(input.filename, 255).replace(/[\\/]/g, '_')
  const title = clean(input.title, 180)
  const altText = clean(input.altText, 500)
  const caption = clean(input.caption, 2000)
  const claimedType = clean(input.mimeType, 120).split(';')[0].trim().toLowerCase()
  const target = typeof input.target === 'string' ? input.target : ''
  if (
    typeof input.size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > config.storage.maxUploadBytes
  )
    throw new MediaWorkflowError('File exceeds the configured upload limit.', 413)
  if (typeof input.key !== 'string' || !uuid.test(input.key) || !filename || !title)
    throw new MediaWorkflowError('A filename, title and upload identifier are required.')
  const creatorKey = sha256(Buffer.from(JSON.stringify([actor.siteId, actor.memberId, input.key])))
  return withUploadLock(payload, `creator-quota:${actor.siteId}:${actor.memberId}`, async () => {
    const { quota } = await authorize(payload, actor, 'media.upload')
    await authorize(payload, actor, 'media.submit')
    const destination = await submissionTarget(payload, actor, target, 'write')
    const previous = (
      await payload.find({
        collection,
        ...access,
        limit: 1,
        where: {
          and: [...actorWhere(actor), { creatorKey: { equals: creatorKey } }],
        },
      })
    ).docs[0]
    if (previous) {
      if (
        previous.filename !== filename ||
        previous.expectedSize !== size ||
        previous.creatorTarget !== target ||
        details(previous).claimedType !== claimedType
      )
        throw new MediaWorkflowError('Upload identifier belongs to a different file.', 409)
      return resumeView(previous)
    }
    const {
      rows: [usage],
    } = await payload.db.pool.query<{ count: string; bytes: string }>(
      `SELECT count(*) AS count, coalesce(sum(expected_size), 0) AS bytes FROM media_upload_sessions
       WHERE site_id=$1 AND owner_id=$2 AND creator_key IS NOT NULL
         AND (state='completed' OR (state IN ('open','failed','finalizing') AND expires_at>now()))`,
      [actor.siteId, actor.memberId],
    )
    if (
      Number(usage.count) >= (quota.uploadCount ?? 0) ||
      Number(usage.bytes) + size > (quota.bytes ?? 0)
    )
      throw new MediaWorkflowError('Your site upload quota is full.', 413)
    return resumeView(
      await payload.create({
        collection,
        ...access,
        data: {
          site: actor.siteId,
          owner: actor.memberId,
          filename,
          title,
          altText,
          caption,
          expectedSize: size,
          chunkSize: uploadChunkSize(size),
          receivedBytes: 0,
          receivedChunks: [],
          chunkManifest: {},
          creatorKey,
          creatorTarget: target,
          creatorDetails: { claimedType, targetTitle: destination.title },
          state: 'open',
          expiresAt: new Date(Date.now() + uploadLifetimeMs).toISOString(),
        },
      }),
    )
  })
}

export async function readSubmission(payload: Payload, actor: SubmissionActor, id: string) {
  return resumeView(await owned(payload, actor, id))
}

export async function writeSubmissionChunk(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  id: string,
  range: { index: number; start: number; end: number; total: number },
  bytes: () => Promise<Buffer>,
) {
  const session = await owned(payload, actor, id, true)
  const { index, start, end, total } = range
  const length = Math.min(session.chunkSize, session.expectedSize - start)
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    start !== index * session.chunkSize ||
    total !== session.expectedSize ||
    length < 1 ||
    end !== start + length - 1
  )
    throw new MediaWorkflowError('Invalid chunk range.', 400)
  if (!['open', 'failed'].includes(session.state) || session.reviewStatus === 'quarantined')
    throw new MediaWorkflowError('Upload is not accepting chunks.', 409)
  const body = await bytes()
  if (body.length !== length) throw new MediaWorkflowError('Invalid chunk size.', 400)
  return withUploadLock(payload, uploadSessionLock(id), async () => {
    const row = await owned(payload, actor, id, true)
    if (!['open', 'failed'].includes(row.state) || row.reviewStatus === 'quarantined')
      throw new MediaWorkflowError('Upload is not accepting chunks.', 409)
    const manifest = row.chunkManifest ?? {}
    if (manifest[index] && sha256(body) !== manifest[index])
      throw new MediaWorkflowError('Chunk retry bytes do not match the original chunk.', 409)
    const hash = await stageUploadChunk(uploadDirectory(config, id), index, body)
    if (manifest[index] && row.state === 'open') return view(row)
    const receivedChunks = [...new Set([...chunks(row), index])].sort((a, b) => a - b)
    return view(
      await payload.update({
        collection,
        id,
        ...access,
        data: {
          chunkManifest: { ...manifest, [index]: hash },
          receivedChunks,
          receivedBytes: receivedChunks.reduce(
            (total, index) =>
              total + Math.min(row.chunkSize, row.expectedSize - index * row.chunkSize),
            0,
          ),
          state: 'open',
          failureReason: null,
        },
      }),
    )
  })
}

export async function finalizeSubmission(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  id: string,
  scan: SourceScan = scanSubmissionSource,
) {
  return withUploadLock(payload, uploadSessionLock(id), async () => {
    const row = await owned(payload, actor, id)
    if (row.state === 'completed') return view(row)
    await owned(payload, actor, id, true)
    if (!openStates.includes(row.state) || row.reviewStatus === 'quarantined')
      throw new MediaWorkflowError('Upload cannot be finalized.', 409)
    if (chunks(row).length !== Math.ceil(row.expectedSize / row.chunkSize))
      throw new MediaWorkflowError('Resume the missing chunks before submitting.', 409)
    const directory = uploadDirectory(config, id)
    await payload.update({
      collection,
      id,
      ...access,
      data: { state: 'finalizing', failureReason: null },
    })
    try {
      const { filename, checksum } = await assembleUpload(
        directory,
        row.expectedSize,
        row.chunkSize,
        row.chunkManifest ?? {},
        true,
        creatorAssetDirectory(config, id),
      )
      const verdict = await scan({ filename, checksum })
      if (verdict === 'infected') {
        await payload.update({
          collection,
          id,
          ...access,
          data: {
            state: 'failed',
            reviewStatus: 'quarantined',
            failureReason: 'Source quarantined by the malware scanner.',
          },
        })
        throw new MediaWorkflowError('Source quarantined by the malware scanner.', 422)
      }
      if (verdict !== 'clean')
        throw new MediaWorkflowError('Malware scanner unavailable. Retry later.', 503)
      const metadata = details(row)
      const source = await prepareSubmissionSource(
        filename,
        row.expectedSize,
        metadata.claimedType ?? '',
      )
      await owned(payload, actor, id, true)
      await payload.update({
        collection,
        id,
        ...access,
        data: {
          state: 'completed',
          reviewStatus: 'pending',
          creatorDetails: { ...metadata, source: { ...source, checksum } },
        },
      })
      const completed = await owned(payload, actor, id)
      try {
        await rm(directory, { force: true, recursive: true })
        await payload.update({
          collection,
          id,
          ...access,
          data: { stagingClearedAt: new Date().toISOString() },
        })
      } catch {
        // The cleanup job can remove leftover parts after completion.
      }
      return view(completed)
    } catch (error) {
      const reason =
        error instanceof MediaWorkflowError
          ? error.message
          : 'Upload finalization failed. Retry the upload.'
      await payload
        .update({ collection, id, ...access, data: { state: 'failed', failureReason: reason } })
        .catch(() => undefined)
      throw error
    }
  })
}

export async function cancelSubmission(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  id: string,
) {
  return withUploadLock(payload, uploadSessionLock(id), async () => {
    const row = await owned(payload, actor, id)
    if (row.state === 'completed' || row.reviewStatus === 'quarantined')
      throw new MediaWorkflowError('This submission cannot be cancelled.', 409)
    await payload.update({ collection, id, ...access, data: { state: 'cancelled' } })
    await rm(uploadDirectory(config, id), { force: true, recursive: true })
    await rm(creatorAssetDirectory(config, id), { force: true, recursive: true })
    await payload.update({
      collection,
      id,
      ...access,
      data: { stagingClearedAt: new Date().toISOString() },
    })
  })
}

export async function listSubmissions(payload: Payload, actor: SubmissionActor) {
  const [reviewer, allowed] = await Promise.all([
    canReviewSubmissions(payload, actor),
    submissionSite(payload, actor.siteId),
  ])
  const uploads = await authorize(payload, actor, 'media.upload').then(
    () => true,
    () => false,
  )
  if (!uploads && !reviewer) throw denied()
  const [mine, queue, targets] = await Promise.all([
    uploads
      ? payload.find({
          collection,
          ...access,
          limit: 100,
          sort: '-createdAt',
          where: { and: actorWhere(actor) },
        })
      : undefined,
    reviewer
      ? payload.find({
          collection,
          ...access,
          limit: 100,
          sort: 'updatedAt',
          where: {
            and: [
              { site: { equals: actor.siteId } },
              { state: { equals: 'completed' } },
              { reviewStatus: { in: ['pending', 'appealed', 'approved', 'published'] } },
              { creatorTarget: { in: allowed } },
            ],
          },
        })
      : undefined,
    uploads
      ? Promise.allSettled(
          allowed.map((target) => submissionTarget(payload, actor, target, 'write', allowed)),
        )
      : [],
  ])
  return {
    mine: mine?.docs.map(view) ?? [],
    queue: queue?.docs.map(view) ?? [],
    uploads,
    targets: targets.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
  }
}

export async function updateSubmission(
  payload: Payload,
  actor: SubmissionActor,
  id: string,
  input: Record<string, unknown>,
) {
  return withUploadLock(payload, uploadSessionLock(id), async () => {
    const row = await findSubmission(payload, actor.siteId, id)
    if (row.state !== 'completed') throw unavailable()
    const owner = relationId(row.owner)
    const review =
      input.action === 'approve' || input.action === 'reject' || input.action === 'withdraw'
    const current = row.reviewStatus ?? ''
    if (review) {
      if (owner === actor.memberId || !(await canReviewSubmissions(payload, actor))) throw denied()
      await submissionSite(payload, actor.siteId)
    } else {
      await owned(payload, actor, id)
      if (input.action === 'publish') await authorize(payload, actor, 'media.submit')
      await authorize(
        payload,
        actor,
        input.action === 'publish'
          ? 'media.publish-own'
          : input.action === 'metadata'
            ? 'media.edit-own'
            : 'media.submit',
      )
      await submissionTarget(payload, actor, row.creatorTarget ?? '', 'write')
    }
    if (input.action === 'metadata' && current === 'pending') {
      const title = clean(input.title, 180)
      if (!title) throw new MediaWorkflowError('A title is required.')
      return view(
        await payload.update({
          collection,
          id,
          ...access,
          data: {
            title,
            altText: clean(input.altText, 500),
            caption: clean(input.caption, 2000),
          },
        }),
      )
    }
    const reason = clean(input.reason, 1000)
    const metadata = details(row)
    let next: string
    if (input.action === 'publish' && current === 'published') return view(row)
    if (input.action === 'publish' && current === 'approved') next = 'published'
    else if (
      input.action === 'appeal' &&
      current === 'rejected' &&
      !metadata.history?.some((entry) => entry.state === 'appealed')
    )
      next = 'appealed'
    else if (input.action === 'withdraw' && ['approved', 'published'].includes(current))
      next = 'rejected'
    else if (review && input.action !== 'withdraw' && ['pending', 'appealed'].includes(current)) {
      if (
        current === 'appealed' &&
        metadata.history?.some(
          (entry) => entry.state === 'rejected' && entry.actor === actor.memberId,
        )
      )
        throw new MediaWorkflowError('Appeals require a different reviewer.', 403)
      next = input.action === 'approve' ? 'approved' : 'rejected'
    } else throw new MediaWorkflowError('This submission cannot take that action.', 409)
    if (next !== 'published' && !reason) throw new MediaWorkflowError('A reason is required.')
    if (next === 'approved' || next === 'published') {
      if (metadata.source?.kind === 'image' && !row.altText?.trim())
        throw new MediaWorkflowError('Add alt text before approving or publishing an image.', 409)
      if (!(await submissionSite(payload, actor.siteId)).includes(row.creatorTarget ?? ''))
        throw unavailable()
    }
    const at = new Date().toISOString()
    const updated = await releaseTransaction(payload, async (tx) => {
      const changed = await tx.update({
        collection,
        id,
        ...access,
        data: {
          reviewStatus: next,
          creatorDetails: {
            ...metadata,
            history: [
              ...(metadata.history ?? []),
              { state: next, reason, at, actor: actor.memberId },
            ],
          },
        },
      })
      if (review && tx.collections['activity-events'] && tx.collections.notifications) {
        const event = await tx.create({
          collection: 'activity-events',
          ...access,
          data: {
            site: actor.siteId,
            type: 'creator.submission.reviewed',
            actor: { system: true },
            object: { submissionId: id },
            payload: {
              title: row.title,
              status: next,
              reason,
              body: `${row.title} was ${next}. ${reason}`,
            },
            occurredAt: at,
          },
        })
        await tx.create({
          collection: 'notifications',
          ...access,
          data: {
            activityEvent: event.id,
            recipientMember: owner,
            status: 'unread',
            channels: ['in-app'],
          },
        })
      }
      return changed
    })
    return view(updated)
  })
}

export async function publishedSubmissions(payload: Payload, actor: SubmissionActor, key: string) {
  const target = await submissionTarget(payload, actor, key, 'read')
  const result = await payload.find({
    collection,
    ...access,
    limit: 100,
    sort: '-updatedAt',
    where: {
      and: [
        { site: { equals: actor.siteId } },
        { creatorTarget: { equals: key } },
        { state: { equals: 'completed' } },
        { reviewStatus: { equals: 'published' } },
      ],
    },
  })
  return {
    target,
    items: result.docs.map((row) => ({
      id: row.id,
      title: row.title,
      altText: row.altText,
      caption: row.caption,
      kind: details(row).source?.kind,
      url: `/api/creator-studio/submissions/${row.id}`,
    })),
  }
}

export async function submissionFile(
  payload: Payload,
  config: AppConfig,
  actor: SubmissionActor,
  id: string,
  preview: boolean,
) {
  const row = await findSubmission(payload, actor.siteId, id)
  const source = details(row).source
  if (!source || row.state !== 'completed') throw unavailable()
  if (preview) {
    if (!actor.memberId) throw unavailable()
    if (relationId(row.owner) === actor.memberId) await owned(payload, actor, id)
    else if (!(await canReviewSubmissions(payload, actor))) throw unavailable()
  } else {
    if (row.reviewStatus !== 'published') throw unavailable()
    await submissionTarget(payload, actor, row.creatorTarget ?? '', 'read')
  }
  const filename = path.join(creatorAssetDirectory(config, id), 'preview')
  const { size } = await stat(filename).catch(() => {
    throw unavailable()
  })
  return { filename, size, mimeType: source.mimeType }
}
