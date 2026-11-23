import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Payload } from 'payload'
import type { AppConfig } from '../core/config'
import { withExecutionLock } from '../operations/execution-lock'
import { assertLocalMediaCapacity, MediaCapacityError } from './storage'
import { MediaWorkflowError } from './workflow'

export const uploadChunkLimit = 8 * 1024 * 1024
export const uploadLifetimeMs = 24 * 60 * 60 * 1000
export const uploadSessionLock = (id: string) => `media-upload:${id}`
let activeUploadMutations = 0

// Each mutation holds its advisory connection and also needs ordinary pool connections.
export async function withUploadLock<T>(payload: Payload, lock: string, execute: () => Promise<T>) {
  if (activeUploadMutations >= 3)
    throw new MediaWorkflowError('Upload service is busy. Retry shortly.', 503)
  activeUploadMutations++
  try {
    return await withExecutionLock(payload, lock, execute)
  } finally {
    activeUploadMutations--
  }
}
export const uploadChunkSize = (size: number) =>
  Math.min(uploadChunkLimit, Math.max(256 * 1024, Math.ceil(size / 100)))
export const sha256 = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`

export function uploadDirectory(config: AppConfig, sessionId: string) {
  if (!/^[a-f0-9-]{16,64}$/i.test(sessionId))
    throw new MediaWorkflowError('Invalid upload session.', 400)
  return path.join(config.storage.mediaDir, '.upload-sessions', sessionId)
}

export function creatorAssetDirectory(config: AppConfig, sessionId: string) {
  uploadDirectory(config, sessionId)
  return path.join(config.storage.mediaDir, '.creator-assets', sessionId)
}

async function requireStagingCapacity(directory: string, bytes: number) {
  try {
    await assertLocalMediaCapacity(directory, bytes)
  } catch (error) {
    if (error instanceof MediaCapacityError) throw new MediaWorkflowError(error.message, 507)
    throw error
  }
}

export async function stageUploadChunk(
  directory: string,
  index: number,
  bytes: Uint8Array,
  flush = false,
) {
  const filename = path.join(directory, `${index}.part`)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const existing = await readFile(filename).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return undefined
  })
  const hash = sha256(bytes)
  if (existing) {
    if (sha256(existing) !== hash)
      throw new MediaWorkflowError('Chunk retry bytes do not match the original chunk.', 409)
  } else {
    await requireStagingCapacity(directory, bytes.byteLength)
    const temporary = filename + '.incoming'
    try {
      await writeFile(temporary, bytes, { mode: 0o600, flush })
      await rename(temporary, filename)
    } finally {
      await rm(temporary, { force: true })
    }
  }
  return hash
}

export async function assembleUpload(
  directory: string,
  size: number,
  chunkSize: number,
  manifest: Record<string, unknown>,
  requireHashes = true,
  destination = directory,
) {
  await mkdir(destination, { recursive: true, mode: 0o700 })
  await requireStagingCapacity(destination, size)
  const filename = path.join(destination, 'original')
  const temporary = filename + '.incoming'
  const hash = createHash('sha256')
  const count = Math.ceil(size / chunkSize)
  async function* parts() {
    for (let index = 0; index < count; index++) {
      const expected = Math.min(chunkSize, size - index * chunkSize)
      const part = createHash('sha256')
      let length = 0
      for await (const buffer of createReadStream(path.join(directory, `${index}.part`))) {
        const bytes = buffer as Buffer
        length += bytes.byteLength
        if (length > expected) throw new MediaWorkflowError('Staged chunk size changed.', 409)
        part.update(bytes)
        hash.update(bytes)
        yield bytes
      }
      const recorded = manifest[index]
      if (
        length !== expected ||
        ((requireHashes || recorded !== undefined) && recorded !== `sha256:${part.digest('hex')}`)
      )
        throw new MediaWorkflowError('Staged chunk integrity check failed.', 409)
    }
  }
  try {
    await pipeline(parts(), createWriteStream(temporary, { mode: 0o600 }))
    await rename(temporary, filename)
  } finally {
    await rm(temporary, { force: true })
  }
  return { filename, checksum: `sha256:${hash.digest('hex')}` }
}

export async function readBoundedUploadBody(request: Request, maximum: number, exact?: number) {
  const declared = request.headers.get('content-length')
  if (
    request.headers.has('content-encoding') ||
    (declared !== null &&
      (!/^\d+$/.test(declared) ||
        Number(declared) > maximum ||
        (exact !== undefined && Number(declared) !== exact)))
  )
    throw new MediaWorkflowError('Invalid upload Content-Length or encoding.', 413)
  if (!request.body) throw new MediaWorkflowError('Upload body is required.')
  const reader = request.body.getReader()
  const bytes = Buffer.allocUnsafe(exact ?? maximum)
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (length + value.byteLength > bytes.byteLength) {
        await reader.cancel().catch(() => undefined)
        throw new MediaWorkflowError('Upload body exceeds the allowed size.', 413)
      }
      bytes.set(value, length)
      length += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  if (exact !== undefined && length !== exact)
    throw new MediaWorkflowError('Chunk body does not match Content-Range.')
  return bytes.subarray(0, length)
}
