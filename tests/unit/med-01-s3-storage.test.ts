/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage, s3MediaStorage } from '../../src/modules/media/storage'
import { deleteOrphanedMedia, uploadMedia } from '../../src/modules/media/workflow'

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0,
  0, 0, 1,
])

describe('MED-01 S3-compatible storage adapter & SigV4 verification', () => {
  const s3Config = {
    endpoint: 'https://s3.us-east-1.example.com',
    bucket: 'renegade-media',
    region: 'us-east-1',
    accessKeyId: 'TESTACCESSKEY12345',
    secretAccessKey: 'TESTSECRETKEY67890abcdef1234567890',
  }

  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('exposes correct S3 provider capabilities', () => {
    const storage = s3MediaStorage(s3Config)
    expect(storage.provider).toBe('s3')
    expect(storage.capabilities).toEqual({
      atomicWrite: true,
      privateObjects: true,
      checksumAddressed: true,
    })
  })

  it('generates valid AWS SigV4 signed PUT requests with sha256 checksum and headers', async () => {
    let capturedUrl: string | undefined
    let capturedMethod: string | undefined
    let capturedHeaders: Record<string, string> = {}
    let capturedBody: Uint8Array | undefined

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedMethod = init?.method
      capturedHeaders = (init?.headers as Record<string, string>) ?? {}
      capturedBody = init?.body ? new Uint8Array(init.body as ArrayBuffer) : undefined
      return new Response(null, { status: 200 })
    })

    const storage = s3MediaStorage(s3Config)
    await storage.put('site-1/test-object.png', png, 'image/png')

    expect(capturedUrl).toBe(
      'https://s3.us-east-1.example.com/renegade-media/site-1/test-object.png',
    )
    expect(capturedMethod).toBe('PUT')
    expect(capturedHeaders['content-type']).toBe('image/png')
    expect(capturedHeaders['host']).toBe('s3.us-east-1.example.com')
    expect(capturedHeaders['x-amz-content-sha256']).toMatch(/^[a-f0-9]{64}$/)
    expect(capturedHeaders['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/)

    // Verify SigV4 Authorization header structure
    const auth = capturedHeaders['authorization']
    expect(auth).toBeTruthy()
    expect(auth).toMatch(
      /^AWS4-HMAC-SHA256 Credential=TESTACCESSKEY12345\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/,
    )
    expect(Array.from(capturedBody ?? [])).toEqual(Array.from(png))
  })

  it('handles GET requests returning bytes, graceful 404 as undefined, and errors on 500', async () => {
    const storage = s3MediaStorage(s3Config)

    // Successful GET
    globalThis.fetch = vi.fn(async () => new Response(png, { status: 200 }))
    const result = await storage.get('site-1/existing.png')
    expect(result).toBeDefined()
    expect(Array.from(result ?? [])).toEqual(Array.from(png))

    // 404 Not Found returns undefined
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 }))
    const missing = await storage.get('site-1/missing.png')
    expect(missing).toBeUndefined()

    // 500 Internal Error throws
    globalThis.fetch = vi.fn(async () => new Response('Internal Server Error', { status: 500 }))
    await expect(storage.get('site-1/error.png')).rejects.toThrow(
      'Object storage GET failed with 500.',
    )
  })

  it('signs and executes DELETE requests and handles errors', async () => {
    let capturedMethod: string | undefined
    let capturedHeaders: Record<string, string> = {}

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedMethod = init?.method
      capturedHeaders = (init?.headers as Record<string, string>) ?? {}
      return new Response(null, { status: 204 })
    })

    const storage = s3MediaStorage(s3Config)
    await storage.remove('site-1/delete-me.png')

    expect(capturedMethod).toBe('DELETE')
    expect(capturedHeaders['authorization']).toMatch(
      /^AWS4-HMAC-SHA256 Credential=TESTACCESSKEY12345/,
    )

    globalThis.fetch = vi.fn(async () => new Response('Forbidden', { status: 403 }))
    await expect(storage.remove('site-1/forbidden.png')).rejects.toThrow(
      'Object storage DELETE failed with 403.',
    )
  })

  it('integrates with uploadMedia and deleteOrphanedMedia end-to-end under STORAGE_DRIVER=s3', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      STORAGE_DRIVER: 's3',
      MEDIA_DIR: './media',
      S3_ENDPOINT: s3Config.endpoint,
      S3_BUCKET: s3Config.bucket,
      S3_REGION: s3Config.region,
      S3_ACCESS_KEY_ID: s3Config.accessKeyId,
      S3_SECRET_ACCESS_KEY: s3Config.secretAccessKey,
    })

    expect(mediaStorage(config).provider).toBe('s3')

    const uploadedObjects = new Map<string, Uint8Array>()
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const key = url.replace(`https://s3.us-east-1.example.com/renegade-media/`, '')

      if (method === 'PUT') {
        uploadedObjects.set(key, new Uint8Array(init?.body as ArrayBuffer))
        return new Response(null, { status: 200 })
      }
      if (method === 'GET') {
        const data = uploadedObjects.get(key)
        return data
          ? new Response(Buffer.from(data), { status: 200 })
          : new Response(null, { status: 404 })
      }
      if (method === 'DELETE') {
        uploadedObjects.delete(key)
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 400 })
    })

    const records: Record<string, any> = {}
    let n = 0
    const payload = {
      find: async ({ collection }: any) => {
        if (collection === 'team-memberships')
          return { docs: [{ id: 'mem-1', role: 'editor', grants: [] }] }
        if (collection === 'media-usages') return { docs: [] }
        if (collection === 'media-assets') return { docs: [] }
        return { docs: [] }
      },
      findByID: async ({ id }: any) => records[id],
      create: async ({ collection, data }: any) => {
        const id = `${collection}-${++n}`
        const record = { id, ...data }
        records[id] = record
        return record
      },
      update: async ({ id, data }: any) => Object.assign(records[id], data),
      delete: async ({ id }: any) => delete records[id],
    }

    const user = { role: 'staff', member: 'member-1' }
    const asset = await uploadMedia(payload as never, config, {
      user,
      scope: { kind: 'site', siteId: 'site-alpha' },
      title: 'S3-backed image',
      bytes: png,
    })

    expect(asset).toBeTruthy()
    expect(records[asset.id]).toBeTruthy()
    expect(uploadedObjects.size).toBe(1)

    // S3 blob deletion
    await deleteOrphanedMedia(payload as never, config, user, {
      scope: { kind: 'site', siteId: 'site-alpha' },
      mediaId: asset.id,
    })

    expect(uploadedObjects.size).toBe(0)
    expect(records[asset.id]).toBeUndefined()
  })
})
