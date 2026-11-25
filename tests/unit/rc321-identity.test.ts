import { generateKeyPairSync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  consumeChallengeNonce,
  enrollRenegadeId,
  issueAssertion,
  issueChallengeNonce,
  loadRenegadeIdConfig,
  renegadeIdJwks,
  revokeRenegadeId,
  verifyAssertion,
  type RenegadeIdConfig,
} from '../../src/modules/identity/renegade-id'
import { validateIdpIssuer } from '../../src/modules/identity/enterprise-idp'
import type { IdentityStore } from '../../src/modules/identity/member-identity'

/** In-memory IdentityStore fake: just enough Payload surface for the identity modules. */
function fakeStore() {
  const tables = new Map<string, Array<Record<string, unknown>>>()
  let seq = 0
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)!
  }
  const matches = (doc: Record<string, unknown>, where: Record<string, unknown>): boolean => {
    const conditions = Array.isArray(where.and)
      ? (where.and as Array<Record<string, unknown>>)
      : [where]
    return conditions.every((condition) =>
      Object.entries(condition).every(([field, rule]) => {
        const r = rule as { equals?: unknown; exists?: boolean }
        if ('equals' in r) return String(doc[field] ?? '') === String(r.equals ?? '')
        if ('exists' in r) return r.exists ? doc[field] != null : doc[field] == null
        return true
      }),
    )
  }
  const store = {
    tables,
    async create(args: Record<string, unknown>) {
      const data = args.data as Record<string, unknown>
      const doc = { ...data, id: `doc-${++seq}` }
      table(String(args.collection)).push(doc)
      return { id: doc.id as string }
    },
    async find(args: {
      collection: string
      where: Record<string, unknown>
      limit: number
      overrideAccess: boolean
    }) {
      return {
        docs: table(args.collection)
          .filter((doc) => matches(doc, args.where))
          .slice(0, args.limit),
      }
    },
    async findByID(args: { collection: string; id: string; overrideAccess: boolean }) {
      const doc = table(args.collection).find((d) => String(d.id) === args.id)
      if (!doc) throw new Error('not found')
      return doc
    },
    async update(args: {
      collection: string
      id: string
      data: Record<string, unknown>
      overrideAccess: boolean
    }) {
      const doc = table(args.collection).find((d) => String(d.id) === args.id)
      if (!doc) throw new Error('not found')
      Object.assign(doc, args.data)
      return doc
    },
  }
  return store as unknown as IdentityStore & { tables: Map<string, Array<Record<string, unknown>>> }
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const config: RenegadeIdConfig = {
  privateKeyPem,
  keyId: 'test-key-1',
  appUrl: 'http://localhost:3000',
}

function seededStore() {
  const store = fakeStore()
  store.tables.set('profiles', [{ id: 'profile-1', member: 'member-1', handle: 'alice' }])
  store.tables.set('members', [{ id: 'member-1', status: 'active', displayName: 'Alice' }])
  return store
}

describe('RC3-21 #64 validateIdpIssuer — loopback only', () => {
  it('accepts loopback origins with an explicit port', () => {
    expect(validateIdpIssuer('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
    expect(validateIdpIssuer('https://[::1]:8443/')).toBe('https://[::1]:8443')
  })
  it.each([
    'https://example.com:443',
    'https://idp.example.com:8443',
    'http://192.168.1.10:8080',
    'http://10.0.0.5:9000',
    'http://localhost:8080',
    'http://127.0.0.1',
    'https://[::1]',
    'http://user:pass@127.0.0.1:8080',
    'http://127.0.0.1:8080/tenant',
    'http://127.0.0.1:8080/?x=1',
    'ftp://127.0.0.1:21',
    'not-a-url',
  ])('refuses %s', (issuer) => {
    expect(() => validateIdpIssuer(issuer)).toThrow()
  })
})

describe('RC3-21 #63 Renegade ID config', () => {
  it('is unconfigured without env key material', () => {
    expect(loadRenegadeIdConfig({})).toBeNull()
    expect(loadRenegadeIdConfig({ RENEGADE_ID_PRIVATE_KEY_PEM: privateKeyPem })).toBeNull()
  })
  it('unescapes the PEM and publishes a JWKS with the configured kid', async () => {
    const loaded = loadRenegadeIdConfig({
      RENEGADE_ID_PRIVATE_KEY_PEM: privateKeyPem.replace(/\n/g, '\\n'),
      RENEGADE_ID_KEY_ID: 'test-key-1',
      APP_URL: 'http://localhost:3000/',
    })
    expect(loaded?.appUrl).toBe('http://localhost:3000')
    const jwks = await renegadeIdJwks(loaded!)
    expect(jwks.keys).toHaveLength(1)
    expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', kid: 'test-key-1', alg: 'RS256', use: 'sig' })
    expect(jwks.keys[0].n).toBeTruthy()
    expect(jwks.keys[0].e).toBeTruthy()
  })
})

describe('RC3-21 #63 Renegade ID assertion lifecycle', () => {
  it('enroll → issue → verify, then revoke actually revokes', async () => {
    const store = seededStore()
    const enrolled = await enrollRenegadeId(store, config, 'member-1')
    expect(enrolled).toMatchObject({
      ok: true,
      subject: 'http://localhost:3000/id/alice',
      scopes: ['profile.read'],
    })
    const issued = await issueAssertion(store, config, 'member-1')
    if (!issued.ok) throw new Error('issue failed')
    const verified = await verifyAssertion(store, config, issued.assertion, {
      requiredScope: 'profile.read',
    })
    expect(verified).toMatchObject({ ok: true, memberId: 'member-1', handle: 'alice' })

    await revokeRenegadeId(store, 'member-1')
    const afterRevoke = await verifyAssertion(store, config, issued.assertion)
    expect(afterRevoke).toEqual({ ok: false, reason: 'enrollment_revoked' })
    const issueAfterRevoke = await issueAssertion(store, config, 'member-1')
    expect(issueAfterRevoke).toEqual({ ok: false, reason: 'enrollment_revoked' })
  })

  it('refuses a required scope the assertion does not carry', async () => {
    const store = seededStore()
    await enrollRenegadeId(store, config, 'member-1')
    const issued = await issueAssertion(store, config, 'member-1')
    if (!issued.ok) throw new Error('issue failed')
    const verified = await verifyAssertion(store, config, issued.assertion, {
      requiredScope: 'profile.write',
    })
    expect(verified).toEqual({ ok: false, reason: 'insufficient_scope' })
  })

  it('refuses an expired assertion and a tampered one', async () => {
    const store = seededStore()
    await enrollRenegadeId(store, config, 'member-1')
    const issued = await issueAssertion(store, config, 'member-1')
    if (!issued.ok) throw new Error('issue failed')
    const expired = await verifyAssertion(store, config, issued.assertion, {
      now: new Date(Date.now() + 11 * 60 * 1000),
    })
    expect(expired).toEqual({ ok: false, reason: 'expired_assertion' })
    const tampered = await verifyAssertion(store, config, `${issued.assertion}x`)
    expect(tampered).toEqual({ ok: false, reason: 'invalid_assertion' })
  })

  it('refuses to issue without an enrollment', async () => {
    const store = seededStore()
    const issued = await issueAssertion(store, config, 'member-1')
    expect(issued).toEqual({ ok: false, reason: 'not_enrolled' })
  })

  it('binds assertions to a single-use challenge nonce', async () => {
    const store = seededStore()
    await enrollRenegadeId(store, config, 'member-1')
    const { nonce } = await issueChallengeNonce(config, 'member-1')
    expect(await consumeChallengeNonce(config, nonce, 'member-1')).toBe(true)
    expect(await consumeChallengeNonce(config, nonce, 'member-1')).toBe(false)

    const { nonce: nonce2 } = await issueChallengeNonce(config, 'member-1')
    const issued = await issueAssertion(store, config, 'member-1', { nonce: nonce2 })
    if (!issued.ok) throw new Error('issue failed')
    const ok = await verifyAssertion(store, config, issued.assertion, {
      expectedNonce: nonce2,
    })
    expect(ok.ok).toBe(true)
    const wrong = await verifyAssertion(store, config, issued.assertion, {
      expectedNonce: 'some-other-nonce',
    })
    expect(wrong).toEqual({ ok: false, reason: 'nonce_mismatch' })
  })

  it('requested scopes are a subset of the enrollment grant', async () => {
    const store = seededStore()
    await enrollRenegadeId(store, config, 'member-1', ['profile.read'])
    const issued = await issueAssertion(store, config, 'member-1', {
      scopes: ['profile.read', 'admin'],
    })
    if (!issued.ok) throw new Error('issue failed')
    const verified = await verifyAssertion(store, config, issued.assertion)
    expect(verified).toMatchObject({ ok: true, scopes: ['profile.read'] })
  })
})
