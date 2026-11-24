/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { exportJWK, importSPKI, SignJWT } from 'jose'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import {
  digest,
  MEMBER_SESSION_COOKIE,
  opaqueToken,
} from '../../src/modules/identity/member-identity'
import { POST as enrollRoute } from '../../src/app/(frontend)/api/renegade-id/enroll/route'
import { POST as challengeRoute } from '../../src/app/(frontend)/api/renegade-id/challenge/route'
import { POST as assertRoute } from '../../src/app/(frontend)/api/renegade-id/assert/route'
import { POST as verifyRoute } from '../../src/app/(frontend)/api/renegade-id/verify/route'
import { POST as revokeRoute } from '../../src/app/(frontend)/api/renegade-id/revoke/route'
import { GET as ssoStartRoute } from '../../src/app/(frontend)/api/auth/sso/start/route'
import { GET as ssoCallbackRoute } from '../../src/app/(frontend)/api/auth/sso/callback/route'

/**
 * RC3-21 #63/#64 real-DB journeys.
 * (1) Renegade ID: enroll → challenge → assert (nonce-bound) → verify →
 *     revoke → verify refused.
 * (2) Enterprise SSO against a loopback fixture IdP (node:http OIDC
 *     fixture, RS256): start → authorize → callback → linked-identities
 *     row (kind 'oauth'), member-sessions row (createdFrom 'oauth'),
 *     session cookie set.
 * (3) Negative: a non-loopback issuer connection is refused at save time.
 */

const RUN = randomUUID().slice(0, 8)
let payload: Payload

const post = (url: string, cookie: string, body: unknown = {}) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })

// ---------- Renegade ID fixtures ----------
const idKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const idPrivatePem = idKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

// ---------- Fixture IdP ----------
const idpKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const idpPrivatePem = idpKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const idpPublicPem = idpKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
let idp: Server
let issuer = ''
const pendingCodes = new Map<string, { challenge: string; nonce?: string }>()
const SSO_SUB = `idp-user-${RUN}`
const SSO_EMAIL = `sso-${RUN}@example.test`

async function startFixtureIdp(): Promise<void> {
  const jwk = await exportJWK(await importSPKI(idpPublicPem, 'RS256'))
  idp = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', issuer)
    if (url.pathname === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks.json`,
        }),
      )
      return
    }
    if (url.pathname === '/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [{ ...jwk, kid: 'fixture-1', alg: 'RS256', use: 'sig' }] }))
      return
    }
    if (url.pathname === '/authorize') {
      const code = `code-${randomUUID()}`
      pendingCodes.set(code, {
        challenge: url.searchParams.get('code_challenge') ?? '',
      })
      const redirect = new URL(url.searchParams.get('redirect_uri') ?? '')
      redirect.searchParams.set('code', code)
      redirect.searchParams.set('state', url.searchParams.get('state') ?? '')
      redirect.searchParams.set('scope', url.searchParams.get('scope') ?? 'openid')
      res.writeHead(302, { location: redirect.toString() })
      res.end()
      return
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      const raw = await new Promise<string>((resolve) => {
        let data = ''
        req.on('data', (chunk) => (data += chunk))
        req.on('end', () => resolve(data))
      })
      const form = new URLSearchParams(raw)
      const code = form.get('code') ?? ''
      const pending = pendingCodes.get(code)
      const verifier = form.get('code_verifier') ?? ''
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      if (!pending || pending.challenge !== challenge) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid_grant' }))
        return
      }
      pendingCodes.delete(code)
      const { importPKCS8 } = await import('jose')
      const idToken = await new SignJWT({
        email: SSO_EMAIL,
        name: 'SSO Fixture User',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'fixture-1' })
        .setIssuer(issuer)
        .setSubject(SSO_SUB)
        .setAudience(form.get('client_id') ?? '')
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
        .sign(await importPKCS8(idpPrivatePem, 'RS256'))
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({ id_token: idToken, access_token: 'fixture-access', token_type: 'Bearer' }),
      )
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => idp.listen(0, '127.0.0.1', resolve))
  const port = (idp.address() as AddressInfo).port
  issuer = `http://127.0.0.1:${port}`
}

beforeAll(async () => {
  process.env.RENEGADE_ID_PRIVATE_KEY_PEM = idPrivatePem
  process.env.RENEGADE_ID_KEY_ID = 'integration-key-1'
  payload = await getPayload({ config })
  await startFixtureIdp()
}, 120_000)

afterAll(async () => {
  await new Promise<void>((resolve) => idp.close(() => resolve()))
})

describe('RC3-21 #63 Renegade ID journey (real DB, real routes)', () => {
  it('enroll → challenge → assert → verify → revoke → verify refused', async () => {
    const member = await payload.create({
      collection: 'members',
      data: {
        displayName: 'Renegade ID Tester',
        email: `rid-${RUN}@example.test`,
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    const handle = `rid-${RUN}`
    await payload.create({
      collection: 'profiles',
      data: {
        member: member.id,
        displayName: 'Renegade ID Tester',
        handle,
        visibility: 'private',
      } as never,
      overrideAccess: true,
    })
    const sessionToken = opaqueToken()
    await payload.create({
      collection: 'member-sessions',
      data: {
        member: member.id,
        tokenHash: digest(sessionToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdFrom: 'magic-link',
      } as never,
      overrideAccess: true,
    })
    const cookie = `${MEMBER_SESSION_COOKIE}=${sessionToken}`
    const base = 'http://localhost:3000/api/renegade-id'

    const enrollRes = await enrollRoute(post(`${base}/enroll`, cookie, {}))
    expect(enrollRes.status).toBe(200)
    const enrollBody = await enrollRes.json()
    expect(enrollBody.subject).toContain(`/id/${handle}`)

    const challengeRes = await challengeRoute(post(`${base}/challenge`, cookie, {}))
    expect(challengeRes.status).toBe(200)
    const { nonce } = await challengeRes.json()

    const assertRes = await assertRoute(post(`${base}/assert`, cookie, { nonce }))
    expect(assertRes.status).toBe(200)
    const { assertion } = await assertRes.json()
    expect(typeof assertion).toBe('string')

    const verifyRes = await verifyRoute(
      post(`${base}/verify`, '', { assertion, requiredScope: 'profile.read', nonce }),
    )
    expect(verifyRes.status).toBe(200)
    const verifyBody = await verifyRes.json()
    expect(verifyBody).toMatchObject({
      verified: true,
      identity: { memberId: String(member.id), handle },
      scopes: ['profile.read'],
    })

    const revokeRes = await revokeRoute(post(`${base}/revoke`, cookie, {}))
    expect(revokeRes.status).toBe(200)

    const refusedRes = await verifyRoute(post(`${base}/verify`, '', { assertion }))
    expect(refusedRes.status).toBe(401)
    const refusedBody = await refusedRes.json()
    expect(refusedBody).toEqual({ verified: false, reason: 'enrollment_revoked' })
  })
})

describe('RC3-21 #64 enterprise SSO journey (loopback fixture IdP)', () => {
  it('start → authorize → callback links identity and mints an oauth session', async () => {
    const connection = await payload.create({
      collection: 'enterprise-idp-connections',
      data: {
        label: `Fixture IdP ${RUN}`,
        issuer,
        clientId: 'fixture-client',
        redirectUri: 'http://localhost:3000/api/auth/sso/callback',
        scopes: ['openid', 'profile', 'email'],
        status: 'active',
      } as never,
      overrideAccess: true,
    })

    const startRes = await ssoStartRoute(
      new Request(`http://localhost:3000/api/auth/sso/start?connection=${connection.id}`),
    )
    expect(startRes.status).toBe(302)
    const authorizeUrl = startRes.headers.get('location') ?? ''
    expect(authorizeUrl.startsWith(`${issuer}/authorize`)).toBe(true)
    const txnCookie = (startRes.headers.get('set-cookie') ?? '').split(';')[0]
    expect(txnCookie.startsWith('renegade-sso-txn=')).toBe(true)

    const authorizeRes = await fetch(authorizeUrl, { redirect: 'manual' })
    expect(authorizeRes.status).toBe(302)
    const callbackUrl = authorizeRes.headers.get('location') ?? ''
    expect(callbackUrl).toContain('/api/auth/sso/callback')
    expect(callbackUrl).toContain('code=')

    const callbackRes = await ssoCallbackRoute(
      new Request(callbackUrl, { headers: { cookie: txnCookie } }),
    )
    expect(callbackRes.status).toBe(302)
    expect(callbackRes.headers.get('location')).toContain('/members/settings')
    const setCookie = callbackRes.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`${MEMBER_SESSION_COOKIE}=`)

    const links = await payload.find({
      collection: 'linked-identities',
      where: {
        and: [
          { providerKey: { equals: String(connection.id) } },
          { externalSubject: { equals: SSO_SUB } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    expect(links.docs).toHaveLength(1)
    expect((links.docs[0] as any).kind).toBe('oauth')
    const memberId = String((links.docs[0] as any).member)

    const member = await payload.findByID({
      collection: 'members',
      id: memberId,
      depth: 0,
      overrideAccess: true,
    })
    expect((member as any).email).toBe(SSO_EMAIL)

    const sessions = await payload.find({
      collection: 'member-sessions',
      where: {
        and: [{ member: { equals: memberId } }, { createdFrom: { equals: 'oauth' } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    expect(sessions.docs).toHaveLength(1)
  })

  it('refuses to save a connection with a non-loopback issuer', async () => {
    await expect(
      payload.create({
        collection: 'enterprise-idp-connections' as never,
        data: {
          label: `Evil IdP ${RUN}`,
          issuer: 'https://example.com:443',
          clientId: 'fixture-client',
          redirectUri: 'http://localhost:3000/api/auth/sso/callback',
          scopes: ['openid'],
          status: 'active',
        } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })
})
