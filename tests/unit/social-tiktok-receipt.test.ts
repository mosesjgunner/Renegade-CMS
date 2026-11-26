import { describe, it, expect, afterEach, vi } from 'vitest'
import { TikTokAdapter } from '@/modules/social/adapters/tiktok'
import type { SocialVariant, MediaResolver, AuthContext } from '@/modules/social/contracts'

/**
 * RC3-TT: the TikTok adapter must never report a publication TikTok has
 * not confirmed. Before this fix, publish() returned 'published' with a
 * fabricated URL (`https://www.tiktok.com/@creator/video/<publish task
 * id>`) the moment the byte upload finished. These tests pin the receipt
 * gate: only a SUCCESS from TikTok's publish-status endpoint counts as
 * published, the URL is built only from the real post ID TikTok returns,
 * FAILED surfaces TikTok's own reason, and a task that never resolves
 * stays 'unknown'.
 */

const PUBLISH_ID = 'v_pub_task_4242'
const POST_ID = '7291234567890123'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

const mockMediaResolver: MediaResolver = {
  resolveUrl: async (assetId: string) => `https://cdn.renegade.media/${assetId}.mp4`,
  resolveBuffer: async (assetId: string) => ({
    buffer: Buffer.from(`mock-binary-video-stream-${assetId}`),
    mimeType: 'video/mp4',
    fileName: `${assetId}.mp4`,
  }),
}

const context: AuthContext = {
  accountId: 'tt-acc-1',
  accountHandle: 'renegade_shorts',
  network: 'tiktok',
  credentials: { accessToken: 'act.tiktok_bearer_token_test' },
}

const variant: SocialVariant = {
  id: 'var-tiktok-receipt',
  accountId: 'tt-acc-1',
  network: 'tiktok',
  text: 'Receipt gate test caption',
  attachments: [{ mediaAssetId: 'vid-receipt', role: 'video' }],
  status: 'approved',
  idempotencyKey: 'idem-tiktok-receipt-1',
}

type StatusStep =
  | { status: 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' }
  | { status: 'SUCCESS'; postId?: string }
  | { status: 'FAILED'; failReason?: string }
  | 'throw'

function mockTikTok(statusScript: StatusStep[]) {
  const calls: string[] = []
  let statusCalls = 0
  globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${url}`)
    if (url.includes('/video/init/')) {
      return new Response(
        JSON.stringify({
          data: {
            publish_id: PUBLISH_ID,
            upload_url: 'https://storage.tiktok.com/upload/chunk_4242',
          },
        }),
        { status: 200 },
      )
    }
    if (url.includes('/upload/chunk_4242')) {
      return new Response(null, { status: 200 })
    }
    if (url.includes('/status/fetch/')) {
      const step = statusScript[Math.min(statusCalls, statusScript.length - 1)]
      statusCalls += 1
      if (step === 'throw') throw new Error('socket hang up')
      if (typeof step === 'object' && step !== null && 'status' in step) {
        const data: Record<string, unknown> = { status: step.status }
        if (step.status === 'SUCCESS' && step.postId) {
          data.publicaly_available_post_id = [step.postId]
        }
        if (step.status === 'FAILED' && step.failReason) {
          data.fail_reason = step.failReason
        }
        return new Response(JSON.stringify({ data }), { status: 200 })
      }
      return new Response(JSON.stringify({ data: { status: step } }), { status: 200 })
    }
    return new Response('Not Found', { status: 404 })
  })
  return { calls, statusCallCount: () => statusCalls }
}

function fastAdapter(maxPolls = 5) {
  return new TikTokAdapter({ sleep: async () => {}, pollIntervalMs: 0, maxPolls })
}

function expectNoFabrication(result: unknown) {
  const serialized = JSON.stringify(result)
  expect(serialized).not.toContain('@creator')
  expect(serialized).not.toContain(`/video/${PUBLISH_ID}`)
}

describe('TikTokAdapter publish receipt gate (RC3-TT)', () => {
  it('reports published only after TikTok confirms SUCCESS, with the real post URL', async () => {
    const { statusCallCount } = mockTikTok([
      { status: 'PROCESSING_UPLOAD' },
      { status: 'SUCCESS', postId: POST_ID },
    ])

    const result = await fastAdapter().publish(variant, context, mockMediaResolver)

    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe(POST_ID)
      expect(result.remoteUrl).toBe(`https://www.tiktok.com/@renegade_shorts/video/${POST_ID}`)
      expect(result.receipt?.remotePostId).toBe(POST_ID)
      expect(result.receipt?.remoteUrl).toBe(result.remoteUrl)
    }
    expect(statusCallCount()).toBe(2)
    expectNoFabrication(result)
  })

  it('surfaces TikTok’s own failure reason when the publish task FAILED', async () => {
    mockTikTok([
      { status: 'PROCESSING_UPLOAD' },
      { status: 'FAILED', failReason: 'file_format_check_failed' },
    ])

    const result = await fastAdapter().publish(variant, context, mockMediaResolver)

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error.providerCode).toBe('file_format_check_failed')
      expect(result.error.message).toContain('file_format_check_failed')
    }
    expectNoFabrication(result)
  })

  it('stays unknown — never published — when processing never resolves within the bound', async () => {
    const { statusCallCount } = mockTikTok([{ status: 'PROCESSING_UPLOAD' }])

    const result = await fastAdapter(3).publish(variant, context, mockMediaResolver)

    expect(result.status).toBe('unknown')
    if (result.status === 'unknown') {
      expect(result.error.kind).toBe('remote-unknown')
      expect(result.error.remoteOutcome).toBe('unknown')
      expect(result.error.message).toContain(PUBLISH_ID)
    }
    expect(statusCallCount()).toBe(3)
    expectNoFabrication(result)
  })

  it('tolerates a transient status-check failure and still settles on SUCCESS', async () => {
    mockTikTok(['throw', { status: 'SUCCESS', postId: POST_ID }])

    const result = await fastAdapter().publish(variant, context, mockMediaResolver)

    expect(result.status).toBe('published')
    expectNoFabrication(result)
  })

  it('reports published on SUCCESS without inventing a URL when TikTok returns no post ID', async () => {
    mockTikTok([{ status: 'SUCCESS' }])

    const result = await fastAdapter().publish(variant, context, mockMediaResolver)

    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteUrl).toBeUndefined()
      expect(result.receipt).toBeUndefined()
    }
    expectNoFabrication(result)
  })
})
