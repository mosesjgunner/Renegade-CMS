import { createHash, createHmac, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { AppConfig } from '../core/config'

export const supportedMediaTypes = {
  'image/png': { kind: 'image', extension: 'png' },
  'image/jpeg': { kind: 'image', extension: 'jpg' },
  'image/gif': { kind: 'image', extension: 'gif' },
  'image/webp': { kind: 'image', extension: 'webp' },
  'image/svg+xml': { kind: 'image', extension: 'svg' },
  'application/pdf': { kind: 'document', extension: 'pdf' },
  'audio/mpeg': { kind: 'audio', extension: 'mp3' },
  'video/mp4': { kind: 'video', extension: 'mp4' },
  'text/vtt': { kind: 'document', extension: 'vtt' },
} as const

export type SupportedMimeType = keyof typeof supportedMediaTypes
export type MediaInspection = {
  mimeType: SupportedMimeType
  kind: (typeof supportedMediaTypes)[SupportedMimeType]['kind']
  extension: string
  width?: number
  height?: number
  sha256: string
}

const signature = (bytes: Uint8Array, value: number[]) =>
  value.every((byte, offset) => bytes[offset] === byte)
const ascii = (bytes: Uint8Array, start: number, value: string) =>
  [...value].every((character, offset) => bytes[start + offset] === character.charCodeAt(0))
const numberAt = (bytes: Uint8Array, offset: number, length: number, littleEndian = false) => {
  if (offset + length > bytes.length) return undefined
  let value = 0
  for (let index = 0; index < length; index++) {
    const position = littleEndian ? offset + index : offset + length - 1 - index
    value += bytes[position] * 256 ** index
  }
  return value
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined
    const marker = bytes[offset + 1]
    const length = numberAt(bytes, offset + 2, 2)
    if (!length || length < 2) return undefined
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: numberAt(bytes, offset + 5, 2), width: numberAt(bytes, offset + 7, 2) }
    }
    offset += length + 2
  }
  return undefined
}

/** Content sniffing is deliberately allow-list based; headers and extensions are never trusted. */
export function inspectMedia(bytes: Uint8Array): MediaInspection {
  const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  if (signature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    const width = numberAt(bytes, 16, 4)
    const height = numberAt(bytes, 20, 4)
    if (!width || !height) throw new Error('Corrupt PNG image.')
    return { ...supportedMediaTypes['image/png'], mimeType: 'image/png', width, height, sha256 }
  }
  if (signature(bytes, [0xff, 0xd8, 0xff])) {
    const dimensions = jpegDimensions(bytes)
    if (!dimensions?.width || !dimensions.height) throw new Error('Corrupt JPEG image.')
    return { ...supportedMediaTypes['image/jpeg'], mimeType: 'image/jpeg', ...dimensions, sha256 }
  }
  if (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a')) {
    const width = numberAt(bytes, 6, 2, true)
    const height = numberAt(bytes, 8, 2, true)
    if (!width || !height) throw new Error('Corrupt GIF image.')
    return { ...supportedMediaTypes['image/gif'], mimeType: 'image/gif', width, height, sha256 }
  }
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) {
    return { ...supportedMediaTypes['image/webp'], mimeType: 'image/webp', sha256 }
  }
  if (ascii(bytes, 0, '%PDF-'))
    return { ...supportedMediaTypes['application/pdf'], mimeType: 'application/pdf', sha256 }
  if (ascii(bytes, 0, 'ID3') || signature(bytes, [0xff, 0xfb]))
    return { ...supportedMediaTypes['audio/mpeg'], mimeType: 'audio/mpeg', sha256 }
  // ISO base media files place the ftyp box at byte four. We deliberately do not
  // infer a codec: the browser receives the original, content-sniffed MP4 only.
  if (ascii(bytes, 4, 'ftyp'))
    return { ...supportedMediaTypes['video/mp4'], mimeType: 'video/mp4', sha256 }
  if (new TextDecoder().decode(bytes.slice(0, 6)).startsWith('WEBVTT'))
    return { ...supportedMediaTypes['text/vtt'], mimeType: 'text/vtt', sha256 }
  const svg = inspectSvg(bytes)
  if (svg) {
    return {
      ...supportedMediaTypes['image/svg+xml'],
      mimeType: 'image/svg+xml',
      ...svg,
      sha256,
    }
  }
  throw new Error('Unsupported or corrupt media file.')
}

function inspectSvg(bytes: Uint8Array): { width?: number; height?: number } | null {
  if (bytes.length > 5 * 1024 * 1024) return null
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const trimmed = text.trim()
  if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml') && !trimmed.startsWith('<!--'))
    return null
  if (!/<svg[\s>]/i.test(trimmed)) return null

  const lower = trimmed.toLowerCase()
  const unsafePatterns = [
    /<script[\s>]/i,
    /<\/script>/i,
    /javascript:/i,
    /<foreignobject[\s>]/i,
    /<iframe[\s>]/i,
    /<object[\s>]/i,
    /<embed[\s>]/i,
    /\son\w+\s*=/i,
    /xlink:href\s*=\s*["']\s*data:/i,
    /href\s*=\s*["']\s*data:/i,
    /<!entity/i,
  ]
  for (const pattern of unsafePatterns) {
    if (pattern.test(lower)) {
      throw new Error('SVG contains unsafe elements or scripts.')
    }
  }

  const widthMatch = text.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i)
  const heightMatch = text.match(/\bheight=["']([0-9.]+)(?:px)?["']/i)
  const width = widthMatch ? Math.round(parseFloat(widthMatch[1]!)) : undefined
  const height = heightMatch ? Math.round(parseFloat(heightMatch[1]!)) : undefined

  return { width, height }
}

export function mediaObjectKey(siteId: string, extension: string) {
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(siteId)) throw new Error('Invalid site scope.')
  if (!/^[a-z0-9]{1,10}$/.test(extension)) throw new Error('Invalid media extension.')
  return `${siteId}/${randomUUID()}.${extension}`
}

function localPath(mediaDir: string, key: string) {
  const resolvedRoot = path.resolve(mediaDir)
  const target = path.resolve(resolvedRoot, key)
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('Unsafe media path.')
  return target
}

export type MediaStorage = {
  provider: 'local' | 's3'
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>
  get(key: string): Promise<Uint8Array | undefined>
  remove(key: string): Promise<void>
}

export function localMediaStorage(mediaDir: string): MediaStorage {
  return {
    provider: 'local',
    async put(key, bytes) {
      const target = localPath(mediaDir, key)
      await mkdir(path.dirname(target), { recursive: true })
      const temporary = `${target}.${randomUUID()}.uploading`
      await writeFile(temporary, bytes, { flag: 'wx' })
      await rename(temporary, target)
    },
    async get(key) {
      try {
        return await readFile(localPath(mediaDir, key))
      } catch (error: unknown) {
        if ((error as { code?: string }).code === 'ENOENT') return undefined
        throw error
      }
    },
    async remove(key) {
      await rm(localPath(mediaDir, key), { force: true })
    },
  }
}

// The adapter intentionally uses the S3-compatible REST protocol so MinIO/R2/S3 do not need a second asset model.
export function s3MediaStorage(config: NonNullable<AppConfig['storage']['s3']>): MediaStorage {
  const endpoint = new URL(config.endpoint)
  const request = async (
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    body?: Uint8Array,
    mimeType?: string,
  ) => {
    const objectPath = `${endpoint.pathname.replace(/\/$/, '')}/${encodeURIComponent(config.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`
    const url = new URL(objectPath, endpoint)
    const payloadHash = createHash('sha256')
      .update(body ?? '')
      .digest('hex')
    const now = new Date()
    const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '')
    const date = amzDate.slice(0, 8)
    const headers: Record<string, string> = {
      host: endpoint.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    }
    if (mimeType) headers['content-type'] = mimeType
    const signedHeaderNames = Object.keys(headers).sort()
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('')
    const signedHeaders = signedHeaderNames.join(';')
    const canonicalRequest = [
      method,
      url.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n')
    const scope = `${date}/${config.region}/s3/aws4_request`
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n')
    const hmac = (secret: Uint8Array | string, value: string) =>
      createHmac('sha256', secret).update(value).digest()
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, date), config.region), 's3'),
      'aws4_request',
    )
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${createHmac('sha256', signingKey).update(stringToSign).digest('hex')}`
    const response = await fetch(url, {
      method,
      headers,
      body: body ? Buffer.from(body) : undefined,
    })
    if (response.status === 404 && method === 'GET') return undefined
    if (!response.ok) throw new Error(`Object storage ${method} failed with ${response.status}.`)
    return method === 'GET' ? new Uint8Array(await response.arrayBuffer()) : undefined
  }
  return {
    provider: 's3',
    put: (key, bytes, mimeType) => request('PUT', key, bytes, mimeType).then(() => undefined),
    get: (key) => request('GET', key),
    remove: (key) => request('DELETE', key).then(() => undefined),
  }
}

export function mediaStorage(config: AppConfig): MediaStorage {
  return config.storage.driver === 's3' && config.storage.s3
    ? s3MediaStorage(config.storage.s3)
    : localMediaStorage(config.storage.mediaDir)
}
