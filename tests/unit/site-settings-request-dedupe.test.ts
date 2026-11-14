import { describe, expect, it, vi } from 'vitest'
import { resolveSiteSettings } from '@/modules/core/site-settings'

vi.mock('@/modules/presentation/request-theme', () => ({
  requestTheme: vi.fn(async () => ({ renderer: 'neutral-starter', id: 'neutral-starter' })),
}))

function stubPayload(siteName: string) {
  return {
    findGlobal: vi.fn(async () => ({
      siteName,
      themeId: 'neutral-starter',
      canonicalOrigin: 'https://alpha.test',
      canonicalOriginsBySite: { a: 'https://alpha.test' },
    })),
    find: vi.fn(),
  } as never
}

/**
 * Perf Pass 0 lane 01: resolveSiteSettings is wrapped in a per-request
 * React cache. Outside an RSC request (this test env) the cache may or
 * may not dedupe — both are acceptable — but three properties must hold
 * in every environment: results are identical across repeated calls,
 * different payload instances never share a resolution, and the
 * includeTheme variants stay distinct.
 */
describe('resolveSiteSettings request dedupe wrapper', () => {
  it('returns identical settings across repeated calls', async () => {
    const payload = stubPayload('Alpha')
    const first = await resolveSiteSettings(payload)
    const second = await resolveSiteSettings(payload)
    const noTheme = await resolveSiteSettings(payload, { includeTheme: false })
    expect(second).toEqual(first)
    expect(noTheme.siteName).toBe('Alpha')
    expect(noTheme.themeConfiguration).toBeNull()
    expect(first.themeConfiguration).toMatchObject({ renderer: 'neutral-starter' })
  })

  it('never shares a resolution across payload instances', async () => {
    const alpha = stubPayload('Alpha')
    const beta = stubPayload('Beta')
    expect((await resolveSiteSettings(alpha)).siteName).toBe('Alpha')
    expect((await resolveSiteSettings(beta)).siteName).toBe('Beta')
    expect((await resolveSiteSettings(alpha)).siteName).toBe('Alpha')
  })

  it('falls back to defaults when the global read fails', async () => {
    const payload = {
      findGlobal: vi.fn(async () => {
        throw new Error('db unavailable')
      }),
      find: vi.fn(),
    } as never
    const result = await resolveSiteSettings(payload, { includeTheme: false })
    expect(result.siteName).toBeTruthy()
    expect(result.canonicalOrigin).toBeTruthy()
  })
})
