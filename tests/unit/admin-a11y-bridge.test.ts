import { describe, expect, it } from 'vitest'

import {
  bestNavCurrentHref,
  shouldFocusErrorControl,
} from '../../src/modules/admin/AdminA11yBridge'

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

/**
 * RC3-03: the focus half of the bridge. A fresh failure after a save
 * (focus on the Save button, or nowhere after React replaced it)
 * moves focus to the first failing control; a user already working
 * in a field is never interrupted, and a hidden target is skipped.
 */
describe('shouldFocusErrorControl', () => {
  it('moves focus after a button-driven save', () => {
    expect(
      shouldFocusErrorControl({ activeKind: 'button', hasNewError: true, targetVisible: true }),
    ).toBe(true)
  })

  it('moves focus when the save left focus nowhere', () => {
    expect(
      shouldFocusErrorControl({ activeKind: 'none', hasNewError: true, targetVisible: true }),
    ).toBe(true)
  })

  it('never steals focus from a field the user is working in', () => {
    expect(
      shouldFocusErrorControl({ activeKind: 'field', hasNewError: true, targetVisible: true }),
    ).toBe(false)
    expect(
      shouldFocusErrorControl({ activeKind: 'other', hasNewError: true, targetVisible: true }),
    ).toBe(false)
  })

  it('does not move focus for a standing error set', () => {
    expect(
      shouldFocusErrorControl({ activeKind: 'button', hasNewError: false, targetVisible: true }),
    ).toBe(false)
  })

  it('does not move focus to a control hidden in a collapsed section', () => {
    expect(
      shouldFocusErrorControl({ activeKind: 'button', hasNewError: true, targetVisible: false }),
    ).toBe(false)
  })
})
