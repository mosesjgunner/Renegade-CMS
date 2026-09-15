/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'

import {
  auditDiscoveryDocument,
  discoveryToJsonLd,
  discoveryToMetadata,
  discoveryToSearchDocument,
  discoveryToSitemapEntry,
  type DiscoveryDocument,
} from '../../src/modules/public/discovery'

describe('DISC-00 Discovery Document & Resolver Contract', () => {
  const baseDoc: DiscoveryDocument = {
    publicUrl: 'https://example.test/articles/renegade-guide',
    canonicalUrl: 'https://example.test/articles/renegade-guide',
    canonicalPath: '/articles/renegade-guide',
    alternateLocales: { en: 'https://example.test/articles/renegade-guide' },
    indexability: {
      indexable: true,
      reason: 'canonical',
      robotsDirectives: { index: true, follow: true },
    },
    title: {
      value: 'The Renegade Guide to Content Systems',
      source: 'explicit_override',
    },
    description: {
      value: 'A comprehensive handbook for high-performance publishing.',
      source: 'content_derived',
    },
    socialImage: {
      url: 'https://example.test/media/hero.jpg',
      alt: 'Renegade Guide cover illustration',
      source: 'content_derived',
      variantEligible: true,
      variantUrl: 'https://example.test/api/media/hero/variants/og.webp',
    },
    contentType: 'article',
    author: {
      name: 'Elena Rostova',
      url: 'https://example.test/authors/elena',
    },
    publisher: {
      name: 'Renegade Media',
      url: 'https://example.test',
      logoUrl: 'https://example.test/media/logo.png',
    },
    dates: {
      publishedAt: '2026-09-01T12:00:00.000Z',
      modifiedAt: '2026-09-10T14:30:00.000Z',
    },
    taxonomy: {
      topics: ['Publishing', 'Architecture'],
      categories: ['Guides'],
      tags: ['headless', 'caching'],
    },
    breadcrumbs: [
      { name: 'Home', path: '/', url: 'https://example.test/' },
      { name: 'Articles', path: '/articles', url: 'https://example.test/articles' },
      {
        name: 'The Renegade Guide to Content Systems',
        path: '/articles/renegade-guide',
        url: 'https://example.test/articles/renegade-guide',
      },
    ],
    media: {
      heroImage: {
        id: 'hero-1',
        url: 'https://example.test/media/hero.jpg',
        alt: 'Renegade Guide cover illustration',
      },
    },
    revisions: {
      entityId: 'content-101',
      collection: 'content',
      publishedRevisionId: 'rev-202',
      presentationRevisionId: 'content-101',
    },
    search: {
      eligible: true,
      bodyProjection: 'The complete guide to decentralized and high-speed content delivery.',
      visibility: 'public',
    },
    redirect: {
      isRedirect: false,
      targetUrl: null,
      statusCode: null,
      isTombstone: false,
    },
    schema: {
      eligible: true,
      schemaType: 'Article',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Article',
            '@id': 'https://example.test/articles/renegade-guide#article',
            headline: 'The Renegade Guide to Content Systems',
            url: 'https://example.test/articles/renegade-guide',
            description: 'A comprehensive handbook for high-performance publishing.',
            datePublished: '2026-09-01T12:00:00.000Z',
            dateModified: '2026-09-10T14:30:00.000Z',
            author: { '@type': 'Person', name: 'Elena Rostova' },
            publisher: { '@type': 'Organization', name: 'Renegade Media' },
          },
        ],
      },
    },
    issues: [],
  }

  it('audits a valid canonical discovery document with 0 issues', () => {
    const issues = auditDiscoveryDocument(baseDoc)
    expect(issues).toEqual([])
  })

  it('tracks title and description provenance accurately', () => {
    expect(baseDoc.title.source).toBe('explicit_override')
    expect(baseDoc.description.source).toBe('content_derived')

    const siteDefaultDoc: DiscoveryDocument = {
      ...baseDoc,
      title: { value: 'Renegade Media', source: 'site_default' },
      description: { value: 'Renegade platform default description', source: 'site_default' },
    }
    expect(siteDefaultDoc.title.source).toBe('site_default')
    expect(siteDefaultDoc.description.source).toBe('site_default')
  })

  it('detects missing title and missing description issues', () => {
    const invalidDoc: DiscoveryDocument = {
      ...baseDoc,
      title: { value: '   ', source: 'site_default' },
      description: { value: '', source: 'site_default' },
    }
    const issues = auditDiscoveryDocument(invalidDoc)
    expect(issues.some((i) => i.ruleId === 'DISC-RULE-01-TITLE')).toBe(true)
    expect(issues.some((i) => i.ruleId === 'DISC-RULE-02-DESC')).toBe(true)
    const titleIssue = issues.find((i) => i.ruleId === 'DISC-RULE-01-TITLE')
    expect(titleIssue?.severity).toBe('publication_blocking')
    expect(titleIssue?.ruleVersion).toBe('1.0.0')
  })

  it('detects invalid or relative canonical URLs', () => {
    const malformedDoc: DiscoveryDocument = {
      ...baseDoc,
      canonicalUrl: '/relative/path/only',
    }
    const issues = auditDiscoveryDocument(malformedDoc)
    expect(issues.some((i) => i.ruleId === 'DISC-RULE-03-CANONICAL')).toBe(true)
  })

  it('detects indexability contradictions between flag and reason', () => {
    const contradictionDoc: DiscoveryDocument = {
      ...baseDoc,
      indexability: {
        indexable: true,
        reason: 'draft',
        robotsDirectives: { index: true, follow: true },
      },
    }
    const issues = auditDiscoveryDocument(contradictionDoc)
    expect(issues.some((i) => i.ruleId === 'DISC-RULE-04-INDEXABILITY')).toBe(true)
  })

  it('detects social media assets missing required alt text', () => {
    const missingAltDoc: DiscoveryDocument = {
      ...baseDoc,
      socialImage: {
        url: 'https://example.test/hero.jpg',
        alt: '   ',
        source: 'content_derived',
        variantEligible: false,
        variantUrl: null,
      },
    }
    const issues = auditDiscoveryDocument(missingAltDoc)
    expect(issues.some((i) => i.ruleId === 'DISC-RULE-05-MEDIA-ALT')).toBe(true)
  })

  it('detects circular redirect loops targeting the source URL', () => {
    const loopDoc: DiscoveryDocument = {
      ...baseDoc,
      publicUrl: 'https://example.test/loop',
      redirect: {
        isRedirect: true,
        targetUrl: 'https://example.test/loop',
        statusCode: 308,
        isTombstone: false,
      },
    }
    const issues = auditDiscoveryDocument(loopDoc)
    expect(issues.some((i) => i.ruleId === 'DISC-RULE-06-REDIRECT-LOOP')).toBe(true)
  })

  it('converts to Next.js metadata with exact matching robots and social image priority', () => {
    const metadata = discoveryToMetadata(baseDoc)
    expect(metadata.title).toBe('The Renegade Guide to Content Systems')
    expect(metadata.description).toBe('A comprehensive handbook for high-performance publishing.')
    expect(metadata.alternates?.canonical).toBe('https://example.test/articles/renegade-guide')
    expect(metadata.robots).toEqual({ index: true, follow: true })

    // OpenGraph and Twitter prefer the optimized variant URL if eligible
    const ogImages = metadata.openGraph?.images as Array<{ url: string; alt?: string }>
    expect(ogImages[0].url).toBe('https://example.test/api/media/hero/variants/og.webp')
    expect(ogImages[0].alt).toBe('Renegade Guide cover illustration')
    expect((metadata.twitter as any)?.card).toBe('summary_large_image')
  })

  it('converts to search document with body projection and taxonomies', () => {
    const searchDoc = discoveryToSearchDocument(baseDoc)
    expect(searchDoc.id).toBe('content-101')
    expect(searchDoc.path).toBe('/articles/renegade-guide')
    expect(searchDoc.title).toBe('The Renegade Guide to Content Systems')
    expect(searchDoc.summary).toBe('A comprehensive handbook for high-performance publishing.')
    expect(searchDoc.body).toBe(
      'The complete guide to decentralized and high-speed content delivery.',
    )
    expect(searchDoc.taxonomy).toContain('Publishing')
    expect(searchDoc.taxonomy).toContain('headless')
    expect(searchDoc.status).toBe('published')
    expect(searchDoc.visibility).toBe('public')
  })

  it('converts to sitemap entry when indexable and rejects non-indexable docs', () => {
    const sitemapEntry = discoveryToSitemapEntry(baseDoc)
    expect(sitemapEntry).toEqual({
      url: 'https://example.test/articles/renegade-guide',
      lastModified: new Date('2026-09-10T14:30:00.000Z'),
    })

    const draftDoc: DiscoveryDocument = {
      ...baseDoc,
      indexability: {
        indexable: false,
        reason: 'draft',
        robotsDirectives: { index: false, follow: false },
      },
    }
    expect(discoveryToSitemapEntry(draftDoc)).toBeNull()
  })

  it('enforces exact JSON-LD schema contract output', () => {
    const jsonLd = discoveryToJsonLd(baseDoc) as Record<string, unknown>
    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(Array.isArray(jsonLd['@graph'])).toBe(true)
    const graph = jsonLd['@graph'] as Array<Record<string, unknown>>
    expect(graph[0]['@type']).toBe('Article')
    expect(graph[0].headline).toBe('The Renegade Guide to Content Systems')
  })
})
