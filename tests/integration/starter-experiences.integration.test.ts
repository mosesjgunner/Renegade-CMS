/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  installStarter,
  getStarterStatus,
  upgradeStarter,
  rollbackStarterLayout,
} from '../../src/modules/starters/service'
import { starterDefinitions } from '../../src/modules/starters/definitions'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
}, 60_000)

afterAll(async () => {
  await payload?.db?.destroy?.()
})

describe('Starter Experiences Integration Tests', () => {
  describe('Publication & Community Starter (publication-community)', () => {
    let siteId: string

    it('installs the publication-community starter completely into Payload', async () => {
      const result = await installStarter(payload, 'publication-community')
      expect(result.success).toBe(true)
      expect(result.starterId).toBe('publication-community')
      expect(result.siteId).toBeTruthy()
      siteId = result.siteId

      // Verify site record
      const site = await payload.findByID({
        collection: 'sites',
        id: siteId,
        overrideAccess: true,
      })
      expect(site).toBeDefined()
      expect(site.name).toBe('The Vanguard Chronicle')
      expect(site.lifecycle).toBe('active')
    })

    it('creates governed media assets with local storage and licensing metadata', async () => {
      const mediaResult = await payload.find({
        collection: 'media-assets',
        where: { site: { equals: siteId } },
        limit: 20,
        overrideAccess: true,
      })
      expect(mediaResult.docs.length).toBeGreaterThanOrEqual(4)
      for (const doc of mediaResult.docs as any[]) {
        expect(doc.governanceEnabled).toBe(true)
        expect(doc.storageProvider).toBe('local')
        expect(doc.altText).toBeTruthy()
        expect(doc.creatorCredit).toBeTruthy()
        expect(doc.licenseType).toBeTruthy()
        expect(doc.storageLocation).toMatch(/^\/starter-assets\//)
      }
    })

    it('creates canonical pages including legal and disclosure placements', async () => {
      const pagesResult = await payload.find({
        collection: 'content',
        where: { and: [{ site: { equals: siteId } }, { contentType: { equals: 'page' } }] },
        limit: 20,
        overrideAccess: true,
      })
      expect(pagesResult.docs.length).toBeGreaterThanOrEqual(6)
      const slugs = pagesResult.docs.map((d: any) => d.slug)
      expect(slugs).toContain('about')
      expect(slugs).toContain('disclosure')
      expect(slugs).toContain('privacy')
      expect(slugs).toContain('terms')
      expect(slugs).toContain('subscribe')
      expect(slugs).toContain('contact')

      for (const doc of pagesResult.docs as any[]) {
        expect(doc.status).toBe('published')
        expect(doc.canonicalPath.startsWith('/')).toBe(true)
        expect(doc.summary).toBeTruthy()
      }
    })

    it('creates published articles with tags and plain text projections', async () => {
      const articlesResult = await payload.find({
        collection: 'content',
        where: { and: [{ site: { equals: siteId } }, { contentType: { equals: 'article' } }] },
        limit: 10,
        overrideAccess: true,
      })
      expect(articlesResult.docs.length).toBeGreaterThanOrEqual(3)

      for (const doc of articlesResult.docs as any[]) {
        expect(doc.status).toBe('published')
        expect(doc.canonicalPath).toMatch(/^\/articles\//)
        expect(doc.summary).toBeTruthy()

        // Check article projection exists
        const projectionResult = await payload.find({
          collection: 'article-family-content',
          where: { content: { equals: doc.id } },
          limit: 1,
          overrideAccess: true,
        })
        expect(projectionResult.docs.length).toBe(1)
        expect((projectionResult.docs[0] as any).plainTextProjection).toBeTruthy()
      }
    })

    it('creates page-layouts with published presentation snapshots and revision history', async () => {
      const layoutsResult = await payload.find({
        collection: 'page-layouts',
        where: { site: { equals: siteId } },
        limit: 50,
        overrideAccess: true,
      })
      expect(layoutsResult.docs.length).toBeGreaterThanOrEqual(9)

      // Homepage layout
      const homeLayout = layoutsResult.docs.find((l: any) => l.path === '/') as any
      expect(homeLayout).toBeDefined()
      expect(homeLayout.status).toBe('published')
      expect(homeLayout.surface).toBe('page')
      expect(homeLayout.slot).toBe('main')
      expect(homeLayout.publishedPresentation).toBeDefined()
      expect(homeLayout.publishedPresentation.version).toBe(1)
      expect(homeLayout.publishedPresentation.document.siteId).toBe(siteId)
      expect(homeLayout.publishedPresentation.document.theme.id).toBe('neutral-starter')
      expect(homeLayout.revisionHistory).toBeDefined()
      expect(homeLayout.revisionHistory.length).toBeGreaterThanOrEqual(1)

      // Templates
      const templatePaths = layoutsResult.docs
        .filter((l: any) => l.surface === 'template')
        .map((l: any) => l.path)
      expect(templatePaths).toContain('__template__/publication-article')
      expect(templatePaths).toContain('__template__/community-hub')

      // Patterns
      const patternPaths = layoutsResult.docs
        .filter((l: any) => l.surface === 'pattern')
        .map((l: any) => l.path)
      expect(patternPaths).toContain('__pattern__/newsletter-signup')
      expect(patternPaths).toContain('__pattern__/community-spotlight')
      expect(patternPaths).toContain('__pattern__/editorial-ethics')

      // Globals
      const globalPaths = layoutsResult.docs
        .filter((l: any) => l.surface === 'global')
        .map((l: any) => l.path)
      expect(globalPaths).toContain('__global__/header')
      expect(globalPaths).toContain('__global__/announcement')
      expect(globalPaths).toContain('__global__/cta')
      expect(globalPaths).toContain('__global__/footer')
    })

    it('reports starter install status accurately', async () => {
      const status = await getStarterStatus(payload, siteId)
      expect(status.installed).toBe(true)
      expect(status.starterId).toBe('publication-community')
      expect(status.version).toBe('1.0.0')
      expect(status.stats.pagesCount).toBeGreaterThanOrEqual(6)
      expect(status.stats.articlesCount).toBeGreaterThanOrEqual(3)
      expect(status.stats.templatesCount).toBeGreaterThanOrEqual(2)
      expect(status.stats.patternsCount).toBeGreaterThanOrEqual(3)
      expect(status.stats.globalsCount).toBe(4)
    })

    it('upgrades starter templates non-destructively without altering custom page content', async () => {
      // Modify an existing page's summary to simulate operator custom content
      const pageToEdit = (
        await payload.find({
          collection: 'content',
          where: { and: [{ site: { equals: siteId } }, { slug: { equals: 'about' } }] },
          limit: 1,
          overrideAccess: true,
        })
      ).docs[0] as any

      await payload.update({
        collection: 'content',
        id: pageToEdit.id,
        data: {
          summary: 'Customized operator summary that must be preserved.',
        },
        overrideAccess: true,
      })

      // Execute upgrade
      const upgradeResult = await upgradeStarter(payload, 'publication-community', siteId)
      expect(upgradeResult.success).toBe(true)

      // Verify custom page summary was preserved
      const refreshedPage = await payload.findByID({
        collection: 'content',
        id: pageToEdit.id,
        overrideAccess: true,
      })
      expect((refreshedPage as any).summary).toBe(
        'Customized operator summary that must be preserved.',
      )
    })

    it('rolls back a layout to a previous revision safely', async () => {
      const homeLayout = (
        await payload.find({
          collection: 'page-layouts',
          where: { and: [{ site: { equals: siteId } }, { path: { equals: '/' } }] },
          limit: 1,
          overrideAccess: true,
        })
      ).docs[0] as any

      const initialRevision = homeLayout.revision

      // Create a second revision by updating the blocks
      const updatedBlocks = [
        ...homeLayout.blocks,
        {
          id: 'test-announcement-block',
          component: 'publisher.cta',
          componentVersion: 1,
          props: {
            title: 'Temporary Flash Announcement',
            body: 'Special edition dispatch released.',
            alignment: 'center',
            spacing: 'compact',
            width: 'standard',
            background: 'brand',
            emphasis: 'bold',
          },
          visible: { desktop: true, tablet: true, mobile: true },
        },
      ]

      await payload.update({
        collection: 'page-layouts',
        id: homeLayout.id,
        data: {
          blocks: updatedBlocks,
          revision: initialRevision + 1,
          revisionHistory: [
            ...(homeLayout.revisionHistory || []),
            {
              revision: initialRevision + 1,
              createdAt: new Date().toISOString(),
              author: 'Operator',
              note: 'Added temporary announcement',
              blocks: updatedBlocks,
            },
          ],
        },
        overrideAccess: true,
      })

      // Roll back to revision 1
      const rollbackResult = await rollbackStarterLayout(payload, siteId, '/', initialRevision)
      expect(rollbackResult.success).toBe(true)

      const rolledBack = await payload.findByID({
        collection: 'page-layouts',
        id: homeLayout.id,
        overrideAccess: true,
      })
      expect((rolledBack as any).blocks.some((b: any) => b.id === 'test-announcement-block')).toBe(
        false,
      )
    })
  })

  describe('Campaign & Commerce Starter (campaign-commerce)', () => {
    let siteId: string

    it('installs the campaign-commerce starter completely into Payload', async () => {
      const result = await installStarter(payload, 'campaign-commerce')
      expect(result.success).toBe(true)
      expect(result.starterId).toBe('campaign-commerce')
      expect(result.siteId).toBeTruthy()
      siteId = result.siteId

      // Verify site record
      const site = await payload.findByID({
        collection: 'sites',
        id: siteId,
        overrideAccess: true,
      })
      expect(site).toBeDefined()
      expect(site.name).toBe('Forward for the People')
      expect(site.lifecycle).toBe('active')
    })

    it('creates physical products with prices, SKUs, inventory, and media', async () => {
      const productsResult = await payload.find({
        collection: 'products',
        where: { site: { equals: siteId } },
        limit: 10,
        overrideAccess: true,
      })
      expect(productsResult.docs.length).toBeGreaterThanOrEqual(4)

      for (const prod of productsResult.docs as any[]) {
        expect(prod.state).toBe('published')
        expect(prod.name).toBeTruthy()
        expect(prod.canonicalPath).toMatch(/^\/store\//)
        expect(prod.variants.length).toBeGreaterThan(0)
        expect(prod.variants[0].sku).toBeTruthy()
        expect(prod.offers.length).toBeGreaterThan(0)
        expect(Number(prod.offers[0].amountMinor)).toBeGreaterThan(0)
        expect(prod.variants[0].inventoryPolicy).toBe('tracked')
        expect(prod.variants[0].inventoryQuantity).toBeGreaterThan(0)
      }
    })

    it('creates an active donation campaign with suggested tiers and legal disclosures', async () => {
      const campaignResult = await payload.find({
        collection: 'donation-campaigns',
        where: { site: { equals: siteId } },
        limit: 5,
        overrideAccess: true,
      })
      expect(campaignResult.docs.length).toBeGreaterThanOrEqual(1)

      const camp = campaignResult.docs[0] as any
      expect(camp.title).toBe("The People's Transit & Clean Energy Fund")
      expect(camp.lifecycle).toBe('active')
      expect(Number(camp.goalAmountMinor)).toBe(25000000)
      expect(camp.allowedAmounts.length).toBe(5)
      expect(camp.disclosures[0]).toContain('Federal Election Campaign Act')
    })

    it('creates campaign templates, patterns, globals, and homepage layout with renegade-party theme', async () => {
      const layoutsResult = await payload.find({
        collection: 'page-layouts',
        where: { site: { equals: siteId } },
        limit: 50,
        overrideAccess: true,
      })

      // Home layout with renegade-party theme
      const homeLayout = layoutsResult.docs.find((l: any) => l.path === '/') as any
      expect(homeLayout).toBeDefined()
      expect(homeLayout.status).toBe('published')
      expect(homeLayout.themeId).toBe('renegade-party')
      expect(homeLayout.publishedPresentation.document.theme.id).toBe('renegade-party')

      // Campaign templates
      const templatePaths = layoutsResult.docs
        .filter((l: any) => l.surface === 'template')
        .map((l: any) => l.path)
      expect(templatePaths).toContain('__template__/campaign-action')
      expect(templatePaths).toContain('__template__/product-spotlight')

      // Campaign patterns
      const patternPaths = layoutsResult.docs
        .filter((l: any) => l.surface === 'pattern')
        .map((l: any) => l.path)
      expect(patternPaths).toContain('__pattern__/grassroots-donate')
      expect(patternPaths).toContain('__pattern__/action-alert')
      expect(patternPaths).toContain('__pattern__/campaign-disclosure')
    })

    it('preserves canonical content and URLs when switching themes', async () => {
      // Find initial products and donation campaigns
      const initialProducts = await payload.find({
        collection: 'products',
        where: { site: { equals: siteId } },
        overrideAccess: true,
      })
      const initialCampaigns = await payload.find({
        collection: 'donation-campaigns',
        where: { site: { equals: siteId } },
        overrideAccess: true,
      })
      const initialArticles = await payload.find({
        collection: 'content',
        where: { and: [{ site: { equals: siteId } }, { contentType: { equals: 'article' } }] },
        overrideAccess: true,
      })

      expect(initialProducts.docs.length).toBeGreaterThanOrEqual(4)
      expect(initialCampaigns.docs.length).toBeGreaterThanOrEqual(1)
      expect(initialArticles.docs.length).toBeGreaterThanOrEqual(3)

      const productPathsBefore = initialProducts.docs.map((p: any) => p.canonicalPath)
      const articlePathsBefore = initialArticles.docs.map((a: any) => a.canonicalPath)

      // Switch theme to neutral-starter
      await (payload as any).updateGlobal({
        slug: 'site-settings',
        data: {
          themeId: 'neutral-starter',
        },
        overrideAccess: true,
      })

      // Verify that canonical content, products, and donation campaigns are completely unaffected
      const productsAfter = await payload.find({
        collection: 'products',
        where: { site: { equals: siteId } },
        overrideAccess: true,
      })
      const campaignsAfter = await payload.find({
        collection: 'donation-campaigns',
        where: { site: { equals: siteId } },
        overrideAccess: true,
      })
      const articlesAfter = await payload.find({
        collection: 'content',
        where: { and: [{ site: { equals: siteId } }, { contentType: { equals: 'article' } }] },
        overrideAccess: true,
      })

      expect(productsAfter.docs.length).toBe(initialProducts.docs.length)
      expect(campaignsAfter.docs.length).toBe(initialCampaigns.docs.length)
      expect(articlesAfter.docs.length).toBe(initialArticles.docs.length)

      expect(productsAfter.docs.map((p: any) => p.canonicalPath)).toEqual(productPathsBefore)
      expect(articlesAfter.docs.map((a: any) => a.canonicalPath)).toEqual(articlePathsBefore)
    })
  })
})
