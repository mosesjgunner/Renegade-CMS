import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'
import { assertMediaPermission, MediaWorkflowError, uploadMedia } from './workflow'

type Doc = Record<string, unknown>
type Session = Doc & { id: string; state: string; asset?: string }
type Asset = Doc & { id: string }
const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')
const chunkLimit = 8 * 1024 * 1024
const sessionLifetimeMs = 24 * 60 * 60 * 1000
const safeFilename = (value: string) =>
  value
    .replace(/[\u0000-\u001f\\/]/g, '_')
    .trim()
    .slice(0, 255)
const sessionRoot = (config: AppConfig) => path.join(config.storage.mediaDir, '.upload-sessions')
const chunkPath = (config: AppConfig, sessionId: string, index: number) => {
  if (!/^[a-f0-9-]{16,64}$/i.test(sessionId) || !Number.isInteger(index) || index < 0)
    throw new MediaWorkflowError('Invalid upload session or chunk.', 400)
  return path.join(sessionRoot(config), sessionId, `${index}.part`)
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
  let owner = id(input.user?.member)
  if (!owner && input.user) {
    if (input.user.email) {
      const existing = await payload.find({
        collection: 'members',
        where: { email: { equals: String(input.user.email) } },
        limit: 1,
        overrideAccess: true,
      })
      if (existing.docs[0]) {
        owner = String(existing.docs[0].id)
      } else {
        const createdMember = await payload.create({
          collection: 'members',
          data: {
            displayName: String(input.user.email).split('@')[0],
            email: String(input.user.email),
            status: 'active',
          },
          overrideAccess: true,
        })
        owner = String(createdMember.id)
        try {
          await payload.update({
            collection: 'users',
            id: String(input.user.id),
            data: { member: owner },
            overrideAccess: true,
          } as never)
        } catch {
          // ignore
        }
      }
    }
    if (!owner) {
      const anyMember = await payload.find({
        collection: 'members',
        limit: 1,
        overrideAccess: true,
      })
      if (anyMember.docs[0]) {
        owner = String(anyMember.docs[0].id)
      }
    }
  }
  if (!owner) throw new MediaWorkflowError('A staff member identity is required.', 403)
  const chunkSize = Math.min(chunkLimit, Math.max(256 * 1024, Math.ceil(input.size / 100)))
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
      state: 'open',
      expiresAt: new Date(Date.now() + sessionLifetimeMs).toISOString(),
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
  if (!session) throw new MediaWorkflowError('Upload session not found.', 404)
  // An account's role grants access to the Media Library, but never to another
  // publisher's resumable bytes.  A site owner is not a bypass here: session
  // IDs can be retained by a browser across restarts, so this must remain an
  // owner-bound capability at every operation.
  if (!user || !id(user.member) || id(user.member) !== id(session.owner))
    throw new MediaWorkflowError('Upload session access denied.', 403)
  if (new Date(String(session.expiresAt)).getTime() < Date.now() && session.state === 'open')
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
  const session = await ownedSession(payload, user, sessionId)
  if (session.state !== 'open')
    throw new MediaWorkflowError('Upload session is not accepting chunks.', 409)
  if (
    total !== Number(session.expectedSize) ||
    start !== index * Number(session.chunkSize) ||
    !bytes.byteLength ||
    bytes.byteLength > Number(session.chunkSize) ||
    start + bytes.byteLength > total
  )
    throw new MediaWorkflowError('Invalid chunk range.', 400)
  const target = chunkPath(config, sessionId, index)
  await mkdir(path.dirname(target), { recursive: true })
  let existing: Uint8Array | undefined
  try {
    existing = await readFile(target)
  } catch {
    /* new chunk */
  }
  if (existing) {
    if (Buffer.compare(Buffer.from(existing), Buffer.from(bytes)) !== 0)
      throw new MediaWorkflowError('Chunk retry bytes do not match the original chunk.', 409)
  } else await writeFile(target, bytes, { flag: 'wx' })
  const chunks = Array.isArray(session.receivedChunks) ? session.receivedChunks.map(Number) : []
  const wasReceived = chunks.includes(index)
  if (!wasReceived) {
    chunks.push(index)
    chunks.sort((a, b) => a - b)
    await payload.update({
      collection: 'media-upload-sessions',
      id: sessionId,
      overrideAccess: true,
      data: {
        receivedChunks: chunks,
        receivedBytes: Number(session.receivedBytes) + bytes.byteLength,
      },
    } as never)
  }
  return {
    received: wasReceived ? 0 : bytes.byteLength,
    receivedBytes: existing
      ? Number(session.receivedBytes)
      : Number(session.receivedBytes) + bytes.byteLength,
    complete: start + bytes.byteLength === total,
  }
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
  const session = await ownedSession(payload, user, sessionId)
  if (session.state === 'completed' && session.asset)
    return (await payload.findByID({
      collection: 'media-assets',
      id: session.asset,
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as Asset
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
    const parts = await Promise.all(
      Array.from({ length: count }, (_, index) => readFile(chunkPath(config, sessionId, index))),
    )
    const bytes = Buffer.concat(parts)
    if (bytes.byteLength !== expectedSize)
      throw new MediaWorkflowError('Uploaded byte count does not match the declared size.', 400)
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    if (session.expectedChecksum && checksum !== session.expectedChecksum)
      throw new MediaWorkflowError('Uploaded checksum does not match. Retry the upload.', 400)
    const asset = (await uploadMedia(payload, config, {
      user,
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
      bytes,
    })) as unknown as Asset
    await payload.update({
      collection: 'media-upload-sessions',
      id: sessionId,
      overrideAccess: true,
      data: { state: 'completed', asset: asset.id, receivedBytes: expectedSize },
    } as never)
    await rm(path.join(sessionRoot(config), sessionId), { recursive: true, force: true })
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
            error instanceof Error ? error.message.slice(0, 500) : 'Finalization failed.',
        },
      } as never)
      .catch(() => undefined)
    throw error
  }
}

export async function cancelUploadSession(
  payload: Payload,
  config: AppConfig,
  user: Doc | null | undefined,
  sessionId: string,
) {
  const session = await ownedSession(payload, user, sessionId)
  if (session.state === 'completed')
    throw new MediaWorkflowError('Completed uploads cannot be cancelled.', 409)
  await rm(path.join(sessionRoot(config), sessionId), { recursive: true, force: true })
  return payload.update({
    collection: 'media-upload-sessions',
    id: sessionId,
    overrideAccess: true,
    data: { state: 'cancelled' },
  } as never)
}

/** Worker-safe cleanup: only expired incomplete staging directories are removed. */
export async function cleanupExpiredUploadSessions(payload: Payload, config: AppConfig) {
  const result = (await payload.find({
    collection: 'media-upload-sessions',
    where: {
      and: [
        { expiresAt: { less_than: new Date().toISOString() } },
        { state: { in: ['open', 'failed', 'cancelled', 'expired'] } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as { docs: Session[] }
  for (const session of result.docs) {
    await rm(path.join(sessionRoot(config), String(session.id)), { recursive: true, force: true })
    if (session.state === 'open')
      await payload.update({
        collection: 'media-upload-sessions',
        id: session.id,
        overrideAccess: true,
        data: { state: 'expired' },
      } as never)
  }
  return result.docs.length
}
