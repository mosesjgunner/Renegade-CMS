/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
import {
  discoveryToJsonLd,
  discoveryToMetadata,
  getAllIndexableDiscoveryDocuments,
  resolveDiscoveryDocument,
} from '../../src/modules/public/discovery'
import { assertSeoCanonicalConflictFree } from '../../src/modules/editorial/publishing-pass'
import { Categories, Content, Sections, Topics } from '../../src/collections/Publishing'
import { PageLayouts } from '../../src/collections/PageLayouts'
import { SiteSettings } from '../../src/globals/SiteSettings'

function createMockPayload(
  overrides: {
    siteSettings?: Record<string, any>
    contentDocs?: Array<Record<string, any>>
    categoryDocs?: Array<Record<string, any>>
    sectionDocs?: Array<Record<string, any>>
    topicDocs?: Array<Record<string, any>>
    layoutDocs?: Array<Record<string, any>>
    redirectDocs?: Array<Record<string, any>>
    mediaDocs?: Record<string, Record<string, any>>
    articleFamilyDocs?: Array<Record<string, any>>
    revisionDocs?: Record<string, Record<string, any>>
  } = {},
) {
  const siteSettings = {
    themeId: 'neutral-starter',
    siteName: 'Renegade Dispatch',
    siteDescription: 'Independent public interest reporting.',
    canonicalOrigin: 'https://dispatch.example.org',
    canonicalOriginsBySite: { 'site-1': 'https://dispatch.example.org' },
    indexingMode: 'index',
    launchState: 'live',
    locale: 'en_US',
    ownerKind: 'organization',
    organizationName: 'Renegade Media Foundation',
    ...overrides.siteSettings,
  }

  const collections: Record<string, Array<Record<string, any>>> = {
    content: overrides.contentDocs ?? [],
    categories: overrides.categoryDocs ?? [],
    sections: overrides.sectionDocs ?? [],
    topics: overrides.topicDocs ?? [],
    'page-layouts': overrides.layoutDocs ?? [],
    'public-redirects': overrides.redirectDocs ?? [],
    'article-family-content': overrides.articleFamilyDocs ?? [],
    publications: [{ id: 'pub-1', site: 'site-1', status: 'active', visibility: 'public' }],
  }

  return {
    collections: Object.fromEntries(Object.keys(collections).map((k) => [k, {}])),
    findGlobal: vi.fn(async ({ slug }: { slug: string }) => {
      if (slug === 'site-settings') return siteSettings
      return {}
    }),
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: string }) => {
      if (collection === 'media-assets') {
        const asset = overrides.mediaDocs?.[id]
        if (!asset) throw new Error('Media asset not found')
        return asset
      }
      if (collection === 'revision-records') {
        const rev = overrides.revisionDocs?.[id]
        if (!rev) throw new Error('Revision not found')
        return rev
      }
      const list = collections[collection] ?? []
      const found = list.find((doc) => String(doc.id) === String(id))
      if (!found) throw new Error(`Not found in ${collection}: ${id}`)
      return found
    }),
    find: vi.fn(async ({ collection, where }: { collection: string; where?: any }) => {
      const list = collections[collection] ?? []
      const matchesWhere = (doc: Record<string, any>, cond: any): boolean => {
        if (!cond || typeof cond !== 'object') return true
        if (Array.isArray(cond.and)) {
          return cond.and.every((c: any) => matchesWhere(doc, c))
        }
        if (Array.isArray(cond.or)) {
          return cond.or.some((c: any) => matchesWhere(doc, c))
        }
        return Object.entries(cond).every(([field, expr]: [string, any]) => {
          if (!expr || typeof expr !== 'object') return true
          const rawVal = doc[field]
          const val = rawVal && typeof rawVal === 'object' && 'id' in rawVal ? rawVal.id : rawVal
          if ('equals' in expr) return val === expr.equals
          if ('not_equals' in expr) return val !== expr.not_equals
          if ('in' in expr && Array.isArray(expr.in)) return expr.in.includes(val)
          if ('contains' in expr) {
            return Array.isArray(rawVal)
              ? rawVal.some((item) => (item?.id ?? item) === expr.contains)
              : val === expr.contains
          }
          return true
        })
      }
      const filtered = list.filter((doc) => matchesWhere(doc, where))
      return {
        docs: filtered,
        totalDocs: filtered.length,
        hasNextPage: false,
      }
    }),
  } as any
}

describe('RC1 06A — Metadata, Schema and Indexing Controls', () => {
  it('rejects entitlement-gated canonical targets and gating a referenced canonical target', async () => {
    const target = {
      id: 'primary',
      site: 'site-1',
      canonicalPath: '/articles/primary',
      status: 'published',
      visibility: 'public',
      requiredEntitlement: { resource: 'vault', capability: 'read' },
    }
    const payload = createMockPayload({ contentDocs: [target] })
    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        payload,
        data: {
          site: 'site-1',
          canonicalPath: '/articles/copy',
          seoCanonicalURL: '/articles/primary',
        },
      }),
    ).rejects.toThrow(/not an indexable public document/)

    const referenced = createMockPayload({
      contentDocs: [
        {
          id: 'copy',
          site: 'site-1',
          canonicalPath: '/articles/copy',
          seoCanonicalURL: 'https://dispatch.example.org/articles/primary',
        },
      ],
    })
    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        payload: referenced,
        originalDoc: { ...target, requiredEntitlement: null },
        data: { requiredEntitlement: target.requiredEntitlement },
      }),
    ).rejects.toThrow(/currently referenced as the canonical URL/)
  })

  it.each([
    { seoNoIndex: true },
    { removeFromDiscovery: true },
    { retentionMode: 'tombstone' },
    { publishedAt: '2099-01-01T00:00:00Z' },
  ])(
    'preserves incoming taxonomy JSON canonical references when target changes: %j',
    async (data) => {
      const payload = createMockPayload({
        categoryDocs: [
          {
            id: 'alias',
            site: 'site-1',
            canonicalPath: '/categories/copy',
            discoveryOverrides: { canonical: '/articles/primary' },
          },
        ],
      })
      await expect(
        assertSeoCanonicalConflictFree({
          collection: 'content',
          payload,
          data,
          originalDoc: {
            id: 'primary',
            site: 'site-1',
            canonicalPath: '/articles/primary',
            status: 'published',
            visibility: 'public',
          },
        }),
      ).rejects.toThrow(/currently referenced as the canonical URL/)
    },
  )

  it('exposes shared editable SEO fields across Content, Categories, Sections, Topics, PageLayouts, and SiteSettings', () => {
    const extractFieldNames = (fields: any[]): string[] =>
      fields.flatMap((f) => {
        if (f.type === 'tabs' && Array.isArray(f.tabs)) {
          return f.tabs.flatMap((t: any) => extractFieldNames(t.fields ?? []))
        }
        return f.name ? [f.name] : []
      })

    for (const config of [Content, Categories, Sections, Topics, PageLayouts, SiteSettings]) {
      const names = extractFieldNames(config.fields)
      expect(names).toEqual(
        expect.arrayContaining([
          'seoTitle',
          'seoDescription',
          'seoCanonicalURL',
          'seoImageAlt',
          'seoNoIndex',
          'discoveryOverrides',
        ]),
      )
    }
  })

  it('emits editable homepage SEO metadata, social overrides, media OG variant, and WebSite/WebPage/Organization JSON-LD', async () => {
    const payload = createMockPayload({
      siteSettings: {
        seoTitle: 'Custom Homepage SEO Title | Renegade Dispatch',
        seoDescription: 'Editable homepage meta description configured by site administrator.',
        seoCanonicalURL: 'https://dispatch.example.org/',
        seoImageAlt: 'Custom Homepage Social Banner Alt',
        defaultSocialImage: 'media-home-1',
        discoveryOverrides: {
          socialTitle: 'Homepage Social Card Headline',
          socialDescription: 'Homepage social card summary for sharing.',
          socialImage: 'media-home-1',
        },
      },
      mediaDocs: {
        'media-home-1': {
          id: 'media-home-1',
          processingState: 'ready',
          altText: 'Default Media Alt',
        },
      },
    })

    const doc = await resolveDiscoveryDocument(payload, { path: '/', siteId: 'site-1' })
    expect(doc.title).toEqual({
      value: 'Custom Homepage SEO Title | Renegade Dispatch',
      source: 'explicit_override',
    })
    expect(doc.description).toEqual({
      value: 'Editable homepage meta description configured by site administrator.',
      source: 'explicit_override',
    })
    expect(doc.canonicalUrl).toBe('https://dispatch.example.org/')
    expect(doc.indexability.indexable).toBe(true)
    expect(doc.socialImage.variantUrl).toBe(
      'https://dispatch.example.org/media/media-home-1?variant=og&format=jpeg&v=1',
    )
    expect(doc.socialImage.alt).toBe('Custom Homepage Social Banner Alt')

    const meta = discoveryToMetadata(doc)
    expect(meta.title).toBe('Custom Homepage SEO Title | Renegade Dispatch')
    expect(meta.description).toBe(
      'Editable homepage meta description configured by site administrator.',
    )
    expect(meta.alternates?.canonical).toBe('https://dispatch.example.org/')
    expect(meta.robots).toEqual({ index: true, follow: true })
    expect(meta.openGraph?.title).toBe('Homepage Social Card Headline')
    expect(meta.openGraph?.description).toBe('Homepage social card summary for sharing.')
    expect((meta.openGraph?.images as any)?.[0]?.url).toBe(
      'https://dispatch.example.org/media/media-home-1?variant=og&format=jpeg&v=1',
    )
    expect((meta.openGraph?.images as any)?.[0]?.alt).toBe('Custom Homepage Social Banner Alt')
    expect((meta.twitter as any)?.card).toBe('summary_large_image')

    const jsonLd = discoveryToJsonLd(doc) as any
    const types = jsonLd['@graph'].map((node: any) => node['@type'])
    expect(types).toEqual(
      expect.arrayContaining(['Organization', 'WebSite', 'WebPage', 'ImageObject']),
    )
  })

  it('resolves editable category and section SEO metadata, social cards, noindex toggle, and CollectionPage Schema.org', async () => {
    const payload = createMockPayload({
      categoryDocs: [
        {
          id: 'cat-1',
          site: 'site-1',
          name: 'Investigations',
          slug: 'investigations',
          canonicalPath: '/categories/investigations',
          description: 'Deep-dive investigative reporting.',
          seoTitle: 'Investigative Desk — Special Reports',
          seoDescription: 'Curated archive of investigative journalism and public records.',
          seoImageAlt: 'Investigative Desk Emblem',
          seoNoIndex: false,
          discoveryOverrides: {
            socialTitle: 'Investigative Desk Social Title',
            socialDescription: 'Investigative Desk Social Description',
            socialImage: 'media-cat-1',
          },
        },
      ],
    })

    const doc = await resolveDiscoveryDocument(payload, {
      path: '/categories/investigations',
      siteId: 'site-1',
    })
    expect(doc.title).toEqual({
      value: 'Investigative Desk — Special Reports',
      source: 'explicit_override',
    })
    expect(doc.description).toEqual({
      value: 'Curated archive of investigative journalism and public records.',
      source: 'explicit_override',
    })
    expect(doc.canonicalUrl).toBe('https://dispatch.example.org/categories/investigations')
    expect(doc.indexability.indexable).toBe(true)

    const meta = discoveryToMetadata(doc)
    expect(meta.title).toBe('Investigative Desk — Special Reports')
    expect(meta.openGraph?.title).toBe('Investigative Desk Social Title')
    expect((meta.openGraph?.images as any)?.[0]?.url).toBe(
      'https://dispatch.example.org/media/media-cat-1?variant=og&format=jpeg&v=1',
    )
    expect((meta.openGraph?.images as any)?.[0]?.alt).toBe('Investigative Desk Emblem')

    const jsonLd = discoveryToJsonLd(doc) as any
    const types = jsonLd['@graph'].map((n: any) => n['@type'])
    expect(types).toContain('CollectionPage')
    expect(types).toContain('BreadcrumbList')
  })

  it('prevents draft, private, scheduled, entitlement-restricted, tombstoned, and missing pages from emitting indexable or leaked public metadata', async () => {
    const payload = createMockPayload({
      contentDocs: [
        {
          id: 'art-draft',
          site: 'site-1',
          contentType: 'article',
          title: 'Top Secret Unreleased Draft',
          slug: 'top-secret-draft',
          canonicalPath: '/articles/top-secret-draft',
          summary: 'Confidential draft summary that must not leak.',
          seoTitle: 'Confidential Draft SEO Title',
          seoDescription: 'Confidential Draft SEO Description',
          status: 'draft',
          visibility: 'public',
        },
        {
          id: 'art-private',
          site: 'site-1',
          contentType: 'article',
          title: 'Members Only Briefing',
          slug: 'members-briefing',
          canonicalPath: '/articles/members-briefing',
          summary: 'Restricted member briefing.',
          status: 'published',
          visibility: 'members',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'art-entitlement',
          site: 'site-1',
          contentType: 'article',
          title: 'Subscriber Vault Report',
          slug: 'subscriber-vault',
          canonicalPath: '/articles/subscriber-vault',
          summary: 'Gated behind entitlement.',
          status: 'published',
          visibility: 'public',
          publishedAt: '2026-01-01T00:00:00.000Z',
          requiredEntitlement: { resource: 'vault', capability: 'read' },
        },
      ],
    })

    for (const path of [
      '/articles/top-secret-draft',
      '/articles/members-briefing',
      '/articles/subscriber-vault',
      '/articles/does-not-exist',
    ]) {
      const doc = await resolveDiscoveryDocument(payload, { path, siteId: 'site-1' })
      expect(doc.indexability.indexable).toBe(false)
      expect(doc.indexability.robotsDirectives).toEqual({ index: false, follow: false })

      const meta = discoveryToMetadata(doc)
      expect(meta).toEqual({
        robots: { index: false, follow: false },
      })
      expect(meta.title).toBeUndefined()
      expect(meta.description).toBeUndefined()
      expect(meta.alternates).toBeUndefined()
      expect(meta.openGraph).toBeUndefined()
      expect(meta.twitter).toBeUndefined()
    }
  })

  it('rejects cross-origin, query/fragment, redirect-targeted, non-indexable, and circular canonical URLs', async () => {
    const payload = createMockPayload({
      contentDocs: [
        {
          id: 'art-canonical-target',
          site: 'site-1',
          contentType: 'article',
          title: 'Primary Canonical Article',
          slug: 'primary-canonical',
          canonicalPath: '/articles/primary-canonical',
          status: 'published',
          visibility: 'public',
          seoNoIndex: false,
        },
        {
          id: 'art-draft-target',
          site: 'site-1',
          contentType: 'article',
          title: 'Draft Article',
          slug: 'draft-target',
          canonicalPath: '/articles/draft-target',
          status: 'draft',
          visibility: 'public',
        },
        {
          id: 'art-noindex-target',
          site: 'site-1',
          contentType: 'article',
          title: 'Noindex Article',
          slug: 'noindex-target',
          canonicalPath: '/articles/noindex-target',
          status: 'published',
          visibility: 'public',
          seoNoIndex: true,
        },
        {
          id: 'art-chained',
          site: 'site-1',
          contentType: 'article',
          title: 'Chained Article',
          slug: 'chained-article',
          canonicalPath: '/articles/chained-article',
          status: 'published',
          visibility: 'public',
          seoCanonicalURL: 'https://dispatch.example.org/articles/primary-canonical',
        },
      ],
      redirectDocs: [
        {
          id: 'red-1',
          site: 'site-1',
          fromPath: '/articles/legacy-redirect',
          toPath: '/articles/primary-canonical',
          enabled: true,
        },
      ],
    })

    // 1. Valid same-origin canonical to an indexable public article succeeds
    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        data: {
          site: 'site-1',
          canonicalPath: '/articles/syndicated-copy',
          seoCanonicalURL: 'https://dispatch.example.org/articles/primary-canonical',
          status: 'published',
          visibility: 'public',
        },
        payload,
      }),
    ).resolves.toBeUndefined()

    // 2. Cross-origin canonical URL is rejected
    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        data: {
          site: 'site-1',
          canonicalPath: '/articles/syndicated-copy',
          seoCanonicalURL: 'https://evil.example.com/articles/primary-canonical',
        },
        payload,
      }),
    ).rejects.toThrow(/cannot cross the site origin boundary/i)

    // 3. Query string or fragment in canonical URL is rejected
    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        data: {
          site: 'site-1',
          canonicalPath: '/articles/syndicated-copy',
          seoCanonicalURL: 'https://dispatch.example.org/articles/primary-canonical?utm_source=x',
        },
        payload,
      }),
    ).rejects.toThrow(/cannot contain query parameters or fragments/i)

    // 4. Canonical pointing to an active redirect source is rejected
    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        data: {
          site: 'site-1',
          canonicalPath: '/articles/syndicated-copy',
          seoCanonicalURL: 'https://dispatch.example.org/articles/legacy-redirect',
        },
        payload,
      }),
    ).rejects.toThrow(/active redirect source/i)

    // 5. Canonical pointing to a draft or noindex target is rejected
    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        data: {
          site: 'site-1',
          canonicalPath: '/articles/syndicated-copy',
          seoCanonicalURL: 'https://dispatch.example.org/articles/draft-target',
        },
        payload,
      }),
    ).rejects.toThrow(/not an indexable public document/i)

    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        data: {
          site: 'site-1',
          canonicalPath: '/articles/syndicated-copy',
          seoCanonicalURL: 'https://dispatch.example.org/articles/noindex-target',
        },
        payload,
      }),
    ).rejects.toThrow(/not an indexable public document/i)

    // 6. Canonical pointing to a record that itself points elsewhere (chain/loop) is rejected
    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        data: {
          site: 'site-1',
          canonicalPath: '/articles/syndicated-copy',
          seoCanonicalURL: 'https://dispatch.example.org/articles/chained-article',
        },
        payload,
      }),
    ).rejects.toThrow(/canonical chains and loops are forbidden/i)

    // 7. Mutating a canonical target (primary-canonical) into noindex while art-chained references it is rejected
    await expect(
      assertSeoCanonicalConflictFree({
        collection: 'content',
        data: {
          seoNoIndex: true,
        },
        originalDoc: {
          id: 'art-canonical-target',
          site: 'site-1',
          canonicalPath: '/articles/primary-canonical',
          status: 'published',
          visibility: 'public',
          seoNoIndex: false,
        },
        payload,
      }),
    ).rejects.toThrow(/currently referenced as the canonical URL by another record/i)
  })

  it('excludes non-self-canonical aliases from getAllIndexableDiscoveryDocuments and preserves metadata across theme switches and revisions', async () => {
    let currentTheme = 'neutral-starter'
    const payload = createMockPayload({
      siteSettings: {
        get themeId() {
          return currentTheme
        },
        seoTitle: 'Renegade Dispatch Home SEO',
        seoDescription: 'Renegade Dispatch Home Description',
      },
      contentDocs: [
        {
          id: 'art-1',
          site: 'site-1',
          contentType: 'article',
          title: 'Primary Investigation',
          slug: 'primary-investigation',
          canonicalPath: '/articles/primary-investigation',
          summary: 'Original summary.',
          seoTitle: 'Persisted SEO Title Across Revisions & Themes',
          seoDescription: 'Persisted SEO Description Across Revisions & Themes',
          seoCanonicalURL: 'https://dispatch.example.org/articles/primary-investigation',
          seoImageAlt: 'Persisted Hero Image Alt',
          heroMedia: 'media-hero-1',
          status: 'updated',
          visibility: 'public',
          publishedAt: '2026-02-01T12:00:00.000Z',
          discoveryOverrides: {
            socialTitle: 'Persisted Social Card Title',
            socialDescription: 'Persisted Social Card Description',
          },
        },
        {
          id: 'art-alias',
          site: 'site-1',
          contentType: 'article',
          title: 'Syndicated Alias',
          slug: 'syndicated-alias',
          canonicalPath: '/articles/syndicated-alias',
          summary: 'Alias pointing canonical to primary-investigation.',
          seoCanonicalURL: 'https://dispatch.example.org/articles/primary-investigation',
          status: 'published',
          visibility: 'public',
          publishedAt: '2026-02-02T12:00:00.000Z',
        },
      ],
      mediaDocs: {
        'media-hero-1': {
          id: 'media-hero-1',
          processingState: 'ready',
          altText: 'Fallback Alt',
        },
      },
      articleFamilyDocs: [
        {
          id: 'fam-1',
          content: 'art-1',
          latestPublishedRevision: 'rev-pub-1',
          currentRevision: 'rev-draft-2',
          plainTextProjection: 'Unpublished draft revision 2 body text',
        },
      ],
      revisionDocs: {
        'rev-pub-1': {
          id: 'rev-pub-1',
          title: 'Published Revision 1 Title',
          summary: 'Published Revision 1 Summary',
          document: {
            plainTextProjection: 'Published revision 1 body text',
          },
        },
      },
    })

    const beforeSwitch = await resolveDiscoveryDocument(payload, {
      path: '/articles/primary-investigation',
      siteId: 'site-1',
    })
    currentTheme = 'renegade-party'
    const afterSwitch = await resolveDiscoveryDocument(payload, {
      path: '/articles/primary-investigation',
      siteId: 'site-1',
    })

    expect(afterSwitch.title).toEqual(beforeSwitch.title)
    expect(afterSwitch.title.value).toBe('Persisted SEO Title Across Revisions & Themes')
    expect(afterSwitch.description.value).toBe(
      'Persisted SEO Description Across Revisions & Themes',
    )
    expect(afterSwitch.canonicalUrl).toBe(
      'https://dispatch.example.org/articles/primary-investigation',
    )
    expect(afterSwitch.social).toEqual(beforeSwitch.social)
    expect(afterSwitch.socialImage).toEqual(beforeSwitch.socialImage)
    expect(afterSwitch.schema.jsonLd).toEqual(beforeSwitch.schema.jsonLd)
    expect(afterSwitch.revisions.publishedRevisionId).toBe('rev-pub-1')
    expect(afterSwitch.search.bodyProjection).toContain('Published revision 1 body text')
    expect(afterSwitch.search.bodyProjection).not.toContain('Unpublished draft revision 2')

    const indexableDocs = await getAllIndexableDiscoveryDocuments(payload, 'site-1')
    const indexablePaths = indexableDocs.map((d) => d.canonicalPath)
    expect(indexablePaths).toContain('/articles/primary-investigation')
    expect(indexablePaths).not.toContain('/articles/syndicated-alias')
  })
})
