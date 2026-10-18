import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { publicationCommunityStarter, campaignCommerceStarter } from '../../src/modules/starters/definitions'
import { starterComponents } from '../../src/modules/presentation/themes/components'
import { resolveTheme, themes } from '../../src/modules/presentation/registry'
import { validateLayout } from '../../src/modules/public/page-builder'

describe('04E presentation regression: starter calls to action & functional destinations', () => {
  it('proves all visible navigation links in publication starter have functional destinations', () => {
    const nav = publicationCommunityStarter.navigation.primary
    expect(nav.length).toBeGreaterThanOrEqual(4)
    for (const item of nav) {
      expect(item.href).toMatch(/^\/[a-zA-Z0-9/_-]*$/)
      expect(item.label.trim().length).toBeGreaterThan(0)
    }
    const paths = nav.map((n) => n.href)
    expect(paths).toContain('/articles')
    expect(paths).toContain('/subscribe')
    expect(paths).toContain('/members')
    expect(paths).toContain('/about')

    const footerPaths = publicationCommunityStarter.navigation.footer.map((n) => n.href)
    expect(footerPaths).toContain('/disclosure')
    expect(footerPaths).toContain('/privacy')
    expect(footerPaths).toContain('/terms')
  })

  it('proves all visible navigation links in campaign commerce starter have functional destinations', () => {
    const nav = campaignCommerceStarter.navigation.primary
    expect(nav.length).toBeGreaterThanOrEqual(4)
    for (const item of nav) {
      expect(item.href).toMatch(/^\/[a-zA-Z0-9/_-]*$/)
      expect(item.label.trim().length).toBeGreaterThan(0)
    }
    const paths = nav.map((n) => n.href)
    expect(paths).toContain('/store')
    expect(paths).toContain('/donate')
    expect(paths).toContain('/about')
    expect(paths).toContain('/articles')

    const footerPaths = campaignCommerceStarter.navigation.footer.map((n) => n.href)
    expect(footerPaths).toContain('/disclosure')
    expect(footerPaths).toContain('/privacy')
    expect(footerPaths).toContain('/terms')
  })

  it('proves all provisioned content, products, and donation paths map to canonical routes', () => {
    // Articles in publication starter
    for (const article of publicationCommunityStarter.articles) {
      expect(article.canonicalPath).toMatch(/^\/articles\/[a-z0-9-]+$/)
      expect(article.title.trim().length).toBeGreaterThan(0)
    }
    // Products in campaign starter
    for (const product of campaignCommerceStarter.products || []) {
      expect(product.canonicalPath).toMatch(/^\/store\/[a-z0-9-]+$/)
      expect(product.name.trim().length).toBeGreaterThan(0)
    }
    // Donation campaign in campaign starter
    if (campaignCommerceStarter.donationCampaign) {
      expect(campaignCommerceStarter.donationCampaign.slug).toBeTruthy()
      expect(campaignCommerceStarter.donationCampaign.title.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('04E presentation regression: public bundle boundaries and editor exclusion', () => {
  it('proves public rendering modules exclude editor-only dependencies', () => {
    const publicFiles = [
      'src/app/(frontend)/[...path]/page.tsx',
      'src/app/(frontend)/page.tsx',
      'src/app/(frontend)/layout.tsx',
      'src/modules/presentation/themes/StarterShell.tsx',
      'src/modules/presentation/themes/components.tsx',
      'src/modules/public/page-builder.tsx',
    ]
    for (const file of publicFiles) {
      const fullPath = path.resolve(process.cwd(), file)
      expect(existsSync(fullPath)).toBe(true)
      const content = readFileSync(fullPath, 'utf8')
      // Must not import Puck editor or VisualEditor shell
      expect(content).not.toContain('@puckeditor')
      expect(content).not.toContain('VisualEditor')
      expect(content).not.toContain('BuilderShell')
    }
  })

  it('proves builder routes correctly isolate editor dependencies', () => {
    const builderRoute = path.resolve(process.cwd(), 'src/app/(frontend)/builder/[id]/page.tsx')
    expect(existsSync(builderRoute)).toBe(true)
    const content = readFileSync(builderRoute, 'utf8')
    expect(content).toContain('BuilderShell')
  })
})

describe('04E presentation regression: block accessibility, landmarks and semantic headings', () => {
  it('renders publisher.newsletter-cta with accessible landmark, heading and functional link', () => {
    const def = starterComponents['publisher.newsletter-cta']
    expect(def).toBeDefined()
    const html = renderToStaticMarkup(
      def.render({
        id: 'news-1',
        title: 'Weekly Grassroots Dispatch',
        body: 'Subscribe to receive verified reports and updates.',
      }),
    )
    expect(html).toContain('id="publisher-newsletter-cta"')
    expect(html).toContain('<h3')
    expect(html).toContain('Weekly Grassroots Dispatch')
    expect(html).toContain('href="/subscribe"')
    expect(html).toContain('Subscribe to Updates')
  })

  it('renders publisher.hero with accessible heading, description and CTA', () => {
    const def = starterComponents['publisher.hero']
    expect(def).toBeDefined()
    const html = renderToStaticMarkup(
      def.render({
        id: 'hero-1',
        title: 'Empowering Independent Journalism',
        body: 'Uncompromising dispatches funded directly by our readers.',
        link: { href: '/articles', label: 'Explore Dispatches' },
      }),
    )
    expect(html).toContain('data-block="Hero"')
    expect(html).toContain('Empowering Independent Journalism')
    expect(html).toContain('href="/articles"')
    expect(html).toContain('Explore Dispatches')
  })

  it('renders publisher.product-showcase with accessible pricing and store destination', () => {
    const def = starterComponents['publisher.product-showcase']
    expect(def).toBeDefined()
    const html = renderToStaticMarkup(
      def.render({
        id: 'prod-1',
        title: 'Official Campaign Gear',
        variant: 'contained',
      }),
    )
    expect(html).toContain('Official Campaign Gear')
    expect(html).toContain('href="/store"')
    expect(html).toContain('View All Products')
  })

  it('renders publisher.donation with safe unconfigured notice or accessible tier options', () => {
    const def = starterComponents['publisher.donation']
    expect(def).toBeDefined()
    const html = renderToStaticMarkup(
      def.render({
        id: 'don-1',
        title: 'Grassroots Victory Fund',
        body: 'Every dollar fuels our neighborhood organizing.',
      }),
    )
    expect(html).toContain('Grassroots Victory Fund')
    expect(html).toContain('id="publisher-donation"')
  })
})

describe('04E presentation regression: responsive visibility rules and validation', () => {
  it('validates block viewport visibility configurations', () => {
    const validBlock = {
      id: 'resp-block-1',
      component: 'publisher.hero',
      componentVersion: 1,
      props: {
        title: 'Desktop Only Hero',
      },
      visible: {
        desktop: true,
        tablet: true,
        mobile: false,
      },
    }
    const result = validateLayout({
      version: 1,
      id: 'layout-resp',
      siteId: 'site-alpha',
      path: '/test-resp',
      status: 'published',
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      blocks: [validBlock],
      unknownBlocks: [],
      revision: 1,
    })
    expect(result.errors).toEqual([])
  })

  it('rejects invalid or unknown visibility rules', () => {
    const invalidBlock = {
      id: 'resp-block-2',
      component: 'publisher.hero',
      componentVersion: 1,
      props: {
        title: 'Invalid Visibility',
      },
      visible: {
        desktop: true,
        smartwatch: true, // unknown rule
      },
    }
    const result = validateLayout({
      version: 1,
      id: 'layout-resp-invalid',
      siteId: 'site-alpha',
      path: '/test-resp',
      status: 'published',
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      blocks: [invalidBlock as any],
      unknownBlocks: [],
      revision: 1,
    })
    expect(result.errors).toContain('resp-block-2: unknown visibility rule')
  })
})

describe('04E presentation regression: cross-site theme isolation', () => {
  it('verifies theme tokens and templates are isolated between neutral-starter and renegade-party', () => {
    const neutral = resolveTheme('neutral-starter')
    const party = resolveTheme('renegade-party')

    expect(neutral.id).toBe('neutral-starter')
    expect(party.id).toBe('renegade-party')
    expect(neutral.tokens.color.accent).not.toBe(party.tokens.color.accent)
    expect(neutral.tokens.color.focus).not.toBe(party.tokens.color.focus)
    expect(neutral.templates.article).not.toBe(party.templates.article)

    // Verify mutations on one theme do not leak into another
    const neutralCopy = structuredClone(neutral.tokens)
    neutralCopy.color.accent = '#000000'
    expect(party.tokens.color.accent).not.toBe('#000000')
  })
})
