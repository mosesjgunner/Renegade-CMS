import { describe, expect, it } from 'vitest'
import { starterDefinitions } from '../../src/modules/starters/definitions'
import { themes } from '../../src/modules/public/contracts'
import { componentRegistry } from '../../src/modules/public/page-builder'
import type { StarterId } from '../../src/modules/starters/contracts'

describe('Starter Definitions Unit Tests', () => {
  const starterIds: StarterId[] = ['publication-community', 'campaign-commerce']

  it('defines both publication-community and campaign-commerce starters', () => {
    expect(starterDefinitions['publication-community']).toBeDefined()
    expect(starterDefinitions['campaign-commerce']).toBeDefined()
  })

  starterIds.forEach((id) => {
    describe(`Starter: ${id}`, () => {
      const starter = starterDefinitions[id]

      it('has valid metadata and matching theme in presentation registry', () => {
        expect(starter.id).toBe(id)
        expect(starter.name).toBeTruthy()
        expect(starter.description).toBeTruthy()
        expect(themes[starter.themeId]).toBeDefined()
      })

      it('has governed media assets with required fields and local storage', () => {
        expect(starter.media.length).toBeGreaterThanOrEqual(4)
        for (const item of starter.media) {
          expect(item.id).toBeTruthy()
          expect(item.title).toBeTruthy()
          expect(item.altText).toBeTruthy()
          expect(item.originalFilename).toBeTruthy()
          expect(item.licenseType).toBeTruthy()
          expect(item.creatorCredit).toBeTruthy()
          expect(item.localAssetPath).toMatch(/^\/starter-assets\//)
        }
      })

      it('includes required core pages and legal/disclosure placements', () => {
        const paths = starter.pages.map((p) => p.canonicalPath)
        expect(paths).toContain('/about')
        expect(paths).toContain('/disclosure')
        expect(paths).toContain('/privacy')
        expect(paths).toContain('/terms')

        for (const page of starter.pages) {
          expect(page.canonicalPath.startsWith('/')).toBe(true)
          expect(page.title).toBeTruthy()
          expect(page.summary).toBeTruthy()
          expect(page.slug).toBeTruthy()
        }
      })

      it('includes articles with summaries, tags, and dates', () => {
        expect(starter.articles.length).toBeGreaterThanOrEqual(3)
        for (const article of starter.articles) {
          expect(article.title).toBeTruthy()
          expect(article.slug).toBeTruthy()
          expect(article.canonicalPath).toMatch(/^\/articles\//)
          expect(article.summary).toBeTruthy()
          expect(article.body).toBeTruthy()
          expect(article.tags.length).toBeGreaterThan(0)
          expect(article.publishedAt).toBeTruthy()
        }
      })

      it('defines templates and patterns with valid registered components', () => {
        expect(starter.templates.length).toBeGreaterThanOrEqual(2)
        expect(starter.patterns.length).toBeGreaterThanOrEqual(3)

        const allBlocks = [
          ...starter.layouts.flatMap((l) => l.blocks),
          ...starter.templates.flatMap((t) => t.blocks),
          ...starter.patterns.flatMap((p) => p.blocks),
          ...starter.globals.flatMap((g) => g.blocks),
        ]

        expect(allBlocks.length).toBeGreaterThan(10)
        for (const block of allBlocks) {
          expect(block.id).toBeTruthy()
          expect(block.component).toBeTruthy()
          expect(componentRegistry[block.component]).toBeDefined()
          expect(block.props).toBeDefined()
        }
      })

      it('defines all required global regions (header, announcement, cta, footer)', () => {
        const slots = starter.globals.map((g) => g.slot)
        expect(slots).toContain('header')
        expect(slots).toContain('announcement')
        expect(slots).toContain('cta')
        expect(slots).toContain('footer')

        const header = starter.globals.find((g) => g.slot === 'header')
        const footer = starter.globals.find((g) => g.slot === 'footer')
        expect(header?.blocks.length).toBeGreaterThan(0)
        expect(footer?.blocks.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Campaign / Commerce Specific Requirements', () => {
    const campaign = starterDefinitions['campaign-commerce']

    it('defines physical products with valid SKUs, prices, stock, and descriptions', () => {
      expect(campaign.products).toBeDefined()
      expect(campaign.products!.length).toBeGreaterThanOrEqual(4)

      for (const prod of campaign.products!) {
        expect(prod.name).toBeTruthy()
        expect(prod.slug).toBeTruthy()
        expect(prod.sku).toBeTruthy()
        expect(Number(prod.priceMinor)).toBeGreaterThan(0)
        expect(prod.inventoryQuantity).toBeGreaterThan(0)
        expect(prod.kind).toBe('physical')
        expect(prod.currency).toBe('USD')
        expect(prod.canonicalPath).toMatch(/^\/(store|products)\//)
      }
    })

    it('defines an active donation campaign with tiers and FEC disclosures', () => {
      expect(campaign.donationCampaign).toBeDefined()
      const don = campaign.donationCampaign!
      expect(don.title).toBeTruthy()
      expect(don.slug).toBe('clean-transit-fund')
      expect(don.currency).toBe('USD')
      expect(Number(don.goalMinor)).toBe(25000000) // $250,000
      expect(don.suggestedTiersMinor.length).toBeGreaterThanOrEqual(4)
      expect(don.complianceDisclosure).toBeTruthy()
      expect(don.complianceDisclosure).toContain('Federal Election Campaign Act')
    })
  })
})
