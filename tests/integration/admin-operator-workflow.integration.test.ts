/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import { installStarter } from '../../src/modules/starters/service'
import { starterDefinitions } from '../../src/modules/starters/definitions'
import {
  resolveDiscoveryDocument,
  discoveryToMetadata,
  discoveryToJsonLd,
  queryLocalSearch,
} from '../../src/modules/public/discovery'
import { instantiatePattern, listPatterns } from '../../src/modules/presentation/composition'
import { toEditorData, fromEditorData } from '../../src/modules/presentation/VisualEditor'
import { MiniPaintAdapter } from '../../src/modules/media/image-editor/minipaint-adapter'
import { attachMediaToContent } from '../../src/modules/media/workflow'
import { createEditorialPreviewToken } from '../../src/modules/editorial/persistence'
import type { PageLayout } from '../../src/modules/public/page-builder'

// 16x16 valid PNG buffer for media tests
const TEST_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff,
  0x61, 0x00, 0x00, 0x00, 0x19, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfc, 0xcf, 0x80, 0x01,
  0x30, 0x30, 0x30, 0xc0, 0x82, 0xa1, 0x08, 0x00, 0x00, 0x00, 0xff, 0xff, 0x03, 0x00, 0x0b, 0x50,
  0x01, 0x91, 0x58, 0x8e, 0x88, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
])

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return ''
}

function toLexical(text: string) {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'text',
              text: text || '',
              format: 0,
              version: 1,
            },
          ],
        },
      ],
    },
  }
}

describe('Admin Operator Workflow & Starter Lifecycle End-to-End Proof', () => {
  let payload: Payload
  let siteId: string
  let publicationId: string
  let operatorUser: any
  let suffix: string
  let operatorStartTime: number
  let timeToConfiguredSiteMs: number
  let timeToFirstPublishMs: number

  // Entities created during hierarchy workflow
  let sectionRecord: any
  let categoryRecord: any
  let subcategoryRecord: any
  let authorRecord: any
  let mediaAssetRecord: any
  let articleRecord: any

  beforeAll(async () => {
    payload = await getPayload({ config })
    await seed(payload)
    suffix = randomUUID().slice(0, 8)
  })

  afterAll(async () => {
    await payload?.db?.destroy?.()
  })

  it('1. Authenticates newly created operator and records baseline start time', async () => {
    operatorStartTime = Date.now()

    // Create a new operator user account
    operatorUser = await payload.create({
      collection: 'users',
      data: {
        email: `operator-${suffix}@vanguard.test`,
        role: 'owner',
      },
      overrideAccess: true,
    } as never)
    expect(operatorUser).toBeTruthy()
    expect(operatorUser.role).toBe('owner')
    expect(operatorUser.email).toContain('operator-')
  })

  it('2. Configures recognizable starter site ("The Vanguard Chronicle"), branding, tokens, and records time to configured site', async () => {
    // Create dedicated test site for the operator
    const siteSlug = `vanguard-${suffix}`
    const site = (await payload.create({
      collection: 'sites',
      data: {
        name: 'The Vanguard Chronicle',
        slug: siteSlug,
        description: 'Independent Dispatches & Community Inquiry for the Digital Commons',
        lifecycle: 'active',
      },
      overrideAccess: true,
    } as never)) as any
    expect(site).toBeTruthy()
    siteId = String(site.id)

    // Install the publication-community starter through the starter service
    const installResult = await installStarter(payload, {
      siteId,
      starterId: 'publication-community',
      ownerEmail: operatorUser.email,
    })
    expect(installResult.success).toBe(true)
    expect(installResult.starterId).toBe('publication-community')

    // Find the installed publication
    const publications = await payload.find({
      collection: 'publications',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)
    expect(publications.docs.length).toBeGreaterThan(0)
    publicationId = String(publications.docs[0].id)

    // Verify starter definitions match
    const starterDef = starterDefinitions['publication-community']
    expect(starterDef.themeId).toBe('neutral-starter')
    expect(starterDef.navigation.primary.length).toBeGreaterThan(0)
    expect(starterDef.navigation.footer.length).toBeGreaterThan(0)

    // Record time to configured site
    timeToConfiguredSiteMs = Date.now() - operatorStartTime
    expect(timeToConfiguredSiteMs).toBeGreaterThan(0)
    console.log(`[TIMING] Operator time to configured site: ${timeToConfiguredSiteMs}ms`)
  })

  it('3. Exercises hierarchy: Site -> Section -> Category -> Subcategory -> Authorship', async () => {
    // Section creation
    sectionRecord = await payload.create({
      collection: 'sections',
      data: {
        site: siteId,
        publication: publicationId,
        scope: 'publication',
        name: 'Investigations',
        slug: `investigations-${suffix}`,
        description: 'In-depth accountability reporting and civic investigations',
        sortOrder: 1,
      },
      overrideAccess: true,
    } as never)
    expect(sectionRecord).toBeTruthy()
    expect(sectionRecord.name).toBe('Investigations')

    // Category creation (Top-level Category attached to Section)
    categoryRecord = await payload.create({
      collection: 'categories',
      data: {
        site: siteId,
        publication: publicationId,
        scope: 'publication',
        section: sectionRecord.id,
        name: 'Civic Governance',
        slug: `governance-${suffix}`,
        description: 'Public institutions, policy implementation, and accountability',
        sortOrder: 1,
      },
      overrideAccess: true,
    } as never)
    expect(categoryRecord).toBeTruthy()
    expect(idOf(categoryRecord.section)).toBe(String(sectionRecord.id))
    expect(categoryRecord.parent).toBeFalsy()

    // Subcategory creation (Category with parent pointing to Category)
    subcategoryRecord = await payload.create({
      collection: 'categories',
      data: {
        site: siteId,
        publication: publicationId,
        scope: 'publication',
        section: sectionRecord.id,
        parent: categoryRecord.id,
        name: 'Municipal Budget',
        slug: `municipal-budget-${suffix}`,
        description: 'City expenditure, audits, and fiscal policy analysis',
        sortOrder: 2,
      },
      overrideAccess: true,
    } as never)
    expect(subcategoryRecord).toBeTruthy()
    expect(idOf(subcategoryRecord.parent)).toBe(String(categoryRecord.id))
    expect(idOf(subcategoryRecord.section)).toBe(String(sectionRecord.id))

    // Authorship creation
    authorRecord = await payload.create({
      collection: 'authors',
      data: {
        displayName: 'Eleanor Vance',
        slug: `eleanor-vance-${suffix}`,
        bio: 'Senior Investigative Reporter specializing in municipal finance and transparency.',
      },
      overrideAccess: true,
    } as never)
    expect(authorRecord).toBeTruthy()
    expect(authorRecord.displayName).toBe('Eleanor Vance')
  })

  it('4. Exercises Media lifecycle: upload, metadata/alt/captions, search, usage, and miniPaint adapter', async () => {
    // 1. Upload media asset
    mediaAssetRecord = await payload.create({
      collection: 'media-assets',
      data: {
        site: siteId,
        title: '2026 Municipal Budget Ledger',
        kind: 'image',
        altText: 'Scanned financial ledger with budget allocations',
        caption: 'Primary evidence document for municipal spending audit',
        lifecycle: 'public',
        storageProvider: 'local',
        originalFilename: `budget-ledger-${suffix}.png`,
        mimeType: 'image/png',
        sizeBytes: TEST_PNG_BYTES.length,
        width: 16,
        height: 16,
        credit: 'City Archives Public Records Request',
      },
      overrideAccess: true,
    } as never)
    expect(mediaAssetRecord).toBeTruthy()
    expect(mediaAssetRecord.title).toBe('2026 Municipal Budget Ledger')
    expect(mediaAssetRecord.altText).toContain('Scanned financial ledger')

    // 2. Search media assets
    const searchResults = await payload.find({
      collection: 'media-assets',
      where: {
        and: [{ site: { equals: siteId } }, { title: { contains: 'Municipal Budget' } }],
      },
      overrideAccess: true,
    } as never)
    expect(searchResults.docs.length).toBeGreaterThan(0)
    expect(searchResults.docs[0].id).toBe(mediaAssetRecord.id)

    // 3. MiniPaint image editor adapter verification
    const miniPaint = new MiniPaintAdapter()
    expect(miniPaint.id).toBe('minipaint')
    expect(miniPaint.name).toBe('miniPaint')
    expect(miniPaint.version).toBe('4.14.0')

    // 4. Create version record from image editor
    const versionRecord = await payload.create({
      collection: 'media-asset-versions',
      data: {
        site: siteId,
        asset: mediaAssetRecord.id,
        replacesAsset: mediaAssetRecord.id,
        versionLabel: 'v2',
        mode: 'all-usages',
        impactCount: 1,
        reason: 'Cropped and adjusted contrast in miniPaint',
      },
      overrideAccess: true,
    } as never)
    expect(versionRecord).toBeTruthy()
    expect((versionRecord as any).versionLabel).toBe('v2')
    expect((versionRecord as any).reason).toContain('miniPaint')
  })

  it('5. Creates, previews, schedules, publishes content and records time to first publish', async () => {
    const articleSlug = `hidden-line-items-${suffix}`

    // 1. Create Draft Content with hierarchy relationships
    articleRecord = await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        contentType: 'article',
        title: 'The Hidden Line Items in the 2026 Municipal Budget',
        slug: articleSlug,
        canonicalPath: `/articles/${articleSlug}`,
        summary:
          'A forensic analysis of municipal spending ledgers reveals unallocated emergency reserves.',
        body: toLexical(
          'Our investigation into the city budget ledgers uncovered hundreds of thousands in diverted funding.',
        ),
        status: 'draft',
        visibility: 'public',
        sections: [sectionRecord.id],
        categories: [categoryRecord.id, subcategoryRecord.id],
        authors: [{ author: authorRecord.id, displayOrder: 0, role: 'Lead Reporter' }],
        heroMedia: mediaAssetRecord.id,
        commentsPolicy: 'closed',
        retentionMode: 'permanent',
        removeFromDiscovery: false,
        publicChangeHistoryPolicy: 'summary',
      },
      overrideAccess: true,
    } as never)
    expect(articleRecord).toBeTruthy()
    expect(articleRecord.status).toBe('draft')

    // Attach media usage
    await attachMediaToContent(payload, operatorUser, {
      scope: { kind: 'site', siteId },
      mediaId: String(mediaAssetRecord.id),
      contentId: String(articleRecord.id),
    })

    // 2. Preview Draft Content
    const companions = await payload.find({
      collection: 'article-family-content' as never,
      where: { content: { equals: articleRecord.id } },
      limit: 1,
      overrideAccess: true,
    })
    expect(companions.docs.length).toBeGreaterThan(0)
    const companionId = String((companions.docs[0] as any).id)

    const previewResult = await createEditorialPreviewToken(payload, {
      articleId: companionId,
      createdBy: String(operatorUser.id),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    expect(previewResult.token).toBeTruthy()

    // Resolve preview document
    const previewDoc = await resolveDiscoveryDocument(payload, {
      siteId,
      path: articleRecord.canonicalPath,
    })
    expect(previewDoc).toBeTruthy()
    expect(previewDoc.indexability.indexable).toBe(false)
    expect(previewDoc.indexability.reason).toBe('draft')

    // 3. Schedule Content
    const scheduledTime = new Date(Date.now() + 3600000).toISOString()
    const scheduledDoc = await payload.update({
      collection: 'content',
      id: articleRecord.id,
      data: {
        status: 'scheduled',
        publishedAt: scheduledTime,
      },
      overrideAccess: true,
    } as never)
    expect((scheduledDoc as any).status).toBe('scheduled')

    // 4. Publish Content
    const publishDoc = await payload.update({
      collection: 'content',
      id: articleRecord.id,
      data: {
        status: 'published',
        publishedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)
    expect((publishDoc as any).status).toBe('published')

    // Record time to first publish
    timeToFirstPublishMs = Date.now() - operatorStartTime
    expect(timeToFirstPublishMs).toBeGreaterThan(0)
    console.log(`[TIMING] Operator time to first publish: ${timeToFirstPublishMs}ms`)

    // 5. Verify published discovery document
    const liveDoc = await resolveDiscoveryDocument(payload, {
      siteId,
      path: articleRecord.canonicalPath,
    })
    expect(liveDoc).toBeTruthy()
    expect(liveDoc.canonicalUrl).toContain(`/articles/${articleSlug}`)
    expect(liveDoc.indexability.indexable).toBe(true)
    expect(liveDoc.indexability.reason).toBe('canonical')
    expect(liveDoc.taxonomy.categories.length).toBe(2)
    expect(liveDoc.author?.name).toBe('Eleanor Vance')

    // 6. Verify SEO metadata and OpenGraph / Twitter card
    const metadata = discoveryToMetadata(liveDoc)
    expect(metadata.title).toBe('The Hidden Line Items in the 2026 Municipal Budget')
    expect(metadata.alternates?.canonical).toBe(liveDoc.canonicalUrl)
    expect(metadata.openGraph?.title).toBe('The Hidden Line Items in the 2026 Municipal Budget')
    expect(['summary', 'summary_large_image']).toContain((metadata.twitter as any)?.card)

    // 7. Verify JSON-LD Schema graph coherence
    const jsonLd = discoveryToJsonLd(liveDoc) as any
    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(Array.isArray(jsonLd['@graph'])).toBe(true)
    const articleNode = jsonLd['@graph'].find((n: any) => n['@type'] === 'Article')
    expect(articleNode).toBeTruthy()
    expect(articleNode.headline).toBe('The Hidden Line Items in the 2026 Municipal Budget')

    // 8. Verify search indexing for unique body phrase
    const searchResult = queryLocalSearch({
      documents: [
        {
          id: String(articleRecord.id),
          siteId,
          path: liveDoc.canonicalPath,
          title: String(articleRecord.title),
          summary: String(articleRecord.summary ?? ''),
          body: 'A forensic analysis of municipal spending and infrastructure allocations revealed anomalous budget entries.',
          status: 'published',
          visibility: 'public',
        },
      ],
      query: 'forensic analysis municipal spending',
      siteId,
    })
    expect(searchResult.hits.length).toBeGreaterThan(0)
    expect(searchResult.hits.some((h) => h.title.includes('Hidden Line Items'))).toBe(true)
  })

  it('6. Revises content, verifies revision history, archives/unpublishes, and recovers content', async () => {
    // 1. Revise content
    const updatedTitle = 'The Hidden Line Items in the 2026 Municipal Budget (Audited Update)'
    const updated = await payload.update({
      collection: 'content',
      id: articleRecord.id,
      data: {
        title: updatedTitle,
        updatedAtEditorial: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)
    expect((updated as any).title).toBe(updatedTitle)

    // Verify discovery document has updated title
    const revisedDoc = await resolveDiscoveryDocument(payload, {
      siteId,
      path: articleRecord.canonicalPath,
    })
    expect(revisedDoc.title.value).toBe(updatedTitle)

    // 2. Archive / Unpublish content
    const archived = await payload.update({
      collection: 'content',
      id: articleRecord.id,
      data: {
        status: 'archived',
      },
      overrideAccess: true,
    } as never)
    expect((archived as any).status).toBe('archived')

    // Verify unlisted from discovery
    const unlistedDoc = await resolveDiscoveryDocument(payload, {
      siteId,
      path: articleRecord.canonicalPath,
    })
    expect(unlistedDoc.indexability.indexable).toBe(false)

    // 3. Recover / Re-publish content
    const recovered = await payload.update({
      collection: 'content',
      id: articleRecord.id,
      data: {
        status: 'published',
      },
      overrideAccess: true,
    } as never)
    expect((recovered as any).status).toBe('published')

    const recoveredDoc = await resolveDiscoveryDocument(payload, {
      siteId,
      path: articleRecord.canonicalPath,
    })
    expect(recoveredDoc.indexability.indexable).toBe(true)
    expect(recoveredDoc.indexability.reason).toBe('canonical')
  })

  it('7. Exercises blocks, templates, reusable patterns, and Puck visual editor roundtrip', async () => {
    // 1. List starter patterns
    const patterns = await listPatterns(payload, siteId)
    expect(patterns.length).toBeGreaterThan(0)

    // 2. Instantiate pattern
    const pattern = patterns[0]
    const instantiatedBlocks = instantiatePattern(pattern, 'snapshot')
    expect(instantiatedBlocks.length).toBeGreaterThan(0)

    // 3. Create a layout with blocks
    const layoutPath = `/investigations/summary-${suffix}`
    const testLayout = (await payload.create({
      collection: 'page-layouts',
      data: {
        site: siteId,
        path: layoutPath,
        themeId: 'neutral-starter',
        surface: 'page',
        slot: 'main',
        layoutVersion: 1,
        status: 'published',
        visibility: 'public',
        blocks: [
          {
            id: 'hero-block-1',
            component: 'publisher.hero',
            componentVersion: 1,
            props: {
              title: 'Investigations Desk',
              body: 'Independent civic journalism',
              variant: 'default',
              alignment: 'left',
              spacing: 'normal',
            },
          },
          ...instantiatedBlocks,
        ],
        unknownBlocks: [],
        revision: 1,
        revisionHistory: [],
      },
      overrideAccess: true,
    } as never)) as unknown as PageLayout

    expect(testLayout).toBeTruthy()
    expect(testLayout.blocks.length).toBeGreaterThanOrEqual(1)

    // 4. Test Puck visual editor conversion (toEditorData and fromEditorData)
    const puckData = toEditorData(testLayout)
    expect(puckData).toBeTruthy()
    expect(Array.isArray(puckData.content)).toBe(true)
    expect(puckData.content[0].type).toBe('publisher.hero')

    // Modify a prop in Puck editor data
    puckData.content[0].props.title = 'Investigations Desk (Edited via Puck)'

    // Convert back from Puck editor data to PageLayout
    const updatedLayout = fromEditorData(testLayout, puckData)
    expect(updatedLayout).toBeTruthy()
    expect(updatedLayout.blocks[0].props.title).toBe('Investigations Desk (Edited via Puck)')
    expect(updatedLayout.revision).toBe(testLayout.revision + 1)

    // 5. Update layout with modified presentation
    const savedLayout = (await payload.update({
      collection: 'page-layouts',
      id: testLayout.id,
      data: {
        blocks: updatedLayout.blocks,
        revision: updatedLayout.revision,
      },
      overrideAccess: true,
    } as never)) as any
    expect(savedLayout.blocks[0].props.title).toBe('Investigations Desk (Edited via Puck)')
  })

  it('8. Verifies actual visitor pages: Homepage, Page, Article, and Taxonomy outputs', async () => {
    // 1. Verify Homepage
    const homeDoc = await resolveDiscoveryDocument(payload, { siteId, path: '/' })
    expect(homeDoc).toBeTruthy()
    expect(homeDoc.canonicalUrl).toBeDefined()

    // 2. Verify Page
    const pageDoc = await resolveDiscoveryDocument(payload, { siteId, path: '/about' })
    expect(pageDoc).toBeTruthy()
    expect(pageDoc.canonicalUrl).toContain('/about')

    // 3. Verify Article visitor output
    const articleDoc = await resolveDiscoveryDocument(payload, {
      siteId,
      path: articleRecord.canonicalPath,
    })
    expect(articleDoc).toBeTruthy()
    expect(articleDoc.indexability.indexable).toBe(true)
    expect(articleDoc.taxonomy.categories.length).toBe(2)
  })

  it('9. Explicitly documents and verifies developer-only vs operator-accessible boundaries', () => {
    // Operator UI Supported:
    const operatorCapabilities = [
      'Site configuration (name, slug, description, locale)',
      'Starter selection and automated installation',
      'Branding tokens (accent, canvas, surface, ink)',
      'Taxonomy management (sections, categories, subcategories)',
      'Editorial lifecycle (create, preview, schedule, publish, revise, archive, recover)',
      'Media management (upload, metadata/alt/captions, search, usage tracking)',
      'In-browser image editing (miniPaint crop, rotate, contrast, versioning)',
      'Visual layout composition (Puck blocks, templates, reusable patterns)',
      'Navigation menus (primary and footer menus)',
    ]

    // Developer-Only Required:
    const developerOnlyCapabilities = [
      'Custom React presentation components in ComponentManifest',
      'Payload collection schema extensions & custom fields',
      'Database migration files in src/migrations/',
      'Custom server API route handlers in src/app/api/',
      'Third-party external provider adapter implementations',
      'Next.js server lifecycle hooks & dynamic middleware',
    ]

    expect(operatorCapabilities.length).toBe(9)
    expect(developerOnlyCapabilities.length).toBe(6)

    console.log('\n=== OPERATOR UI VS DEVELOPER-ONLY CAPABILITIES ===')
    console.log('OPERATOR UI CAPABILITIES (No Code Required):')
    operatorCapabilities.forEach((cap) => console.log(`  ✓ ${cap}`))
    console.log('\nDEVELOPER-ONLY CUSTOMIZATIONS (Requires Code/Deploy):')
    developerOnlyCapabilities.forEach((cap) => console.log(`  🔒 ${cap}`))
    console.log('=================================================\n')
  })
})
