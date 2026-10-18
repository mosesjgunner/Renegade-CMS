import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/(frontend)/api/admin/active-site/route'

vi.mock('@payload-config', () => ({
  default: Promise.resolve({}),
}))

let mockUser: { id: string; role: string; email?: string; isGlobalOwner?: boolean } | null = {
  id: 'usr-owner-1',
  role: 'owner',
  email: 'owner@renegadeparty.org',
  isGlobalOwner: true,
}

const mockSites = [
  { id: 'site-1', name: 'Site One', slug: 'site-one', lifecycle: 'active' },
  { id: 'site-2', name: 'Site Two', slug: 'site-two', lifecycle: 'active' },
]

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    auth: vi.fn(async () => ({ user: mockUser })),
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'sites') return { docs: mockSites }
      if (collection === 'member-site-roles')
        return { docs: [{ site: 'site-1', role: 'administrator' }] }
      return { docs: [] }
    }),
  })),
}))

describe('Active Site Route API (/api/admin/active-site)', () => {
  beforeEach(() => {
    mockUser = {
      id: 'usr-owner-1',
      role: 'owner',
      email: 'owner@renegadeparty.org',
      isGlobalOwner: true,
    }
  })

  it('rejects unauthenticated GET requests with 401', async () => {
    mockUser = null
    const req = new Request('http://localhost:3000/api/admin/active-site')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('rejects non-operator roles with 401', async () => {
    mockUser = { id: 'usr-member-1', role: 'member', email: 'member@test.com' }
    const req = new Request('http://localhost:3000/api/admin/active-site')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns default first site when cookie is absent for owner', async () => {
    const req = new Request('http://localhost:3000/api/admin/active-site')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.activeSiteId).toBe('site-1')
    expect(json.sites).toHaveLength(2)
  })

  it('honors renegade-active-site cookie when present and authorized', async () => {
    const req = new Request('http://localhost:3000/api/admin/active-site', {
      headers: {
        cookie: 'renegade-active-site=site-2',
      },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.activeSiteId).toBe('site-2')
  })

  it('sets renegade-active-site cookie upon valid POST switch', async () => {
    const req = new Request('http://localhost:3000/api/admin/active-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: 'site-2' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.activeSiteId).toBe('site-2')
    const cookie = res.headers.get('Set-Cookie')
    expect(cookie).toContain('renegade-active-site=site-2')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('rejects POST with missing siteId with 400', async () => {
    const req = new Request('http://localhost:3000/api/admin/active-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('denies POST switch for unauthorized site when user has restricted grant', async () => {
    mockUser = {
      id: 'usr-admin-restricted',
      role: 'administrator',
      email: 'admin@site1.org',
      isGlobalOwner: false,
    }
    const req = new Request('http://localhost:3000/api/admin/active-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: 'site-2' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})
