import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YouTubeAdapter, youtubeApprovedSettings } from '@/modules/social/adapters/youtube'
import { youtubeReadonly, youtubeUpload } from '@/modules/creator-studio/youtube-metadata'
import { manualVideo } from '@/modules/creator-studio/video-providers'
import { socialProviderFor } from '@/modules/social/provider-runtime'
import type { AuthContext, MediaResolver, SocialVariant } from '@/modules/social/contracts'

const id = 'UCabcdefghijklmnopqrstuv'
const session = 'synthetic-sensitive-upload-session'
const remoteId = 'testvideo01'
const part = 8 * 1024 * 1024
const variant: SocialVariant = {
  id: 'draft-variant',
  accountId: 'yt-account',
  network: 'youtube',
  status: 'approved',
  idempotencyKey: 'approved-upload',
  text: 'Approved description',
  attachments: [{ mediaAssetId: 'owned-video', role: 'video' }],
  platformSettings: {
    channelId: id,
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
  externalAccountId: id,
  credentials: { refreshToken: 'synthetic-refresh-token' },
}

function resolver() {
  const buffer = vi.fn(() => {
    throw new Error('Whole asset resolution must never run.')
  })
  const open = vi.fn(async (start: number, end: number) => {
    let remaining = end - start + 1
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!remaining) return controller.close()
        const bytes = new Uint8Array(Math.min(remaining, 256 * 1024))
        remaining -= bytes.byteLength
        controller.enqueue(bytes)
      },
    })
  })
  const media: MediaResolver = {
    resolveBuffer: buffer,
    resolveUrl: vi.fn(),
    resolveVideo: vi.fn(async () => ({ size: part + 99, mimeType: 'video/mp4', open })),
  }
  return { media, buffer, open }
}

function provider(options?: { scope?: string; status?: number; location?: string }) {
  const calls: string[] = []
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const { hostname, pathname, searchParams } = new URL(String(input))
    const range = new Headers(init?.headers).get('content-range')
    calls.push(range ?? pathname)
    if (hostname === 'oauth2.googleapis.com' && pathname === '/token')
      return Response.json({
        access_token: 'synthetic-access',
        scope: options?.scope ?? `${youtubeReadonly} ${youtubeUpload}`,
      })
    expect(hostname).toBe('www.googleapis.com')
    if (pathname === '/youtube/v3/channels') {
      expect(searchParams.get('mine')).toBe('true')
      return Response.json({
        items: [{ id, contentDetails: { relatedPlaylists: { uploads: 'fixture' } } }],
      })
    }
    if (searchParams.get('uploadType') === 'resumable') {
      if (options?.status)
        return Response.json(
          {
            error: { message: session, errors: [{ reason: 'quotaExceeded' }] },
          },
          { status: options.status, headers: { 'retry-after': '3600' } },
        )
      return new Response(null, {
        headers: {
          location:
            options?.location ??
            `https://www.googleapis.com/upload/youtube/v3/videos?upload_id=${session}`,
        },
      })
    }
    expect(searchParams.get('upload_id')).toBe(session)
    expect(init?.redirect).toBe('manual')
    if (range?.startsWith('bytes */')) {
      expect(init?.body).toBeUndefined()
      return new Response(null, { status: 308, headers: { range: `bytes=0-${part - 1}` } })
    }
    expect(init?.body).toBeInstanceOf(ReadableStream)
    const reader = (init!.body as ReadableStream<Uint8Array>).getReader()
    let count = 0
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      count += chunk.value.byteLength
    }
    if (range?.startsWith('bytes 0-')) {
      expect(count).toBe(part)
      throw new Error(`Lost response for ${session}`)
    }
    expect(count).toBe(99)
    return Response.json({ id: remoteId, internal: session })
  })
  return { request, calls }
}

beforeEach(() => {
  vi.stubEnv('CREATOR_YOUTUBE_AUTHORIZED', 'true')
  vi.stubEnv('CREATOR_YOUTUBE_UPLOAD_AUTHORIZED', 'true')
  vi.stubEnv('CREATOR_YOUTUBE_CLIENT_ID', 'test-client-id')
  vi.stubEnv('CREATOR_YOUTUBE_CLIENT_SECRET', 'test-client-secret')
  vi.stubEnv('CREATOR_YOUTUBE_ALLOWED_CHANNELS', id)
  vi.stubEnv(
    'CREATOR_YOUTUBE_REDIRECT_URI',
    'https://creator.example.org/api/creator-studio/external-video/callback',
  )
  vi.stubEnv('RENEGADE_ENCRYPTION_KEY', '9'.repeat(64))
})
afterEach(() => vi.unstubAllEnvs())

describe('YouTube outbound video', () => {
  it('streams ranges and probes the same session after an interrupted response', async () => {
    const { request, calls } = provider()
    const { media, buffer, open } = resolver()
    const result = await new YouTubeAdapter(request).publish(variant, context, media)
    expect(result).toMatchObject({ status: 'published', remoteId, rawResponse: { id: remoteId } })
    expect(JSON.stringify(result)).not.toContain(session)
    expect(buffer).not.toHaveBeenCalled()
    expect(open.mock.calls).toEqual([
      [0, part - 1],
      [part, part + 98],
    ])
    expect(calls).toEqual([
      '/token',
      '/youtube/v3/channels',
      '/upload/youtube/v3/videos',
      `bytes 0-${part - 1}/${part + 99}`,
      `bytes */${part + 99}`,
      `bytes ${part}-${part + 98}/${part + 99}`,
    ])
  })

  it('halts before bytes on scope, certification, privacy, quota and invalid session URL', async () => {
    const { media, open } = resolver()
    const scoped = provider({ scope: youtubeReadonly })
    expect(await new YouTubeAdapter(scoped.request).publish(variant, context, media)).toMatchObject(
      {
        status: 'failed',
        error: { kind: 'reconnect-required' },
      },
    )
    expect(scoped.calls).toEqual(['/token'])
    const quota = provider({ status: 403 })
    const refusal = await new YouTubeAdapter(quota.request).publish(variant, context, media)
    expect(refusal).toMatchObject({
      status: 'failed',
      error: { kind: 'rate-limit', retryAfter: expect.any(String) },
    })
    expect(JSON.stringify(refusal)).not.toContain(session)
    const badLocation = provider({
      location: 'https://example.org/upload/youtube/v3/videos?upload_id=fake',
    })
    expect(
      (await new YouTubeAdapter(badLocation.request).publish(variant, context, media)).status,
    ).toBe('failed')
    expect(badLocation.calls).toHaveLength(3)
    const noNetwork = vi.fn<typeof fetch>()
    for (const platformSettings of [
      undefined,
      { ...variant.platformSettings, title: 't'.repeat(101) },
      { ...variant.platformSettings, complianceConfirmed: false },
      { ...variant.platformSettings, channelId: 'UCabcdefghijklmnopqrstuw' },
      { ...variant.platformSettings, privacy: 'public' },
    ]) {
      expect(
        await new YouTubeAdapter(noNetwork).publish(
          { ...variant, platformSettings },
          context,
          media,
        ),
      ).toMatchObject({
        status: 'failed',
        error: { kind: 'validation' },
      })
    }
    expect(noNetwork).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    expect(youtubeApprovedSettings('youtube', variant.platformSettings)).toEqual({
      platformSettings: variant.platformSettings,
    })
  })

  it('uses manual handoff without explicit live upload authorization', () => {
    vi.stubEnv('CREATOR_YOUTUBE_UPLOAD_AUTHORIZED', '')
    expect(socialProviderFor('youtube').mode).toBe('manual-handoff')
    expect(socialProviderFor('tiktok').mode).toBe('manual-handoff')
  })
})

it('only accepts Vimeo IDs and exact approved HTTPS player or direct-video origins', () => {
  vi.stubEnv('CREATOR_DIRECT_VIDEO_ORIGINS', 'https://media.example.org')
  vi.stubEnv('CREATOR_CUSTOM_EMBED_ORIGINS', 'https://players.example.org')
  expect(manualVideo('vimeo', 'https://vimeo.com/123').url).toBe(
    'https://player.vimeo.com/video/123',
  )
  expect(manualVideo('direct-video', 'https://media.example.org/my-video.mp4').url).toBe(
    'https://media.example.org/my-video.mp4',
  )
  expect(manualVideo('custom-https', 'https://players.example.org/embed/12').url).toBe(
    'https://players.example.org/embed/12',
  )
  for (const input of [
    'javascript:alert(1)',
    'https://127.0.0.1/my-video.mp4',
    'https://players.example.org.evil.com/embed/12',
    'https://name:password@players.example.org/embed/12',
    'https://players.example.org:9000/embed/12',
    'https://players.example.org/embed/12?token=secret',
  ])
    expect(() => manualVideo('custom-https', input)).toThrow()
  vi.stubEnv('CREATOR_DIRECT_VIDEO_ORIGINS', 'https://r123.googlevideo.com')
  expect(() => manualVideo('direct-video', 'https://r123.googlevideo.com/video.mp4')).toThrow()
})
