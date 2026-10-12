import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  access: vi.fn(),
  grant: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: async () => ({ user: { id: 'staff', role: 'staff' } }),
    find: mocks.find,
    update: mocks.update,
    findByID: async () => ({ id: 'supporter', site: 'foreign', visibilityPreference: 'private' }),
  }),
}))
vi.mock('../../src/modules/operations/operator-grants', () => ({
  checkOperatorSiteAccess: mocks.access,
  resolveOperatorGrantContext: mocks.grant,
}))
import { GET, PATCH } from '../../src/app/(frontend)/api/admin/commerce/donations/route'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.grant.mockResolvedValue({
    authorized: true,
    isGlobalOwner: false,
    authorizedSiteIds: ['allowed'],
  })
  mocks.find.mockResolvedValue({ docs: [] })
  mocks.access.mockResolvedValue(false)
})
it('scopes campaign and donation reads and reads only matching financial events', async () => {
  expect((await GET(new Request('http://localhost/api/admin/commerce/donations'))).status).toBe(200)
  expect(mocks.find.mock.calls.map(([input]) => [input.collection, input.where])).toEqual([
    ['donations', { site: { in: ['allowed'] } }],
    ['donation-campaigns', { site: { in: ['allowed'] } }],
    ['donation-events', { donation: { in: [] } }],
  ])
})
it('denies a foreign dashboard before reading records', async () => {
  expect(
    (await GET(new Request('http://localhost/api/admin/commerce/donations?siteId=foreign'))).status,
  ).toBe(403)
  expect(mocks.find).not.toHaveBeenCalled()
})
it.each(['privacy', 'mask-retention'])(
  'denies foreign supporter %s without mutation',
  async (action) => {
    const response = await PATCH(
      new Request('http://localhost/api/admin/commerce/donations', {
        method: 'PATCH',
        body: JSON.stringify({ action, supporterId: 'supporter', visibilityPreference: 'public' }),
      }),
    )
    expect(response.status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  },
)
