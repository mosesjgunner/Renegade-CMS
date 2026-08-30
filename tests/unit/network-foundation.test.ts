import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { loadConfig } from '../../src/modules/core/config'
import { safeFetch } from '../../src/modules/core/external-boundary'
import {
  deliveryIdempotencyKey,
  isBlocked,
  remoteIdentityKey,
} from '../../src/modules/network/contracts'
import { NetworkKeyManager } from '../../src/modules/network/key-management'
import { networkDomain } from '../../src/modules/network/payload-domain'

const env = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/renegade_test',
  PAYLOAD_SECRET: 'a-valid-test-value-with-more-than-32-characters',
  APP_URL: 'http://localhost:3000',
}
const publicDns = async () => [{ address: '93.184.216.34' }]
describe('protocol-neutral network foundation', () => {
  it('keeps the full network subsystem absent in Lean or disabled deployments', () => {
    const disabled = loadConfig(env)
    expect(disabled.networking.enabled).toBe(false)
    expect(networkDomain.collections?.length).toBeGreaterThan(0)
    expect(() =>
      loadConfig({ ...env, DEPLOYMENT_PROFILE: 'Lean', NETWORKING_ENABLED: 'true' }),
    ).toThrow('NETWORKING_ENABLED')
  })
  it('normalizes remote identities and makes deliveries idempotent', () => {
    expect(remoteIdentityKey('https://EXAMPLE.test:443/a/#fragment')).toBe('https://example.test/a')
    const payload = { type: 'follow' }
    expect(deliveryIdempotencyKey('future-protocol', 'https://example.test/a', payload)).toBe(
      deliveryIdempotencyKey('future-protocol', 'https://example.test/a', payload),
    )
    expect(() => remoteIdentityKey('http://example.test/a')).toThrow('HTTPS')
  })
  it('never projects private signing material', () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const privateKeyPem = pair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    const manager = new NetworkKeyManager([
      { keyId: 'rotation-1', algorithm: 'rsa-sha256', privateKeyPem },
    ])
    expect(JSON.stringify(manager.publicRecords())).not.toContain(privateKeyPem)
    expect(manager.sign('request').keyId).toBe('rotation-1')
  })
  it('enforces block decisions and validates every redirect hop', async () => {
    expect(
      isBlocked('https://remote.test', [{ subject: 'https://remote.test', decision: 'block' }]),
    ).toBe(true)
    await expect(
      safeFetch(
        'https://example.test',
        {},
        {
          resolve: publicDns,
          fetcher: async () =>
            new Response(null, { status: 302, headers: { location: 'http://127.0.0.1' } }),
        },
      ),
    ).rejects.toThrow('private')
    await expect(
      safeFetch(
        'https://example.test',
        {},
        {
          resolve: publicDns,
          allowedContentTypes: ['application/json'],
          fetcher: async () => new Response('ok', { headers: { 'content-type': 'text/html' } }),
        },
      ),
    ).rejects.toThrow('content type')
  })
})
