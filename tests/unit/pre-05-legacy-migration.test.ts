import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseWxr } from '../../src/modules/portability/legacy-migration/parser'
import { assertSafeOutboundUrl } from '../../src/modules/core/external-boundary'
import { inspectMedia } from '../../src/modules/media/storage'
import { rewireMediaUrls } from '../../src/modules/portability/legacy-migration/media'
import { buildUrlAndRedirectPlan } from '../../src/modules/portability/legacy-migration/urls'
import { reconstructPresentation } from '../../src/modules/portability/legacy-migration/presentation'
import { MemoryLegacyMigrationStore } from '../../src/modules/portability/legacy-migration/store'
import {
  inspectLegacySite,
  dryRunPreflight,
  executeLegacyMigration,
  verifyLegacyMigration,
  activateLegacyMigration,
  rollbackLegacyMigration,
} from '../../src/modules/portability/legacy-migration/pipeline'
import type {
  LegacySitePackage,
  LegacyThemeMapping,
  NormalizedItem,
} from '../../src/modules/portability/legacy-migration/types'

describe('PRE-05 Legacy Site Migration Unit Tests', () => {
  const fixtureDir = path.resolve(__dirname, '../fixtures/legacy-migration')

  async function loadFixtures(): Promise<{
    wxrXml: string
    themeMapping: LegacyThemeMapping
  }> {
    const wxrXml = await readFile(path.join(fixtureDir, 'wordpress-fixture.xml'), 'utf8')
    const mappingRaw = await readFile(path.join(fixtureDir, 'theme-mapping.json'), 'utf8')
    const themeMapping = JSON.parse(mappingRaw) as LegacyThemeMapping
    return { wxrXml, themeMapping }
  }

  describe('1. WXR Parsing & Normalization', () => {
    it('parses realistic WordPress export with posts, pages, authors, taxonomy, media, and menus', async () => {
      const { wxrXml } = await loadFixtures()
      const normalized = parseWxr(wxrXml)

      expect(normalized.site.title).toBe('The Renegade Tribune')
      expect(normalized.site.language).toBe('en-US')

      // Authors
      expect(normalized.authors.length).toBeGreaterThanOrEqual(2)
      const chiefEditor = normalized.authors.find((a) => a.login === 'chief_editor')
      expect(chiefEditor).toBeDefined()
      expect(chiefEditor?.email).toBe('editor@renegadetribune.example')
      expect(chiefEditor?.displayName).toBe('Marcus Vance')

      const sarah = normalized.authors.find((a) => a.login === 'sarah_scribe')
      expect(sarah).toBeDefined()

      // Taxonomy
      expect(normalized.categories.length).toBeGreaterThanOrEqual(3)
      const newsCat = normalized.categories.find((c) => c.slug === 'news')
      expect(newsCat?.name).toBe('News')
      const invCat = normalized.categories.find((c) => c.slug === 'investigative')
      expect(invCat?.parentSlug).toBe('news')

      expect(normalized.tags.length).toBeGreaterThanOrEqual(3)

      // Menus
      expect(normalized.menus.length).toBe(1)
      expect(normalized.menus[0].name).toBe('Main Navigation')
      expect(normalized.menus[0].items.length).toBeGreaterThanOrEqual(4)

      // Content items
      const posts = normalized.items.filter((i) => i.postType === 'post')
      const pages = normalized.items.filter((i) => i.postType === 'page')
      const media = normalized.media

      expect(posts.length).toBeGreaterThanOrEqual(3)
      expect(pages.length).toBeGreaterThanOrEqual(3)
      expect(media.length).toBeGreaterThanOrEqual(1)

      // Post details with SEO
      const censorshipPost = posts.find((p) => p.slug === 'investigating-algorithmic-censorship')
      expect(censorshipPost).toBeDefined()
      expect(censorshipPost?.status).toBe('publish')
      expect(censorshipPost?.seo?.metaTitle).toBe(
        'Investigating Algorithmic Censorship | Special Report',
      )
      expect(censorshipPost?.seo?.metaDescription).toContain(
        'automated systems altering public discourse',
      )
      expect(censorshipPost?.categories).toContain('news')
      expect(censorshipPost?.tags).toContain('freedom')
      expect(censorshipPost?.featuredMediaId).toBe('101')

      // Gutenberg blocks parsed
      expect(censorshipPost?.parsedBlocks.length).toBeGreaterThanOrEqual(3)
      expect(censorshipPost?.parsedBlocks[0].type).toBe('paragraph')
      expect(censorshipPost?.parsedBlocks[1].type).toBe('heading')
    })

    it('extracts SEO metadata accurately from postmeta tags', async () => {
      const { wxrXml } = await loadFixtures()
      const normalized = parseWxr(wxrXml)
      const homePage = normalized.items.find((i) => i.slug === 'home')
      expect(homePage?.seo?.metaTitle).toBe('Home | The Renegade Tribune')
      expect(homePage?.seo?.metaDescription).toBe(
        'Independent investigative journalism and uncensored analysis.',
      )
    })
  })

  describe('2. Unsupported Artifact Handling & Quarantine', () => {
    it('detects shortcodes, plugin blocks, raw scripts, styles, comments, and raw PHP without executing them', async () => {
      const { wxrXml } = await loadFixtures()
      const normalized = parseWxr(wxrXml)

      const allUnsupported = normalized.items.flatMap((i) => i.unsupported)
      expect(allUnsupported.length).toBeGreaterThanOrEqual(6)

      // 1. Raw PHP
      const phpItem = allUnsupported.find((u) => u.kind === 'php-code')
      expect(phpItem).toBeDefined()
      expect(phpItem?.rawSource).toContain('echo "Legacy PHP query execution"')

      // 2. Script
      const scriptItem = allUnsupported.find((u) => u.kind === 'script')
      expect(scriptItem).toBeDefined()
      expect(scriptItem?.rawSource).toContain('Unsafe third-party tracker payload')

      // 3. Style
      const styleItem = allUnsupported.find((u) => u.kind === 'style')
      expect(styleItem).toBeDefined()
      expect(styleItem?.rawSource).toContain('.unsafe-inline-override')

      // 4. Shortcode / Form
      const formItem = allUnsupported.find((u) => u.kind === 'form')
      expect(formItem).toBeDefined()
      expect(formItem?.rawSource).toContain('[contact-form-7')

      const shortcodeItem = allUnsupported.find((u) => u.kind === 'shortcode')
      expect(shortcodeItem).toBeDefined()
      expect(shortcodeItem?.rawSource).toContain('[gallery')

      // 5. Plugin block (WooCommerce)
      const pluginItem = allUnsupported.find(
        (u) => u.kind === 'commerce' || u.kind === 'plugin-block',
      )
      expect(pluginItem).toBeDefined()
      expect(pluginItem?.rawSource).toContain('wp:woocommerce/cart')

      // 6. Comment
      const commentItem = allUnsupported.find((u) => u.kind === 'comment')
      expect(commentItem).toBeDefined()
      expect(commentItem?.rawSource).toContain('comments attached to post')

      // 7. Custom Post Type
      const cptItem = allUnsupported.find((u) => u.kind === 'custom-post-type')
      expect(cptItem).toBeDefined()
      expect(cptItem?.name).toBe('cpt:portfolio_docket')
    })
  })

  describe('3. Safe Media Acquisition & SSRF Protection', () => {
    it('strictly blocks SSRF attempts into private IPv4, IPv6, localhost, and cloud metadata IPs', async () => {
      const privateUrls = [
        'http://localhost/secret.png',
        'http://127.0.0.1/admin.jpg',
        'http://10.0.0.1/internal.png',
        'http://172.16.0.5/photo.jpg',
        'http://192.168.1.1/router.png',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]/test.png',
        'ftp://example.com/file.png',
        'file:///etc/passwd',
      ]

      for (const target of privateUrls) {
        await expect(assertSafeOutboundUrl(target)).rejects.toThrow()
      }

      // A deterministic public DNS answer proves the allow path without making
      // this security test depend on an external resolver or image host.
      const publicUrl = await assertSafeOutboundUrl(
        'https://media.example.test/photo-1500',
        async () => [{ address: '93.184.216.34' }],
      )
      expect(publicUrl.hostname).toBe('media.example.test')
    })

    it('validates MIME types and magic bytes, rejecting masquerading executables or HTML', () => {
      // Valid PNG header: 89 50 4E 47 with 16-byte IHDR
      const validPng = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a, // PNG magic
        0x00,
        0x00,
        0x00,
        0x0d, // IHDR chunk length 13
        0x49,
        0x48,
        0x44,
        0x52, // IHDR
        0x00,
        0x00,
        0x01,
        0x00, // width 256
        0x00,
        0x00,
        0x01,
        0x00, // height 256
        0x08,
        0x06,
        0x00,
        0x00,
        0x00,
      ])
      const pngResult = inspectMedia(validPng)
      expect(pngResult.mimeType).toBe('image/png')
      expect(pngResult.width).toBe(256)
      expect(pngResult.height).toBe(256)
      expect(pngResult.sha256).toBeDefined()

      // Disguised HTML: 3C 21 44 4F (<!DO)
      const fakeImage = new TextEncoder().encode(
        '<!DOCTYPE html><html><script>alert(1)</script></html>',
      )
      expect(() => inspectMedia(fakeImage)).toThrow()

      // Disguised Executable: 4D 5A (MZ)
      const fakeExe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])
      expect(() => inspectMedia(fakeExe)).toThrow()
    })

    it('rewires legacy media URLs to renegade media paths across blocks and HTML', () => {
      const urlMapping = new Map([
        [
          'https://renegadetribune.example/wp-content/uploads/2026/08/tribune-hero.png',
          '/media/asset-101.png',
        ],
      ])

      const rawHtml =
        '<p>Check this image: <img src="https://renegadetribune.example/wp-content/uploads/2026/08/tribune-hero.png" alt="Hero" /></p>'
      const rewired = rewireMediaUrls(rawHtml, urlMapping)
      expect(rewired).toContain('src="/media/asset-101.png"')
      expect(rewired).not.toContain('https://renegadetribune.example')
    })
  })

  describe('4. URL Inventory, Routing & Cycle Detection', () => {
    it('creates URL plans preserving canonical paths and generating 308 redirects for altered paths', async () => {
      const { wxrXml } = await loadFixtures()
      const normalized = parseWxr(wxrXml)
      const planResult = buildUrlAndRedirectPlan(normalized.items, {
        postsBasePath: '/articles',
        pagesBasePath: '',
      })

      expect(planResult.hasCollisions).toBe(false)
      expect(planResult.hasLoops).toBe(false)
      expect(planResult.plan.length).toBeGreaterThanOrEqual(6)

      // Homepage: '/' preserved
      const homePlan = planResult.plan.find((p) => p.canonicalPath === '/')
      expect(homePlan).toBeDefined()
      expect(homePlan?.status).toBe('compatible-direct')

      // About page: '/about-us' preserved
      const aboutPlan = planResult.plan.find((p) => p.canonicalPath === '/about-us')
      expect(aboutPlan).toBeDefined()
      expect(aboutPlan?.status).toBe('compatible-direct')

      // Post: legacy path '/2026/08/investigating-algorithmic-censorship' -> '/articles/investigating-algorithmic-censorship'
      const postPlan = planResult.plan.find(
        (p) => p.canonicalPath === '/articles/investigating-algorithmic-censorship',
      )
      expect(postPlan).toBeDefined()
      expect(postPlan?.status).toBe('needs-redirect')
      expect(postPlan?.statusCode).toBe(308)
    })

    it('detects circular redirect chains before applying any database mutation', () => {
      const cyclicItems: NormalizedItem[] = [
        {
          id: '1',
          postType: 'post',
          title: 'Post 1',
          slug: 'post-2',
          originalUrl: '/articles/post-1',
          publishedAt: '',
          status: 'publish',
          authorLogin: 'admin',
          excerpt: '',
          rawContent: '',
          parsedBlocks: [],
          categories: [],
          tags: [],
          seo: {},
          unsupported: [],
        },
        {
          id: '2',
          postType: 'post',
          title: 'Post 2',
          slug: 'post-1',
          originalUrl: '/articles/post-2',
          publishedAt: '',
          status: 'publish',
          authorLogin: 'admin',
          excerpt: '',
          rawContent: '',
          parsedBlocks: [],
          categories: [],
          tags: [],
          seo: {},
          unsupported: [],
        },
      ]

      const planResult = buildUrlAndRedirectPlan(cyclicItems, { postsBasePath: '/articles' })
      expect(planResult.hasLoops).toBe(true)
      expect(planResult.errors.some((e) => e.code === 'CIRCULAR_REDIRECT_LOOP')).toBe(true)
    })
  })

  describe('5. Presentation Reconstruction', () => {
    it('derives safe design tokens, header/footer globals, templates and draft layouts using only registered components', async () => {
      const { wxrXml, themeMapping } = await loadFixtures()
      const normalized = parseWxr(wxrXml)
      const pages = normalized.items.filter((i) => i.postType === 'page')

      const presentation = reconstructPresentation(
        themeMapping,
        undefined,
        normalized.menus,
        normalized.site,
        pages,
        'neutral-starter',
      )

      // Design tokens
      expect(presentation.themeTokens['canvas']).toBe('#ffffff')
      expect(presentation.themeTokens['brand']).toBe('#1e40af')
      expect(presentation.themeTokens['accent']).toBe('#3b82f6')
      expect(presentation.themeTokens['fontFamily']).toBe('Inter, sans-serif')

      // Header Global
      expect(presentation.header.name).toBe('Global Site Header')
      expect(presentation.header.blocks.length).toBeGreaterThan(0)
      const headerBlock = presentation.header.blocks[0]
      expect(headerBlock.component).toBe('publisher.hero')

      // Footer Global
      expect(presentation.footer.name).toBe('Global Site Footer')
      expect(presentation.footer.blocks.length).toBeGreaterThan(0)

      // Templates
      expect(presentation.templates.length).toBe(3)
      const postTemplate = presentation.templates.find((t) => t.targetType === 'post')
      const pageTemplate = presentation.templates.find((t) => t.targetType === 'page')
      const archiveTemplate = presentation.templates.find((t) => t.targetType === 'archive')

      expect(postTemplate).toBeDefined()
      expect(pageTemplate).toBeDefined()
      expect(archiveTemplate).toBeDefined()

      // Reconstructed Pages
      expect(presentation.pages.length).toBeGreaterThanOrEqual(3)
      for (const layout of presentation.pages) {
        expect(layout.templateMode).toBe('inherited')
        expect(
          layout.blocks.every(
            (b) => b.component.startsWith('publisher.') || b.component === 'prose',
          ),
        ).toBe(true)
      }
    })
  })

  describe('6. Full Pipeline: Inspect, Preflight, Execute, Verify, Activate, Rollback', () => {
    it('executes full pipeline idempotently and rolls back cleanly in memory store', async () => {
      const { wxrXml, themeMapping } = await loadFixtures()
      const pkg: LegacySitePackage = {
        wxr: wxrXml,
        themeMapping,
      }
      const store = new MemoryLegacyMigrationStore()
      const options = {
        actorId: 'operator-1',
        newSiteName: 'Migrated Renegade Tribune',
        newSiteSlug: 'renegade-tribune',
        remoteMediaDownloadAllowed: false, // Disallowed in test
      }

      // Stage 1: Inspect
      const inspectReport = inspectLegacySite(pkg)
      expect(inspectReport.valid).toBe(true)
      expect(inspectReport.summary.posts).toBeGreaterThanOrEqual(3)
      expect(inspectReport.summary.pages).toBeGreaterThanOrEqual(3)
      expect(inspectReport.summary.authors).toBeGreaterThanOrEqual(2)
      expect(inspectReport.summary.categories).toBeGreaterThanOrEqual(3)
      expect(inspectReport.summary.tags).toBeGreaterThanOrEqual(3)
      expect(inspectReport.detectedUnsupportedCount).toBeGreaterThanOrEqual(6)

      // Stage 2: Dry Run / Preflight
      const preflight = await dryRunPreflight(pkg, store, options)
      expect(preflight.stage).toBe('dry-run')
      expect(preflight.reconciliation.created.content).toBeGreaterThanOrEqual(6)
      expect(preflight.quarantine.length).toBeGreaterThanOrEqual(6)
      expect(preflight.redirectPlan.length).toBeGreaterThanOrEqual(6)
      expect(preflight.sideBySide.length).toBeGreaterThanOrEqual(6)

      // Stage 3: Execute into new isolated site
      const executed = await executeLegacyMigration(pkg, store, options)
      expect(executed.stage).toBe('imported')
      expect(executed.siteId).toBeDefined()
      expect(executed.createdEntityIds.contentIds.length).toBeGreaterThanOrEqual(6)
      expect(executed.createdEntityIds.authorIds.length).toBeGreaterThanOrEqual(2)
      expect(executed.createdEntityIds.layoutIds.length).toBeGreaterThanOrEqual(3)
      expect(executed.quarantine.length).toBeGreaterThanOrEqual(6)

      // Verify store state
      const foundSite = await store.findSite(executed.siteId)
      expect(foundSite).toBeDefined()
      expect(store.content.size).toBeGreaterThanOrEqual(6)
      expect(store.layouts.size).toBeGreaterThanOrEqual(3)
      const quarantineRecords = await store.getQuarantineRecords(executed.runId)
      expect(quarantineRecords.length).toBeGreaterThanOrEqual(6)

      // Confirm all imported layouts are strictly DRAFT
      for (const layout of store.layouts.values()) {
        expect(layout.status).toBe('draft')
      }

      // Stage 4: Verify
      const verified = await verifyLegacyMigration(executed.runId, store)
      expect(verified.stage).toBe('verified')
      expect(verified.acceptanceChecklist.urlsAndRedirectsLoopFree).toBe(true)
      expect(verified.acceptanceChecklist.contentCountsMatch).toBe(true)
      expect(verified.acceptanceChecklist.renderedTemplatesValid).toBe(true)
      expect(verified.acceptanceChecklist.themeSafeNoArbitraryExec).toBe(true)

      // Stage 5: Deliberate Activation
      const activated = await activateLegacyMigration(executed.runId, store, 'operator-1')
      expect(activated.stage).toBe('activated')
      expect(activated.activatedAt).toBeDefined()

      // Confirm layouts are now published upon deliberate activation
      for (const layout of store.layouts.values()) {
        expect(layout.status).toBe('published')
      }

      // Stage 6: Rollback
      const rolledBack = await rollbackLegacyMigration(executed.runId, store, 'operator-1')
      expect(rolledBack.stage).toBe('rolled-back')
      expect(await store.findSite(executed.siteId)).toBeNull()
      expect(store.content.size).toBe(0)
      expect(store.layouts.size).toBe(0)
    })
  })
})
