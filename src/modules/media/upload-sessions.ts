import { rm } from 'node:fs/promises'
import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'
import { withExecutionLock } from '../operations/execution-lock'
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
} from './upload-staging'
import { assertMediaPermission, MediaWorkflowError, uploadMediaFile } from './workflow'

type Doc = Record<string, unknown>
type Session = Doc & { id: string; state: string; asset?: string }
type Asset = Doc & { id: string }
const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')
const safeFilename = (value: string) =>
  value
    .replace(/[\u0000-\u001f\\/]/g, '_')
    .trim()
    .slice(0, 255)

async function resolveSessionOwnerMemberId(
  payload: Payload,
  user: Doc | null | undefined,
  allowCreate = false,
): Promise<string> {
  let owner = id(user?.member)
  if (!owner && user && typeof payload.find === 'function') {
    if (user.email) {
      const existing = await payload
        .find({
          collection: 'members',
          where: { email: { equals: String(user.email) } },
          limit: 1,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] as Doc[] }))
      if (existing.docs[0]) {
        owner = String(existing.docs[0].id)
      } else if (allowCreate && typeof payload.create === 'function') {
        const createdMember = await payload.create({
          collection: 'members',
          data: {
            displayName: String(user.email).split('@')[0],
            email: String(user.email),
            status: 'active',
          },
          overrideAccess: true,
        })
        owner = String(createdMember.id)
        try {
          await payload.update({
            collection: 'users',
            id: String(user.id),
            data: { member: owner },
            overrideAccess: true,
          } as never)
        } catch {
          // ignore
        }
      }
    }
  }
  return owner
}

export async function createUploadSession(
  payload: Payload,
  config: AppConfig,
  input: {
    user: Doc | null | undefined
    scope: {
      kind: 'site' | 'publication' | 'space'
      siteId: string
      publicationId?: string | null
      spaceId?: string | null
    }
    filename: string
    title?: string
    altText?: string
    caption?: string
    size: number
    checksum?: string
  },
) {
  await assertMediaPermission(payload, input.user, input.scope, 'content.edit')
  if (
    !Number.isSafeInteger(input.size) ||
    input.size < 1 ||
    input.size > config.storage.maxUploadBytes
  )
    throw new MediaWorkflowError('Media exceeds the configured upload limit.', 413)
  if (input.checksum && !/^sha256:[a-f0-9]{64}$/i.test(input.checksum))
    throw new MediaWorkflowError('Checksum must be a SHA-256 value.', 400)
  const filename = safeFilename(input.filename)
  if (!filename) throw new MediaWorkflowError('A filename is required.')
  const extMatch = /\.([a-z0-9]+)$/i.exec(filename)
  if (
    extMatch &&
    !new Set([
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'svg',
      'pdf',
      'mp3',
      'm4a',
      'ogg',
      'wav',
      'mp4',
      'vtt',
    ]).has(extMatch[1]!.toLowerCase())
  ) {
    throw new MediaWorkflowError('Unsupported media file type.', 415)
  }
  const owner = await resolveSessionOwnerMemberId(payload, input.user, true)
  if (!owner) throw new MediaWorkflowError('A staff member identity is required.', 403)
  const chunkSize = uploadChunkSize(input.size)
  return payload.create({
    collection: 'media-upload-sessions',
    overrideAccess: true,
    data: {
      site: input.scope.siteId,
      publication: input.scope.publicationId ?? null,
      space: input.scope.spaceId ?? null,
      owner,
      filename,
      title: safeFilename(input.title || filename),
      altText: input.altText || null,
      caption: input.caption || null,
      expectedSize: input.size,
      expectedChecksum: input.checksum || null,
      chunkSize,
      receivedBytes: 0,
      receivedChunks: [],
      chunkManifest: {},
      state: 'open',
      expiresAt: new Date(Date.now() + uploadLifetimeMs).toISOString(),
    },
  } as never) as unknown as Promise<Session>
}

async function ownedSession(payload: Payload, user: Doc | null | undefined, sessionId: string) {
  const session = (await payload
    .findByID({
      collection: 'media-upload-sessions',
      id: sessionId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => undefined)) as unknown as Session | undefined
  if (!session || session.creatorKey) throw new MediaWorkflowError('Upload session not found.', 404)
  // An account's role grants access to the Media Library, but never to another
  // publisher's resumable bytes.  A site owner is not a bypass here: session
  // IDs can be retained by a browser across restarts, so this must remain an
  // owner-bound capability at every operation.
  const ownerMemberId = await resolveSessionOwnerMemberId(payload, user, false)
  if (!user || !ownerMemberId || ownerMemberId !== id(session.owner))
    throw new MediaWorkflowError('Upload session access denied.', 403)
  await assertMediaPermission(
    payload,
    user,
    {
      kind: 'site',
      siteId: id(session.site),
      publicationId: id(session.publication) || null,
      spaceId: id(session.space) || null,
    },
    'content.edit',
  )
  if (
    new Date(String(session.expiresAt)).getTime() < Date.now() &&
    ['open', 'failed', 'finalizing', 'expired'].includes(session.state)
  )
    throw new MediaWorkflowError('Upload session expired. Start a new upload.', 410)
  return session
}

export async function writeUploadChunk(
  payload: Payload,
  config: AppConfig,
  user: Doc | null | undefined,
  sessionId: string,
  index: number,
  start: number,
  total: number,
  bytes: Uint8Array,
) {
  return withUploadLock(payload, uploadSessionLock(sessionId), async () => {
    const session = await ownedSession(payload, user, sessionId)
    if (session.state !== 'open' && session.state !== 'failed')
      throw new MediaWorkflowError('Upload session is not accepting chunks.', 409)
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      total !== Number(session.expectedSize) ||
      start !== index * Number(session.chunkSize) ||
      start >= total
    )
      throw new MediaWorkflowError('Invalid chunk range.', 400)
    const manifest = (session.chunkManifest ?? {}) as Record<string, unknown>
    if (manifest[index] && manifest[index] !== sha256(bytes))
      throw new MediaWorkflowError('Chunk retry bytes do not match the original chunk.', 409)
    if (bytes.byteLength !== Math.min(Number(session.chunkSize), total - start))
      throw new MediaWorkflowError('Invalid chunk range.', 400)
    const hash = await stageUploadChunk(uploadDirectory(config, sessionId), index, bytes)
    const chunks = Array.isArray(session.receivedChunks) ? session.receivedChunks.map(Number) : []
    const wasReceived = chunks.includes(index)
    const receivedBytes = Number(session.receivedBytes) + (wasReceived ? 0 : bytes.byteLength)
    if (!wasReceived || !manifest[index] || session.state === 'failed') {
      if (!wasReceived) {
        chunks.push(index)
        chunks.sort((a, b) => a - b)
      }
      await payload.update({
        collection: 'media-upload-sessions',
        id: sessionId,
        overrideAccess: true,
        data: {
          state: 'open',
          receivedChunks: chunks,
          chunkManifest: { ...manifest, [index]: hash },
          receivedBytes,
        },
      } as never)
    }
    return {
      received: wasReceived ? 0 : bytes.byteLength,
      receivedBytes,
      complete: start + bytes.byteLength === total,
    }
  })
}

/** Safe resume metadata; this deliberately excludes filenames' physical paths and object keys. */
export async function readUploadSession(
  payload: Payload,
  user: Doc | null | undefined,
  sessionId: string,
) {
  const session = await ownedSession(payload, user, sessionId)
  return {
    id: session.id,
    state: session.state,
    chunkSize: Number(session.chunkSize),
    expectedSize: Number(session.expectedSize),
    receivedBytes: Number(session.receivedBytes),
    receivedChunks: Array.isArray(session.receivedChunks) ? session.receivedChunks.map(Number) : [],
    expiresAt: session.expiresAt,
    failureReason: typeof session.failureReason === 'string' ? session.failureReason : undefined,
    assetId: typeof session.asset === 'string' ? session.asset : undefined,
  }
}

export async function finalizeUploadSession(
  payload: Payload,
  config: AppConfig,
  user: Doc | null | undefined,
  sessionId: string,
): Promise<Asset> {
  return withUploadLock(payload, uploadSessionLock(sessionId), async () => {
    const session = await ownedSession(payload, user, sessionId)
    if (session.state === 'completed' && session.asset) {
      const asset = (await payload.findByID({
        collection: 'media-assets',
        id: session.asset,
        depth: 0,
        overrideAccess: true,
      } as never)) as unknown as Asset
      if (!asset || id(asset.site) !== id(session.site) || id(asset.owner) !== id(session.owner))
        throw new MediaWorkflowError('Upload asset access denied.', 403)
      return asset
    }
    // Finalization is deliberately restart-safe. Staged chunks are immutable and
    // idempotent, so a process dying after the state transition must not strand a
    // publisher with bytes that can neither be resumed nor finalized.
    if (!['open', 'finalizing', 'failed'].includes(String(session.state)))
      throw new MediaWorkflowError('Upload session cannot be finalized.', 409)
    const expectedSize = Number(session.expectedSize),
      chunkSize = Number(session.chunkSize),
      count = Math.ceil(expectedSize / chunkSize)
    const chunks = Array.isArray(session.receivedChunks) ? session.receivedChunks.map(Number) : []
    if (
      chunks.length !== count ||
      !Array.from({ length: count }, (_, i) => chunks.includes(i)).every(Boolean)
    )
      throw new MediaWorkflowError('Upload is incomplete; resume the missing chunks.', 409)
    if (session.state !== 'finalizing')
      await payload.update({
        collection: 'media-upload-sessions',
        id: sessionId,
        overrideAccess: true,
        data: { state: 'finalizing', failureReason: null },
      } as never)
    try {
      const directory = uploadDirectory(config, sessionId)
      const assembled = await assembleUpload(
        directory,
        expectedSize,
        chunkSize,
        (session.chunkManifest ?? {}) as Record<string, unknown>,
        false,
      )
      if (
        typeof session.expectedChecksum === 'string' &&
        assembled.checksum !== session.expectedChecksum.toLowerCase()
      )
        throw new MediaWorkflowError('Uploaded checksum does not match. Retry the upload.', 400)
      await ownedSession(payload, user, sessionId)
      const asset = (await uploadMediaFile(
        payload,
        config,
        {
          user: { ...user, member: id(session.owner) },
          scope: {
            kind: 'site',
            siteId: id(session.site),
            publicationId: id(session.publication) || null,
            spaceId: id(session.space) || null,
          },
          title: String(session.title),
          altText: typeof session.altText === 'string' ? session.altText : undefined,
          caption: typeof session.caption === 'string' ? session.caption : undefined,
          originalFilename: String(session.filename),
        },
        { ...assembled, size: expectedSize },
      )) as unknown as Asset
      if (id(asset.site) !== id(session.site) || id(asset.owner) !== id(session.owner))
        throw new MediaWorkflowError('Upload asset access denied.', 403)
      await payload.update({
        collection: 'media-upload-sessions',
        id: sessionId,
        overrideAccess: true,
        data: { state: 'completed', asset: asset.id, receivedBytes: expectedSize },
      } as never)
      try {
        await rm(directory, { recursive: true, force: true })
        await payload.update({
          collection: 'media-upload-sessions',
          id: sessionId,
          overrideAccess: true,
          data: { stagingClearedAt: new Date().toISOString() },
        })
      } catch {
        // The cleanup worker retries after the successful asset commit.
      }
      return asset
    } catch (error) {
      await payload
        .update({
          collection: 'media-upload-sessions',
          id: sessionId,
          overrideAccess: true,
          data: {
            state: 'failed',
            failureReason:
              error instanceof MediaWorkflowError
                ? error.message
                : 'Finalization failed. Retry the upload.',
          },
        } as never)
        .catch(() => undefined)
      throw error
    }
  })
}

export async function cancelUploadSession(
  payload: Payload,
  config: AppConfig,
  user: Doc | null | undefined,
  sessionId: string,
) {
  return withUploadLock(payload, uploadSessionLock(sessionId), async () => {
    const session = await ownedSession(payload, user, sessionId)
    if (session.state === 'completed')
      throw new MediaWorkflowError('Completed uploads cannot be cancelled.', 409)
    await rm(uploadDirectory(config, sessionId), { recursive: true, force: true })
    return payload.update({
      collection: 'media-upload-sessions',
      id: sessionId,
      overrideAccess: true,
      data: { state: 'cancelled', stagingClearedAt: new Date().toISOString() },
    } as never)
  })
}

/** Worker-safe cleanup: only expired incomplete staging directories are removed. */
export async function cleanupExpiredUploadSessions(
  payload: Payload,
  config: AppConfig,
  staffSiteId?: string,
) {
  const result = (await payload.find({
    collection: 'media-upload-sessions',
    where: {
      and: [
        ...(staffSiteId
          ? [{ site: { equals: staffSiteId } }, { creatorKey: { exists: false } }]
          : []),
        { stagingClearedAt: { exists: false } },
        {
          or: [
            { state: { in: ['completed', 'cancelled', 'aborted', 'expired'] } },
            {
              and: [
                { expiresAt: { less_than: new Date().toISOString() } },
                { state: { in: ['open', 'failed', 'finalizing'] } },
              ],
            },
          ],
        },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as { docs: Session[] }
  let cleaned = 0
  for (const candidate of result.docs) {
    await withExecutionLock(payload, uploadSessionLock(candidate.id), async () => {
      const session = await payload.findByID({
        collection: 'media-upload-sessions',
        id: candidate.id,
        depth: 0,
        overrideAccess: true,
      })
      if (session.stagingClearedAt) return
      const incomplete = ['open', 'failed', 'finalizing'].includes(session.state)
      if (incomplete && Date.parse(session.expiresAt) > Date.now()) return
      const dir = uploadDirectory(config, session.id)
      await rm(dir, { recursive: true, force: true })
      if (session.creatorKey && session.state !== 'completed')
        await rm(creatorAssetDirectory(config, session.id), { recursive: true, force: true })
      await payload.update({
        collection: 'media-upload-sessions',
        id: session.id,
        overrideAccess: true,
        data: {
          ...(incomplete ? { state: 'expired' } : {}),
          stagingClearedAt: new Date().toISOString(),
        },
      })
      cleaned++
    })
  }
  return cleaned
}
