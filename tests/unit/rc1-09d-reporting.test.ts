import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  payload: { auth: vi.fn(), count: vi.fn(), find: vi.fn(), collections: { contacts: {} } },
  grant: vi.fn(),
  query: vi.fn(),
  sameOrigin: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => mock.payload }))
vi.mock('../../src/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: mock.grant,
}))
vi.mock('../../src/modules/public/site-scope', () => ({
  publicSiteForHost: async () => 'alpha',
  samePublicOrigin: mock.sameOrigin,
}))
vi.mock('../../src/modules/community/comment-composer', () => ({ executeDbQuery: mock.query }))
import { GET, POST } from '../../src/app/(frontend)/api/admin/audience/crm/route'

describe('CRM reporting trust boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.payload.auth.mockResolvedValue({ user: { id: 'operator', role: 'staff' } })
    mock.grant.mockResolvedValue({
      authorized: true,
      isGlobalOwner: false,
      authorizedSiteIds: ['alpha'],
    })
    mock.payload.count.mockResolvedValue({ totalDocs: 7 })
    mock.query.mockResolvedValue([{ status: 'accepted', count: 120 }])
    mock.payload.find.mockResolvedValue({
      docs: [],
      totalDocs: 0,
      page: 1,
      totalPages: 1,
      limit: 50,
    })
    mock.sameOrigin.mockResolvedValue(true)
  })
  it('denies a foreign export before querying any metrics', async () => {
    const response = await GET(new Request('https://alpha.test/api?siteId=beta&action=export'))
    expect(response.status).toBe(403)
    expect(mock.query).not.toHaveBeenCalled()
    expect(mock.payload.count).not.toHaveBeenCalled()
  })
  it('exports complete canonical counts through the persisted message site', async () => {
    const response = await GET(
      new Request('https://alpha.test/api?siteId=alpha&action=export&format=csv'),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('email,120,')
    const [, sql, parameters] = mock.query.mock.calls[0]
    expect(sql).toContain('JOIN email_messages m ON m.id=d.message_id WHERE m.site_id=$1')
    expect(sql).not.toContain('LIMIT')
    expect(parameters).toEqual(['alpha'])
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('uses bounded finite pagination and database case-insensitive matching', async () => {
    await GET(new Request('https://alpha.test/api?siteId=alpha&page=NaN&limit=NaN&query=jAnE'))
    expect(mock.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 50,
        where: {
          and: [
            { site: { equals: 'alpha' } },
            {
              or: [
                { displayName: { like: 'jAnE' } },
                { email: { like: 'jAnE' } },
                { phoneE164: { like: 'jAnE' } },
              ],
            },
          ],
        },
      }),
    )
  })
  it('returns a safe unavailable response rather than a successful empty directory on storage failure', async () => {
    mock.payload.find.mockRejectedValue(new Error('private database details'))
    const response = await GET(new Request('https://alpha.test/api?siteId=alpha'))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database details')
  })
  it('rejects malformed IDs before a database read', async () => {
    const response = await GET(new Request('https://alpha.test/api?siteId=alpha&contactId=invalid'))
    expect(response.status).toBe(400)
    expect(mock.payload.find).not.toHaveBeenCalled()
  })
  it('denies cross-origin writes before mutation', async () => {
    mock.sameOrigin.mockResolvedValue(false)
    const response = await POST(
      new Request('https://alpha.test/api?siteId=alpha', { method: 'POST', body: '{}' }),
    )
    expect(response.status).toBe(403)
    expect(mock.payload.find).not.toHaveBeenCalled()
  })
})
