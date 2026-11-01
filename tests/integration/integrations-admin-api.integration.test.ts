/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { GET, POST } from '../../src/app/(frontend)/api/admin/integrations/route'
import { credentialCipher } from '../../src/modules/ai/connections'
import { EncryptedCredentialBoundary } from '../../src/modules/extensions/connection-runtime'
import {
  decryptCredential as decryptPodCredential,
  encryptCredential as encryptPodCredential,
} from '../../src/modules/commerce/pod-connection'

// Mock Payload store
const mockClients: any[] = []
const mockSubscriptions: any[] = []
const mockDeliveries: any[] = []
const mockMerchants: any[] = []
const mockSocials: any[] = []
const mockPod: any[] = []
const mockAi: any[] = []
const mockAiCredentials: any[] = []
const mockAuditEvents: any[] = []

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(async (args: any) => {
    switch (args.collection) {
      case 'api-clients':
        return { docs: [...mockClients] }
      case 'webhook-subscriptions':
        return { docs: [...mockSubscriptions] }
      case 'webhook-deliveries':
        return { docs: [...mockDeliveries] }
      case 'merchant-connections':
        return { docs: [...mockMerchants] }
      case 'social-accounts':
        return { docs: [...mockSocials] }
      case 'pod-connections':
        return { docs: [...mockPod] }
      case 'ai-connections':
        return { docs: [...mockAi] }
      case 'ai-credentials':
        return { docs: [...mockAiCredentials] }
      case 'integration-audit-events':
        return { docs: [...mockAuditEvents] }
      default:
        return { docs: [] }
    }
  }),
  findByID: vi.fn(async (args: any) => {
    let pool: any[] = []
    if (args.collection === 'api-clients') pool = mockClients
    if (args.collection === 'webhook-subscriptions') pool = mockSubscriptions
    if (args.collection === 'webhook-deliveries') pool = mockDeliveries
    if (args.collection === 'merchant-connections') pool = mockMerchants
    if (args.collection === 'social-accounts') pool = mockSocials
    if (args.collection === 'pod-connections') pool = mockPod
    if (args.collection === 'ai-connections') pool = mockAi
    const found = pool.find((item) => String(item.id) === String(args.id))
    return found || null
  }),
  create: vi.fn(async (args: any) => {
    const doc = { id: `doc_${Date.now()}_${Math.random()}`, ...args.data }
    if (args.collection === 'api-clients') mockClients.push(doc)
    if (args.collection === 'webhook-subscriptions') mockSubscriptions.push(doc)
    if (args.collection === 'webhook-deliveries') mockDeliveries.push(doc)
    if (args.collection === 'integration-audit-events') mockAuditEvents.push(doc)
    return doc
  }),
  update: vi.fn(async (args: any) => {
    let pool: any[] = []
    if (args.collection === 'api-clients') pool = mockClients
    if (args.collection === 'webhook-subscriptions') pool = mockSubscriptions
    if (args.collection === 'webhook-deliveries') pool = mockDeliveries
    if (args.collection === 'merchant-connections') pool = mockMerchants
    if (args.collection === 'social-accounts') pool = mockSocials
    if (args.collection === 'pod-connections') pool = mockPod
    if (args.collection === 'ai-connections') pool = mockAi
    if (args.collection === 'ai-credentials') pool = mockAiCredentials
    const idx = pool.findIndex((item) => String(item.id) === String(args.id))
    if (idx >= 0) {
      pool[idx] = { ...pool[idx], ...args.data }
      return pool[idx]
    }
    return { id: args.id, ...args.data }
  }),
  delete: vi.fn(async (args: any) => {
    if (args.collection === 'ai-credentials') {
      const connectionId = args.where?.connection?.equals
      for (let i = mockAiCredentials.length - 1; i >= 0; i--) {
        if (String(mockAiCredentials[i].connection) === String(connectionId)) {
          mockAiCredentials.splice(i, 1)
        }
      }
    }
    return { docs: [] }
  }),
}

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mockPayload),
}))

describe('Operational Admin API (/api/admin/integrations)', () => {
  beforeEach(() => {
    mockClients.length = 0
    mockSubscriptions.length = 0
    mockDeliveries.length = 0
    mockMerchants.length = 0
    mockSocials.length = 0
    mockPod.length = 0
    mockAi.length = 0
    mockAiCredentials.length = 0
    mockAuditEvents.length = 0

    mockPayload.auth.mockResolvedValue({
      user: { id: 'admin-1', role: 'owner' },
    })

    process.env.WEBHOOK_SECRET_TEST_VAULT = 'secret_testing_val_123'
  })

  it('rejects unauthorized requests without staff role', async () => {
    mockPayload.auth.mockResolvedValueOnce({ user: { id: 'user-1', role: 'subscriber' } })
    const res = await GET(new Request('http://localhost/api/admin/integrations'))
    expect(res.status).toBe(403)
  })

  it('queries all canonical connection records and computes operational health and repair actions', async () => {
    mockClients.push({
      id: 'c1',
      name: 'Mobile Reader Client',
      tokenPrefix: 'rgn_c1_abc',
      tokenHash: 'hash1',
      scopes: ['content.read'],
      lastUsedAt: '2026-09-24T18:00:00.000Z',
    })

    mockMerchants.push({
      id: 'm1',
      label: 'Stripe Global',
      providerKey: 'stripe',
      status: 'active',
      credentialReference: 'STRIPE_SECRET_KEY',
      updatedAt: '2026-09-24T12:00:00.000Z',
    })

    const res = await GET(new Request('http://localhost/api/admin/integrations'))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.connections).toHaveLength(2)

    const clientConn = data.connections.find((c: any) => c.id === 'c1')
    expect(clientConn.healthState).toBe('healthy')
    expect(clientConn.lastSuccessAt).toBe('2026-09-24T18:00:00.000Z')
    expect(clientConn.nextSafeRepairAction).toContain('Healthy')

    const merchantConn = data.connections.find((c: any) => c.id === 'm1')
    // No live probe exists for merchant connections: health stays unverified
    // and no success is derived from the record's updatedAt timestamp.
    expect(merchantConn.healthState).toBe('unknown')
    expect(merchantConn.lastSuccessAt).toBeNull()
    expect(merchantConn.lastHealthCheckAt).toBeNull()
    expect(merchantConn.isUnknown).toBe(true)
    expect(merchantConn.group).toBe('Payments & Support')
  })

  it('creates an API client machine credential, returning clear token once and recording audit event', async () => {
    const req = new Request('http://localhost/api/admin/integrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'create-client',
        name: 'Analytics Importer',
        scopes: ['content.read', 'analytics.read'],
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.token).toMatch(/^rgn_.*\.[\w-]+$/)
    expect(body.tokenPrefix).toMatch(/^rgn_/)
    expect(mockClients).toHaveLength(1)
    expect(mockClients[0].tokenHash).not.toBe(body.token) // never stored in clear

    // Canonical audit event recorded
    expect(mockAuditEvents).toHaveLength(1)
    expect(mockAuditEvents[0].action).toBe('client.issued')
    expect(mockAuditEvents[0].outcome).toBe('allowed')
  })

  it('rotates machine client secret and records audit trail', async () => {
    mockClients.push({
      id: 'client-rotate',
      name: 'To Rotate',
      tokenPrefix: 'rgn_old',
      tokenHash: 'oldHash',
      scopes: ['content.read'],
    })

    const req = new Request('http://localhost/api/admin/integrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'rotate-client-secret',
        clientId: 'client-rotate',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.token).toBeDefined()
    expect(body.tokenPrefix).not.toBe('rgn_old')

    expect(mockAuditEvents.some((e) => e.action === 'client.secret_rotated')).toBe(true)
  })

  it('revokes machine client safely', async () => {
    mockClients.push({
      id: 'client-revoke',
      name: 'To Revoke',
      tokenPrefix: 'rgn_revoke',
      tokenHash: 'hash',
      scopes: ['content.read'],
    })

    const req = new Request('http://localhost/api/admin/integrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'revoke-client',
        clientId: 'client-revoke',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockClients[0].revokedAt).toBeDefined()
    expect(mockAuditEvents.some((e) => e.action === 'client.revoked')).toBe(true)
  })

  it('reconciles a provider family without a probe without fabricating health or success', async () => {
    mockMerchants.push({
      id: 'm-reconcile',
      label: 'PayPal Gateway',
      providerKey: 'paypal',
      status: 'active',
      credentialReference: 'PAYPAL_VAULT_REF',
    })

    const req = new Request('http://localhost/api/admin/integrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'reconcile-provider',
        connectionId: 'm-reconcile',
        collection: 'merchant-connections',
        providerKey: 'paypal',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    // Merchant connections have no live probe: reconciliation must report the
    // health as unverified instead of stamping a fresh "healthy" success.
    expect(body.probePerformed).toBe(false)
    expect(body.reconciliation.probePerformed).toBe(false)
    expect(body.reconciliation.observedSuccess).toBe(false)
    expect(body.reconciliation.healthState).toBe('unknown')
    expect(body.reconciliation.lastHealthCheckAt).toBeNull()
    expect(body.reconciliation.lastSuccessAt).toBeNull()
    expect(body.reconciliation.nextSafeRepairAction).toContain('not been verified by a live probe')
    expect(body.message).toContain('No success was recorded')

    const audit = mockAuditEvents.find((e) => e.action === 'connection.reconciled')
    expect(audit).toBeDefined()
    expect(audit.subject.dryRun).toBe(true)
    expect(audit.subject.observedSuccess).toBe(false)
  })

  it('safely disconnects provider, clearing secret reference and preserving canonical data', async () => {
    mockMerchants.push({
      id: 'm-disconnect',
      label: 'Old Processor',
      providerKey: 'stripe',
      status: 'active',
      credentialReference: 'SECRET_TO_CLEAR',
    })

    const req = new Request('http://localhost/api/admin/integrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'disconnect-provider',
        connectionId: 'm-disconnect',
        collection: 'merchant-connections',
        providerKey: 'stripe',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    // Status is disabled, credentialReference is wiped, canonical document preserved
    expect(mockMerchants[0].status).toBe('disabled')
    expect(mockMerchants[0].credentialReference).toBeNull()

    // Canonical audit event recorded
    expect(mockAuditEvents.some((e) => e.action === 'connection.disconnected')).toBe(true)
  })

  it('enqueues manual redelivery for failed webhook with fresh idempotency key', async () => {
    mockDeliveries.push({
      id: 'del-failed',
      subscription: 'sub-1',
      eventId: 'ev-100',
      eventType: 'order.paid',
      payload: { orderId: '100' },
      state: 'dead-letter',
      attempts: 5,
    })

    const req = new Request('http://localhost/api/admin/integrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'redeliver-webhook',
        deliveryId: 'del-failed',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(202)

    const body = await res.json()
    expect(body.delivery.state).toBe('queued')
    expect(body.delivery.idempotencyKey).toContain('webhook:redelivery:del-failed:')

    // Audit event recorded
    expect(mockAuditEvents.some((e) => e.action === 'webhook.manual_redelivery')).toBe(true)
  })

  describe('16A truthful health, credential purge, and key rotation', () => {
    const KEY_V1 = Buffer.alloc(32, 7).toString('base64url')
    const KEY_V2 = Buffer.alloc(32, 9).toString('base64url')
    const ENV_KEYS = [
      'AI_CREDENTIAL_KEY_BASE64URL',
      'AI_CREDENTIAL_KEYRING_JSON',
      'AI_CREDENTIAL_ACTIVE_KEY_ID',
    ] as const
    let savedEnv: Record<string, string | undefined> = {}
    let harness: Server | undefined

    beforeEach(() => {
      savedEnv = {}
      for (const key of ENV_KEYS) {
        savedEnv[key] = process.env[key]
        delete process.env[key]
      }
      process.env.AI_CREDENTIAL_KEY_BASE64URL = KEY_V1
    })

    afterEach(async () => {
      for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key]
        else process.env[key] = savedEnv[key]
      }
      if (harness) {
        await new Promise((resolve) => harness!.close(resolve))
        harness = undefined
      }
    })

    const post = (body: Record<string, unknown>) =>
      POST(
        new Request('http://localhost/api/admin/integrations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )

    const seedAiConnection = (endpoint: string) => {
      mockAi.push({
        id: 'ai-1',
        site: 'site-1',
        label: 'Local Ollama',
        providerKey: 'ai.ollama',
        endpoint,
        model: 'llama3.1',
        status: 'degraded',
        lastError: 'stale error',
        capabilities: [],
      })
      mockAiCredentials.push({
        id: 'cred-1',
        connection: 'ai-1',
        envelope: credentialCipher().encrypt({ apiKey: '' }),
      })
    }

    it('reconciles an AI connection with a real probe against a local Ollama-protocol harness', async () => {
      harness = createServer((req, res) => {
        if (req.url === '/api/tags') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ models: [{ name: 'llama3.1' }] }))
          return
        }
        if (req.url === '/api/generate') {
          let raw = ''
          req.on('data', (chunk) => (raw += chunk))
          req.on('end', () => {
            const parsed = JSON.parse(raw || '{}')
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(
              JSON.stringify({
                response: parsed.format === 'json' ? '{"ok":true}' : 'A short proposal.',
                prompt_eval_count: 5,
                eval_count: 3,
              }),
            )
          })
          return
        }
        res.writeHead(404)
        res.end()
      })
      await new Promise<void>((resolve) => harness!.listen(0, '127.0.0.1', () => resolve()))
      const address = harness.address()
      const port = typeof address === 'object' && address ? address.port : 0
      seedAiConnection(`http://127.0.0.1:${port}`)

      const res = await post({
        action: 'reconcile-provider',
        connectionId: 'ai-1',
        collection: 'ai-connections',
      })
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.probePerformed).toBe(true)
      expect(body.reconciliation.observedSuccess).toBe(true)
      expect(body.reconciliation.healthState).toBe('healthy')
      expect(body.reconciliation.lastSuccessAt).not.toBeNull()
      // The observed probe result was persisted on the canonical record.
      expect(mockAi[0].status).toBe('active')
      expect(mockAi[0].lastTestedAt).toBeDefined()
      expect(mockAi[0].lastError).toBeNull()
      expect(mockAi[0].capabilities).toContain('ai.text.structured')

      const audit = mockAuditEvents.find((e) => e.action === 'connection.reconciled')
      expect(audit.subject.probePerformed).toBe(true)
      expect(audit.subject.dryRun).toBe(false)
      expect(audit.outcome).toBe('allowed')
    })

    it('records an observed AI probe failure as degraded and never claims success', async () => {
      // Reserve an ephemeral port, then close it so the probe is refused.
      const probeServer = createServer()
      await new Promise<void>((resolve) => probeServer.listen(0, '127.0.0.1', () => resolve()))
      const address = probeServer.address()
      const deadPort = typeof address === 'object' && address ? address.port : 0
      await new Promise((resolve) => probeServer.close(resolve))
      seedAiConnection(`http://127.0.0.1:${deadPort}`)

      const res = await post({
        action: 'reconcile-provider',
        connectionId: 'ai-1',
        collection: 'ai-connections',
      })
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.probePerformed).toBe(true)
      expect(body.reconciliation.observedSuccess).toBe(false)
      expect(body.reconciliation.healthState).toBe('warning')
      expect(body.reconciliation.lastSuccessAt).toBeNull()
      expect(body.reconciliation.lastHealthCheckAt).not.toBeNull()
      expect(mockAi[0].status).toBe('degraded')
      expect(mockAi[0].lastError).toContain('Connection test failed')

      const audit = mockAuditEvents.find((e) => e.action === 'connection.reconciled')
      expect(audit.outcome).toBe('failed')
    })

    it('leaves social health unverified when the network has no live probe', async () => {
      mockSocials.push({
        id: 'soc-1',
        site: 'site-1',
        network: 'mastodon',
        displayName: 'Mastodon Account',
        credentialHealth: 'healthy',
        connectionReference: JSON.stringify({ identifier: 'op', appPassword: 'pw' }),
        lastVerifiedAt: '2026-09-01T00:00:00.000Z',
      })

      const res = await post({
        action: 'reconcile-provider',
        connectionId: 'soc-1',
        collection: 'social-accounts',
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.probePerformed).toBe(false)
      expect(body.reconciliation.healthState).toBe('unknown')
      expect(body.reconciliation.lastSuccessAt).toBeNull()
      expect(body.message).toContain('No live probe is available')
      // The stored verification timestamp was not refreshed by a dry run.
      expect(mockSocials[0].lastVerifiedAt).toBe('2026-09-01T00:00:00.000Z')
    })

    it('disconnecting an AI connection via the Center deletes its credential envelope', async () => {
      seedAiConnection('http://127.0.0.1:11434')
      mockAi[0].status = 'active'

      const res = await post({
        action: 'disconnect-provider',
        connectionId: 'ai-1',
        collection: 'ai-connections',
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.credentialsPurged).toBe(true)
      expect(mockAiCredentials).toHaveLength(0)
      expect(mockAi[0].status).toBe('disconnected')
      expect(mockAi[0].capabilities).toEqual([])

      const audit = mockAuditEvents.find((e) => e.action === 'connection.disconnected')
      expect(audit.subject.credentialsPurged).toBe(true)
      expect(audit.subject.canonicalDataPreserved).toBe(true)
    })

    it('disconnecting a POD connection destroys the stored API key', async () => {
      const canary = 'sk-live-canary-pod-key-1234567890'
      mockPod.push({
        id: 'pod-1',
        site: 'site-1',
        providerKey: 'pod-emulator',
        label: 'Emulator POD',
        status: 'active',
        encryptedApiKey: encryptPodCredential(canary),
        encryptedWebhookSecret: encryptPodCredential('whsec-canary-value'),
      })

      const res = await post({
        action: 'disconnect-provider',
        connectionId: 'pod-1',
        collection: 'pod-connections',
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.credentialsPurged).toBe(true)
      expect(mockPod[0].status).toBe('disabled')
      // The real key is gone: the field now holds a tombstone envelope.
      expect(mockPod[0].encryptedApiKey).not.toContain(canary)
      expect(decryptPodCredential(mockPod[0].encryptedApiKey)).not.toBe(canary)
      expect(mockPod[0].encryptedWebhookSecret).toBeNull()
    })

    it('rotates AI credential envelopes onto the active keyring key', async () => {
      process.env.AI_CREDENTIAL_KEYRING_JSON = JSON.stringify({ v2: KEY_V2 })
      process.env.AI_CREDENTIAL_ACTIVE_KEY_ID = 'v2'
      mockAiCredentials.push({
        id: 'cred-old',
        connection: 'ai-old',
        // Envelope written earlier, when v1 was the only (active) key.
        envelope: new EncryptedCredentialBoundary({
          activeKeyId: 'v1',
          keys: { v1: KEY_V1 },
        }).encrypt({ apiKey: 'sk-canary-rotate-me' }),
      })
      expect((mockAiCredentials[0].envelope as any).keyId).toBe('v1')

      const res = await post({ action: 'rotate-credential-keys' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.rotated).toBe(1)
      expect(body.failed).toBe(0)
      expect(body.activeKeyId).toBe('v2')
      expect((mockAiCredentials[0].envelope as any).keyId).toBe('v2')
      // The secret survives rotation unchanged and never appears in the response.
      expect(credentialCipher().decrypt(mockAiCredentials[0].envelope).apiKey).toBe(
        'sk-canary-rotate-me',
      )
      expect(JSON.stringify(body)).not.toContain('sk-canary-rotate-me')
      expect(mockAuditEvents.some((e) => e.action === 'credential_keys.rotated')).toBe(true)

      // Rotation is idempotent once every envelope is on the active key.
      const again = await post({ action: 'rotate-credential-keys' })
      const againBody = await again.json()
      expect(againBody.rotated).toBe(0)
      expect(againBody.alreadyCurrent).toBe(1)
    })

    it('refuses credential key rotation for non-global operators', async () => {
      mockPayload.auth.mockResolvedValueOnce({
        user: { id: 'admin-2', role: 'administrator', authorizedSiteIds: ['site-1'] },
      })
      const res = await post({ action: 'rotate-credential-keys' })
      expect(res.status).toBe(403)
    })
  })
})
