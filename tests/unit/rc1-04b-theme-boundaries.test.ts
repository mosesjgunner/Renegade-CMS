import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  site: 'alpha',
  user: { id: 'owner', role: 'owner' },
  state: { revision: 4, draft: { id: 'neutral-starter', version: '1.0.0' }, previous: null },
  change: vi.fn(),
  createPattern: vi.fn(),
  findByID: vi.fn(async () => ({ site: 'beta', surface: 'pattern' })),
  query: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: async () => ({ user: mocks.user }),
    find: async ({ collection }: { collection: string }) => ({
      docs: collection === 'sites' ? [{ id: 'alpha' }] : [],
    }),
    findByID: mocks.findByID,
  }),
}))
vi.mock('@/modules/public/site-scope', () => ({
  publicSiteForHost: async () => mocks.site,
  samePublicOrigin: async () => true,
}))
vi.mock('@/modules/operations/redirect-site', () => ({
  resolveRedirectSite: async (_p: unknown, _u: unknown, req: Request, site?: string) =>
    (site ?? new URL(req.url).searchParams.get('siteId')) === 'alpha' ? 'alpha' : null,
}))
vi.mock('@/modules/presentation/lifecycle', () => ({
  themePool: () => ({ query: mocks.query }),
  readThemeState: async () => mocks.state,
  createThemePreview: async () => 'preview',
  changeTheme: mocks.change,
}))
vi.mock('@/modules/presentation/composition', () => ({
  createPattern: mocks.createPattern,
  instantiatePattern: vi.fn(),
  listPatterns: vi.fn(),
  createPageFromTemplate: vi.fn(),
  createTemplate: vi.fn(),
  duplicateTemplate: vi.fn(),
  getPagesUsingTemplate: vi.fn(),
  reactivateTemplate: vi.fn(),
  retireTemplate: vi.fn(),
  syncPageWithTemplate: vi.fn(),
}))
import { GET as themesGET, POST as themesPOST } from '@/app/(frontend)/api/admin/themes/route'
import {
  GET as patternsGET,
  POST as patternsPOST,
} from '@/app/(frontend)/api/layouts/patterns/route'
import {
  GET as templatesGET,
  POST as templatesPOST,
} from '@/app/(frontend)/api/layouts/templates/route'
import { GET as overviewGET } from '@/app/(frontend)/api/layouts/overview/route'

const post = (body: unknown) =>
  new Request('https://alpha.test/api', {
    method: 'POST',
    headers: { host: 'alpha.test', origin: 'https://alpha.test' },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.site = 'alpha'
  vi.unstubAllGlobals()
})
describe('04B theme and composition boundaries', () => {
  it('rejects explicit unavailable theme site instead of silently choosing another', async () => {
    expect((await themesGET(new Request('https://alpha.test/api?site=beta'))).status).toBe(403)
  })
  it('refuses activation when the selected site does not own the request host', async () => {
    mocks.site = 'beta'
    const res = await themesPOST(post({ site: 'alpha', revision: 4, action: 'activate' }))
    expect(res.status).toBe(400)
    expect(mocks.change).not.toHaveBeenCalled()
  })
  it.each([500, 200])(
    'failed render preflight (%s) leaves active state untouched and removes probe',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('unrelated output', { status })),
      )
      const res = await themesPOST(post({ site: 'alpha', revision: 4, action: 'activate' }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('Render preflight failed')
      expect(mocks.change).not.toHaveBeenCalled()
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM presentation_theme_previews'),
        ['alpha', 'owner'],
      )
    },
  )
  it.each([patternsGET, templatesGET, overviewGET])(
    'denies foreign-site discovery before reading composition',
    async (get) => {
      expect((await get(new Request('https://alpha.test/api?siteId=beta'))).status).toBe(403)
    },
  )
  it.each([patternsPOST, templatesPOST])('denies foreign-site reusable creation', async (route) => {
    expect((await route(post({ action: 'create', siteId: 'beta' }))).status).toBe(403)
    expect(mocks.createPattern).not.toHaveBeenCalled()
  })
  it('rejects a substituted foreign pattern ID even with an authorized site hint', async () => {
    expect(
      (
        await patternsPOST(
          post({ action: 'instantiate', siteId: 'alpha', patternId: 'foreign', mode: 'snapshot' }),
        )
      ).status,
    ).toBe(403)
    expect(mocks.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, user: mocks.user }),
    )
  })
  it('rejects a substituted foreign template ID on inspection', async () => {
    expect(
      (await templatesGET(new Request('https://alpha.test/api?siteId=alpha&templateId=foreign')))
        .status,
    ).toBe(403)
  })
})
