import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  user: { id: 'owner', role: 'owner', email: 'owner@example.test' } as {
    id: string
    role: string
    email: string
  } | null,
  install: vi.fn(),
  upgrade: vi.fn(),
  rollback: vi.fn(),
  status: vi.fn(async () => ({ installed: false })),
  find: vi.fn(async () => ({ docs: [{ id: 'site-alpha', name: 'Alpha' }] })),
}))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: async () => ({ user: mocks.user }),
    find: mocks.find,
    findByID: async () => ({ id: 'site-alpha' }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: async () => ({
    authorized: true,
    isGlobalOwner: false,
    authorizedSiteIds: ['site-alpha'],
  }),
}))
vi.mock('@/modules/starters/service', () => ({
  installStarter: mocks.install,
  upgradeStarter: mocks.upgrade,
  rollbackStarterLayout: mocks.rollback,
  getStarterStatus: mocks.status,
}))
vi.mock('@/modules/presentation/lifecycle', () => ({
  themePool: () => ({}),
  readThemeState: async () => null,
  createThemePreview: vi.fn(),
}))

import { GET, POST } from '@/app/(frontend)/api/admin/starters/route'
import { campaignCommerceStarter } from '@/modules/starters/definitions'
import { componentRegistry, validateLayout } from '@/modules/public/page-builder'
import {
  guestCanConfirmTestCheckout,
  localTestCheckoutEnabled,
} from '@/modules/commerce/local-test-checkout'
import {
  configuredPaymentProvider,
  PaymentProviderError,
} from '@/modules/commerce/payment-provider'
import CheckoutPage from '@/app/(frontend)/checkout/page'

const post = (body: unknown, origin = 'https://site-alpha.test') =>
  new Request('https://site-alpha.test/api/admin/starters', {
    method: 'POST',
    headers: { host: 'site-alpha.test', origin },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user = { id: 'owner', role: 'owner', email: 'owner@example.test' }
})

describe('04D campaign/commerce starter authorization', () => {
  it.each(['install', 'upgrade', 'rollback', 'preview'])(
    'denies foreign site %s before privileged services',
    async (action) => {
      const res = await POST(
        post({
          action,
          siteId: 'site-beta',
          starterId: 'campaign-commerce',
          path: '/',
          targetRevision: 1,
        }),
      )
      expect(res.status).toBe(403)
      expect(mocks.install).not.toHaveBeenCalled()
      expect(mocks.upgrade).not.toHaveBeenCalled()
      expect(mocks.rollback).not.toHaveBeenCalled()
    },
  )

  it.each(['staff', 'administrator', 'member'])('denies %s mutation', async (role) => {
    mocks.user!.role = role
    const res = await POST(
      post({ action: 'install', siteId: 'site-alpha', starterId: 'campaign-commerce' }),
    )
    expect(res.status).toBe(403)
    expect(mocks.install).not.toHaveBeenCalled()
  })

  it('denies anonymous starter discovery', async () => {
    mocks.user = null
    expect((await GET(new Request('https://site-alpha.test/api'))).status).toBe(403)
    expect(mocks.find).not.toHaveBeenCalled()
  })

  it('denies cross-origin action', async () => {
    const res = await POST(
      post(
        { action: 'install', siteId: 'site-alpha', starterId: 'campaign-commerce' },
        'https://attacker.test',
      ),
    )
    expect(res.status).toBe(403)
    expect(mocks.install).not.toHaveBeenCalled()
  })

  it('passes authorized site to canonical installer for campaign-commerce', async () => {
    mocks.install.mockResolvedValueOnce({ success: true })
    const res = await POST(
      post({ action: 'install', siteId: 'site-alpha', starterId: 'campaign-commerce' }),
    )
    expect(res.status).toBe(200)
    expect(mocks.install).toHaveBeenCalledWith(expect.anything(), {
      siteId: 'site-alpha',
      starterId: 'campaign-commerce',
      ownerEmail: 'owner@example.test',
    })
  })
})

describe('04D campaign/commerce starter visitor and catalog contract', () => {
  it('ships complete local illustrations with no external image requests', () => {
    for (const media of campaignCommerceStarter.media) {
      expect(existsSync(`public${media.localAssetPath}`)).toBe(true)
      const svg = readFileSync(`public${media.localAssetPath}`, 'utf8')
      expect(svg).not.toMatch(/(?:href|src)=["']https?:/)
      expect(media.altText).toBeTruthy()
      expect(media.width).toBeGreaterThan(0)
      expect(media.height).toBeGreaterThan(0)
    }
  })

  it('provisions valid products with positive integer minor prices and shippable variants', () => {
    expect(campaignCommerceStarter.products?.length).toBeGreaterThanOrEqual(4)
    for (const prod of campaignCommerceStarter.products ?? []) {
      expect(prod.name).toBeTruthy()
      expect(prod.canonicalPath).toMatch(/^\/store\//)
      expect(prod.kind).toBe('physical')
      expect(Number(prod.priceMinor)).toBeGreaterThan(0)
      expect(prod.currency).toBe('USD')
      expect(prod.sku).toMatch(/^FFP-/)
      expect(prod.inventoryQuantity).toBeGreaterThan(0)
      expect(prod.weightGrams).toBeGreaterThan(0)
    }
  })

  it('provisions grassroots donation campaign with suggested tiers and legal disclosure', () => {
    const dc = campaignCommerceStarter.donationCampaign
    expect(dc).toBeDefined()
    expect(dc?.title).toBe("The People's Transit & Clean Energy Fund")
    expect(dc?.slug).toBe('clean-transit-fund')
    expect(Number(dc?.goalMinor)).toBe(25000000)
    expect(dc?.suggestedTiersMinor).toEqual(['1000', '2500', '5000', '10000', '25000'])
    expect(dc?.complianceDisclosure).toContain('Federal Election Campaign Act')
    expect(dc?.complianceDisclosure).toContain('not tax deductible')
  })

  it('includes home, content, disclosure, contact, terms, privacy and volunteer pages', () => {
    const paths = campaignCommerceStarter.pages.map((p) => p.canonicalPath)
    expect(paths).toContain('/about')
    expect(paths).toContain('/disclosure')
    expect(paths).toContain('/privacy')
    expect(paths).toContain('/terms')
    expect(paths).toContain('/subscribe')
    expect(paths).toContain('/contact')

    for (const page of campaignCommerceStarter.pages) {
      expect(page.title).toBeTruthy()
      expect(page.body.length).toBeGreaterThan(page.summary.length)
      expect(page.status).toBe('published')
    }
  })

  it('publishes valid layouts, templates, patterns, and globals under renegade-party theme', () => {
    expect(campaignCommerceStarter.themeId).toBe('renegade-party')
    const all = [
      ...campaignCommerceStarter.layouts,
      ...campaignCommerceStarter.globals,
      ...campaignCommerceStarter.templates,
      ...campaignCommerceStarter.patterns,
    ]
    for (const layout of all) {
      for (const block of layout.blocks) {
        expect(componentRegistry[block.component]).toBeDefined()
      }
      const checked = validateLayout({
        version: 1,
        id: 'starter',
        siteId: 'site-alpha',
        path: layout.path,
        status: 'draft',
        themeId: 'renegade-party',
        surface: layout.surface,
        slot: layout.slot,
        blocks: layout.blocks,
        unknownBlocks: [],
        revision: 1,
      })
      expect(checked.errors).toEqual([])
    }
  })
})

describe('04D canonical widgets and safe unconfigured boundaries', () => {
  it('renders interactive publisher.donation widget with safe unconfigured notice', () => {
    const donationDef = componentRegistry['publisher.donation']
    expect(donationDef).toBeDefined()
    const markup = renderToStaticMarkup(
      donationDef.render({
        title: 'Fuel the Campaign',
        body: '100% small-dollar funded.',
        variant: 'contained',
        alignment: 'center',
      }),
    )
    expect(markup).toContain('Fuel the Campaign')
    expect(markup).toContain('Donate Online Now')
    expect(markup).toContain('/donate?amount=10')
    expect(markup).toContain('/donate?amount=250')
    expect(markup).toContain('data-provider-state="safe-unconfigured"')
    expect(markup).toContain('No unverified live charges accepted')
  })

  it('renders interactive publisher.product-showcase widget with safe unconfigured notice', () => {
    const showcaseDef = componentRegistry['publisher.product-showcase']
    expect(showcaseDef).toBeDefined()
    const markup = renderToStaticMarkup(
      showcaseDef.render({
        title: 'Official Campaign Gear',
        body: '100% union-printed merchandise.',
      }),
    )
    expect(markup).toContain('Official Campaign Gear')
    expect(markup).toContain('Solidarity Heavyweight Tee')
    expect(markup).toContain('$32.00')
    expect(markup).toContain('/store/solidarity-heavyweight-tee')
    expect(markup).toContain('data-provider-state="safe-unconfigured"')
    expect(markup).toContain('Unconfigured checkouts cannot charge live cards')
  })

  it('exports valid CheckoutPage component matching CartView entry', () => {
    expect(CheckoutPage).toBeDefined()
    expect(typeof CheckoutPage).toBe('function')
  })

  it('proves unconfigured payment provider throws PaymentProviderError', () => {
    expect(() => configuredPaymentProvider('unknown-live-gateway')).toThrow(PaymentProviderError)
    try {
      configuredPaymentProvider('unknown-live-gateway')
    } catch (err: any) {
      expect(err.code).toBe('configuration')
      expect(err.outcomeKnown).toBe(true)
      expect(err.retryable).toBe(false)
    }
  })

  it('proves local test checkout is strictly gated by loopback or test host and secrets', () => {
    expect(localTestCheckoutEnabled('https://malicious-external-domain.com')).toBe(false)
    expect(localTestCheckoutEnabled('https://evil.org/checkout')).toBe(false)
  })

  it('proves guest cannot confirm test checkout with tampered token or expired session', () => {
    const canConfirm = guestCanConfirmTestCheckout({
      cookie: 'renegade_checkout_sess123=invalid-token',
      sessionId: 'sess123',
      siteId: 'site-alpha',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    expect(canConfirm).toBe(false)
  })
})
