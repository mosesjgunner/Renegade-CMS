/**
 * RC1 17B focused units: the shared outbound boundary (SSRF), webhook
 * target posture, media content sniffing, JSON-LD escaping, the Discord
 * delete path's dispatch boundary, and fail-closed secret handling.
 * All network access is stubbed; no real egress occurs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertSafeOutboundUrl,
  isPrivateAddress,
  type Lookup,
} from '../../src/modules/core/external-boundary'
import { supportedTarget } from '../../src/modules/integrations/webhooks'
import { inspectMedia } from '../../src/modules/media/storage'
import { serializeJsonLd } from '../../src/modules/public/schema'
import { getEncryptionKey } from '../../src/modules/social/security'
import { DiscordAdapter } from '../../src/modules/social/adapters/discord'

const stubLookup =
  (addresses: string[]): Lookup =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as never

describe('isPrivateAddress', () => {
  it('classifies loopback, RFC1918, link-local and metadata addresses as private', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.9',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
    ])
      expect(isPrivateAddress(ip), ip).toBe(true)
  })

  it('classifies CGNAT shared address space (100.64.0.0/10) as private', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true)
    expect(isPrivateAddress('100.127.255.255')).toBe(true)
    expect(isPrivateAddress('100.63.255.255')).toBe(false)
    expect(isPrivateAddress('100.128.0.1')).toBe(false)
  })

  it('classifies public addresses and mapped IPv6 forms correctly', () => {
    expect(isPrivateAddress('93.184.216.34')).toBe(false)
    expect(isPrivateAddress('172.15.0.1')).toBe(false)
    expect(isPrivateAddress('172.32.0.1')).toBe(false)
    // WHATWG-normalized mapped forms: ::ffff:7f00:1 == 127.0.0.1
    expect(isPrivateAddress('::ffff:7f00:1')).toBe(true)
    expect(isPrivateAddress('::ffff:808:808')).toBe(false)
  })
})

describe('assertSafeOutboundUrl', () => {
  it('accepts an HTTPS URL whose resolution is public', async () => {
    const url = await assertSafeOutboundUrl(
      'https://hooks.example.com/hook',
      stubLookup(['93.184.216.34']),
    )
    expect(url.hostname).toBe('hooks.example.com')
  })

  it('rejects the same hostname when DNS resolves privately (rebinding)', async () => {
    await expect(
      assertSafeOutboundUrl('https://hooks.example.com/hook', stubLookup(['10.0.0.9'])),
    ).rejects.toThrow(/private/)
  })

  it('rejects plain HTTP, embedded credentials and malformed URLs', async () => {
    await expect(
      assertSafeOutboundUrl('http://hooks.example.com/hook', stubLookup(['93.184.216.34'])),
    ).rejects.toThrow()
    await expect(
      assertSafeOutboundUrl(
        'https://user:pass@hooks.example.com/hook',
        stubLookup(['93.184.216.34']),
      ),
    ).rejects.toThrow()
    await expect(assertSafeOutboundUrl('not a url', stubLookup([]))).rejects.toThrow()
  })
})

describe('supportedTarget posture', () => {
  const saved = { vitest: process.env.VITEST, nodeEnv: process.env.NODE_ENV }
  afterEach(() => {
    if (saved.vitest === undefined) delete process.env.VITEST
    else process.env.VITEST = saved.vitest
    process.env.NODE_ENV = saved.nodeEnv
  })

  it('production posture rejects loopback HTTP, private and metadata targets but accepts public HTTPS', () => {
    delete process.env.VITEST
    process.env.NODE_ENV = 'development'
    expect(() => supportedTarget('http://127.0.0.1:39177/hook')).toThrow()
    expect(() => supportedTarget('https://169.254.169.254/hook')).toThrow()
    expect(() => supportedTarget('https://10.0.0.9/hook')).toThrow()
    expect(supportedTarget('https://hooks.example.com/hook').hostname).toBe('hooks.example.com')
  })

  it('test posture (only) permits loopback HTTP for local receivers', () => {
    process.env.VITEST = 'true'
    expect(supportedTarget('http://127.0.0.1:39177/hook').hostname).toBe('127.0.0.1')
  })
})

describe('inspectMedia content sniffing', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  )
  it('accepts a real PNG and a clean SVG by content, not by name', () => {
    expect(inspectMedia(png).mimeType).toBe('image/png')
    expect(
      inspectMedia(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
        ),
      ).mimeType,
    ).toBe('image/svg+xml')
  })
  it('rejects executable bytes, HTML and a script-bearing SVG', () => {
    expect(() => inspectMedia(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x01]))).toThrow()
    expect(() => inspectMedia(Buffer.from('<html><body>hi</body></html>'))).toThrow()
    expect(() =>
      inspectMedia(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ),
    ).toThrow(/unsafe/)
    expect(() =>
      inspectMedia(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" width="10" height="10"/></svg>',
        ),
      ),
    ).toThrow(/unsafe/)
  })
})

describe('serializeJsonLd', () => {
  it('escapes script-breaking sequences in embedded JSON-LD', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>', amp: 'a & b' })
    expect(out).not.toContain('</script>')
    expect(out).toContain('\\u003c/script\\u003e')
    expect(out).toContain('\\u0026')
  })
})

describe('Discord deletePost dispatch boundary', () => {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS = 'http://127.0.0.1:39177'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS
  })

  it('deletes through the boundary for an allowlisted loopback webhook', async () => {
    const adapter = new DiscordAdapter()
    await adapter.deletePost('4242', {
      credentials: { webhookUrl: 'http://127.0.0.1:39177/discord/hook' },
    } as never)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:39177/discord/hook/messages/4242')
    expect(init.method).toBe('DELETE')
  })

  it('blocks a metadata-address webhook before any request is made', async () => {
    const adapter = new DiscordAdapter()
    await expect(
      adapter.deletePost('4242', {
        credentials: { webhookUrl: 'https://169.254.169.254/hook' },
      } as never),
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('secret handling', () => {
  const saved = {
    nodeEnv: process.env.NODE_ENV,
    key: process.env.RENEGADE_ENCRYPTION_KEY,
  }
  afterEach(() => {
    process.env.NODE_ENV = saved.nodeEnv
    if (saved.key === undefined) delete process.env.RENEGADE_ENCRYPTION_KEY
    else process.env.RENEGADE_ENCRYPTION_KEY = saved.key
  })

  it('fails closed in production when no encryption key is configured', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.RENEGADE_ENCRYPTION_KEY
    expect(() => getEncryptionKey()).toThrow(/Production encryption key is required/)
  })
})
