import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as exportRules } from '@/app/(frontend)/api/admin/redirects/export/route'
import { POST as importRules } from '@/app/(frontend)/api/admin/redirects/import/route'
import { resolveRedirectSite } from '@/modules/operations/redirect-site'

const mocks = vi.hoisted(() => ({
  user: { id: 'staff', role: 'staff' } as { id: string; role: string } | null,
  grant: { authorized: true, isGlobalOwner: false, authorizedSiteIds: ['alpha', 'beta'] },
  list: vi.fn(),
  import: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: async () => ({ auth: async () => ({ user: mocks.user }) }),
}))
vi.mock('@/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: async () => mocks.grant,
}))
vi.mock('@/modules/public/redirect-manager', async (original) => ({
  ...(await original<typeof import('@/modules/public/redirect-manager')>()),
  listRedirectRules: mocks.list,
  importRedirectRules: mocks.import,
}))
const request = (suffix = '', cookie = 'renegade-active-site=beta') =>
  new Request(`http://localhost/api/admin/redirects${suffix}`, {
    headers: { cookie },
  })

describe('Redirect workspace site and outcome boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { id: 'staff', role: 'staff' }
    mocks.grant = { authorized: true, isGlobalOwner: false, authorizedSiteIds: ['alpha', 'beta'] }
    mocks.list.mockResolvedValue([])
    mocks.import.mockResolvedValue({ created: 1, updated: 0, skipped: 0, errors: [], rules: [{}] })
  })

  it('exports only the selected site, including for a global owner', async () => {
    mocks.grant.isGlobalOwner = true
    expect((await exportRules(request('/export?format=json'))).status).toBe(200)
    expect(mocks.list).toHaveBeenCalledWith(expect.anything(), 'beta')
  })

  it.each(['foreign', '%E0%A4%A'])(
    'rejects foreign or malformed active site %s without reading rows',
    async (site) => {
      expect((await exportRules(request('/export', `renegade-active-site=${site}`))).status).toBe(
        403,
      )
      expect(mocks.list).not.toHaveBeenCalled()
    },
  )

  it('rejects a foreign explicit export site', async () => {
    expect((await exportRules(request('/export?siteId=foreign'))).status).toBe(403)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it.each([null, { id: 'member', role: 'member' }])(
    'denies unauthenticated and member exports',
    async (user) => {
      mocks.user = user
      expect((await exportRules(request('/export'))).status).toBe(403)
      expect(mocks.list).not.toHaveBeenCalled()
    },
  )

  it('imports into the active site and reports parse failures as partial', async () => {
    const response = await importRules(
      new Request('http://localhost/api/admin/redirects/import', {
        method: 'POST',
        headers: { cookie: 'renegade-active-site=beta', 'content-type': 'application/json' },
        body: JSON.stringify([
          { fromPath: '/old', toPath: '/new' },
          { fromPath: '/loop', toPath: '/loop' },
        ]),
      }),
    )
    expect(mocks.import).toHaveBeenCalledWith(expect.anything(), 'beta', [
      expect.objectContaining({ fromPath: '/old' }),
    ])
    expect(await response.json()).toMatchObject({
      success: false,
      partial: true,
      created: 1,
      skipped: 1,
      errors: [expect.stringContaining('own source')],
    })
  })

  it('reports total service failure without success', async () => {
    mocks.import.mockResolvedValue({
      created: 0,
      updated: 0,
      skipped: 1,
      errors: ['Database unavailable'],
      rules: [],
    })
    const response = await importRules(
      new Request('http://localhost/api/admin/redirects/import', {
        method: 'POST',
        headers: { cookie: 'renegade-active-site=beta', 'content-type': 'text/csv' },
        body: '/old,/new',
      }),
    )
    expect(await response.json()).toMatchObject({
      success: false,
      partial: false,
      errors: ['Database unavailable'],
    })
  })

  it('fails closed on revoked grants and missing sites', async () => {
    mocks.grant.authorized = false
    expect(await resolveRedirectSite({} as never, mocks.user, request())).toBeNull()
    mocks.grant.authorized = true
    mocks.grant.authorizedSiteIds = []
    expect(await resolveRedirectSite({} as never, mocks.user, request('', ''))).toBeNull()
  })
})
