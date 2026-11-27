import { describe, it, expect, afterEach, vi } from 'vitest'
import { DiscordAdapter } from '@/modules/social/adapters/discord'
import { FacebookAdapter } from '@/modules/social/adapters/facebook'
import { InstagramAdapter } from '@/modules/social/adapters/instagram'
import { ThreadsAdapter } from '@/modules/social/adapters/threads'
import { LinkedInAdapter } from '@/modules/social/adapters/linkedin'
import type { AuthContext, MediaResolver, SocialVariant } from '@/modules/social/contracts'

/**
 * RC3-SOC: receipt honesty for the five adapters flagged by the
 * 2026-11-26 social-adapter audit (2 DEFECT, 3 SUSPECT). The rule,
 * matching the YouTube/TikTok receipt discipline: 'published' only on
 * identifiers the platform actually returned; a receipt URL only from
 * a real platform ID / permalink, never constructed or invented; an
 * unconfirmable outcome is 'unknown', never 'published'.
 */

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

const mockMediaResolver: MediaResolver = {
  resolveUrl: async (assetId: string) => `https://cdn.renegade.media/${assetId}.jpg`,
  resolveBuffer: async (assetId: string) => ({
    buffer: Buffer.from(`mock-binary-${assetId}`),
    mimeType: 'image/jpeg',
    fileName: `${assetId}.jpg`,
  }),
}

function makeVariant(overrides: Partial<SocialVariant>): SocialVariant {
  return {
    id: 'var-soc',
    accountId: 'acc-soc',
    network: 'discord',
    text: 'Receipt honesty test post',
    attachments: [],
    status: 'publishing',
    idempotencyKey: 'idem-soc',
    ...overrides,
  }
}

describe('DiscordAdapter receipt honesty (DEFECT fix)', () => {
  const adapter = new DiscordAdapter()
  const webhookAuth: AuthContext = {
    accountId: 'acc-dc',
    accountHandle: 'Renegade Guild',
    network: 'discord',
    credentials: { webhookUrl: 'https://discord.com/api/webhooks/123/token_abc' },
  }

  it('returns unknown — never an invented msg-<timestamp> ID — when the response has no message ID', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
    } as unknown as Response)

    const result = await adapter.publish(makeVariant({ network: 'discord' }), webhookAuth)
    expect(result.status).toBe('unknown')
    if (result.status === 'unknown') {
      expect(result.error.kind).toBe('remote-unknown')
      expect(result.error.remoteOutcome).toBe('unknown')
    }
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('msg-')
    expect(serialized).not.toContain('discord.com/channels')
  })

  it('publishes with the real ID but no URL when the response lacks a channel ID', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: '111222333444555' }),
    } as unknown as Response)

    const result = await adapter.publish(makeVariant({ network: 'discord' }), webhookAuth)
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('111222333444555')
      expect(result.remoteUrl).toBeUndefined()
      expect(result.receipt).toBeUndefined()
    }
  })

  it('fetchPost reads the real message back and builds the URL from its real IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 'msg-42',
        channel_id: 'chan-555',
        guild_id: 'guild-777',
        content: 'hello from discord',
        timestamp: '2026-11-26T12:00:00.000Z',
      }),
    } as unknown as Response)
    globalThis.fetch = fetchMock

    const auth: AuthContext = {
      accountId: 'acc-dc',
      accountHandle: 'chan-555',
      network: 'discord',
      credentials: { botToken: 'bot-token-xyz', channelId: 'chan-555' },
    }

    const post = await adapter.fetchPost('msg-42', auth)
    expect(post.remoteId).toBe('msg-42')
    expect(post.remoteUrl).toBe('https://discord.com/channels/guild-777/chan-555/msg-42')
    expect(post.text).toBe('hello from discord')
    expect(post.publishedAt.toISOString()).toBe('2026-11-26T12:00:00.000Z')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/channels/chan-555/messages/msg-42'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('fetchPost throws honestly when no destination is configured', async () => {
    const auth: AuthContext = {
      accountId: 'acc-dc',
      accountHandle: 'Renegade Guild',
      network: 'discord',
      credentials: {},
    }
    await expect(adapter.fetchPost('msg-42', auth)).rejects.toThrow()
  })

  it('editPost refuses to fabricate a receipt URL when the edit response has no channel ID', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: 'msg-999' }),
    } as unknown as Response)

    await expect(
      adapter.editPost('msg-999', makeVariant({ network: 'discord' }), webhookAuth),
    ).rejects.toThrow('channel ID')
  })
})

describe('FacebookAdapter scheduling honesty (DEFECT fix)', () => {
  const adapter = new FacebookAdapter()
  const auth: AuthContext = {
    accountId: 'page_98765',
    accountHandle: 'Renegade Page',
    network: 'facebook',
    credentials: { pageId: 'page_98765', pageToken: 'page-token-abc' },
  }

  it('refuses a natively scheduled post before any Graph call', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    const result = await adapter.publish(
      makeVariant({
        network: 'facebook',
        platformSettings: { pageId: 'page_98765', scheduledPublishTime: 1799999999 },
      }),
      auth,
    )
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error.kind).toBe('unsupported')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses an unpublished (published=false) post before any Graph call', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    const result = await adapter.publish(
      makeVariant({
        network: 'facebook',
        platformSettings: { pageId: 'page_98765', published: false },
      }),
      auth,
    )
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error.kind).toBe('unsupported')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a scheduled photo post too — the refusal precedes every publish path', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    const result = await adapter.publish(
      makeVariant({
        network: 'facebook',
        attachments: [{ mediaAssetId: 'photo-1', role: 'image' }],
        platformSettings: { pageId: 'page_98765', scheduledPublishTime: 1799999999 },
      }),
      auth,
      mockMediaResolver,
    )
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error.kind).toBe('unsupported')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('an immediate feed post still publishes and never sends scheduling fields to Graph', async () => {
    let sentBody: Record<string, unknown> = {}
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(init?.body as string)
      return new Response(JSON.stringify({ id: 'page_98765_post_42' }), { status: 200 })
    })

    const result = await adapter.publish(
      makeVariant({ network: 'facebook', platformSettings: { pageId: 'page_98765' } }),
      auth,
    )
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('page_98765_post_42')
    }
    expect(sentBody).not.toHaveProperty('scheduled_publish_time')
    expect(sentBody).not.toHaveProperty('published')
  })
})

describe('InstagramAdapter permalink receipt (SUSPECT fix)', () => {
  const adapter = new InstagramAdapter()
  const auth: AuthContext = {
    accountId: 'ig-account-123',
    accountHandle: 'renegade_media',
    network: 'instagram',
    credentials: { igUserId: '17841400000000001', accessToken: 'IGAA_test_token' },
  }
  const variant = makeVariant({
    network: 'instagram',
    attachments: [{ mediaAssetId: 'hero', role: 'image' }],
  })

  function mockInstagramFlow(permalinkResponse: () => Response) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/media')) {
        return new Response(JSON.stringify({ id: 'cont_soc_1' }), { status: 200 })
      }
      if (url.includes('fields=status_code')) {
        return new Response(JSON.stringify({ status_code: 'FINISHED' }), { status: 200 })
      }
      if (url.endsWith('/media_publish')) {
        return new Response(JSON.stringify({ id: 'ig_media_777' }), { status: 200 })
      }
      if (url.includes('fields=permalink')) {
        return permalinkResponse()
      }
      return new Response('Not Found', { status: 404 })
    })
  }

  it('stores the platform permalink, not a constructed /p/{media ID} URL', async () => {
    mockInstagramFlow(
      () =>
        new Response(JSON.stringify({ permalink: 'https://www.instagram.com/p/CRealShortcode/' }), {
          status: 200,
        }),
    )

    const result = await adapter.publish(variant, auth, mockMediaResolver)
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('ig_media_777')
      expect(result.remoteUrl).toBe('https://www.instagram.com/p/CRealShortcode/')
      expect(result.remoteUrl).not.toContain('ig_media_777')
      expect(result.receipt?.remoteUrl).toBe('https://www.instagram.com/p/CRealShortcode/')
    }
  })

  it('publishes with no URL when the permalink cannot be obtained', async () => {
    mockInstagramFlow(() => new Response('Not Found', { status: 404 }))

    const result = await adapter.publish(variant, auth, mockMediaResolver)
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('ig_media_777')
      expect(result.remoteUrl).toBeUndefined()
      expect(result.receipt).toBeUndefined()
    }
    expect(JSON.stringify(result)).not.toContain('instagram.com/p/ig_media_777')
  })
})

describe('ThreadsAdapter permalink receipt (SUSPECT fix)', () => {
  const adapter = new ThreadsAdapter()
  const auth: AuthContext = {
    accountId: 'th-account-123',
    accountHandle: 'renegadethreads',
    network: 'threads',
    credentials: { threadsUserId: 'th_user_4444', accessToken: 'TH_test_token' },
  }
  const variant = makeVariant({ network: 'threads' })

  function mockThreadsFlow(permalinkResponse: () => Response) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/threads')) {
        return new Response(JSON.stringify({ id: 'th_cont_1' }), { status: 200 })
      }
      if (url.includes('fields=status')) {
        return new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200 })
      }
      if (url.endsWith('/threads_publish')) {
        return new Response(JSON.stringify({ id: 'th_post_888' }), { status: 200 })
      }
      if (url.includes('fields=permalink')) {
        return permalinkResponse()
      }
      return new Response('Not Found', { status: 404 })
    })
  }

  it('stores the platform permalink, not a constructed /t/{post ID} URL', async () => {
    mockThreadsFlow(
      () =>
        new Response(
          JSON.stringify({ permalink: 'https://www.threads.net/@renegade/post/CRealCode' }),
          { status: 200 },
        ),
    )

    const result = await adapter.publish(variant, auth)
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('th_post_888')
      expect(result.remoteUrl).toBe('https://www.threads.net/@renegade/post/CRealCode')
      expect(result.receipt?.remoteUrl).toBe('https://www.threads.net/@renegade/post/CRealCode')
    }
    expect(JSON.stringify(result)).not.toContain('threads.net/t/th_post_888')
  })

  it('publishes with no URL when the permalink cannot be obtained', async () => {
    mockThreadsFlow(() => new Response('Not Found', { status: 404 }))

    const result = await adapter.publish(variant, auth)
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('th_post_888')
      expect(result.remoteUrl).toBeUndefined()
      expect(result.receipt).toBeUndefined()
    }
  })
})

describe('LinkedInAdapter URN presence guard (SUSPECT fix)', () => {
  const adapter = new LinkedInAdapter()
  const auth: AuthContext = {
    accountId: 'acc-li-1',
    accountHandle: 'Renegade Organization',
    network: 'linkedin',
    credentials: { accessToken: 'linkedin-oauth-token' },
  }
  const variant = makeVariant({
    network: 'linkedin',
    platformSettings: { authorUrn: 'urn:li:organization:998877' },
  })

  it('returns unknown on a header-less 201 instead of published with an empty ID', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 201, headers: {} }))

    const result = await adapter.publish(variant, auth)
    expect(result.status).toBe('unknown')
    if (result.status === 'unknown') {
      expect(result.error.kind).toBe('remote-unknown')
      expect(result.error.remoteOutcome).toBe('unknown')
    }
    expect(JSON.stringify(result)).not.toContain('feed/update/')
  })

  it('still publishes with the real URN when the header is present', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:123456' } }),
      )

    const result = await adapter.publish(variant, auth)
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('urn:li:share:123456')
      expect(result.remoteUrl).toContain('urn%3Ali%3Ashare%3A123456')
    }
  })
})
