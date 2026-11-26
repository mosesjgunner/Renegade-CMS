import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YouTubeAdapter, nextUtcMidnight } from '@/modules/social/adapters/youtube'
import { youtubeReadonly, youtubeUpload } from '@/modules/creator-studio/youtube-metadata'
import type { AuthContext, MediaResolver, SocialVariant } from '@/modules/social/contracts'

const channelId = 'UCabcdefghijklmnopqrstuv'
const remoteId = 'testvideo01'
const session = 'synthetic-sensitive-upload-session'

const variant: SocialVariant = {
  id: 'yt-variant',
  accountId: 'yt-account',
  network: 'youtube',
  status: 'approved',
  idempotencyKey: 'approved-upload',
  text: 'Approved description',
  scheduledFor: new Date(Date.now() - 60_000).toISOString(),
  attachments: [{ mediaAssetId: 'owned-video', role: 'video' }],
  platformSettings: {
    channelId,
    title: 'Approved title',
    privacy: 'private',
    madeForKids: 'no',
    complianceConfirmed: true,
  },
}
const context: AuthContext = {
  accountId: variant.accountId,
  accountHandle: 'fixture-channel',
  network: 'youtube',
  externalAccountId: channelId,
  credentials: { refreshToken: 'synthetic-refresh-token' },
}

const media: MediaResolver = {
  resolveBuffer: vi.fn(),
  resolveUrl: vi.fn(),
  resolveVideo: vi.fn(async () => ({
    size: 64,
    mimeType: 'video/mp4',
    open: async () =>
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(64))
          controller.close()
        },
      }),
  })),
}

type VideoStatus = {
  uploadStatus: string
  failureReason?: string
  rejectionReason?: string
}

function provider(options?: {
  beginError?: { status: number; reason: string; retryAfter?: string }
  statuses?: VideoStatus[]
  uploads?: Array<{ id: string; title: string; description: string; publishedAt: string }>
  statusHttpError?: number
}) {
  const calls: string[] = []
  let statusCalls = 0
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input))
    const { hostname, pathname, searchParams } = url
    calls.push(`${init?.method ?? 'GET'} ${pathname}`)
    if (hostname === 'oauth2.googleapis.com' && pathname === '/token')
      return Response.json({
        access_token: 'synthetic-access',
        scope: `${youtubeReadonly} ${youtubeUpload}`,
      })
    expect(hostname).toBe('www.googleapis.com')
    if (pathname === '/youtube/v3/channels')
      return Response.json({
        items: [{ id: channelId, contentDetails: { relatedPlaylists: { uploads: 'fixture' } } }],
      })
    if (pathname === '/youtube/v3/playlistItems')
      return Response.json({
        items: (options?.uploads ?? []).map((upload) => ({
          contentDetails: { videoId: upload.id },
        })),
      })
    if (pathname === '/youtube/v3/videos') {
      const ids = (searchParams.get('id') ?? '').split(',')
      if (ids.length > 1 || options?.uploads?.some((upload) => upload.id === ids[0])) {
        return Response.json({
          items: (options?.uploads ?? []).map((upload) => ({
            id: upload.id,
            snippet: {
              channelId,
              title: upload.title,
              description: upload.description,
              publishedAt: upload.publishedAt,
            },
            status: { uploadStatus: 'processed' },
          })),
        })
      }
      if (options?.statusHttpError && statusCalls === 0) {
        statusCalls += 1
        return Response.json({ error: { errors: [{ reason: 'backendError' }] } }, { status: 503 })
      }
      const sequence = options?.statuses ?? [{ uploadStatus: 'processed' }]
      const status = sequence[Math.min(statusCalls, sequence.length - 1)]
      statusCalls += 1
      return Response.json({
        items: [
          {
            id: remoteId,
            snippet: { channelId },
            status: { privacyStatus: 'private', ...status },
          },
        ],
      })
    }
    if (searchParams.get('uploadType') === 'resumable') {
      if (options?.beginError)
        return Response.json(
          { error: { errors: [{ reason: options.beginError.reason }] } },
          {
            status: options.beginError.status,
            headers: options.beginError.retryAfter
              ? { 'retry-after': options.beginError.retryAfter }
              : {},
          },
        )
      return new Response(null, {
        headers: {
          location: `https://www.googleapis.com/upload/youtube/v3/videos?upload_id=${session}`,
        },
      })
    }
    expect(searchParams.get('upload_id')).toBe(session)
    return Response.json({ id: remoteId })
  })
  return { request, calls }
}

const fastAdapter = (request: typeof fetch, maxPolls = 5) =>
  new YouTubeAdapter(request, { sleep: async () => {}, pollIntervalMs: 0, maxPolls })

beforeEach(() => {
  vi.stubEnv('CREATOR_YOUTUBE_AUTHORIZED', 'true')
  vi.stubEnv('CREATOR_YOUTUBE_UPLOAD_AUTHORIZED', 'true')
  vi.stubEnv('CREATOR_YOUTUBE_PUBLIC_UPLOADS_AUTHORIZED', 'true')
  vi.stubEnv('CREATOR_YOUTUBE_CLIENT_ID', 'test-client-id')
  vi.stubEnv('CREATOR_YOUTUBE_CLIENT_SECRET', 'test-client-secret')
  vi.stubEnv('CREATOR_YOUTUBE_ALLOWED_CHANNELS', channelId)
  vi.stubEnv(
    'CREATOR_YOUTUBE_REDIRECT_URI',
    'https://creator.example.org/api/creator-studio/external-video/callback',
  )
  vi.stubEnv('RENEGADE_ENCRYPTION_KEY', '9'.repeat(64))
})
afterEach(() => vi.unstubAllEnvs())

describe('RC3-YT processing-confirmed receipt', () => {
  it('publishes only after YouTube confirms processing, across still-processing polls', async () => {
    const { request, calls } = provider({
      statuses: [
        { uploadStatus: 'uploaded' },
        { uploadStatus: 'uploaded' },
        { uploadStatus: 'processed' },
      ],
    })
    const result = await fastAdapter(request).publish(variant, context, media)
    expect(result).toMatchObject({
      status: 'published',
      remoteId,
      remoteUrl: `https://www.youtube.com/watch?v=${remoteId}`,
      rawResponse: { processingStatus: 'processed' },
      receipt: { rawResponse: { processingStatus: 'processed' } },
    })
    expect(calls.filter((call) => call === 'GET /youtube/v3/videos')).toHaveLength(3)
    expect(JSON.stringify(result)).not.toContain(session)
  })

  it('fails honestly with the provider reason when processing fails or is rejected', async () => {
    const failed = provider({ statuses: [{ uploadStatus: 'failed', failureReason: 'codec' }] })
    const failedResult = await fastAdapter(failed.request).publish(variant, context, media)
    expect(failedResult).toMatchObject({
      status: 'failed',
      error: { kind: 'validation', providerCode: 'codec' },
    })
    if (failedResult.status === 'failed')
      expect(failedResult.error.message).toContain('could not process')

    const rejected = provider({
      statuses: [{ uploadStatus: 'rejected', rejectionReason: 'duplicate' }],
    })
    const rejectedResult = await fastAdapter(rejected.request).publish(variant, context, media)
    expect(rejectedResult).toMatchObject({
      status: 'failed',
      error: { kind: 'validation', providerCode: 'duplicate' },
    })
    if (rejectedResult.status === 'failed')
      expect(rejectedResult.error.message).toContain('rejected')
  })

  it('stays unknown — never fake-published — when processing outlasts the poll bound', async () => {
    const { request } = provider({ statuses: [{ uploadStatus: 'uploaded' }] })
    const result = await fastAdapter(request, 3).publish(variant, context, media)
    expect(result).toMatchObject({
      status: 'unknown',
      remoteId,
      error: { kind: 'remote-unknown', remoteOutcome: 'unknown' },
    })
  })

  it('survives a transient poll error and still confirms processing', async () => {
    const { request } = provider({ statusHttpError: 503 })
    const result = await fastAdapter(request).publish(variant, context, media)
    expect(result).toMatchObject({ status: 'published', remoteId })
  })
})

describe('RC3-YT quota honesty', () => {
  it('names the 100-uploads-per-day bucket and retries at the UTC-midnight reset', async () => {
    const { request } = provider({
      beginError: { status: 403, reason: 'uploadLimitExceeded' },
    })
    const before = nextUtcMidnight()
    const result = await fastAdapter(request).publish(variant, context, media)
    const after = nextUtcMidnight()
    expect(result).toMatchObject({ status: 'failed', error: { kind: 'rate-limit' } })
    if (result.status === 'failed') {
      expect(result.error.message).toContain('100 uploads per day')
      expect([before, after]).toContain(result.error.retryAfter)
    }
  })

  it('treats the shared daily quota as a midnight reset, not an hourly retry', async () => {
    const { request } = provider({ beginError: { status: 403, reason: 'quotaExceeded' } })
    const result = await fastAdapter(request).publish(variant, context, media)
    expect(result).toMatchObject({ status: 'failed', error: { kind: 'rate-limit' } })
    if (result.status === 'failed') {
      expect(result.error.message).toContain('daily API quota')
      const retryAt = Date.parse(result.error.retryAfter ?? '')
      expect(retryAt).toBeGreaterThan(Date.now())
      expect(new Date(retryAt).toISOString()).toMatch(/T00:00:00\.000Z$/)
    }
  })

  it('keeps hourly rate limits on the retry-after header', async () => {
    const { request } = provider({
      beginError: { status: 429, reason: 'rateLimitExceeded', retryAfter: '3600' },
    })
    const started = Date.now()
    const result = await fastAdapter(request).publish(variant, context, media)
    expect(result).toMatchObject({ status: 'failed', error: { kind: 'rate-limit' } })
    if (result.status === 'failed') {
      const retryAt = Date.parse(result.error.retryAfter ?? '')
      expect(retryAt).toBeGreaterThanOrEqual(started + 3590_000)
      expect(retryAt).toBeLessThanOrEqual(Date.now() + 3600_000)
      expect(result.error.message).not.toContain('100 uploads per day')
    }
  })

  it('computes the next UTC midnight', () => {
    expect(nextUtcMidnight(Date.parse('2026-11-26T13:38:00.000Z'))).toBe('2026-11-27T00:00:00.000Z')
    expect(nextUtcMidnight(Date.parse('2026-11-26T00:00:00.000Z'))).toBe('2026-11-27T00:00:00.000Z')
  })
})

describe('RC3-YT read-only reconcile', () => {
  it('settles a stored video ID from provider truth and never sends', async () => {
    const { request, calls } = provider({ statuses: [{ uploadStatus: 'processed' }] })
    const result = await fastAdapter(request).reconcile(variant, {
      ...context,
      recoveryRemoteId: remoteId,
    })
    expect(result).toMatchObject({ status: 'published', remoteId })
    expect(calls.some((call) => call.includes('/upload/'))).toBe(false)
    expect(calls.some((call) => call.startsWith('PUT'))).toBe(false)
  })

  it('keeps a still-processing stored ID unknown with its ID attached', async () => {
    const { request } = provider({ statuses: [{ uploadStatus: 'uploaded' }] })
    const result = await fastAdapter(request).reconcile(variant, {
      ...context,
      recoveryRemoteId: remoteId,
    })
    expect(result).toMatchObject({ status: 'unknown', remoteId })
  })

  it('finds a lost-response upload by exact title and description on the channel', async () => {
    const { request } = provider({
      uploads: [
        {
          id: remoteId,
          title: 'Approved title',
          description: 'Approved description',
          publishedAt: new Date().toISOString(),
        },
      ],
    })
    const result = await fastAdapter(request).reconcile(variant, context)
    expect(result).toMatchObject({ status: 'published', remoteId })
  })

  it('stays unknown when no channel upload matches the approved content', async () => {
    const { request } = provider({
      uploads: [
        {
          id: remoteId,
          title: 'A different video',
          description: 'Approved description',
          publishedAt: new Date().toISOString(),
        },
      ],
    })
    const result = await fastAdapter(request).reconcile(variant, context)
    expect(result).toMatchObject({ status: 'unknown' })
    if (result.status === 'unknown') expect(result.remoteId).toBeUndefined()
  })
})
