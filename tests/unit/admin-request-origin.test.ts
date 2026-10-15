import { describe, expect, it } from 'vitest'

import { trustedAdminMutationOrigin } from '../../src/modules/operations/request-origin'

const app = 'https://cms.example.test:3139'
const headers = (extra: Record<string, string> = {}) =>
  new Headers({ cookie: 'renegade-passkey=disposable-test-capability', ...extra })

describe('admin browser origin boundary', () => {
  it('denies foreign, same-site subdomain, null, malformed and wrong-port browser origins', () => {
    for (const origin of [
      'https://evil.example.test:3139',
      'https://cms.example.test',
      'null',
      '',
      'invalid',
    ]) {
      for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
        expect(trustedAdminMutationOrigin(method, headers({ origin }), app)).toBe(false)
      }
    }
  })

  it('permits the canonical origin and rejects foreign referer fallbacks', () => {
    expect(trustedAdminMutationOrigin('POST', headers({ origin: app }), app)).toBe(true)
    expect(trustedAdminMutationOrigin('PATCH', headers({ referer: `${app}/admin` }), app)).toBe(
      true,
    )
    expect(
      trustedAdminMutationOrigin('POST', headers({ referer: 'https://evil.example.test/' }), app),
    ).toBe(false)
    expect(
      trustedAdminMutationOrigin('POST', headers({ 'sec-fetch-site': 'same-site' }), app),
    ).toBe(false)
    expect(
      trustedAdminMutationOrigin('POST', headers({ 'sec-fetch-site': 'cross-site' }), app),
    ).toBe(false)
  })

  it('preserves read-only requests, non-browser operator calls and cookie-free signed providers', () => {
    expect(trustedAdminMutationOrigin('GET', headers({ origin: 'https://evil.test' }), app)).toBe(
      true,
    )
    expect(
      trustedAdminMutationOrigin('OPTIONS', headers({ origin: 'https://evil.test' }), app),
    ).toBe(true)
    expect(trustedAdminMutationOrigin('POST', headers(), app)).toBe(true)
    expect(
      trustedAdminMutationOrigin(
        'POST',
        new Headers({ authorization: 'Bearer fixture', origin: 'https://provider.test' }),
        app,
      ),
    ).toBe(true)
  })
})
