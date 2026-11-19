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
import {
  discoveryToJsonLd,
  discoveryToMetadata,
  type DiscoveryDocument,
} from '../../src/modules/public/discovery'

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
    // Live path (SEO 1.0 §8): metadata and JSON-LD are projections of the
    // resolved DiscoveryDocument — the local buildMetadata/buildJsonLd
    // composers that used to live in public/seo were removed as dead code.
    const articleDoc: DiscoveryDocument = {
      publicUrl: 'https://example.test/articles/a',
      canonicalUrl: 'https://example.test/articles/a',
      canonicalPath: '/articles/a',
      alternateLocales: {},
      indexability: {
        indexable: true,
        reason: 'canonical',
        robotsDirectives: { index: true, follow: true },
      },
      title: { value: 'An article', source: 'explicit_override' },
      description: { value: 'A test article summary.', source: 'content_derived' },
      socialImage: { url: null, alt: null, source: null, variantEligible: false, variantUrl: null },
      contentType: 'article',
      author: { name: 'Ada', url: 'https://example.test/authors/ada' },
      publisher: { name: 'Example', url: 'https://example.test', logoUrl: null },
      dates: { publishedAt: '2026-09-01T12:00:00.000Z', modifiedAt: '2026-09-01T12:00:00.000Z' },
      taxonomy: { topics: [], categories: [], tags: [] },
      breadcrumbs: [
        { name: 'Home', path: '/', url: 'https://example.test/' },
        { name: 'Article', path: '/articles/a', url: 'https://example.test/articles/a' },
      ],
      media: {},
      revisions: {
        entityId: 'a1',
        collection: 'content',
        publishedRevisionId: 'rev-1',
        presentationRevisionId: 'a1',
      },
      search: { eligible: true, bodyProjection: 'An article body.', visibility: 'public' },
      redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
      schema: {
        eligible: true,
        schemaType: 'Article',
        jsonLd: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebSite',
              '@id': 'https://example.test#website',
              url: 'https://example.test',
              name: 'Example',
            },
            { '@type': 'Organization', '@id': 'https://example.test#identity', name: 'Example' },
            {
              '@type': 'BreadcrumbList',
              '@id': 'https://example.test/articles/a#breadcrumb',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.test/' },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: 'Article',
                  item: 'https://example.test/articles/a',
                },
              ],
            },
            {
              '@type': 'Article',
              '@id': 'https://example.test/articles/a#article-a1',
              headline: 'An article',
              url: 'https://example.test/articles/a',
              author: { '@type': 'Person', name: 'Ada' },
            },
          ],
        },
      },
      issues: [],
    }

    // (a) A non-public document yields robots-only metadata — nothing else leaks.
    const draftMetadata = discoveryToMetadata({
      ...articleDoc,
      indexability: {
        indexable: false,
        reason: 'draft',
        robotsDirectives: { index: false, follow: false },
      },
    })
    expect(draftMetadata).toEqual({ robots: { index: false, follow: false } })

    // (b) A canonical document projects its own title, description and canonical.
    const metadata = discoveryToMetadata(articleDoc)
    expect(metadata.title).toBe('An article')
    expect(metadata.description).toBe('A test article summary.')
    expect(metadata.alternates?.canonical).toBe('https://example.test/articles/a')
    expect(metadata.robots).toEqual({ index: true, follow: true })

    // (c) The JSON-LD projection carries the document's typed graph verbatim.
    const graph = discoveryToJsonLd(articleDoc) as {
      '@graph': Array<Record<string, unknown>>
    }
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
