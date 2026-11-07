import { describe, expect, it, vi, afterEach } from 'vitest'
import { isConfiguredLocalPeer } from '../../src/modules/network/local-peer'
import { fetchRemoteJson } from '../../src/modules/network/safe-fetch'

afterEach(() => vi.unstubAllEnvs())

describe('explicit local ActivityPub peer transport', () => {
  it('has no loopback exception by default', () => {
    expect(isConfiguredLocalPeer('https://127.0.0.1:3450/actor', '')).toBe(false)
  })
  it('permits only the exact configured HTTPS loopback origin', () => {
    const configured = 'https://127.0.0.1:3450'
    expect(isConfiguredLocalPeer(`${configured}/actor`, configured)).toBe(true)
    expect(isConfiguredLocalPeer('https://127.0.0.1:3451/actor', configured)).toBe(false)
    expect(isConfiguredLocalPeer('http://127.0.0.1:3450/actor', configured)).toBe(false)
    expect(isConfiguredLocalPeer('https://example.com/actor', configured)).toBe(false)
  })
  it.each([
    'http://127.0.0.1:3450',
    'https://localhost:3450',
    'https://10.0.0.1:3450',
    'https://169.254.169.254:3450',
    'https://peer.example.test:3450',
    'https://127.0.0.1',
    'https://user:password@127.0.0.1:3450',
    'https://127.0.0.1:3450/path',
    'https://127.0.0.1:3450?query=1',
  ])('refuses unsafe or ambiguous peer configuration %s', (configured) => {
    expect(() => isConfiguredLocalPeer('https://127.0.0.1:3450/actor', configured)).toThrow()
  })
  it('supports an explicit IPv6 loopback peer', () => {
    expect(isConfiguredLocalPeer('https://[::1]:3450/actor', 'https://[::1]:3450')).toBe(true)
  })
  it('keeps redirects from an approved local peer blocked', async () => {
    vi.stubEnv('NETWORK_LOCAL_PEER_ORIGINS', 'https://127.0.0.1:3450')
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://169.254.169.254/credentials' },
        }),
    )
    await expect(
      fetchRemoteJson('https://127.0.0.1:3450/actor', {
        fetcher,
        resolve: async () => [{ address: '127.0.0.1' }],
      }),
    ).rejects.toThrow('redirect')
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
