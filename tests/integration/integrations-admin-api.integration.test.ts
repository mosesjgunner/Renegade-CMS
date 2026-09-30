/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GET, POST } from '../../src/app/(frontend)/api/admin/integrations/route'

// Mock Payload store
const mockClients: any[] = []
const mockSubscriptions: any[] = []
const mockDeliveries: any[] = []
const mockMerchants: any[] = []
const mockSocials: any[] = []
const mockPod: any[] = []
const mockAi: any[] = []
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
    const idx = pool.findIndex((item) => String(item.id) === String(args.id))
    if (idx >= 0) {
      pool[idx] = { ...pool[idx], ...args.data }
      return pool[idx]
    }
    return { id: args.id, ...args.data }
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
    mockAuditEvents.length = 0

    mockPayload.auth.mockResolvedValue({
      user: { id: 'admin-1', role: 'administrator' },
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
    expect(merchantConn.healthState).toBe('healthy')
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

  it('reconciles provider in safe dry-run mode and updates health without making external transactions', async () => {
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
    expect(body.reconciliation.healthState).toBe('healthy')
    expect(body.reconciliation.lastHealthCheckAt).toBeDefined()
    expect(body.reconciliation.nextSafeRepairAction).toContain('Healthy')

    expect(mockAuditEvents.some((e) => e.action === 'connection.reconciled')).toBe(true)
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
})
