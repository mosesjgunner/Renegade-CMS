// R-08-SOCIAL regression: the operator allowlist for local social
// adapters (SOCIAL_LOCAL_ADAPTER_ORIGINS) must work in production,
// not only under NODE_ENV=development/test. Before the fix,
// validateOutboundUrl ANDed the HTTP/loopback permission with a
// dev/test gate, so on the production build an allowlisted local
// harness could never be connected (08A) or dispatched to (08C):
// every attempt failed with "SSRF Blocked: Disallowed protocol:
// http:. HTTPS is required." The frozen 08A-08C acceptances only
// passed because they ran a Next dev server.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateOutboundUrl } from '../../src/modules/social/security'
import { assertSocialEndpoint } from '../../src/modules/social/dispatch-boundary'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('R-08-SOCIAL: allowlisted local adapter origins in production', () => {
  it('permits an allowlisted loopback origin over HTTP in production when the caller opts in', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SOCIAL_LOCAL_ADAPTER_ORIGINS', 'http://127.0.0.1:3141')
    expect(validateOutboundUrl('http://127.0.0.1:3141/xrpc/com.atproto.server.createSession', {
      allowHttpInDev: true,
    }).isValid).toBe(true)
  })

  it('still blocks a non-allowlisted loopback origin in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SOCIAL_LOCAL_ADAPTER_ORIGINS', 'http://127.0.0.1:3141')
    expect(
      validateOutboundUrl('http://127.0.0.1:9999/secret', { allowHttpInDev: true }).isValid,
    ).toBe(false)
  })

  it('still blocks the allowlisted origin when the caller does not opt in', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SOCIAL_LOCAL_ADAPTER_ORIGINS', 'http://127.0.0.1:3141')
    expect(validateOutboundUrl('http://127.0.0.1:3141/xrpc').isValid).toBe(false)
  })

  it('the allowlist cannot rescue a cloud metadata endpoint', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SOCIAL_LOCAL_ADAPTER_ORIGINS', 'http://169.254.169.254')
    expect(
      validateOutboundUrl('http://169.254.169.254/latest/meta-data', { allowHttpInDev: true })
        .isValid,
    ).toBe(false)
  })

  it('dispatch boundary accepts the allowlisted origin and rejects others in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SOCIAL_LOCAL_ADAPTER_ORIGINS', 'http://127.0.0.1:3141')
    expect(() => assertSocialEndpoint('http://127.0.0.1:3141')).not.toThrow()
    expect(() => assertSocialEndpoint('http://127.0.0.1:3142')).toThrow()
  })

  it('dev/test behavior is unchanged for non-allowlisted loopback when the caller opts in', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('SOCIAL_LOCAL_ADAPTER_ORIGINS', '')
    expect(
      validateOutboundUrl('http://127.0.0.1:3130', { allowHttpInDev: true }).isValid,
    ).toBe(true)
  })
})
