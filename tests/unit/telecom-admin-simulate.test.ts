import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GET, POST } from '../../src/app/(frontend)/api/admin/telecom/simulate/route'

const mockAuth = vi.fn()
const mockFind = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockGrant = vi.fn()
const mockPublicSiteForHost = vi.fn()
const mockSamePublicOrigin = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: mockAuth,
    find: mockFind,
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
    collections: {
      'telecom-deliveries': {},
      'consent-events': {},
      suppressions: {},
    },
  }),
}))

vi.mock('../../src/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: (...args: any[]) => mockGrant(...args),
}))

vi.mock('../../src/modules/public/site-scope', () => ({
  publicSiteForHost: (...args: any[]) => mockPublicSiteForHost(...args),
  samePublicOrigin: (...args: any[]) => mockSamePublicOrigin(...args),
}))

describe('AUD-06 Telecom Simulation & Inbound Operator Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSamePublicOrigin.mockResolvedValue(true)
  })

  it('denies unauthenticated requests to GET', async () => {
    mockAuth.mockResolvedValue({ user: null })
    mockGrant.mockResolvedValue({ authorized: false, authorizedSiteIds: [], isGlobalOwner: false })

    const req = new Request('http://localhost/api/admin/telecom/simulate?siteId=site-a')
    const res = await GET(req)
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toMatch(/unauthorized/i)
  })

  it('denies requests to a site not in operator grants', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
    mockGrant.mockResolvedValue({
      authorized: true,
      authorizedSiteIds: ['site-a'],
      isGlobalOwner: false,
    })

    const req = new Request('http://localhost/api/admin/telecom/simulate?siteId=site-b')
    const res = await GET(req)
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toMatch(/forbidden/i)
  })

  it('allows authorized staff to inspect telecom emulator readiness and health', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
    mockGrant.mockResolvedValue({
      authorized: true,
      authorizedSiteIds: ['site-a'],
      isGlobalOwner: false,
    })

    const req = new Request('http://localhost/api/admin/telecom/simulate?siteId=site-a')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.siteId).toBe('site-a')
    expect(data.health.status).toBe('healthy')
    expect(data.capabilities.channels).toContain('sms')
    expect(data.capabilities.channels).toContain('rcs')
  })

  it('processes inbound STOP opt-out simulation by creating consent-event, suppression, and cancelling sends', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
    mockGrant.mockResolvedValue({
      authorized: true,
      authorizedSiteIds: ['site-a'],
      isGlobalOwner: false,
    })

    mockCreate.mockResolvedValue({ id: 'created-id' })
    mockFind.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'suppressions') return { docs: [] }
      if (collection === 'telecom-deliveries') {
        return { docs: [{ id: 'deliv-queued-1', status: 'queued' }] }
      }
      return { docs: [] }
    })
    mockUpdate.mockResolvedValue({ id: 'deliv-queued-1', status: 'cancelled' })

    const req = new Request('http://localhost/api/admin/telecom/simulate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'simulate-inbound',
        siteId: 'site-a',
        from: '+14155550199',
        text: 'STOP',
        brandName: 'Renegade',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.processResult.action).toBe('opt-out')
    expect(data.processResult.suppressionRecorded).toBe(true)
    expect(data.processResult.deliveriesCancelled).toBe(1)
    expect(data.processResult.autoResponse).toContain('unsubscribed from Renegade')
  })

  it('evaluates quiet hours accurately and provides next send window', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
    mockGrant.mockResolvedValue({
      authorized: true,
      authorizedSiteIds: ['site-a'],
      isGlobalOwner: false,
    })

    // 11:30 PM (23:30) is inside default quiet hours (21:00 - 08:00)
    const req = new Request('http://localhost/api/admin/telecom/simulate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'check-quiet-hours',
        siteId: 'site-a',
        timestamp: '2026-10-09T23:30:00Z',
        recipientTimezone: 'UTC',
        policy: { startHour: 21, endHour: 8, siteTimezone: 'UTC' },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.quietResult.isQuiet).toBe(true)
    expect(data.nextWindow).toBeDefined()
  })

  it('isolates simulator receipts and inbound history across different sites', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'owner-1', role: 'owner' } })
    mockGrant.mockResolvedValue({
      authorized: true,
      authorizedSiteIds: ['site-a', 'site-b'],
      isGlobalOwner: true,
    })

    // Reset emulator for site-a and site-b
    const { resetTelecomEmulator, simulateInboundTelecomMessage } = await import(
      '../../src/modules/telecom/emulator'
    )
    resetTelecomEmulator()

    // Simulate inbound on site-a
    simulateInboundTelecomMessage({
      from: '+14155550100',
      to: '+18005550199',
      text: 'HELLO FROM SITE A',
      siteId: 'site-a',
    })

    // Request for site-b should not see site-a's inbound message
    const reqB = new Request('http://localhost/api/admin/telecom/simulate?siteId=site-b')
    const resB = await GET(reqB)
    expect(resB.status).toBe(200)
    const dataB = await resB.json()
    expect(dataB.inboundHistory).toHaveLength(0)

    // Request for site-a should see the message
    const reqA = new Request('http://localhost/api/admin/telecom/simulate?siteId=site-a')
    const resA = await GET(reqA)
    expect(resA.status).toBe(200)
    const dataA = await resA.json()
    expect(dataA.inboundHistory).toHaveLength(1)
    expect(dataA.inboundHistory[0].text).toBe('HELLO FROM SITE A')
  })
})
