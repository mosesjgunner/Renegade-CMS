import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  assertSafeOutboundUrl,
  readBoundedJson,
  safeFetch,
  safeRelativeRedirect,
} from '../../src/modules/core/external-boundary'
import { safeUploadMetadata } from '../../src/modules/audience/contracts'
import {
  createDevelopmentAdapter,
  sameCommerceScope,
  validWebhookEvent,
} from '../../src/modules/commerce/service'

const publicDns = async () => [{ address: '93.184.216.34' }]

describe('external boundary hardening', () => {
  it('rejects localhost and private-address SSRF targets before fetching', async () => {
    await expect(assertSafeOutboundUrl('http://localhost/', publicDns)).rejects.toThrow('private')
    await expect(assertSafeOutboundUrl('http://10.0.0.7/', publicDns)).rejects.toThrow('private')
    await expect(
      assertSafeOutboundUrl('https://example.test/', async () => [{ address: '169.254.169.254' }]),
    ).rejects.toThrow('private')
  })

  it('revalidates redirects and rejects a public-to-private redirect', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })
    await expect(
      safeFetch('https://example.test/', {}, { fetcher, resolve: publicDns }),
    ).rejects.toThrow('private')
  })

  it('enforces declared and streamed remote response size limits', async () => {
    await expect(
      safeFetch(
        'https://example.test/',
        {},
        {
          resolve: publicDns,
          maxBytes: 2,
          fetcher: async () => new Response('large', { headers: { 'content-length': '5' } }),
        },
      ),
    ).rejects.toThrow('size limit')
    await expect(readBoundedJson(new Response('{"large":true}'), 2)).rejects.toThrow('size limit')
  })

  it('rejects forged, replayed, stale, malformed, and misbound webhook events', () => {
    const raw = JSON.stringify({
      id: 'evt-1',
      intentId: 'pi-1',
      kind: 'confirmed',
      occurredAt: '2026-08-29T12:00:00.000Z',
    })
    const adapter = createDevelopmentAdapter('development-stripe', 'secret')
    const event = adapter.verifyWebhook(
      raw,
      createHmac('sha256', 'secret').update(raw).digest('hex'),
    )
    expect(adapter.verifyWebhook(raw, 'forged')).toBeNull()
    expect(validWebhookEvent(event, 'pi-1', new Date('2026-08-29T12:05:00.000Z'))).toBe(true)
    expect(validWebhookEvent(event, 'other-intent', new Date('2026-08-29T12:05:00.000Z'))).toBe(
      false,
    )
    expect(validWebhookEvent(event, 'pi-1', new Date('2026-08-29T12:15:00.001Z'))).toBe(false)
    expect(
      adapter.verifyWebhook(
        '{bad json',
        createHmac('sha256', 'secret').update('{bad json').digest('hex'),
      ),
    ).toBeNull()
  })

  it('does not permit a capability, cart, or merchant from another site or space', () => {
    const scope = { siteId: 'site-a', spaceId: 'space-a', merchantConnectionId: 'merchant-a' }
    expect(sameCommerceScope(scope, { ...scope })).toBe(true)
    expect(sameCommerceScope(scope, { ...scope, siteId: 'site-b' })).toBe(false)
    expect(sameCommerceScope(scope, { ...scope, spaceId: 'space-b' })).toBe(false)
    expect(sameCommerceScope(scope, { ...scope, merchantConnectionId: 'merchant-b' })).toBe(false)
  })
  it('confines uploads and redirects to safe forms', () => {
    expect(() =>
      safeUploadMetadata({ filename: '../secrets.txt', contentType: 'text/plain', size: 1 }),
    ).toThrow('Unsafe')
    expect(() =>
      safeUploadMetadata({ filename: 'invoice\\.pdf', contentType: 'application/pdf', size: 1 }),
    ).toThrow('Unsafe')
    expect(() =>
      safeUploadMetadata({ filename: 'ｅvil.pdf', contentType: 'application/pdf', size: 1 }),
    ).toThrow('Unsafe')
    expect(
      safeUploadMetadata({ filename: 'receipt.pdf', contentType: 'application/pdf', size: 1 }),
    ).toMatchObject({ private: true, scanStatus: 'pending' })
    expect(safeRelativeRedirect('https://attacker.test', '/cart')).toBe('/cart')
    expect(safeRelativeRedirect('//attacker.test', '/cart')).toBe('/cart')
    expect(safeRelativeRedirect('/complete', '/cart')).toBe('/complete')
  })
})
