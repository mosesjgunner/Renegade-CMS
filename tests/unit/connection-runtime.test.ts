import { createHmac, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  EncryptedCredentialBoundary,
  ProviderConnectionRuntime,
  beginOAuth,
  connectionProjection,
  createPkcePair,
  hmacWebhookVerifier,
  receiveWebhook,
  validateOAuthCallback,
  validateConnectionConfiguration,
  type CredentialEnvelope,
  type ProviderConnection,
} from '../../src/modules/extensions/connection-runtime'
import { developmentEmailAdapter } from '../../src/modules/extensions/reference-adapters'

const now = '2026-08-29T00:00:00.000Z'
const connection = (): ProviderConnection => ({
  id: 'connection-1',
  siteId: 'site-1',
  providerKey: 'email.development',
  externalAccountId: 'dev',
  label: 'Development email',
  status: 'unconfigured',
  credentialRef: null,
  encryptedSecretRef: null,
  scopes: [],
  expiresAt: null,
  refreshMetadata: null,
  capabilities: [],
  lastHealthCheckAt: null,
  lastError: null,
  auditEventIds: [],
})
const keyring = { activeKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64url') } }

describe('provider connection runtime', () => {
  it('keeps secrets behind authenticated encrypted envelopes and public projections', () => {
    const boundary = new EncryptedCredentialBoundary(keyring)
    const encrypted = boundary.encrypt({ accessToken: 'top-secret' })
    expect(JSON.stringify(encrypted)).not.toContain('top-secret')
    expect(boundary.decrypt(encrypted)).toEqual({ accessToken: 'top-secret' })
    expect(() => boundary.decrypt({ ...encrypted, tag: 'invalid' })).toThrow(/decrypted/)
    expect(
      JSON.stringify(connectionProjection({ ...connection(), credentialRef: 'credential:1' })),
    ).not.toContain('credential')
  })

  it('uses state protection, PKCE, and required scope validation', () => {
    const pair = createPkcePair()
    expect(pair.challenge).not.toBe(pair.verifier)
    const flow = beginOAuth(
      {
        authorizationUrl: 'https://id.example/authorize',
        clientId: 'client',
        redirectUri: 'https://cms.example/callback',
        scopes: ['profile'],
        supportsPkce: true,
      },
      'identity.example',
      new Date(now),
    )
    const state = new URL(flow.authorizationUrl).searchParams.get('state')
    expect(new URL(flow.authorizationUrl).searchParams.get('code_challenge_method')).toBe('S256')
    validateOAuthCallback(flow.transaction, state, ['profile'], now)
    expect(() => validateOAuthCallback(flow.transaction, 'wrong', ['profile'], now)).toThrow(
      /OAuth state/,
    )
    expect(() => validateOAuthCallback(flow.transaction, state, [], now)).toThrow(/scopes/)
  })

  it('runs the development email adapter through configure, discovery, expiry, and disconnect', async () => {
    const records = new Map<string, CredentialEnvelope>()
    const deleted: string[] = []
    const runtime = new ProviderConnectionRuntime(
      [developmentEmailAdapter],
      {
        async put(_id, envelope) {
          records.set('credential:1', envelope)
          return 'credential:1'
        },
        async get(ref) {
          return records.get(ref) ?? null
        },
        async delete(ref) {
          deleted.push(ref)
          records.delete(ref)
        },
      },
      new EncryptedCredentialBoundary(keyring),
    )
    const configured = await runtime.configure(connection(), { apiKey: 'secret' }, now)
    const active = await runtime.test(configured, now)
    expect(active.status).toBe('active')
    expect(active.capabilities.map((item) => item.key)).toContain('email.transactional')
    expect(validateConnectionConfiguration(developmentEmailAdapter, active)).toEqual([])
    const degraded = await new ProviderConnectionRuntime(
      [
        {
          ...developmentEmailAdapter,
          async test() {
            throw new Error('token=secret')
          },
        },
      ],
      {
        async put() {
          return 'unused'
        },
        async get() {
          return null
        },
        async delete() {},
      },
      new EncryptedCredentialBoundary(keyring),
    ).test(active, now)
    expect(degraded.status).toBe('degraded')
    expect(degraded.lastError?.message).not.toContain('secret')
    expect(
      (await runtime.test({ ...active, expiresAt: '2026-08-28T00:00:00.000Z' }, now)).status,
    ).toBe('expired')
    expect((await runtime.disconnect(active, now)).status).toBe('disconnected')
    expect(deleted).toEqual(['credential:1'])
  })

  it('fails closed on invalid, replayed, stale, or oversized webhooks', async () => {
    const seen = new Set<string>(),
      persisted: string[] = []
    const raw = '{"id":"event-1"}',
      secret = 'webhook-secret'
    const signature = createHmac('sha256', secret).update(raw).digest('hex')
    const definition = {
      providerKey: 'email.fixture',
      signatureHeader: 'x-signature',
      timestampHeader: 'x-timestamp',
      toleranceMs: 60_000,
      maxBytes: 100,
      verify: hmacWebhookVerifier(secret),
      eventId: (body: string) => JSON.parse(body).id as string,
    }
    const store = {
      async seen(_provider: string, id: string) {
        return seen.has(id)
      },
      async persist(receipt: { eventId: string }) {
        seen.add(receipt.eventId)
        persisted.push(receipt.eventId)
      },
    }
    const headers = { 'x-signature': signature, 'x-timestamp': String(Date.parse(now) / 1000) }
    expect(
      (
        await receiveWebhook(
          new Request('http://x', { method: 'POST', headers, body: raw }),
          definition,
          store,
          async () => {},
          new Date(now),
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await receiveWebhook(
          new Request('http://x', { method: 'POST', headers, body: raw }),
          definition,
          store,
          async () => {},
          new Date(now),
        )
      ).status,
    ).toBe(200)
    expect(persisted).toEqual(['event-1'])
    expect(
      (
        await receiveWebhook(
          new Request('http://x', { method: 'POST', headers: { 'x-signature': 'bad' }, body: raw }),
          definition,
          store,
          async () => {},
          new Date(now),
        )
      ).status,
    ).toBe(401)
    expect(
      (
        await receiveWebhook(
          new Request('http://x', {
            method: 'POST',
            headers: { 'x-signature': signature, 'content-length': '101' },
            body: raw,
          }),
          definition,
          store,
          async () => {},
          new Date(now),
        )
      ).status,
    ).toBe(413)
  })
})
