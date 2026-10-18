import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  user: { id: 'owner', role: 'owner', email: 'owner@example.test' } as {
    id: string
    role: string
    email: string
  } | null,
  install: vi.fn(),
  upgrade: vi.fn(),
  rollback: vi.fn(),
  status: vi.fn(async () => ({ installed: false })),
  find: vi.fn(async () => ({ docs: [{ id: 'alpha', name: 'Alpha' }] })),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: async () => ({ user: mocks.user }),
    find: mocks.find,
    findByID: async () => ({ id: 'alpha' }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: async () => ({
    authorized: true,
    isGlobalOwner: false,
    authorizedSiteIds: ['alpha'],
  }),
}))
vi.mock('@/modules/starters/service', () => ({
  installStarter: mocks.install,
  upgradeStarter: mocks.upgrade,
  rollbackStarterLayout: mocks.rollback,
  getStarterStatus: mocks.status,
}))
vi.mock('@/modules/presentation/lifecycle', () => ({
  themePool: () => ({}),
  readThemeState: async () => null,
  createThemePreview: vi.fn(),
}))
import { GET, POST } from '@/app/(frontend)/api/admin/starters/route'
import { publicationCommunityStarter } from '@/modules/starters/definitions'
import { componentRegistry, validateLayout } from '@/modules/public/page-builder'
import { readFileSync, existsSync } from 'node:fs'
const post = (body: unknown, origin = 'https://alpha.test') =>
  new Request('https://alpha.test/api/admin/starters', {
    method: 'POST',
    headers: { host: 'alpha.test', origin },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user = { id: 'owner', role: 'owner', email: 'owner@example.test' }
})
describe('04C starter authorization', () => {
  it.each(['install', 'upgrade', 'rollback', 'preview'])(
    'denies foreign site %s before privileged services',
    async (action) => {
      expect(
        (
          await POST(
            post({
              action,
              siteId: 'beta',
              starterId: 'publication-community',
              path: '/',
              targetRevision: 1,
            }),
          )
        ).status,
      ).toBe(403)
      expect(mocks.install).not.toHaveBeenCalled()
      expect(mocks.upgrade).not.toHaveBeenCalled()
      expect(mocks.rollback).not.toHaveBeenCalled()
    },
  )
  it.each(['staff', 'administrator', 'member'])('denies %s mutation', async (role) => {
    mocks.user!.role = role
    expect(
      (await POST(post({ action: 'install', siteId: 'alpha', starterId: 'publication-community' })))
        .status,
    ).toBe(403)
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('denies anonymous discovery', async () => {
    mocks.user = null
    expect((await GET(new Request('https://alpha.test/api'))).status).toBe(403)
    expect(mocks.find).not.toHaveBeenCalled()
  })
  it('denies explicit foreign discovery', async () => {
    expect((await GET(new Request('https://alpha.test/api?site=beta'))).status).toBe(403)
    expect(mocks.status).not.toHaveBeenCalled()
  })
  it('denies cross-origin action', async () => {
    expect(
      (await POST(post({ action: 'install', siteId: 'alpha' }, 'https://evil.test'))).status,
    ).toBe(403)
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('rejects malformed starter without writes', async () => {
    expect(
      (await POST(post({ action: 'install', siteId: 'alpha', starterId: '__proto__' }))).status,
    ).toBe(400)
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('passes authorized selected site to canonical installer', async () => {
    mocks.install.mockResolvedValueOnce({ success: true })
    expect(
      (await POST(post({ action: 'install', siteId: 'alpha', starterId: 'publication-community' })))
        .status,
    ).toBe(200)
    expect(mocks.install).toHaveBeenCalledWith(expect.anything(), {
      siteId: 'alpha',
      starterId: 'publication-community',
      ownerEmail: 'owner@example.test',
    })
  })
})
describe('04C starter visitor contract', () => {
  it('ships complete local illustrations with no external image requests', () => {
    for (const media of publicationCommunityStarter.media) {
      expect(existsSync(`public${media.localAssetPath}`)).toBe(true)
      const svg = readFileSync(`public${media.localAssetPath}`, 'utf8')
      expect(svg).not.toMatch(/(?:href|src)=["']https?:/)
      expect(media.altText).toBeTruthy()
    }
  })
  it('publishes valid registered blocks including real signup and community links', () => {
    for (const layout of [
      ...publicationCommunityStarter.layouts,
      ...publicationCommunityStarter.globals,
      ...publicationCommunityStarter.templates,
      ...publicationCommunityStarter.patterns,
    ]) {
      for (const block of layout.blocks) expect(componentRegistry[block.component]).toBeDefined()
      const blocks = structuredClone(layout.blocks).map((block) => {
        for (const field of ['link', 'media']) {
          const value = block.props[field] as Record<string, unknown> | undefined
          if (value) block.props[field] = { ...value, id: 'fixture-reference', siteId: 'alpha' }
        }
        return block
      })
      expect(
        validateLayout({
          version: 1,
          id: 'starter',
          siteId: 'alpha',
          path: layout.path,
          status: 'draft',
          themeId: 'neutral-starter',
          surface: layout.surface,
          slot: layout.slot,
          blocks,
          unknownBlocks: [],
          revision: 1,
        }).errors,
      ).toEqual([])
    }
    const home = JSON.stringify(publicationCommunityStarter.layouts)
    expect(home).toContain('/subscribe')
    expect(home).toContain('/members')
  })
  it('includes contact and required legal links and nonempty full bodies', () => {
    for (const path of ['/contact', '/privacy', '/terms']) {
      expect(publicationCommunityStarter.navigation.footer.some((link) => link.href === path)).toBe(
        true,
      )
      const page = publicationCommunityStarter.pages.find((page) => page.canonicalPath === path)!
      expect(page.body.length).toBeGreaterThan(page.summary.length)
    }
    expect(
      publicationCommunityStarter.pages.find((page) => page.canonicalPath === '/contact')!.body,
    ).not.toContain('@vanguardchronicle.org')
  })
})
