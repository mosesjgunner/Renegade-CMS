import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { TelegramAdapter } from '@/modules/social/adapters/telegram'
import { DiscordAdapter } from '@/modules/social/adapters/discord'
import { type AuthContext, type SocialVariant } from '@/modules/social/contracts'

describe('TelegramAdapter', () => {
  let adapter: TelegramAdapter
  const origFetch = global.fetch

  beforeEach(() => {
    adapter = new TelegramAdapter()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = origFetch
    vi.restoreAllMocks()
  })

  it('declares valid capabilities according to 2026 specification', () => {
    const caps = adapter.getCapabilities()
    expect(caps.supportsText).toBe(true)
    expect(caps.supportsImages).toBe(true)
    expect(caps.supportsVideo).toBe(true)
    expect(caps.supportsCarousels).toBe(true) // Media group albums
    expect(caps.supportsPostEditing).toBe(true)
    expect(caps.supportsPostDeletion).toBe(true)
    expect(caps.limits.maxCharacters).toBe(4096)
    expect(caps.limits.maxImages).toBe(10)
    expect(caps.limits.maxVideoFileSizeBytes).toBe(50 * 1024 * 1024)
  })

  it('validates character ceiling and empty message constraints', () => {
    const emptyVariant: SocialVariant = {
      id: 'var-1',
      accountId: 'acc-tg',
      network: 'telegram',
      text: '',
      attachments: [],
      status: 'draft',
      idempotencyKey: 'idem-1',
    }
    const emptyReport = adapter.validatePost(emptyVariant)
    expect(emptyReport.isValid).toBe(false)
    expect(emptyReport.errors.some((e) => e.code === 'EMPTY_MESSAGE')).toBe(true)

    const longTextVariant: SocialVariant = {
      id: 'var-2',
      accountId: 'acc-tg',
      network: 'telegram',
      text: 'a'.repeat(4097),
      attachments: [],
      status: 'draft',
      idempotencyKey: 'idem-2',
    }
    const longReport = adapter.validatePost(longTextVariant)
    expect(longReport.isValid).toBe(false)
    expect(longReport.errors.some((e) => e.code === 'TEXT_TOO_LONG')).toBe(true)

    const mediaVariant: SocialVariant = {
      id: 'var-3',
      accountId: 'acc-tg',
      network: 'telegram',
      text: 'a'.repeat(1025),
      attachments: [{ mediaAssetId: 'img-1', role: 'image' }],
      status: 'draft',
      idempotencyKey: 'idem-3',
    }
    const mediaReport = adapter.validatePost(mediaVariant)
    expect(mediaReport.isValid).toBe(false)
    expect(mediaReport.errors.some((e) => e.code === 'TEXT_TOO_LONG')).toBe(true)
  })

  it('publishes text-only message to destination chat via /sendMessage', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          message_id: 9876,
          chat: { id: -1001987654321, username: 'renegade_broadcast' },
        },
      }),
    } as unknown as Response)

    const variant: SocialVariant = {
      id: 'var-tg-1',
      accountId: 'acc-tg',
      network: 'telegram',
      text: 'Hello Telegram subscribers!',
      attachments: [],
      status: 'publishing',
      idempotencyKey: 'idem-tg-1',
      platformSettings: { chatId: '@renegade_broadcast' },
    }

    const auth: AuthContext = {
      accountId: 'acc-tg',
      accountHandle: '@renegade_bot',
      network: 'telegram',
      credentials: { botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' },
    }

    const result = await adapter.publish(variant, auth)
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('@renegade_broadcast:9876')
      expect(result.remoteUrl).toBe('https://t.me/renegade_broadcast/9876')
    }

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"text":"Hello Telegram subscribers!"'),
      }),
    )
  })

  it('publishes photo with binary buffer via /sendPhoto and multipart form data', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          message_id: 1122,
          chat: { id: -100123456789 },
        },
      }),
    } as unknown as Response)

    const variant: SocialVariant = {
      id: 'var-tg-photo',
      accountId: 'acc-tg',
      network: 'telegram',
      text: 'Photo announcement',
      attachments: [{ mediaAssetId: 'asset-img-1', role: 'image' }],
      status: 'publishing',
      idempotencyKey: 'idem-tg-photo',
      platformSettings: { chatId: -100123456789 },
    }

    const auth: AuthContext = {
      accountId: 'acc-tg',
      accountHandle: '@renegade_bot',
      network: 'telegram',
      credentials: { botToken: 'test-token' },
    }

    const fakeMediaResolver = {
      resolveUrl: vi.fn().mockResolvedValue('https://renegadeparty.org/media/cover.jpg'),
      resolveBuffer: vi.fn().mockResolvedValue({
        buffer: Buffer.from('fake-jpeg-bytes'),
        mimeType: 'image/jpeg',
        fileName: 'cover.jpg',
      }),
    }

    const result = await adapter.publish(variant, auth, fakeMediaResolver)
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('-100123456789:1122')
      expect(result.remoteUrl).toBe('https://t.me/c/123456789/1122')
    }
    expect(fakeMediaResolver.resolveBuffer).toHaveBeenCalledWith('asset-img-1')
  })

  it('handles 429 rate limit error parsing retry_after from Telegram API parameters', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry after 42',
        parameters: { retry_after: 42 },
      }),
    } as unknown as Response)

    const variant: SocialVariant = {
      id: 'var-tg-ratelimit',
      accountId: 'acc-tg',
      network: 'telegram',
      text: 'Fast burst message',
      attachments: [],
      status: 'publishing',
      idempotencyKey: 'idem-tg-rate',
      platformSettings: { chatId: '@burst' },
    }

    const auth: AuthContext = {
      accountId: 'acc-tg',
      accountHandle: '@bot',
      network: 'telegram',
      credentials: { botToken: 'test-token' },
    }

    const result = await adapter.publish(variant, auth)
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error?.kind).toBe('rate-limit')
      expect(result.error?.retryAfter).toBeDefined()
    }
  })

  it('executes message editing and deletion', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 555 } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: true }),
      } as unknown as Response)

    const auth: AuthContext = {
      accountId: 'acc-tg',
      accountHandle: '@bot',
      network: 'telegram',
      credentials: { botToken: 'token-123' },
    }

    const editReceipt = await adapter.editPost(
      '-100123:555',
      {
        id: 'var-edit',
        accountId: 'acc-tg',
        network: 'telegram',
        text: 'Updated status copy',
        attachments: [],
        status: 'published',
        idempotencyKey: 'idem-edit',
      },
      auth,
    )
    expect(editReceipt.remotePostId).toBe('-100123:555')

    await expect(adapter.deletePost('-100123:555', auth)).resolves.not.toThrow()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/deleteMessage'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('DiscordAdapter', () => {
  let adapter: DiscordAdapter
  const origFetch = global.fetch

  beforeEach(() => {
    adapter = new DiscordAdapter()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = origFetch
    vi.restoreAllMocks()
  })

  it('declares expected capabilities and 2000 character limit', () => {
    const caps = adapter.getCapabilities()
    expect(caps.supportsText).toBe(true)
    expect(caps.supportsImages).toBe(true)
    expect(caps.supportsPostEditing).toBe(true)
    expect(caps.supportsPostDeletion).toBe(true)
    expect(caps.limits.maxCharacters).toBe(2000)
    expect(caps.limits.maxImages).toBe(10)
  })

  it('validates post bounds against Discord constraints', () => {
    const emptyReport = adapter.validatePost({
      id: 'v1',
      accountId: 'acc-dc',
      network: 'discord',
      text: '',
      attachments: [],
      status: 'draft',
      idempotencyKey: 'idem-dc-1',
    })
    expect(emptyReport.isValid).toBe(false)
    expect(emptyReport.errors.some((e) => e.code === 'EMPTY_POST')).toBe(true)

    const longReport = adapter.validatePost({
      id: 'v2',
      accountId: 'acc-dc',
      network: 'discord',
      text: 'x'.repeat(2001),
      attachments: [],
      status: 'draft',
      idempotencyKey: 'idem-dc-2',
    })
    expect(longReport.isValid).toBe(false)
    expect(longReport.errors.some((e) => e.code === 'TEXT_TOO_LONG')).toBe(true)
  })

  it('publishes message via incoming webhook with wait=true', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: '123456789012345678',
        channel_id: '987654321098765432',
        guild_id: '112233445566778899',
      }),
    } as unknown as Response)

    const variant: SocialVariant = {
      id: 'var-dc-webhook',
      accountId: 'acc-dc',
      network: 'discord',
      text: 'New announcement for Discord community!',
      attachments: [],
      status: 'publishing',
      idempotencyKey: 'idem-dc-hook',
      platformSettings: {
        username: 'Renegade Bot',
      },
    }

    const auth: AuthContext = {
      accountId: 'acc-dc',
      accountHandle: 'Renegade Guild',
      network: 'discord',
      credentials: {
        webhookUrl: 'https://discord.com/api/webhooks/123/token_abc',
      },
    }

    const result = await adapter.publish(variant, auth)
    expect(result.status).toBe('published')
    if (result.status === 'published') {
      expect(result.remoteId).toBe('123456789012345678')
      expect(result.remoteUrl).toContain('123456789012345678')
    }

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('wait=true'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"content":"New announcement for Discord community!"'),
      }),
    )
  })

  it('handles Discord 429 rate-limit with retry_after and reset headers', async () => {
    const mockHeaders = new Headers({
      'x-ratelimit-reset-after': '3.5',
    })

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: mockHeaders,
      json: async () => ({
        message: 'You are being rate limited.',
        retry_after: 3.5,
        global: false,
      }),
    } as unknown as Response)

    const variant: SocialVariant = {
      id: 'var-dc-rate',
      accountId: 'acc-dc',
      network: 'discord',
      text: 'Rate limited text',
      attachments: [],
      status: 'publishing',
      idempotencyKey: 'idem-dc-rate',
    }

    const auth: AuthContext = {
      accountId: 'acc-dc',
      accountHandle: 'Guild',
      network: 'discord',
      credentials: { webhookUrl: 'https://discord.com/api/webhooks/123/token_abc' },
    }

    const result = await adapter.publish(variant, auth)
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error?.kind).toBe('rate-limit')
      expect(result.error?.retryAfter).toBeDefined()
    }
  })

  it('supports post editing and deletion via webhook or bot endpoints', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'msg-999' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      } as unknown as Response)

    const auth: AuthContext = {
      accountId: 'acc-dc',
      accountHandle: 'Guild',
      network: 'discord',
      credentials: { webhookUrl: 'https://discord.com/api/webhooks/123/token_abc' },
    }

    const editReceipt = await adapter.editPost(
      'msg-999',
      {
        id: 'var-edit',
        accountId: 'acc-dc',
        network: 'discord',
        text: 'Edited discord copy',
        attachments: [],
        status: 'published',
        idempotencyKey: 'idem-dc-edit',
      },
      auth,
    )
    expect(editReceipt.remotePostId).toBe('msg-999')

    await expect(adapter.deletePost('msg-999', auth)).resolves.not.toThrow()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages/msg-999'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
