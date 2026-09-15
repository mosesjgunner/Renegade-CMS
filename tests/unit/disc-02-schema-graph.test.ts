import { describe, expect, it } from 'vitest'
import {
  composeSchemaGraph,
  serializeJsonLd,
  schemaIdentityId,
  schemaWebSiteId,
  schemaWebPageId,
  schemaBreadcrumbId,
  schemaPersonId,
  globalSchemaRegistry,
  type SchemaSiteIdentityInput,
  type SchemaTypeExtension,
  type BreadcrumbListNode,
} from '../../src/modules/public/schema'
import { toSchemaSiteIdentity } from '../../src/modules/public/discovery'
import type { ResolvedSiteSettings } from '../../src/modules/core/site-settings'

const baseSettings: ResolvedSiteSettings = {
  siteName: 'Renegade Press',
  siteDescription: 'Independent investigative journal',
  canonicalOrigin: 'https://renegade.test',
  canonicalOriginsBySite: {},
  locale: 'en',
  timezone: 'UTC',
  logoId: 'media-logo-1',
  logoUrl: '/media/media-logo-1',
  defaultSocialImageId: 'media-social-1',
  defaultSocialImageUrl: '/media/media-social-1',
  footerText: '© 2026 Renegade',
  indexingMode: 'index',
  launchState: 'live',
  discoveryDefaults: {},
  homepageSelection: { mode: 'default' },
  ownerKind: 'organization',
  organizationName: 'Renegade Press Org',
  legalName: 'Renegade Press Inc.',
  sameAs: ['https://twitter.com/renegadepress', 'https://github.com/renegadepress'],
  searchAction: { enabled: true },
}

const mockSiteIdentity: SchemaSiteIdentityInput = toSchemaSiteIdentity(
  baseSettings,
  'https://renegade.test',
)

describe('DISC-02 Schema-First Graph Registry & Engine', () => {
  // -----------------------------------------------------------------------------------------------
  // 1. TYPED SCHEMA NODES & COHERENT GRAPH LINKAGE
  // -----------------------------------------------------------------------------------------------
  describe('1. Coherent Graph & Stable @id References', () => {
    it('composes a coherent schema graph for Home page with Organization identity', () => {
      const { graph, validation } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/',
        canonicalPath: '/',
        base: 'https://renegade.test',
        contentType: 'home',
        title: 'Renegade Press',
        description: 'Independent investigative journal',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: true,
      })

      expect(graph['@context']).toBe('https://schema.org')
      expect(graph['@type']).toBe('WebSite')
      expect(validation.eligible).toBe(true)
      expect(validation.primaryType).toBe('WebSite')

      const nodes = graph['@graph']
      expect(nodes.length).toBeGreaterThanOrEqual(4)

      // WebSite node
      const websiteNode = nodes.find((n) => n['@type'] === 'WebSite')
      expect(websiteNode).toBeDefined()
      expect(websiteNode!['@id']).toBe(schemaWebSiteId('https://renegade.test'))
      expect(websiteNode!.publisher).toEqual({
        '@id': schemaIdentityId('https://renegade.test'),
      })

      // Organization identity node
      const identityNode = nodes.find((n) => n['@type'] === 'Organization')
      expect(identityNode).toBeDefined()
      expect(identityNode!['@id']).toBe(schemaIdentityId('https://renegade.test'))
      expect(identityNode!.name).toBe('Renegade Press Org')
      expect(identityNode!.legalName).toBe('Renegade Press Inc.')

      // WebPage node
      const webpageNode = nodes.find((n) => n['@type'] === 'WebPage')
      expect(webpageNode).toBeDefined()
      expect(webpageNode!['@id']).toBe(schemaWebPageId('https://renegade.test/'))
      expect(webpageNode!.isPartOf).toEqual({
        '@id': schemaWebSiteId('https://renegade.test'),
      })
      expect(webpageNode!.breadcrumb).toEqual({
        '@id': schemaBreadcrumbId('https://renegade.test/'),
      })

      // BreadcrumbList node
      const breadcrumbNode = nodes.find((n) => n['@type'] === 'BreadcrumbList')
      expect(breadcrumbNode).toBeDefined()
      expect(breadcrumbNode!['@id']).toBe(schemaBreadcrumbId('https://renegade.test/'))
    })

    it('emits Person identity node when ownerKind is person', () => {
      const personSettings: ResolvedSiteSettings = {
        ...baseSettings,
        ownerKind: 'person',
        personName: 'Moses Gunner',
      }
      const personIdentity = toSchemaSiteIdentity(personSettings, 'https://renegade.test')

      const { graph } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/',
        canonicalPath: '/',
        base: 'https://renegade.test',
        contentType: 'home',
        title: 'Moses Gunner',
        site: personIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: true,
      })

      const identityNode = graph['@graph'].find((n) => n['@id'] === schemaIdentityId('https://renegade.test'))
      expect(identityNode).toBeDefined()
      expect(identityNode!['@type']).toBe('Person')
      expect(identityNode!.name).toBe('Moses Gunner')
    })

    it('emits interconnected Article, Person author, ImageObject, and WebPage nodes without duplicates', () => {
      const { graph, validation } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/investigation-into-dark-money',
        canonicalPath: '/articles/investigation-into-dark-money',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Investigation into Dark Money',
        description: 'An in-depth probe into offshore financial vehicles.',
        site: mockSiteIdentity,
        breadcrumbs: [
          { name: 'Home', url: 'https://renegade.test/' },
          { name: 'Articles', url: 'https://renegade.test/articles' },
          {
            name: 'Investigation into Dark Money',
            url: 'https://renegade.test/articles/investigation-into-dark-money',
          },
        ],
        author: { name: 'Jane Doe', url: 'https://renegade.test/authors/jane-doe' },
        image: {
          url: 'https://renegade.test/media/dark-money-hero.jpg',
          alt: 'Vault illustration',
        },
        dates: {
          publishedAt: '2026-06-01T12:00:00.000Z',
          modifiedAt: '2026-06-02T15:30:00.000Z',
        },
        taxonomy: {
          categories: ['Investigations'],
          tags: ['Finance', 'Transparency'],
        },
        indexable: true,
      })

      expect(validation.eligible).toBe(true)
      expect(validation.primaryType).toBe('Article')

      const articleNode = graph['@graph'].find((n) => n['@type'] === 'Article')
      expect(articleNode).toBeDefined()
      expect(articleNode!.headline).toBe('Investigation into Dark Money')
      expect(articleNode!.datePublished).toBe('2026-06-01T12:00:00.000Z')
      expect(articleNode!.dateModified).toBe('2026-06-02T15:30:00.000Z')
      expect(articleNode!.articleSection).toBe('Investigations')
      expect(articleNode!.keywords).toBe('Finance, Transparency')

      // Stable cross-reference integrity
      const expectedAuthorId = schemaPersonId(
        'https://renegade.test/authors/jane-doe',
        'Jane Doe',
        'https://renegade.test',
      )
      expect(articleNode!.author).toEqual({ '@id': expectedAuthorId })

      const expectedImageId = `${articleNode!['@id'].replace(/#article$/, '')}#primaryimage`
      expect(articleNode!.image).toEqual({ '@id': expectedImageId })
      expect(articleNode!.publisher).toEqual({
        '@id': schemaIdentityId('https://renegade.test'),
      })
      expect(articleNode!.mainEntityOfPage).toEqual({
        '@id': schemaWebPageId('https://renegade.test/articles/investigation-into-dark-money'),
      })

      // Auxiliary nodes present and match references
      const personNode = graph['@graph'].find((n) => n['@type'] === 'Person' && n['@id'] === expectedAuthorId)
      expect(personNode).toBeDefined()
      expect(personNode!.name).toBe('Jane Doe')

      const imageNode = graph['@graph'].find((n) => n['@type'] === 'ImageObject' && n['@id'] === expectedImageId)
      expect(imageNode).toBeDefined()
      expect(imageNode!.url).toBe('https://renegade.test/media/dark-money-hero.jpg')
      expect(imageNode!.caption).toBe('Vault illustration')

      // WebPage links to primary image and main entity
      const webPageNode = graph['@graph'].find((n) => n['@type'] === 'WebPage')
      expect(webPageNode!.primaryImageOfPage).toEqual({ '@id': expectedImageId })
      expect(webPageNode!.mainEntity).toEqual({ '@id': articleNode!['@id'] })
    })

    it('ensures all @id values in the graph are unique', () => {
      const { graph } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/unique-ids-test',
        canonicalPath: '/articles/unique-ids-test',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Testing Unique IDs',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        author: { name: 'Alice Editor' },
        image: { url: 'https://renegade.test/media/alice.jpg' },
        indexable: true,
      })

      const ids = graph['@graph'].map((n) => n['@id'])
      const uniqueIds = new Set(ids)
      expect(ids.length).toBe(uniqueIds.size)
    })
  })

  // -----------------------------------------------------------------------------------------------
  // 2. EXPLICIT FACT MAPPING (NO INVENTED FACTS)
  // -----------------------------------------------------------------------------------------------
  describe('2. Strict Content Fact Fidelity (No Invention)', () => {
    it('does NOT invent ratings, prices, or offers when absent', () => {
      const { graph } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/no-invented-facts',
        canonicalPath: '/articles/no-invented-facts',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Honest Reporting',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: true,
      })

      const jsonString = JSON.stringify(graph)
      expect(jsonString).not.toContain('aggregateRating')
      expect(jsonString).not.toContain('Review')
      expect(jsonString).not.toContain('offers')
      expect(jsonString).not.toContain('price')
    })

    it('does NOT invent an author person node when none is provided in content', () => {
      const { graph } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/anonymous-dispatch',
        canonicalPath: '/articles/anonymous-dispatch',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Anonymous Dispatch',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        author: null,
        indexable: true,
      })

      const articleNode = graph['@graph'].find((n) => n['@type'] === 'Article')
      expect(articleNode!.author).toBeUndefined()

      // The only Person node could be site identity (if ownerKind was person), but here ownerKind is organization
      const personNodes = graph['@graph'].filter((n) => n['@type'] === 'Person')
      expect(personNodes.length).toBe(0)
    })

    it('does NOT invent dates when none are provided', () => {
      const { graph } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/undated-piece',
        canonicalPath: '/articles/undated-piece',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Undated Piece',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        dates: undefined,
        indexable: true,
      })

      const articleNode = graph['@graph'].find((n) => n['@type'] === 'Article')
      expect(articleNode!.datePublished).toBeUndefined()
      expect(articleNode!.dateModified).toBeUndefined()
    })

    it('does NOT invent transcript in podcast episode if none is provided in facts', () => {
      const { graph } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/podcasts/episodes/no-transcript-ep',
        canonicalPath: '/podcasts/episodes/no-transcript-ep',
        base: 'https://renegade.test',
        contentType: 'podcast-episode',
        title: 'Episode Without Transcript',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        audio: { url: 'https://renegade.test/media/ep.mp3' },
        podcastEpisode: { transcriptText: undefined },
        indexable: true,
      })

      const epNode = graph['@graph'].find((n) => n['@type'] === 'PodcastEpisode')
      expect(epNode!.transcript).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------------------------------
  // 3. VALIDATION, ELIGIBILITY & DETERMINISTIC FALLBACKS
  // -----------------------------------------------------------------------------------------------
  describe('3. Validation Rules, Eligibility & Deterministic Fallbacks', () => {
    it('falls back to WebPage when an Article is missing its required title', () => {
      const { graph, validation } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/empty-title',
        canonicalPath: '/articles/empty-title',
        base: 'https://renegade.test',
        contentType: 'article',
        title: '',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: true,
      })

      expect(validation.eligible).toBe(false)
      expect(validation.primaryType).toBe('Article')
      expect(validation.fallbackType).toBe('WebPage')
      expect(validation.eligibilityReason).toBe('fallback_to_webpage')
      expect(validation.validationIssues.length).toBeGreaterThan(0)
      expect(validation.validationIssues[0].repairField).toBe('title')

      // Graph should emit WebPage rather than an incomplete Article
      expect(graph['@type']).toBe('WebPage')
      const articleNode = graph['@graph'].find((n) => n['@type'] === 'Article')
      expect(articleNode).toBeUndefined()
      const webPageNode = graph['@graph'].find((n) => n['@type'] === 'WebPage')
      expect(webPageNode).toBeDefined()
    })

    it('falls back to WebPage when a VideoObject is missing required uploadDate', () => {
      const { graph, validation } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/videos/missing-date',
        canonicalPath: '/videos/missing-date',
        base: 'https://renegade.test',
        contentType: 'video',
        title: 'Documentary Footage',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        video: { contentUrl: 'https://renegade.test/videos/doc.mp4' },
        dates: undefined,
        videoDetails: { uploadDate: undefined },
        indexable: true,
      })

      expect(validation.eligible).toBe(false)
      expect(validation.primaryType).toBe('VideoObject')
      expect(validation.fallbackType).toBe('WebPage')
      expect(graph['@type']).toBe('WebPage')
      expect(graph['@graph'].find((n) => n['@type'] === 'VideoObject')).toBeUndefined()
    })

    it('keeps PodcastEpisode eligible when audio is missing but logs a repairable warning issue', () => {
      const { validation } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/podcasts/episodes/ep-no-audio',
        canonicalPath: '/podcasts/episodes/ep-no-audio',
        base: 'https://renegade.test',
        contentType: 'podcast-episode',
        title: 'Teaser Episode',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: true,
      })

      // Retains PodcastEpisode since title is valid, but issues warning
      expect(validation.primaryType).toBe('PodcastEpisode')
      const warningIssue = validation.validationIssues.find((i) => i.field === 'associatedMedia')
      expect(warningIssue).toBeDefined()
      expect(warningIssue!.severity).toBe('warning')
      expect(warningIssue!.repairField).toBe('audio')
    })
  })

  // -----------------------------------------------------------------------------------------------
  // 4. BREADCRUMBS DRIVEN BY CANONICAL HIERARCHY
  // -----------------------------------------------------------------------------------------------
  describe('4. BreadcrumbList Hierarchy Mapping', () => {
    it('builds canonical hierarchical breadcrumbs for nested pages', () => {
      const { graph } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/docs/operations/hosting',
        canonicalPath: '/docs/operations/hosting',
        base: 'https://renegade.test',
        contentType: 'page',
        title: 'Hosting Guide',
        site: mockSiteIdentity,
        breadcrumbs: [
          { name: 'Home', url: 'https://renegade.test/' },
          { name: 'Docs', url: 'https://renegade.test/docs' },
          { name: 'Operations', url: 'https://renegade.test/docs/operations' },
          { name: 'Hosting Guide', url: 'https://renegade.test/docs/operations/hosting' },
        ],
        indexable: true,
      })

      const crumbList = graph['@graph'].find((n) => n['@type'] === 'BreadcrumbList')
      expect(crumbList).toBeDefined()
      const items = (crumbList as BreadcrumbListNode).itemListElement
      expect(items).toHaveLength(4)
      expect(items[0]).toEqual({
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://renegade.test/',
      })
      expect(items[3]).toEqual({
        '@type': 'ListItem',
        position: 4,
        name: 'Hosting Guide',
        item: 'https://renegade.test/docs/operations/hosting',
      })
    })

    it('builds podcast show -> episode breadcrumb hierarchy', () => {
      const { graph } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/podcasts/episodes/ep-42',
        canonicalPath: '/podcasts/episodes/ep-42',
        base: 'https://renegade.test',
        contentType: 'podcast-episode',
        title: 'Episode 42: The Verdict',
        site: mockSiteIdentity,
        breadcrumbs: [
          { name: 'Home', url: 'https://renegade.test/' },
          { name: 'Underground Wire', url: 'https://renegade.test/podcasts/underground-wire' },
          { name: 'Episode 42: The Verdict', url: 'https://renegade.test/podcasts/episodes/ep-42' },
        ],
        podcastEpisode: {
          showSlug: 'underground-wire',
          showTitle: 'Underground Wire',
          episodeNumber: 42,
        },
        indexable: true,
      })

      const crumbList = graph['@graph'].find((n) => n['@type'] === 'BreadcrumbList')
      const items = (crumbList as BreadcrumbListNode).itemListElement
      expect(items).toHaveLength(3)
      expect(items[1].name).toBe('Underground Wire')
      expect(items[1].item).toBe('https://renegade.test/podcasts/underground-wire')
    })
  })

  // -----------------------------------------------------------------------------------------------
  // 5. ADMIN SCHEMA INSPECTION MODEL
  // -----------------------------------------------------------------------------------------------
  describe('5. Admin Schema Inspection Model', () => {
    it('produces structured inspection model with source field mappings and repair targets', () => {
      const { inspection } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/field-mapping-test',
        canonicalPath: '/articles/field-mapping-test',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Tax Evasion Exposed',
        description: 'Exclusive documents reveal widespread evasion.',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        author: { name: 'Bob Reporter' },
        image: { url: 'https://renegade.test/media/evasion.jpg', alt: 'Court documents' },
        dates: { publishedAt: '2026-07-01T00:00:00Z' },
        indexable: true,
      })

      expect(inspection.eligible).toBe(true)
      expect(inspection.primaryType).toBe('Article')

      const primaryNode = inspection.nodes.find((n) => n.role === 'primary')
      expect(primaryNode).toBeDefined()
      expect(primaryNode!.type).toBe('Article')

      // Check field source mappings
      const headlineField = primaryNode!.fields.find((f) => f.field === 'headline')
      expect(headlineField).toBeDefined()
      expect(headlineField!.sourceField).toBe('title')
      expect(headlineField!.value).toBe('Tax Evasion Exposed')

      const dateField = primaryNode!.fields.find((f) => f.field === 'datePublished')
      expect(dateField).toBeDefined()
      expect(dateField!.sourceField).toBe('publishedAt')

      const authorField = primaryNode!.fields.find((f) => f.field === 'author')
      expect(authorField).toBeDefined()
      expect(authorField!.sourceField).toBe('authors')
    })
  })

  // -----------------------------------------------------------------------------------------------
  // 6. EXTENSION API FOR CUSTOM TYPES & PLUGINS
  // -----------------------------------------------------------------------------------------------
  describe('6. Schema Extension API Security & Validation', () => {
    it('prohibits overriding core reserved types without core credentials', () => {
      const rogueExtension: SchemaTypeExtension = {
        id: 'third-party-plugin',
        targetContentType: 'article',
        primarySchemaType: 'NewsArticle',
        requiredFields: ['headline'],
        buildNodes: () => [],
      }

      expect(() => globalSchemaRegistry.register(rogueExtension)).toThrow(
        /Cannot override reserved core content type/i,
      )
    })

    it('detects conflicting extensions for the same target content type', () => {
      const ext1: SchemaTypeExtension = {
        id: 'plugin-books-alpha',
        targetContentType: 'book-review',
        primarySchemaType: 'Review',
        requiredFields: ['name'],
        buildNodes: () => [],
      }
      const ext2: SchemaTypeExtension = {
        id: 'plugin-books-beta',
        targetContentType: 'book-review',
        primarySchemaType: 'Review',
        requiredFields: ['name'],
        buildNodes: () => [],
      }

      globalSchemaRegistry.register(ext1)
      expect(() => globalSchemaRegistry.register(ext2)).toThrow(/Conflicting schema extension/i)
      globalSchemaRegistry.unregister('book-review')
    })

    it('validates extension node @id canonical origin and strips prototype pollution / script injection', () => {
      const testExtension: SchemaTypeExtension = {
        id: 'plugin-events-safe',
        targetContentType: 'press-conference',
        primarySchemaType: 'Event',
        requiredFields: ['name', 'startDate'],
        buildNodes: (ctx) => [
          {
            '@type': 'Event',
            '@id': `${ctx.base}/events/conf-1#event`,
            name: 'Press Conference <script>alert("hacked")</script>',
            url: `${ctx.base}/events/conf-1`,
            description: 'Conference details',
            // Attempt prototype pollution
            __proto__: { polluted: true },
          },
          // Attempt foreign origin ID injection
          {
            '@type': 'Place',
            '@id': 'https://evil-site.com/places/fake#place',
            name: 'Foreign Place',
          },
        ],
      }

      globalSchemaRegistry.register(testExtension)

      const result = globalSchemaRegistry.buildExtensionNodes('press-conference', {
        canonicalUrl: 'https://renegade.test/events/conf-1',
        canonicalPath: '/events/conf-1',
        base: 'https://renegade.test',
        record: {},
        site: mockSiteIdentity,
      })

      // The valid node was accepted with sanitized string and stripped script tags
      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0]['@type']).toBe('Event')
      expect(result.nodes[0]['name']).toBe('Press Conference ')
      expect((result.nodes[0] as Record<string, unknown>).polluted).toBeUndefined()

      // The foreign origin node was rejected with validation error issue
      expect(result.issues.some((i) => i.message.includes('must belong to canonical origin'))).toBe(
        true,
      )

      globalSchemaRegistry.unregister('press-conference')
    })
  })

  // -----------------------------------------------------------------------------------------------
  // 7. SAFE SERIALIZATION (SCRIPT TERMINATION PREVENTION)
  // -----------------------------------------------------------------------------------------------
  describe('7. Safe JSON-LD Serialization', () => {
    it('escapes script closing tags, ampersands, angle brackets, and unicode line separators', () => {
      const maliciousData = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Attack </script><script>alert("injection")</script>',
        description: 'Line with \u2028 and paragraph \u2029 separators & <test>',
      }

      const serialized = serializeJsonLd(maliciousData)

      // Must never contain literal </script>
      expect(serialized).not.toContain('</script>')
      expect(serialized).toContain('\\u003c/script\\u003e')
      expect(serialized).toContain('\\u0026')
      expect(serialized).toContain('\\u2028')
      expect(serialized).toContain('\\u2029')

      // Must cleanly parse back to valid JSON identical in data content
      const parsed = JSON.parse(serialized)
      expect(parsed['@type']).toBe('Article')
      expect(parsed.headline).toContain('Attack </script><script>alert("injection")</script>')
    })
  })

  // -----------------------------------------------------------------------------------------------
  // 8. LIFECYCLE INVARIANCE: NOINDEX, IMAGE REPLACEMENT, SLUG CHANGE, THEME SWITCH
  // -----------------------------------------------------------------------------------------------
  describe('8. Lifecycle Invariants', () => {
    it('marks noindex and private pages as ineligible for rich snippets', () => {
      const { validation } = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/private-draft',
        canonicalPath: '/articles/private-draft',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Draft in Progress',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: false,
      })

      expect(validation.eligible).toBe(false)
      expect(validation.eligibilityReason).toBe('noindex_directive')
    })

    it('updates image nodes and references consistently on image replacement', () => {
      const oldDoc = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/test-image-swap',
        canonicalPath: '/articles/test-image-swap',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Image Test',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        image: { url: 'https://renegade.test/media/image-1.jpg' },
        indexable: true,
      })

      const newDoc = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/test-image-swap',
        canonicalPath: '/articles/test-image-swap',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Image Test',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        image: { url: 'https://renegade.test/media/image-2.jpg' },
        indexable: true,
      })

      const oldImage = oldDoc.graph['@graph'].find((n) => n['@type'] === 'ImageObject')
      const newImage = newDoc.graph['@graph'].find((n) => n['@type'] === 'ImageObject')

      expect(oldImage!.url).toBe('https://renegade.test/media/image-1.jpg')
      expect(newImage!.url).toBe('https://renegade.test/media/image-2.jpg')
      // @id convention remains stable
      expect(oldImage!['@id']).toBe(newImage!['@id'])
    })

    it('updates canonical URLs and entity @ids coherently when slug changes', () => {
      const docSlug1 = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/first-slug',
        canonicalPath: '/articles/first-slug',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Slug Change Article',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: true,
      })

      const docSlug2 = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/second-slug',
        canonicalPath: '/articles/second-slug',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Slug Change Article',
        site: mockSiteIdentity,
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: true,
      })

      const article1 = docSlug1.graph['@graph'].find((n) => n['@type'] === 'Article')
      const article2 = docSlug2.graph['@graph'].find((n) => n['@type'] === 'Article')

      expect(article1!['@id']).toBe('https://renegade.test/articles/first-slug#article')
      expect(article2!['@id']).toBe('https://renegade.test/articles/second-slug#article')
      expect(article1!.mainEntityOfPage).toEqual({
        '@id': 'https://renegade.test/articles/first-slug#webpage',
      })
      expect(article2!.mainEntityOfPage).toEqual({
        '@id': 'https://renegade.test/articles/second-slug#webpage',
      })
    })

    it('maintains schema graph invariance when switching presentation themes', () => {
      // Theme changes affect CSS/presentation tokens, but canonical schema facts remain invariant
      const editorialSettings: ResolvedSiteSettings = {
        ...baseSettings,
        themeId: 'editorial',
      }
      const brutalistSettings: ResolvedSiteSettings = {
        ...baseSettings,
        themeId: 'brutalist',
      }

      const docEditorial = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/theme-invariance',
        canonicalPath: '/articles/theme-invariance',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Theme Invariance Test',
        site: toSchemaSiteIdentity(editorialSettings, 'https://renegade.test'),
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: true,
      })

      const docBrutalist = composeSchemaGraph({
        canonicalUrl: 'https://renegade.test/articles/theme-invariance',
        canonicalPath: '/articles/theme-invariance',
        base: 'https://renegade.test',
        contentType: 'article',
        title: 'Theme Invariance Test',
        site: toSchemaSiteIdentity(brutalistSettings, 'https://renegade.test'),
        breadcrumbs: [{ name: 'Home', url: 'https://renegade.test/' }],
        indexable: true,
      })

      // Structural and semantic identity match identically across themes
      expect(docEditorial.graph).toEqual(docBrutalist.graph)
      expect(docEditorial.validation).toEqual(docBrutalist.validation)
    })
  })
})
