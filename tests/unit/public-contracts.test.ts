import { describe, expect, it } from 'vitest'

import {
  canDiscoverPublic,
  canRenderPublic,
  migrateThemeConfig,
  resolveTheme,
} from '../../src/modules/public/contracts'
import {
  localeAlternates,
  localeDirection,
  localizedPath,
} from '../../src/modules/public/localization'
import { buildJsonLd, buildMetadata } from '../../src/modules/public/seo'

describe('public publishing contracts', () => {
  it('switches presentation themes without any content migration', () => {
    expect(resolveTheme('neutral-starter').templates.article).toBe('reading')
    expect(resolveTheme('renegade-party').templates.article).toBe('argument')
    expect(migrateThemeConfig({ version: 0, themeId: 'renegade-party' })).toMatchObject({
      version: 1,
      themeId: 'renegade-party',
    })
  })

  it('keeps restricted, held, removed and expired records out of public surfaces', () => {
    expect(canRenderPublic({ visibility: 'private', status: 'published' })).toBe(false)
    expect(
      canDiscoverPublic({ visibility: 'public', status: 'published', moderationState: 'review' }),
    ).toBe(false)
    expect(
      canDiscoverPublic({
        visibility: 'public',
        status: 'published',
        retentionMode: 'expire-at',
        retentionExpiresAt: '2001-01-01',
      }),
    ).toBe(false)
    expect(
      canDiscoverPublic({ visibility: 'public', status: 'published', removeFromDiscovery: true }),
    ).toBe(false)
    expect(canDiscoverPublic({ visibility: 'public', status: 'published' })).toBe(true)
  })

  it('emits stable typed metadata and JSON-LD without raw injection', () => {
    const metadata = buildMetadata({
      title: 'An article',
      canonicalPath: '/articles/a',
      siteUrl: 'https://example.test',
      seoNoIndex: true,
    })
    expect(metadata.robots).toEqual({ index: false, follow: false })
    const graph = buildJsonLd({
      siteUrl: 'https://example.test',
      path: '/articles/a',
      site: { ownerKind: 'organization', name: 'Example' },
      breadcrumb: [
        { name: 'Home', path: '/' },
        { name: 'Article', path: '/articles/a' },
      ],
      entity: { kind: 'article', id: 'a1', name: 'An article', author: 'Ada' },
    })
    expect(graph['@graph'].map((node) => node['@type'])).toEqual([
      'WebSite',
      'Organization',
      'BreadcrumbList',
      'Article',
    ])
    expect(JSON.stringify(graph)).not.toContain('FAQPage')
  })

  it('uses locale-aware routes and RTL direction without changing canonical ownership', () => {
    const settings = {
      defaultLocale: 'en',
      supportedLocales: ['en', 'ar'],
      fallbackChain: ['en'],
      timeZone: 'UTC',
    }
    expect(localizedPath('/articles/a', 'ar', settings)).toBe('/ar/articles/a')
    expect(localeAlternates('/articles/a', settings)).toEqual({
      en: '/articles/a',
      ar: '/ar/articles/a',
    })
    expect(localeDirection('ar-EG')).toBe('rtl')
  })
})
