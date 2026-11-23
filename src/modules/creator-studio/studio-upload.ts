import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { loadConfig } from '../core/config'
import { MediaWorkflowError, persistReviewedCreatorMedia } from '../media/workflow'
import {
  readBoundedUploadBody,
  uploadChunkSize,
  uploadLifetimeMs,
  withUploadLock,
} from '../media/upload-staging'
import { captureAccess } from './capture-service'
import { prepareSubmissionSource, scanSubmissionSource } from './submission-source'
import { relationId, type SubmissionActor } from './submission-targets'

const checksum = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')

export async function uploadPrivateStudioFile(
  payload: Payload,
  actor: SubmissionActor,
  request: Request,
) {
  const config = loadConfig()
  await captureAccess(payload, actor)
  const url = new URL(request.url)
  const title = (url.searchParams.get('title') ?? '').trim()
  const altText = (url.searchParams.get('alt') ?? '').trim()
  if (!title || title.length > 160 || altText.length > 500)
    throw new MediaWorkflowError('Enter a title and alt text within the limits.')
  const mime = request.headers.get('content-type')?.split(';')[0] ?? ''
  if (
    mime !== 'application/octet-stream' &&
    !/^(image\/(png|jpeg|webp)|video\/(mp4|webm|quicktime)|audio\/(wav|x-wav|ogg|mpeg|webm|mp4))$/.test(
      mime,
    )
  )
    throw new MediaWorkflowError('Choose a supported image, audio, or video file.', 415)
  const bytes = await readBoundedUploadBody(
    request,
    Math.min(config.storage.maxUploadBytes, 32 * 1024 * 1024),
  )
  if (!bytes.length) throw new MediaWorkflowError('Choose a file to upload.')
  const hash = checksum(bytes)
  const restoreChecksum = url.searchParams.get('checksum')
  if (
    restoreChecksum &&
    (restoreChecksum !== hash || url.searchParams.get('rights') !== 'confirmed')
  )
    throw new MediaWorkflowError(
      'The file must match the export checksum and you must have permission to restore it.',
      409,
    )
  const creatorKey =
    'library:' +
    createHash('sha256')
      .update(JSON.stringify([actor.siteId, actor.memberId, hash, title, altText, restoreChecksum]))
      .digest('hex')
  return withUploadLock(
    payload,
    'creator-quota:' + actor.siteId + ':' + actor.memberId,
    async () => {
      const { quota } = await captureAccess(payload, actor)
      const {
        docs: [prior],
      } = await payload.find({
        collection: 'media-upload-sessions',
        depth: 0,
        overrideAccess: true,
        limit: 1,
        where: {
          and: [
            { site: { equals: actor.siteId } },
            { owner: { equals: actor.memberId } },
            { creatorKey: { equals: creatorKey } },
          ],
        },
      })
      if (prior?.state === 'completed' && relationId(prior.asset))
        return { id: relationId(prior.asset), title }
      const {
        rows: [usage],
      } = await payload.db.pool.query<{ count: string; bytes: string }>(
        `SELECT count(*) AS count, coalesce(sum(expected_size),0) AS bytes
       FROM media_upload_sessions WHERE site_id=$1 AND owner_id=$2 AND creator_key IS NOT NULL
       AND id IS DISTINCT FROM $3::uuid
       AND (state='completed' OR (state IN ('open','failed','finalizing') AND expires_at>now()))`,
        [actor.siteId, actor.memberId, prior?.id ?? null],
      )
      if (
        Number(usage.count) >= (quota.uploadCount ?? 0) ||
        Number(usage.bytes) + bytes.length > (quota.bytes ?? 0)
      )
        throw new MediaWorkflowError('Your upload limit has been reached.', 413)
      const session =
        prior ??
        (await payload.create({
          collection: 'media-upload-sessions',
          overrideAccess: true,
          data: {
            site: actor.siteId,
            owner: actor.memberId,
            filename: title,
            title,
            altText,
            expectedSize: bytes.length,
            receivedBytes: bytes.length,
            receivedChunks: [],
            chunkSize: uploadChunkSize(bytes.length),
            creatorKey,
            state: 'finalizing',
            expiresAt: new Date(Date.now() + uploadLifetimeMs).toISOString(),
          },
        }))
      const directory = await mkdtemp(path.join(os.tmpdir(), 'studio-upload-'))
      try {
        const source = path.join(directory, 'source')
        await writeFile(source, bytes)
        if ((await scanSubmissionSource({ filename: source, checksum: hash })) !== 'clean')
          throw new MediaWorkflowError('The file could not pass the required safety scan.', 422)
        const prepared = await prepareSubmissionSource(source, bytes.length, mime)
        const kind = prepared.kind
        if (kind !== 'image' && kind !== 'audio' && kind !== 'video')
          throw new MediaWorkflowError('Choose a supported image, audio, or video file.')
        if (kind === 'image' && !altText)
          throw new MediaWorkflowError('Describe the image for people who cannot see it.')
        const derivative = path.join(directory, 'preview')
        const safeBytes = await readFile(derivative)
        if (safeBytes.length > config.storage.maxUploadBytes)
          throw new MediaWorkflowError('The prepared file exceeds the upload limit.', 413)
        const storedMime = restoreChecksum ? prepared.sourceMime : prepared.mimeType
        const extension =
          storedMime === 'audio/mpeg'
            ? 'mp3'
            : storedMime === 'audio/mp4'
              ? 'm4a'
              : storedMime === 'image/jpeg'
                ? 'jpg'
                : storedMime.split('/')[1]
        const image =
          kind === 'image' ? await sharp(restoreChecksum ? bytes : safeBytes).metadata() : undefined
        const sourceRef = 'studio-upload:' + session.id
        const {
          docs: [existing],
        } = await payload.find({
          collection: 'media-assets',
          overrideAccess: true,
          depth: 0,
          limit: 1,
          where: {
            and: [
              { site: { equals: actor.siteId } },
              { owner: { equals: actor.memberId } },
              { source: { equals: sourceRef } },
            ],
          },
        })
        const asset =
          existing ??
          (await persistReviewedCreatorMedia(
            payload,
            config,
            {
              user: { member: actor.memberId },
              scope: { kind: 'site', siteId: actor.siteId },
              title,
              altText,
              originalFilename: title + '.' + extension,
            },
            restoreChecksum
              ? { filename: source, size: bytes.length, checksum: hash }
              : { filename: derivative, size: safeBytes.length, checksum: checksum(safeBytes) },
            {
              kind,
              mimeType: storedMime,
              extension,
              source: sourceRef,
              private: true,
              width: image?.width,
              height: image?.height,
              durationSeconds: prepared.durationSeconds,
            },
          ))
        await payload.update({
          collection: 'media-upload-sessions',
          id: session.id,
          overrideAccess: true,
          data: {
            asset: asset.id,
            state: 'completed',
            failureReason: null,
            stagingClearedAt: new Date().toISOString(),
          },
        })
        return { id: asset.id, title }
      } catch (error) {
        await payload.update({
          collection: 'media-upload-sessions',
          id: session.id,
          overrideAccess: true,
          data: { state: 'cancelled', failureReason: 'The file could not be prepared.' },
        })
        throw error
      } finally {
        await rm(directory, { recursive: true, force: true, maxRetries: 3 }).catch((error) => {
          payload.logger.warn({ event: 'studio.upload.cleanup_failed', err: error })
        })
      }
    },
  )
}
