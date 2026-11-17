import { describe, expect, it } from 'vitest'

import { bestNavCurrentHref } from '../../src/modules/admin/AdminA11yBridge'

/**
 * RC2-DEBT-23: the nav annotation half of the admin accessibility
 * bridge. The winner rule decides which stock nav link carries
 * aria-current="page" for a given admin route.
 */
describe('bestNavCurrentHref', () => {
  const hrefs = [
    '/admin',
    '/admin/collections/content',
    '/admin/collections/media-assets',
    '/admin/posts',
    '/admin/globals/site-settings',
  ]

  it('marks the dashboard only on the dashboard itself', () => {
    expect(bestNavCurrentHref('/admin', hrefs)).toBe('/admin')
    expect(bestNavCurrentHref('/admin/collections/content', hrefs)).not.toBe('/admin')
  })

  it('prefers an exact match', () => {
    expect(bestNavCurrentHref('/admin/collections/content', hrefs)).toBe(
      '/admin/collections/content',
    )
    expect(bestNavCurrentHref('/admin/posts', hrefs)).toBe('/admin/posts')
  })

  it('marks the section link on a document page under it', () => {
    expect(bestNavCurrentHref('/admin/collections/content/abc123', hrefs)).toBe(
      '/admin/collections/content',
    )
  })

  it('chooses the longest matching prefix', () => {
    const nested = ['/admin/collections', '/admin/collections/content']
    expect(bestNavCurrentHref('/admin/collections/content/abc123', nested)).toBe(
      '/admin/collections/content',
    )
  })

  it('does not match across a segment boundary', () => {
    expect(bestNavCurrentHref('/admin/collections/contentious', hrefs)).toBe(null)
  })

  it('tolerates trailing slashes and query strings', () => {
    expect(bestNavCurrentHref('/admin/collections/content/', hrefs)).toBe(
      '/admin/collections/content',
    )
    expect(bestNavCurrentHref('/admin/posts?draft=1', hrefs)).toBe('/admin/posts')
  })

  it('returns null when nothing in the nav matches', () => {
    expect(bestNavCurrentHref('/admin/account', hrefs)).toBe(null)
  })
})
