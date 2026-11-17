import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: { id: 'staff-a', role: 'staff' } as { id: string; role: string } | null,
  sites: [{ id: 'site-a' }] as Array<{ id: string }>,
  allowed: ['site-a'],
  find: vi.fn(),
  collections: { 'quality-scans': {} } as Record<string, unknown>,
  settings: vi.fn(),
  documents: vi.fn(),
  audit: vi.fn(),
  persist: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: async () => ({ user: mocks.user }),
    find: mocks.find,
    collections: mocks.collections,
  }),
}))
vi.mock('@/modules/operations/operator-grants', () => ({
  checkOperatorSiteAccess: async (_payload: unknown, _user: unknown, site: string) =>
    mocks.allowed.includes(site),
}))
vi.mock('@/modules/core/site-settings', () => ({ resolveSiteSettings: mocks.settings }))
vi.mock('@/modules/public/discovery', () => ({
  getAllIndexableDiscoveryDocuments: mocks.documents,
}))
vi.mock('@/modules/public/discovery-audit', () => ({ runRenderedAudit: mocks.audit }))
vi.mock('@/modules/public/discovery-cross-checks', () => ({
  crossCheckDiscoveryOutputs: () => ({ issues: [] }),
}))
vi.mock('@/modules/public/cannibalization', () => ({
  analyzeCannibalization: () => ({ issues: [] }),
}))
vi.mock('@/modules/public/ai-boundary-suggestions', () => ({
  generateSeoAiSuggestions: () => ({ suggestions: [] }),
}))
vi.mock('@/modules/public/discovery-lifecycle', () => ({
  persistRenderedAuditLifecycle: mocks.persist,
}))

import { POST } from '@/app/(frontend)/api/admin/discovery/audit/route'

const request = (body: object = {}) =>
  new Request('https://alpha.example.test/api/admin/discovery/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('rendered quality audit tenant authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { id: 'staff-a', role: 'staff' }
    mocks.sites = [{ id: 'site-a' }]
    mocks.allowed = ['site-a']
    mocks.collections = { 'quality-scans': {} }
    mocks.find.mockImplementation(async () => ({ docs: mocks.sites }))
    mocks.settings.mockResolvedValue({
      canonicalOrigin: 'https://alpha.example.test',
      canonicalOriginsBySite: { 'site-a': 'https://alpha.example.test' },
    })
    mocks.documents.mockResolvedValue([])
    mocks.audit.mockResolvedValue({ pages: [], issues: [] })
    mocks.persist.mockResolvedValue({ scanId: 'scan-a' })
  })

  it.each(['staff', 'administrator', 'owner'])(
    'denies a scoped %s foreign audit before any read, fetch or findings write',
    async (role) => {
      mocks.user!.role = role
      expect((await POST(request({ siteId: 'site-b' }))).status).toBe(403)
      expect(mocks.settings).not.toHaveBeenCalled()
      expect(mocks.documents).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
      expect(mocks.persist).not.toHaveBeenCalled()
    },
  )

  it('chooses the default site through access-controlled enumeration', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'sites', overrideAccess: false, user: mocks.user }),
    )
    // The lifecycle now takes a fourth scope argument; the mocked audit
    // returns no scope, so the route passes undefined (no re-examination
    // evidence) rather than letting findings resolve implicitly.
    expect(mocks.persist).toHaveBeenCalledWith(expect.anything(), 'site-a', [], undefined)
  })

  it('denies an actor whose persisted site grant has been revoked', async () => {
    mocks.allowed = []
    expect((await POST(request({ siteId: 'site-a' }))).status).toBe(403)
    expect(mocks.persist).not.toHaveBeenCalled()
  })

  it('refuses an absent default rather than creating synthetic-site findings', async () => {
    mocks.sites = []
    expect((await POST(request())).status).toBe(403)
    expect(mocks.persist).not.toHaveBeenCalled()
  })

  it('allows an explicitly authorized second site and persists its findings', async () => {
    mocks.allowed.push('site-b')
    expect((await POST(request({ siteId: 'site-b' }))).status).toBe(200)
    expect(mocks.documents).toHaveBeenCalledWith(expect.anything(), 'site-b')
    expect(mocks.persist).toHaveBeenCalledWith(expect.anything(), 'site-b', [], undefined)
  })

  it('rejects anonymous callers before site enumeration', async () => {
    mocks.user = null
    expect((await POST(request({ siteId: 'site-a' }))).status).toBe(403)
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.persist).not.toHaveBeenCalled()
  })

  it('refuses cleanly with 503 when the quality module is not enabled (RC2-DEBT-07)', async () => {
    mocks.collections = {}
    const response = await POST(request({ siteId: 'site-a' }))
    expect(response.status).toBe(503)
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.documents).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.persist).not.toHaveBeenCalled()
  })
})
