import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'

const theme = vi.hoisted(() => ({ calls: 0, resolve: vi.fn() }))
vi.mock('@/modules/presentation/request-theme', () => ({ requestTheme: theme.resolve }))

const payload = {
  findGlobal: vi.fn(async () => ({
    siteName: 'Alpha',
    themeId: 'neutral-starter',
    canonicalOrigin: 'https://alpha.test',
    canonicalOriginsBySite: { a: 'https://alpha.test', b: 'https://beta.test' },
  })),
  find: vi.fn(),
} as never

describe('Host resolution does not recurse through cached theme settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    theme.calls = 0
  })
  it('resolves the theme host without requesting the in-flight theme again', async () => {
    theme.resolve.mockImplementation(async () => {
      if (++theme.calls > 1) throw new Error('Recursive theme resolution')
      expect(await publicSiteForHost(payload, 'alpha.test')).toBe('a')
      return { renderer: 'neutral-starter', id: 'neutral-starter' }
    })
    const result = await resolveSiteSettings(payload)
    expect(result.themeConfiguration).toMatchObject({ renderer: 'neutral-starter' })
    expect(result.siteName).toBe('Alpha')
    expect(theme.resolve).toHaveBeenCalledTimes(1)
  })
  it('resolves host and same-origin checks even when theme loading is unavailable', async () => {
    theme.resolve.mockRejectedValue(new Error('Theme package unavailable'))
    expect(await publicSiteForHost(payload, 'beta.test')).toBe('b')
    expect(
      await samePublicOrigin(
        payload,
        new Request('https://beta.test/api', {
          headers: { host: 'beta.test', origin: 'https://beta.test' },
        }),
      ),
    ).toBe(true)
    expect(theme.resolve).not.toHaveBeenCalled()
  })
})
