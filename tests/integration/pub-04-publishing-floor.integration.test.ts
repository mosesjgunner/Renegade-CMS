import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { randomUUID } from 'crypto'

import { resolveSiteSettings } from '../../src/modules/core/site-settings'
import { normalizeNavigation, validateNavigation } from '../../src/modules/public/navigation'
import { mediaStorage, inspectMedia } from '../../src/modules/media/storage'
import { deleteOrphanedMedia, publicMedia } from '../../src/modules/media/workflow'
import { loadConfig } from '../../src/modules/core/config'
import { queryLocalSearch, type SearchDocument } from '../../src/modules/public/discovery'
import sitemap from '../../src/app/(frontend)/sitemap'
import robots from '../../src/app/(frontend)/robots'
import { seed } from '../../src/scripts/seed'

describe('PUB-04 publishing floor integration contract', () => {
  let payload: Payload
  let siteId: string
  let publicationId: string
  let adminUserId: string

  beforeAll(async () => {
    payload = await getPayload({ config })
    await seed(payload)

    const site = await payload.find({
      collection: 'sites',
      where: { slug: { equals: 'demo-publication' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    siteId = String(site.docs[0]!.id)

    const publication = await payload.find({
      collection: 'publications',
      where: { and: [{ site: { equals: siteId } }, { slug: { equals: 'main' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    publicationId = String(publication.docs[0]!.id)

    const user = await payload.find({
      collection: 'users',
      where: { email: { equals: 'river@example.test' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    await payload.update({
      collection: 'users',
      id: user.docs[0]!.id,
      data: { role: 'owner' },
      overrideAccess: true,
    })
    adminUserId = String(user.docs[0]!.id)
  })

  afterAll(async () => {
    await payload?.db.destroy?.()
  })

  it('Requirement 1: updates and resolves site settings through normal admin controls', async () => {
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        siteName: 'Renegade Party HQ',
        siteDescription: 'A free, portable publishing and democratic platform.',
        canonicalOrigin: 'https://renegadeparty.org',
        locale: 'en-US',
        timezone: 'America/New_York',
        footerText: '© 2026 Renegade Party. Published with local sovereignty.',
        indexingMode: 'index',
        homepageSelection: {
          mode: 'default',
        },
      },
      overrideAccess: true,
    })

    const resolved = await resolveSiteSettings(payload)
    expect(resolved.siteName).toBe('Renegade Party HQ')
    expect(resolved.siteDescription).toBe('A free, portable publishing and democratic platform.')
    expect(resolved.canonicalOrigin).toBe('https://renegadeparty.org')
    expect(resolved.locale).toBe('en-US')
    expect(resolved.timezone).toBe('America/New_York')
    expect(resolved.footerText).toBe('© 2026 Renegade Party. Published with local sovereignty.')
    expect(resolved.indexingMode).toBe('index')
    expect(resolved.homepageSelection.mode).toBe('default')
  })

  it('Requirement 2: validates, updates, and normalizes navigation menus with 1-level nesting', async () => {
    const rawNav = {
      primary: [
        {
          label: 'Platform',
          href: '/articles',
          children: [{ label: 'Action Plan', href: '/articles/action-plan' }],
        },
        { label: 'About Us', href: '/about' },
      ],
      secondary: [{ label: 'Search', href: '/search' }],
      footer: [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'External Community', href: 'https://community.renegadeparty.org' },
      ],
    }

    const validated = validateNavigation(rawNav)
    expect(validated.primary[0]!.children).toHaveLength(1)

    await payload.update({
      collection: 'publications',
      id: publicationId,
      data: {
        navigation: validated,
      },
      overrideAccess: true,
    })

    const updatedPub = (await payload.findByID({
      collection: 'publications',
      id: publicationId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const normalized = normalizeNavigation(updatedPub.navigation)
    expect(normalized.primary).toHaveLength(2)
    expect(normalized.primary[0]!.label).toBe('Platform')
    expect(normalized.primary[0]!.children[0]!.label).toBe('Action Plan')
    expect(normalized.footer).toHaveLength(2)
    expect(normalized.footer[1]!.href).toBe('https://community.renegadeparty.org')
  })

  it('Requirement 4: supports real byte uploads, restart persistence, anonymous protection, and deletion refusal', async () => {
    const appConfig = loadConfig()
    const storage = mediaStorage(appConfig)

    // 1. Upload real bytes (safe SVG)
    const svgContent =
      '<svg width="120" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="40" fill="#dc2626"/><text x="10" y="25" fill="#fff">LOGO</text></svg>'
    const bytes = new TextEncoder().encode(svgContent)
    const inspected = inspectMedia(bytes)
    expect(inspected.mimeType).toBe('image/svg+xml')

    const storageLocation = `test-media/${randomUUID()}.svg`
    await storage.put(storageLocation, bytes, inspected.mimeType)

    // 2. Restart persistence: simulate reading after app restart
    const persistedBytes = await storage.get(storageLocation)
    expect(persistedBytes).toBeDefined()
    expect(persistedBytes!.byteLength).toBe(bytes.byteLength)

    // 3. Create media-asset in database
    const mediaDoc = (await payload.create({
      collection: 'media-assets',
      data: {
        site: siteId,
        title: 'Site Header Logo',
        kind: 'image',
        mimeType: inspected.mimeType,
        sizeBytes: bytes.byteLength,
        checksum: inspected.sha256,
        storageLocation,
        storageProvider: 'local',
        altText: 'Renegade Party Logo',
      } as never,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const mediaId = String(mediaDoc.id)

    // 4. Anonymous protection: orphan media is NOT public
    const orphanAccess = await publicMedia(payload, mediaId)
    expect(orphanAccess).toBeUndefined()

    // 5. Reference media in site-settings logo
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        logo: mediaId,
      },
      overrideAccess: true,
    })

    // 6. Public access now succeeds because it is the site logo
    const publicLogo = await publicMedia(payload, mediaId)
    expect(publicLogo).toBeDefined()
    expect(String(publicLogo!.id)).toBe(mediaId)

    // 7. Referenced deletion refusal: deleting referenced media throws 409
    const adminUserDoc = (await payload.findByID({
      collection: 'users',
      id: adminUserId,
      depth: 0,
      overrideAccess: true,
    })) as unknown
    await expect(
      deleteOrphanedMedia(payload, appConfig, adminUserDoc as never, {
        scope: { kind: 'site', siteId } as never,
        mediaId,
      }),
    ).rejects.toThrow(/referenced media cannot be deleted/i)
  })

  it('Requirement 6: local public search finds unique phrase in body projection and highlights excerpt', async () => {
    const uniqueToken = `renegade_body_token_${randomUUID().slice(0, 8)}`

    // Create a published article where the unique token is ONLY in the body text
    const article = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        contentType: 'article',
        title: 'Decentralized Architecture Whitepaper',
        slug: `decentralized-${randomUUID().slice(0, 6)}`,
        canonicalPath: `/articles/whitepaper-${randomUUID().slice(0, 6)}`,
        summary: 'A neutral overview of platform protocols and data structures.',
        body: {
          root: {
            children: [
              {
                children: [
                  {
                    text: `This sentence contains the secret key ${uniqueToken} which only exists inside body text.`,
                    type: 'text',
                  },
                ],
                type: 'paragraph',
                version: 1,
              },
            ],
            type: 'root',
            version: 1,
          },
        },
        status: 'published',
        visibility: 'public',
        publishedAt: new Date().toISOString(),
      } as never,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    // Also create a draft article containing the same token to prove draft exclusion
    await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        contentType: 'article',
        title: 'Draft Internal Notes',
        slug: `draft-notes-${randomUUID().slice(0, 6)}`,
        canonicalPath: `/articles/draft-${randomUUID().slice(0, 6)}`,
        summary: 'Internal draft notes.',
        body: {
          root: {
            children: [
              {
                children: [
                  {
                    text: `Draft mentioning ${uniqueToken} should never appear publicly.`,
                    type: 'text',
                  },
                ],
                type: 'paragraph',
                version: 1,
              },
            ],
            type: 'root',
            version: 1,
          },
        },
        status: 'draft',
        visibility: 'public',
      } as never,
      overrideAccess: true,
    })

    // Build search document projection matching search/page.tsx
    const searchDocs: SearchDocument[] = [
      {
        id: String(article.id),
        siteId,
        path: String(article.canonicalPath),
        title: String(article.title),
        summary: String(article.summary),
        body: `This sentence contains the secret key ${uniqueToken} which only exists inside body text.`,
        status: 'published',
        visibility: 'public',
        publishedAt: String(article.publishedAt),
      },
      {
        id: 'draft-id',
        siteId,
        path: '/articles/draft',
        title: 'Draft Internal Notes',
        summary: 'Draft summary',
        body: `Draft mentioning ${uniqueToken}`,
        status: 'draft',
        visibility: 'public',
      },
    ]

    const searchResult = queryLocalSearch({
      documents: searchDocs,
      query: uniqueToken,
      siteId,
      now: new Date(),
    })

    expect(searchResult.total).toBe(1)
    expect(searchResult.hits[0]!.id).toBe(String(article.id))
    expect(searchResult.hits[0]!.path).toBe(String(article.canonicalPath))
    expect(searchResult.hits[0]!.excerpt).toContain(`<mark>${uniqueToken}</mark>`)
  })

  it('Requirement 5 & 7: sitemap and robots respect indexingMode toggle and unpublish changes', async () => {
    // 1. In index mode: robots allows public routes, sitemap contains URLs
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        indexingMode: 'index',
        canonicalOrigin: 'https://renegadeparty.org',
      },
      overrideAccess: true,
    })

    const indexRobots = await robots()
    expect(indexRobots.rules).toEqual([
      { userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/preview', '/setup'] },
    ])
    expect(indexRobots.sitemap).toBe('https://renegadeparty.org/sitemap.xml')

    const indexSitemap = await sitemap()
    expect(indexSitemap.length).toBeGreaterThanOrEqual(2)
    expect(indexSitemap.some((entry) => entry.url === 'https://renegadeparty.org/')).toBe(true)

    // 2. Toggle indexingMode to 'noindex': robots disallows /, sitemap is empty
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        indexingMode: 'noindex',
      },
      overrideAccess: true,
    })

    const noIndexRobots = await robots()
    expect(noIndexRobots.rules).toEqual([{ userAgent: '*', disallow: '/' }])

    const noIndexSitemap = await sitemap()
    expect(noIndexSitemap).toEqual([])

    // Restore index mode for clean state
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        indexingMode: 'index',
      },
      overrideAccess: true,
    })
  })
})
