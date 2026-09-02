import { describe, expect, it } from 'vitest'

import { inspectMedia, supportedMediaTypes } from '../../src/modules/media/storage'
import {
  isActiveMenuItem,
  normalizeNavigation,
  validateMenuItem,
  validateNavigation,
} from '../../src/modules/public/navigation'
import { buildJsonLd, buildMetadata } from '../../src/modules/public/seo'
import {
  highlightExcerpt,
  queryLocalSearch,
  type SearchDocument,
} from '../../src/modules/public/discovery'

describe('PUB-04 publishing floor unit contracts', () => {
  describe('Media engine inspection & safe SVG policy', () => {
    it('supports PNG, JPEG, WebP, PDF, and safe SVG', () => {
      expect(supportedMediaTypes['image/png']).toBeDefined()
      expect(supportedMediaTypes['image/jpeg']).toBeDefined()
      expect(supportedMediaTypes['image/webp']).toBeDefined()
      expect(supportedMediaTypes['application/pdf']).toBeDefined()
      expect(supportedMediaTypes['image/svg+xml']).toBeDefined()
    })

    it('sniffs safe SVG and parses dimensions', () => {
      const safeSvg =
        '<svg width="200" height="100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>'
      const bytes = new TextEncoder().encode(safeSvg)
      const inspected = inspectMedia(bytes)
      expect(inspected.mimeType).toBe('image/svg+xml')
      expect(inspected.kind).toBe('image')
      expect(inspected.width).toBe(200)
      expect(inspected.height).toBe(100)
      expect(inspected.sha256).toMatch(/^sha256:[a-f0-9]{64}$/)
    })

    it('rejects SVG containing script tags or event handlers', () => {
      const scriptSvg =
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>'
      expect(() => inspectMedia(new TextEncoder().encode(scriptSvg))).toThrow(
        /unsafe elements or scripts/i,
      )

      const onloadSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="10"/></svg>'
      expect(() => inspectMedia(new TextEncoder().encode(onloadSvg))).toThrow(
        /unsafe elements or scripts/i,
      )

      const foreignObjectSvg =
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>test</div></foreignObject></svg>'
      expect(() => inspectMedia(new TextEncoder().encode(foreignObjectSvg))).toThrow(
        /unsafe elements or scripts/i,
      )
    })
  })

  describe('Navigation validation, nesting, and active state', () => {
    it('validates menu items and enforces max 1 nesting level', () => {
      const validItem = {
        label: 'Dispatches',
        href: '/articles',
        children: [{ label: 'Field Notes', href: '/articles/field-notes' }],
      }
      expect(validateMenuItem(validItem)).toEqual({
        label: 'Dispatches',
        href: '/articles',
        children: [{ label: 'Field Notes', href: '/articles/field-notes', children: [] }],
      })

      const deepNested = {
        label: 'Level 0',
        href: '/level-0',
        children: [
          {
            label: 'Level 1',
            href: '/level-1',
            children: [{ label: 'Level 2', href: '/level-2' }],
          },
        ],
      }
      expect(() => validateMenuItem(deepNested)).toThrow(/at most one nesting level/i)
    })

    it('rejects invalid or unsafe href protocols', () => {
      expect(() => validateMenuItem({ label: 'Bad', href: 'javascript:alert(1)' })).toThrow(
        /invalid menu item link/i,
      )
      expect(() => validateMenuItem({ label: 'Bad', href: '//malicious.com' })).toThrow(
        /invalid menu item link/i,
      )
    })

    it('normalizes navigation and computes active states', () => {
      const raw = {
        primary: [
          { label: 'Home', href: '/' },
          { label: 'Articles', href: '/articles' },
        ],
        secondary: [{ label: 'Search', href: '/search' }],
        footer: [{ label: 'Privacy', href: '/privacy' }],
      }
      const validated = validateNavigation(raw)
      const nav = normalizeNavigation(validated)
      expect(nav.primary).toHaveLength(2)
      expect(nav.secondary).toHaveLength(1)
      expect(nav.footer).toHaveLength(1)

      expect(isActiveMenuItem(nav.primary[0]!, '/')).toBe(true)
      expect(isActiveMenuItem(nav.primary[0]!, '/articles')).toBe(false)
      expect(isActiveMenuItem(nav.primary[1]!, '/articles')).toBe(true)
      expect(isActiveMenuItem(nav.primary[1]!, '/articles/my-post')).toBe(true)
    })
  })

  describe('SEO metadata & JSON-LD inheritance', () => {
    it('builds canonical, title, description, and respects siteNoIndex', () => {
      const meta = buildMetadata({
        title: 'Demo Title',
        description: 'Demo Summary',
        canonicalPath: '/articles/demo',
        siteUrl: 'https://renegadeparty.org',
        siteNoIndex: true,
      })
      expect(meta.title).toBe('Demo Title')
      expect(meta.description).toBe('Demo Summary')
      expect(meta.alternates?.canonical).toBe('https://renegadeparty.org/articles/demo')
      expect(meta.robots).toEqual({ index: false, follow: false })
    })

    it('generates valid minimal JSON-LD schema', () => {
      const jsonLd = buildJsonLd({
        siteUrl: 'https://renegadeparty.org',
        path: '/articles/demo-post',
        site: { ownerKind: 'organization', name: 'Renegade Party' },
        breadcrumb: [
          { name: 'Home', path: '/' },
          { name: 'Articles', path: '/articles' },
          { name: 'Demo Post', path: '/articles/demo-post' },
        ],
        entity: {
          kind: 'article',
          id: 'art-1',
          name: 'Demo Post',
          description: 'A test dispatch',
          datePublished: '2026-09-01T12:00:00Z',
        },
      })
      expect(jsonLd['@context']).toBe('https://schema.org')
      expect(jsonLd['@graph'].length).toBeGreaterThanOrEqual(3)
      const articleSchema = jsonLd['@graph'].find((s) => s['@type'] === 'Article') as Record<
        string,
        unknown
      >
      expect(articleSchema).toBeDefined()
      expect(articleSchema.headline).toBe('Demo Post')
      expect(articleSchema.datePublished).toBe('2026-09-01T12:00:00Z')
    })
  })

  describe('Local Public Search over body projection & taxonomy', () => {
    const docs: SearchDocument[] = [
      {
        id: 'doc-1',
        siteId: 'site-a',
        path: '/articles/first',
        title: 'First Article',
        summary: 'General introductory overview',
        excerpt: 'Short excerpt',
        body: 'The unique secret token renegade_body_needle_77 appears only inside this body prose paragraph.',
        taxonomy: 'Dispatches Strategy',
        status: 'published',
        visibility: 'public',
        publishedAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'doc-2',
        siteId: 'site-a',
        path: '/articles/second',
        title: 'Renegade Strategy Guide',
        summary: 'A tactical handbook',
        body: 'Standard discussion of principles without the secret token.',
        taxonomy: 'Governance Tactics',
        status: 'published',
        visibility: 'public',
        publishedAt: '2026-09-01T11:00:00Z',
      },
      {
        id: 'doc-draft',
        siteId: 'site-a',
        path: '/articles/draft',
        title: 'Draft Post',
        body: 'Contains renegade_body_needle_77 but is still a draft.',
        status: 'draft',
        visibility: 'public',
      },
      {
        id: 'doc-future',
        siteId: 'site-a',
        path: '/articles/future',
        title: 'Future Post',
        body: 'Contains renegade_body_needle_77 but is scheduled in future.',
        status: 'published',
        visibility: 'public',
        publishedAt: '2099-01-01T00:00:00Z',
      },
    ]

    it('finds unique phrase present only in body text and highlights the body snippet', () => {
      const search = queryLocalSearch({
        documents: docs,
        query: 'renegade_body_needle_77',
        siteId: 'site-a',
        now: new Date('2026-09-02T00:00:00Z'),
      })

      expect(search.total).toBe(1)
      expect(search.hits[0]!.id).toBe('doc-1')
      expect(search.hits[0]!.path).toBe('/articles/first')
      expect(search.hits[0]!.excerpt).toContain('<mark>renegade_body_needle_77</mark>')
      expect(search.hits[0]!.excerpt).toContain('body prose paragraph')
    })

    it('matches taxonomy keywords', () => {
      const search = queryLocalSearch({
        documents: docs,
        query: 'Governance',
        siteId: 'site-a',
      })
      expect(search.total).toBe(1)
      expect(search.hits[0]!.id).toBe('doc-2')
    })

    it('strictly excludes draft and future-scheduled content from public search', () => {
      const search = queryLocalSearch({
        documents: docs,
        query: 'renegade_body_needle_77',
        siteId: 'site-a',
        now: new Date('2026-09-02T00:00:00Z'),
      })
      const ids = search.hits.map((h) => h.id)
      expect(ids).not.toContain('doc-draft')
      expect(ids).not.toContain('doc-future')
    })

    it('directly highlights excerpt and escapes HTML entities safely', () => {
      const highlighted = highlightExcerpt(
        { body: 'Before <b>tag</b> & needle after' } as SearchDocument,
        'needle',
      )
      expect(highlighted).toContain('<mark>needle</mark>')
      expect(highlighted).toContain('&lt;b&gt;tag&lt;/b&gt;')
    })
  })
})
