/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from '../../src/app/(frontend)/api/admin/social/accounts/route'
import { credentialsForSocialAccount } from '../../src/modules/social/provider-runtime'
import { runSocialCredentialScan } from '../../src/modules/social/credential-scan'
import { encryptSecret } from '../../src/modules/social/security'

/**
 * SOC-SEC-1 (Red F-1/F-3) contract suite.
 *
 * F-1: the social accounts API must never return credential material — the
 * stored `enc:` envelope is a credential, not metadata. Every response shape
 * (list, connect, test, disconnect) carries a redacted account view only.
 * F-3: a plaintext-JSON `connectionReference` must resolve to nothing and be
 * refused at the connect write path; envelope accounts keep working, and the
 * named-reference (environment-resolved) path is unchanged.
 */

const envelopeFor = (creds: Record<string, unknown>) =>
  `enc:${encryptSecret(JSON.stringify(creds))}`

const blueskyEnvelope = envelopeFor({
  identifier: 'op.bsky.social',
  appPassword: 'pw-123',
  service: 'http://127.0.0.1:3130',
})
const xEnvelope = envelopeFor({ token: 'tok-1' })

const envelopeAccount = {
  id: 'acct-enc',
  site: 'site-a',
  network: 'bluesky',
  displayName: 'Bluesky Main',
  externalAccountId: 'op.bsky.social',
  actorType: 'site',
  capabilityState: 'available',
  capabilities: { postTypes: ['text'] },
  credentialHealth: 'healthy',
  credentialExpiresAt: null,
  connectionReference: blueskyEnvelope,
  lastVerifiedAt: '2026-11-01T00:00:00.000Z',
  diagnostics: { mode: 'live', status: 'healthy', lastError: null },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

const xAccount = {
  ...envelopeAccount,
  id: 'acct-x',
  site: 'site-b',
  network: 'x',
  displayName: 'X Main',
  externalAccountId: 'x-main',
  connectionReference: xEnvelope,
}

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(async (args: any) => {
    if (args.collection === 'social-accounts') return { docs: mockAccounts }
    return { docs: [] }
  }),
  findByID: vi.fn(async (args: any) => {
    if (args.collection !== 'social-accounts') return null
    return mockAccounts.find((a) => String(a.id) === String(args.id)) ?? null
  }),
  create: vi.fn(async (args: any) => ({ id: 'created-1', ...args.data })),
  // Payload update returns the full updated document, not just the patch.
  update: vi.fn(async (args: any) => {
    const existing = mockAccounts.find((a) => String(a.id) === String(args.id)) ?? {}
    return { ...existing, id: args.id, ...args.data }
  }),
}

let mockAccounts: any[] = []

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mockPayload),
}))

const operator = {
  user: {
    id: 'op-a',
    email: 'a@example.com',
    role: 'administrator',
    authorizedSiteIds: ['site-a', 'site-b'],
  },
}

function getRequest(url = 'http://localhost/api/admin/social/accounts') {
  return new Request(url, { method: 'GET' })
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/social/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function expectNoCredentialMaterial(body: unknown) {
  const serialized = JSON.stringify(body)
  expect(serialized).not.toContain('connectionReference')
  expect(serialized).not.toContain('enc:')
  expect(serialized).not.toContain('pw-123')
  expect(serialized).not.toContain('tok-1')
}

describe('SOC-SEC-1 F-1: accounts API never returns credential material', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccounts = [{ ...envelopeAccount }, { ...xAccount }]
    mockPayload.auth.mockResolvedValue(operator)
  })

  it('GET list returns redacted views for every site', async () => {
    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accounts).toHaveLength(2)
    expectNoCredentialMaterial(body)
    const view = body.accounts[0]
    expect(view.id).toBe('acct-enc')
    expect(view.network).toBe('bluesky')
    expect(view.displayName).toBe('Bluesky Main')
    expect(view.externalAccountId).toBe('op.bsky.social')
    expect(view.credentialHealth).toBe('healthy')
    expect(view.capabilityState).toBe('available')
    expect(view.credentialsConfigured).toBe(true)
  })

  it('POST connect stores an envelope but returns only the redacted view', async () => {
    mockAccounts = []
    const res = await POST(
      postRequest({
        action: 'connect',
        siteId: 'site-a',
        network: 'x',
        displayName: 'Fresh X',
        credentials: { token: 'brand-new-token' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expectNoCredentialMaterial(body)
    expect(body.account.displayName).toBe('Fresh X')
    expect(body.account.credentialsConfigured).toBe(true)
    // Write path intact: the stored reference is an envelope, never plaintext.
    const createArgs = mockPayload.create.mock.calls[0][0] as any
    expect(createArgs.data.connectionReference).toMatch(/^enc:/)
  })

  it('POST test on an envelope account stays healthy and returns the redacted view', async () => {
    mockAccounts = [{ ...xAccount, site: 'site-a' }]
    const res = await POST(postRequest({ action: 'test', accountId: 'acct-x' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.health).toBe('healthy')
    expectNoCredentialMaterial(body)
    expect(body.account.credentialsConfigured).toBe(true)
  })

  it('POST disconnect purges the reference and returns the redacted view', async () => {
    mockAccounts = [{ ...envelopeAccount }]
    const res = await POST(postRequest({ action: 'disconnect', accountId: 'acct-enc' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expectNoCredentialMaterial(body)
    const updateArgs = mockPayload.update.mock.calls[0][0] as any
    expect(updateArgs.data.connectionReference).toBeNull()
    expect(body.account.credentialHealth).toBe('revoked')
    expect(body.account.credentialsConfigured).toBe(false)
  })
})

describe('SOC-SEC-1 F-3: plaintext credential references are refused', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccounts = [{ ...envelopeAccount }]
    mockPayload.auth.mockResolvedValue(operator)
  })

  it('credentialsForSocialAccount resolves envelope credentials', () => {
    expect(credentialsForSocialAccount(xEnvelope)).toEqual({ token: 'tok-1' })
    expect(credentialsForSocialAccount(blueskyEnvelope)).toEqual({
      identifier: 'op.bsky.social',
      appPassword: 'pw-123',
      service: 'http://127.0.0.1:3130',
    })
  })

  it('credentialsForSocialAccount rejects plaintext JSON references', () => {
    const plaintext = JSON.stringify({ identifier: 'op', appPassword: 'pw' })
    expect(credentialsForSocialAccount(plaintext)).toBeNull()
  })

  it('connect refuses a plaintext JSON connectionReference and writes nothing', async () => {
    const res = await POST(
      postRequest({
        action: 'connect',
        siteId: 'site-a',
        network: 'bluesky',
        displayName: 'Plaintext Attempt',
        connectionReference: JSON.stringify({ identifier: 'op', appPassword: 'pw' }),
      }),
    )
    expect(res.status).toBe(400)
    expect(mockPayload.create).not.toHaveBeenCalled()
    expect(mockPayload.update).not.toHaveBeenCalled()
  })

  describe('credential scan migrates or invalidates plaintext rows', () => {
    const plaintextParseable = JSON.stringify({ identifier: 'legacy', appPassword: 'legacy-pw' })
    const plaintextBroken = '{not-json'

    function scanPayload(rows: any[], mutateOnRead?: (row: any) => void) {
      return {
        find: vi.fn(async () => {
          const docs = rows.map((r) => ({ ...r }))
          if (mutateOnRead) docs.forEach(mutateOnRead)
          return { docs, hasNextPage: false }
        }),
        update: vi.fn(async (args: any) => {
          const clauses = args.where.and as any[]
          const idEq = clauses.find((c) => c.id)?.id.equals
          const refEq = clauses.find((c) => c.connectionReference)?.connectionReference.equals
          const row = rows.find((r) => String(r.id) === String(idEq))
          if (!row || row.connectionReference !== refEq) return { docs: [] }
          Object.assign(row, args.data)
          return { docs: [row] }
        }),
      }
    }

    const baseRow = {
      site: 'site-a',
      network: 'bluesky',
      displayName: 'Legacy',
      externalAccountId: 'legacy',
      actorType: 'site',
      capabilityState: 'available',
      credentialHealth: 'healthy',
      diagnostics: { mode: 'live' },
    }

    it('dry run reports plaintext rows and changes nothing', async () => {
      const rows = [
        { ...baseRow, id: 'r1', connectionReference: plaintextParseable },
        { ...baseRow, id: 'r2', connectionReference: xEnvelope },
        { ...baseRow, id: 'r3', connectionReference: 'named-ref' },
        { ...baseRow, id: 'r4', connectionReference: null },
      ]
      const payload = scanPayload(rows)
      const report = await runSocialCredentialScan(payload as never, false)
      expect(report).toMatchObject({
        dryRun: true,
        scanned: 4,
        envelope: 1,
        namedReference: 1,
        empty: 1,
        plaintextFound: 1,
        reencrypted: 0,
        invalidated: 0,
      })
      expect(payload.update).not.toHaveBeenCalled()
      expect(rows[0].connectionReference).toBe(plaintextParseable)
    })

    it('apply re-encrypts parseable rows and invalidates broken rows', async () => {
      const rows = [
        { ...baseRow, id: 'r1', connectionReference: plaintextParseable },
        { ...baseRow, id: 'r2', connectionReference: plaintextBroken },
      ]
      const payload = scanPayload(rows)
      const report = await runSocialCredentialScan(payload as never, true)
      expect(report).toMatchObject({ plaintextFound: 2, reencrypted: 1, invalidated: 1 })

      // Re-encrypted row: envelope that resolves to the original credentials.
      expect(rows[0].connectionReference).toMatch(/^enc:/)
      expect(credentialsForSocialAccount(rows[0].connectionReference)).toEqual({
        identifier: 'legacy',
        appPassword: 'legacy-pw',
      })
      expect(rows[0].credentialHealth).toBe('healthy')

      // Invalidated row: reference wiped, marked reconnect-required, cannot dispatch.
      expect(rows[1].connectionReference).toBeNull()
      expect(rows[1].credentialHealth).toBe('expired')
      expect(rows[1].capabilityState).toBe('unavailable')
      expect((rows[1].diagnostics as any).reconnectRequired).toBe(true)
      expect(credentialsForSocialAccount(rows[1].connectionReference)).toBeNull()

      // Idempotent: a second apply finds no plaintext.
      const second = await runSocialCredentialScan(payload as never, true)
      expect(second.plaintextFound).toBe(0)
    })

    it('a row changed mid-scan is reported, not corrupted', async () => {
      const freshEnvelope = envelopeFor({ token: 'fresh' })
      const rows = [{ ...baseRow, id: 'r1', connectionReference: plaintextParseable }]
      // Simulate a connect landing between the scan's read and its write:
      // the stored value no longer matches the classified plaintext.
      const payload = scanPayload(rows, () => {
        rows[0].connectionReference = freshEnvelope
      })
      const report = await runSocialCredentialScan(payload as never, true)
      expect(report.changedDuringScan).toBe(1)
      expect(report.reencrypted).toBe(0)
      expect(rows[0].connectionReference).toBe(freshEnvelope)
    })
  })

  describe('named-reference environment fallback (unchanged)', () => {
    afterEach(() => {
      delete process.env.SOCIAL_BLUESKY_MY_HANDLE_IDENTIFIER
      delete process.env.SOCIAL_BLUESKY_MY_HANDLE_APP_PASSWORD
      delete process.env.SOCIAL_BLUESKY_MY_HANDLE_SERVICE
    })

    it('still resolves a named reference from the environment', () => {
      process.env.SOCIAL_BLUESKY_MY_HANDLE_IDENTIFIER = 'env.bsky.social'
      process.env.SOCIAL_BLUESKY_MY_HANDLE_APP_PASSWORD = 'env-pw'
      expect(credentialsForSocialAccount('my-handle')).toEqual({
        identifier: 'env.bsky.social',
        appPassword: 'env-pw',
      })
    })
  })
})
