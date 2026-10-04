import { describe, expect, it } from 'vitest'
import { isPublicPageLayout } from '@/modules/public/layout-visibility'
describe('RC-02 reusable presentation discovery boundary', () => {
  it('keeps real and legacy pages while excluding globals, patterns and templates', () => {
    expect(isPublicPageLayout({ surface: 'page', path: '/get-involved' })).toBe(true)
    expect(isPublicPageLayout({ path: '/legacy-page' })).toBe(true)
    for (const surface of ['global', 'pattern', 'template']) {
      expect(isPublicPageLayout({ surface, path: '/somewhere' })).toBe(false)
      expect(isPublicPageLayout({ path: `__${surface}__/asset` })).toBe(false)
      expect(isPublicPageLayout({ path: `/__${surface}__/asset` })).toBe(false)
    }
  })
})
