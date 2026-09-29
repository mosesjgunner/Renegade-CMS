import { beforeEach, describe, expect, it, vi } from 'vitest'

// 1. Mock payload
const authMock = vi.fn()
const findMock = vi.fn()
const findByIDMock = vi.fn()
const countMock = vi.fn()

const mockPayload = {
  auth: authMock,
  find: findMock,
  findByID: findByIDMock,
  count: countMock,
}

vi.mock('payload', () => ({
  getPayload: async () => mockPayload,
}))

vi.mock('@payload-config', () => ({
  default: {},
}))

// 2. Mock next/navigation
const redirectMock = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT: ${url}`)
  ;(err as unknown as Record<string, unknown>).digest = `NEXT_REDIRECT;replace;${url};307;`
  throw err
})

const notFoundMock = vi.fn(() => {
  const err = new Error('NEXT_NOT_FOUND')
  ;(err as unknown as Record<string, unknown>).digest = 'NEXT_NOT_FOUND'
  throw err
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => notFoundMock(),
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// 3. Mock headers from next/headers
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}))

// 4. Mock heavy client components / studios to prevent DOM rendering issues in node environment
vi.mock('@/modules/admin/CommerceOperations', () => ({
  CommerceOperations: () => null,
}))
vi.mock('@/modules/admin/ProductCatalogStudio', () => ({
  ProductCatalogStudio: () => null,
}))
vi.mock('@/modules/admin/FulfillmentCenter', () => ({
  FulfillmentCenter: () => null,
}))
vi.mock('@/modules/admin/ConnectionsCenter', () => ({
  ConnectionsCenter: () => null,
}))
vi.mock('@/modules/admin/WorkflowCenter', () => ({
  WorkflowCenter: () => null,
}))
vi.mock('@/modules/admin/ReleasesCenter', () => ({
  ReleasesCenter: () => null,
}))
vi.mock('@/modules/admin/SocialDistributionCenter', () => ({
  SocialDistributionCenter: () => null,
}))
vi.mock('@/modules/admin/AIStudioCenter', () => ({
  AIStudioCenter: () => null,
}))
vi.mock('@/modules/admin/AudienceCenter', () => ({
  AudienceCenter: () => null,
}))
vi.mock('@/modules/admin/TelemetryConsole', () => ({
  TelemetryConsole: () => null,
}))
vi.mock('@/modules/admin/ContentIntelligenceWorkflows', () => ({
  default: () => null,
  ContentIntelligenceWorkflows: () => null,
}))
vi.mock('@/modules/presentation/PuckEditor', () => ({
  PuckEditor: () => null,
}))

// Imports for testing
import { ADMIN_SECTIONS } from '../../src/modules/admin/PublishingLinks'
import AdminLayout from '../../src/app/(frontend)/admin/layout'
import ConnectionsPage from '../../src/app/(frontend)/connections/page'
import TelemetryPage from '../../src/app/(frontend)/admin/telemetry/page'
import CommercePage from '../../src/app/(frontend)/admin/commerce/page'
import CatalogPage from '../../src/app/(frontend)/admin/catalog/page'
import FulfillmentPage from '../../src/app/(frontend)/admin/fulfillment/page'
import WorkflowPage from '../../src/app/(frontend)/admin/workflow/page'
import ReleasesPage from '../../src/app/(frontend)/admin/releases/page'
import SocialPage from '../../src/app/(frontend)/admin/social/page'
import AIPage from '../../src/app/(frontend)/admin/ai/page'
import AudiencePage from '../../src/app/(frontend)/admin/audience/page'
import IntelligencePage from '../../src/app/(frontend)/admin/intelligence/page'
import ProvidersPage from '../../src/app/(frontend)/admin/providers/page'
import AdminMigrationPage from '../../src/app/(frontend)/admin/migration/page'
import BuilderPage from '../../src/app/(frontend)/builder/page'
import BuilderIdPage from '../../src/app/(frontend)/builder/[id]/page'
import { Categories } from '../../src/collections/Publishing'
import {
  ADMIN_NAV_COLLECTIONS,
  applyCoreGlobalGroups,
  applyProgressiveDisclosure,
} from '../../src/modules/admin/progressive-disclosure'

describe('ADMIN-00 Map Navigation & Surface Coherence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. 16-Section Navigation Structure', () => {
    const EXPECTED_SECTIONS = [
      'dashboard',
      'publishing',
      'media',
      'presentation',
      'discovery',
      'workflow',
      'distribution',
      'audience',
      'community',
      'commerce',
      'analytics',
      'users',
      'roles',
      'providers',
      'settings',
      'maintenance',
    ]

    it('implements all 16 ADMIN-00 map surfaces', () => {
      const sectionIds = ADMIN_SECTIONS.map((s) => s.id)
      for (const expectedId of EXPECTED_SECTIONS) {
        expect(sectionIds).toContain(expectedId)
      }
      expect(ADMIN_SECTIONS.length).toBe(16)
    })

    it('ensures every section has a valid title and non-empty items array', () => {
      for (const section of ADMIN_SECTIONS) {
        expect(section.title).toBeTruthy()
        expect(section.items.length).toBeGreaterThan(0)
        for (const item of section.items) {
          expect(item.label).toBeTruthy()
          expect(item.href).toBeTruthy()
          expect(item.href.startsWith('/')).toBe(true)
        }
      }
    })

    it('contains no duplicate links within any single section', () => {
      for (const section of ADMIN_SECTIONS) {
        const hrefs = section.items.map((i) => i.href)
        const uniqueHrefs = new Set(hrefs)
        expect(uniqueHrefs.size).toBe(hrefs.length)
      }
    })

    it('contains no duplicate destinations across the grouped menu', () => {
      const hrefs = ADMIN_SECTIONS.flatMap((section) => section.items.map((item) => item.href))
      expect(new Set(hrefs).size).toBe(hrefs.length)
    })

    it('hides native Payload entries represented by the grouped menu while preserving routes', () => {
      const collections = [...ADMIN_NAV_COLLECTIONS].map((slug) => ({ slug, admin: {} }))
      const normalized = applyProgressiveDisclosure(collections as never)
      expect(normalized.every((collection) => collection.admin?.hidden === true)).toBe(true)
      const globals = applyCoreGlobalGroups([
        { slug: 'site-settings', admin: { group: 'Settings' } },
      ] as never)
      expect(globals[0]?.admin?.hidden).toBe(true)
    })

    it('links key operational consoles without dead ends', () => {
      const allHrefs = ADMIN_SECTIONS.flatMap((s) => s.items.map((i) => i.href))
      expect(allHrefs).toContain('/admin')
      expect(allHrefs).toContain('/admin/workflow')
      expect(allHrefs).toContain('/admin/commerce')
      expect(allHrefs).toContain('/admin/catalog')
      expect(allHrefs).toContain('/admin/fulfillment')
      expect(allHrefs).toContain('/admin/providers')
      expect(allHrefs).toContain('/admin/social')
      expect(allHrefs).toContain('/admin/audience')
      expect(allHrefs).toContain('/admin/telemetry')
      expect(allHrefs).toContain('/admin/security')
    })
  })

  describe('2. Admin Shell Layout Authorization', () => {
    it('redirects unauthenticated users to /admin/login', async () => {
      authMock.mockResolvedValue({ user: null })
      await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT: /admin/login')
      expect(redirectMock).toHaveBeenCalledWith('/admin/login')
    })

    it('redirects unauthorized roles (e.g. member) to /admin/login', async () => {
      authMock.mockResolvedValue({ user: { id: 'mem-1', role: 'member' } })
      await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT: /admin/login')
      expect(redirectMock).toHaveBeenCalledWith('/admin/login')
    })

    it('allows staff, administrators, and owners', async () => {
      for (const role of ['staff', 'administrator', 'owner']) {
        authMock.mockResolvedValue({ user: { id: 'u-1', email: 'op@example.com', role } })
        findMock.mockResolvedValue({ docs: [] })
        const res = await AdminLayout({ children: 'Content' })
        expect(res).toBeDefined()
      }
    })

    it.each(['editor', 'publisher', 'moderator', 'commerce', 'member'])(
      'denies unsupported staff persona %s at the admin shell',
      async (role) => {
        authMock.mockResolvedValue({ user: { id: 'u-special', email: 'op@example.com', role } })
        await expect(AdminLayout({ children: 'Content' })).rejects.toThrow(
          'NEXT_REDIRECT: /admin/login',
        )
      },
    )
  })

  describe('3. Server Route Security & Defense-in-Depth', () => {
    describe('/connections & /admin/providers', () => {
      it('rejects unauthenticated requests by redirecting to /admin/login', async () => {
        authMock.mockResolvedValue({ user: null })
        await expect(ConnectionsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
          'NEXT_REDIRECT: /admin/login',
        )
        expect(redirectMock).toHaveBeenCalledWith('/admin/login')
      })

      it('allows authenticated operators to access provider connections', async () => {
        authMock.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
        findMock.mockResolvedValue({ docs: [] })
        const result = await ConnectionsPage({ searchParams: Promise.resolve({}) })
        expect(result).toBeDefined()
      })

      it('/admin/providers forwards to connections page with same authorization', async () => {
        authMock.mockResolvedValue({ user: null })
        await expect(ProvidersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
          'NEXT_REDIRECT: /admin/login',
        )
      })
    })

    describe('/admin/telemetry (Owner Only)', () => {
      it('redirects unauthorized requests to the safe admin landing page', async () => {
        authMock.mockResolvedValue({ user: null })
        await expect(TelemetryPage()).rejects.toThrow('NEXT_REDIRECT: /admin')
        expect(redirectMock).toHaveBeenCalledWith('/admin')
      })

      it('redirects non-owner roles (staff/administrator) to the safe admin landing page', async () => {
        authMock.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
        await expect(TelemetryPage()).rejects.toThrow('NEXT_REDIRECT: /admin')
        expect(redirectMock).toHaveBeenCalledWith('/admin')
      })

      it('allows owner to access system telemetry', async () => {
        authMock.mockResolvedValue({ user: { id: 'owner-1', role: 'owner' } })
        const result = await TelemetryPage()
        expect(result).toBeDefined()
        expect(redirectMock).not.toHaveBeenCalled()
      })
    })

    describe('/admin/migration (Owner or Administrator)', () => {
      it('redirects staff migration access to the safe admin landing page', async () => {
        authMock.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
        await expect(AdminMigrationPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
          'NEXT_REDIRECT: /admin',
        )
        expect(redirectMock).toHaveBeenCalledWith('/admin')
      })

      it('allows administrator migration access', async () => {
        authMock.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
        await expect(
          AdminMigrationPage({ searchParams: Promise.resolve({}) }),
        ).resolves.toBeDefined()
      })
    })

    describe('Operator Surfaces Authenticated Access', () => {
      const withSite =
        (page: (props?: { searchParams?: Promise<{ siteId?: string }> }) => Promise<unknown>) =>
        () =>
          page({ searchParams: Promise.resolve({ siteId: 'site-1' }) })
      const surfaces: Array<{ name: string; page: () => Promise<unknown> }> = [
        { name: '/admin/commerce', page: withSite(CommercePage) },
        { name: '/admin/catalog', page: CatalogPage },
        { name: '/admin/fulfillment', page: withSite(FulfillmentPage) },
        { name: '/admin/workflow', page: WorkflowPage },
        { name: '/admin/releases', page: ReleasesPage },
        { name: '/admin/social', page: withSite(SocialPage) },
        { name: '/admin/ai', page: AIPage },
        { name: '/admin/audience', page: withSite(AudiencePage) },
        { name: '/admin/intelligence', page: withSite(IntelligencePage) },
      ]

      for (const { name, page } of surfaces) {
        it(`${name} rejects anonymous callers with notFound`, async () => {
          authMock.mockResolvedValue({ user: null })
          await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
          expect(notFoundMock).toHaveBeenCalled()
        })

        it(`${name} permits authenticated staff/admin`, async () => {
          for (const role of ['staff', 'administrator', 'owner']) {
            authMock.mockResolvedValue({
              user: { id: 'staff-1', role, adminSites: [{ id: 'site-1' }] },
            })
            findMock.mockResolvedValue({ docs: [] })
            countMock.mockResolvedValue({ totalDocs: 0 })
            const result = await page()
            expect(result).toBeDefined()
          }
        })
      }

      it.each([
        ['/admin/commerce', CommercePage],
        ['/admin/fulfillment', FulfillmentPage],
        ['/admin/social', SocialPage],
        ['/admin/audience', AudiencePage],
        ['/admin/intelligence', IntelligencePage],
      ] as const)('%s denies staff without an assigned selected site', async (_name, page) => {
        authMock.mockResolvedValue({
          user: { id: 'staff-1', role: 'staff', adminSites: [{ id: 'site-1' }] },
        })
        await expect(
          page({ searchParams: Promise.resolve({ siteId: 'other-site' }) }),
        ).rejects.toThrow('NEXT_NOT_FOUND')
      })

      it.each(['commerce', 'moderator', 'editor'])(
        'denies unsupported role %s from protected commerce/workflow routes',
        async (role) => {
          authMock.mockResolvedValue({ user: { id: 'limited-1', role } })
          await expect(CommercePage()).rejects.toThrow('NEXT_NOT_FOUND')
          authMock.mockResolvedValue({ user: { id: 'limited-1', role } })
          await expect(WorkflowPage()).rejects.toThrow('NEXT_NOT_FOUND')
        },
      )
    })

    describe('Visual Builder Routes', () => {
      it('/builder/[id] redirects anonymous users to /admin/login', async () => {
        authMock.mockResolvedValue({ user: null })
        await expect(
          BuilderIdPage({ params: Promise.resolve({ id: 'layout-1' }) }),
        ).rejects.toThrow('NEXT_REDIRECT: /admin/login')
        expect(redirectMock).toHaveBeenCalledWith('/admin/login')
      })

      it('/builder (index) redirects anonymous users to /admin/login', async () => {
        authMock.mockResolvedValue({ user: null })
        await expect(BuilderPage()).rejects.toThrow('NEXT_REDIRECT: /admin/login')
        expect(redirectMock).toHaveBeenCalledWith('/admin/login')
      })

      it('/builder redirects to /admin/collections/page-layouts when no layouts exist', async () => {
        authMock.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
        findMock.mockResolvedValue({ docs: [] })
        await expect(BuilderPage()).rejects.toThrow(
          'NEXT_REDIRECT: /admin/collections/page-layouts',
        )
        expect(redirectMock).toHaveBeenCalledWith('/admin/collections/page-layouts')
      })

      it('/builder redirects to /builder/[firstId] when a layout exists', async () => {
        authMock.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
        findMock.mockResolvedValue({ docs: [{ id: 'layout-abc' }] })
        await expect(BuilderPage()).rejects.toThrow('NEXT_REDIRECT: /builder/layout-abc')
        expect(redirectMock).toHaveBeenCalledWith('/builder/layout-abc')
      })
    })
  })

  describe('4. Hierarchy & Category Canonical Path Hook', () => {
    it('automatically generates canonicalPath from slug if missing', async () => {
      const beforeValidateHooks = Categories.hooks?.beforeValidate || []
      expect(beforeValidateHooks.length).toBeGreaterThan(0)

      const hook = beforeValidateHooks[0]
      const result = await (hook as any)({
        data: {
          name: 'Investigations',
          slug: 'investigations',
        },
        originalDoc: null,
        req: {
          payload: {
            find: vi.fn().mockResolvedValue({ docs: [] }),
            findByID: vi.fn(),
          },
        },
        context: {},
      })

      expect(result.canonicalPath).toBe('/topics/investigations')
    })
  })
})
