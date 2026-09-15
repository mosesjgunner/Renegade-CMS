import { describe, expect, it } from 'vitest'

import {
  discoveryPreview,
  discoveryToMetadata,
  normalizeDiscoveryPath,
  safeCanonicalUrl,
  type DiscoveryDocument,
} from '../../src/modules/public/discovery'

const document = (): DiscoveryDocument => ({
  publicUrl: 'https://alpha.test/articles/launch',
  canonicalUrl: 'https://alpha.test/articles/launch',
  canonicalPath: '/articles/launch',
  alternateLocales: { es: 'https://alpha.test/es/articles/launch' },
  indexability: {
    indexable: true,
    reason: 'canonical',
    robotsDirectives: { index: true, follow: true },
  },
  title: {
    value: 'A deliberately long discovery title that visibly truncates in search results',
    source: 'content_derived',
  },
  description: { value: 'A public summary.', source: 'content_derived' },
  socialImage: {
    url: 'https://alpha.test/media/asset',
    alt: 'Launch artwork',
    source: 'content_derived',
    variantEligible: true,
    variantUrl: 'https://alpha.test/media/asset/variant/og.jpeg',
  },
  social: { title: 'Visible social title', description: 'Visible social summary', locale: 'en_US' },
  contentType: 'article',
  author: null,
  publisher: { name: 'Alpha', url: 'https://alpha.test' },
  dates: { publishedAt: null, modifiedAt: null },
  taxonomy: { topics: [], categories: [], tags: [] },
  breadcrumbs: [],
  media: {},
  revisions: {
    entityId: 'content-1',
    collection: 'content',
    publishedRevisionId: 'revision-1',
    presentationRevisionId: null,
  },
  schema: { eligible: true, schemaType: 'Article', jsonLd: {} },
  search: { eligible: true, bodyProjection: 'Launch', visibility: 'public' },
  redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
  issues: [],
})

describe('DISC-01 publisher discovery workflow', () => {
  it('normalizes duplicate home, query, fragment, encoding, and trailing-slash variants', () => {
    expect(normalizeDiscoveryPath('//articles///launch/?utm_source=x#share')).toBe(
      '/articles/launch',
    )
    expect(normalizeDiscoveryPath('/')).toBe('/')
    expect(normalizeDiscoveryPath('/author/Jane Doe/')).toBe('/author/Jane%20Doe')
  })

  it('refuses cross-site canonical accidents and strips query/fragment variants', () => {
    const publicUrl = 'https://alpha.test/articles/launch'
    expect(
      safeCanonicalUrl('https://evil.test/articles/launch', publicUrl, 'https://alpha.test'),
    ).toBe(publicUrl)
    expect(safeCanonicalUrl('/articles/launch/?utm=x#top', publicUrl, 'https://alpha.test')).toBe(
      publicUrl,
    )
  })

  it('drives search and major social previews from the same discovery document as metadata', () => {
    const doc = document()
    const preview = discoveryPreview(doc)
    const metadata = discoveryToMetadata(doc)
    expect(preview.search.titleTruncated).toBe(true)
    expect(preview.openGraph.title).toBe(metadata.openGraph?.title)
    expect(preview.openGraph.image).toBe('https://alpha.test/media/asset/variant/og.jpeg')
    expect(metadata.twitter?.title).toBe('Visible social title')
    expect(metadata.alternates?.languages).toEqual(doc.alternateLocales)
  })

  it('never previews an ineligible draft or expired image variant', () => {
    const doc = document()
    doc.indexability = {
      indexable: false,
      reason: 'maintenance',
      robotsDirectives: { index: false, follow: false },
    }
    doc.socialImage.variantEligible = false
    doc.socialImage.variantUrl = null
    doc.socialImage.url = null
    expect(discoveryPreview(doc).openGraph.image).toBeNull()
    expect(discoveryToMetadata(doc).robots).toEqual({ index: false, follow: false })
  })
})
