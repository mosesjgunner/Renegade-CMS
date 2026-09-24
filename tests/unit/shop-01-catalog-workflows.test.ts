import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  affiliateFreshness,
  assertCatalogReady,
  authorizePrivateDownload,
  catalogChecksum,
  catalogReadiness,
  minorMoneyDecimal,
  planCatalogImport,
  resolveActiveOffer,
  trackedAffiliateUrl,
  validateCatalogProduct,
  type CatalogProduct,
} from '../../src/modules/commerce/catalog'
import { deriveDownloadGrantKey, snapshotQuotedLines } from '../../src/modules/commerce/service'
import { Products } from '../../src/collections/Commerce'
import { globalSchemaRegistry } from '../../src/modules/public/discovery'
import { ProductDetail } from '../../src/modules/commerce/ProductView'

const native: CatalogProduct = {
  id: 'native',
  siteId: 'renegade-party',
  slug: 'field-guide',
  canonicalPath: '/store/field-guide',
  name: 'Field Guide',
  state: 'published',
  capabilities: ['digital-entitlement'],
  optionDimensions: [{ key: 'format', label: 'Format', values: ['pdf', 'epub'] }],
  variants: [
    {
      sku: 'GUIDE-PDF',
      title: 'PDF',
      optionValues: { format: 'pdf' },
      status: 'active',
      inventory: { policy: 'untracked' },
    },
  ],
  offers: [
    {
      id: 'guide-usd',
      version: 2,
      status: 'active',
      variantSku: 'GUIDE-PDF',
      amountMinor: '1200',
      currency: 'USD',
      compareAtMinor: '1500',
      compareAtEvidence: {
        source: 'publisher price history',
        observedAt: '2026-09-01T00:00:00.000Z',
      },
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-10-01T00:00:00.000Z',
      segmentPolicy: { mode: 'public' },
      taxDisplay: 'exclusive',
    },
  ],
  digitalDelivery: {
    entitlement: 'product.field-guide',
    downloadLimit: 3,
    expiresAfterDays: 30,
    assets: [
      {
        mediaId: 'private-guide',
        rightsStatus: 'approved',
        malwareStatus: 'clean',
        publicOriginal: false,
      },
    ],
  },
}

const affiliate: CatalogProduct = {
  id: 'affiliate',
  siteId: 'renegade-party',
  slug: 'reading-lamp',
  canonicalPath: '/store/reading-lamp',
  name: 'Reading Lamp',
  state: 'published',
  capabilities: ['affiliate'],
  optionDimensions: [],
  variants: [
    {
      sku: 'LAMP-REMOTE',
      title: 'Reading Lamp',
      optionValues: {},
      inventory: { policy: 'affiliate' },
    },
  ],
  offers: [
    {
      id: 'lamp-usd',
      version: 1,
      status: 'active',
      amountMinor: '3999',
      currency: 'USD',
      taxDisplay: 'exclusive',
    },
  ],
  affiliate: {
    destinationUrl: 'https://seller.example/lamp?campaign=old',
    disclosure: 'We may earn a commission.',
    observedAt: '2026-09-22T00:00:00.000Z',
    freshnessHours: 24,
    trackingParameters: { utm_source: 'renegade', evil: 'drop-me' },
    remotePrice: { amountMinor: '3999', currency: 'USD' },
    remoteAvailability: 'in-stock',
  },
}

const pod: CatalogProduct = {
  id: 'pod',
  siteId: 'renegade-party',
  slug: 'party-shirt',
  canonicalPath: '/store/party-shirt',
  name: 'Party Shirt',
  state: 'approved',
  capabilities: ['shippable', 'pod'],
  optionDimensions: [
    { key: 'size', label: 'Size', values: ['m', 'l'] },
    { key: 'color', label: 'Color', values: ['black'] },
  ],
  variants: [
    {
      sku: 'SHIRT-M-BLK',
      title: 'Medium black',
      optionValues: { size: 'm', color: 'black' },
      weightGrams: 180,
      dimensionsMm: { length: 300, width: 240, height: 20 },
      inventory: { policy: 'pod' },
    },
  ],
  offers: [
    {
      id: 'shirt-usd',
      version: 1,
      status: 'active',
      variantSku: 'SHIRT-M-BLK',
      amountMinor: '2800',
      currency: 'USD',
      taxDisplay: 'exclusive',
    },
  ],
  podMappings: [
    {
      providerKey: 'fixture-pod',
      remoteProductId: 'remote-shirt',
      remoteVariantId: 'remote-m-black',
      variantSku: 'SHIRT-M-BLK',
      optionValues: { size: 'm', color: 'black' },
      artworkRevisionId: 'art-rev-7',
      mockupProvenance: { source: 'provider', generatedAt: '2026-09-20T00:00:00.000Z' },
      snapshot: {
        costMinor: '1100',
        currency: 'USD',
        available: true,
        observedAt: '2026-09-22T00:00:00.000Z',
      },
      reviewStatus: 'approved',
    },
  ],
}

describe('SHOP-01 canonical catalog workflows', () => {
  it('limits anonymous collection reads to published products', async () => {
    const read = Products.access?.read
    expect(typeof read).toBe('function')
    if (typeof read !== 'function') throw new Error('Product read access must be a function.')
    expect(await read({ req: { user: null } } as never)).toEqual({
      state: { equals: 'published' },
    })
    expect(
      await read({
        req: { user: { role: 'staff' } },
      } as never),
    ).toBe(true)
  })
  it('requires the governed workflow boundary for publication', () => {
    const validate = Products.hooks?.beforeValidate?.[0]
    if (typeof validate !== 'function') throw new Error('Product validation hook is required.')
    expect(() =>
      validate({
        data: { state: 'published' },
        originalDoc: { state: 'approved' },
        operation: 'update',
        context: {},
      } as never),
    ).toThrow('catalog or coordinated release workflow')
  })
  it('accepts deliberate native, affiliate and manually reviewed POD products', () => {
    expect(assertCatalogReady(native)).toBe(native)
    expect(assertCatalogReady(affiliate)).toBe(affiliate)
    expect(assertCatalogReady(pod)).toBe(pod)
  })
  it('rejects an impossible or undeclared variant instead of generating a Cartesian catalog', () => {
    const invalid = {
      ...pod,
      variants: [{ ...pod.variants[0], optionValues: { size: 'xl', color: 'black' } }],
    }
    expect(validateCatalogProduct(invalid)).toContain(
      'Variant SHIRT-M-BLK uses an undeclared size value.',
    )
  })
  it('rejects POD option mismatch and unreviewed mappings', () => {
    const invalid = {
      ...pod,
      podMappings: [
        {
          ...pod.podMappings![0],
          optionValues: { size: 'l', color: 'black' },
          reviewStatus: 'pending' as const,
        },
      ],
    }
    expect(validateCatalogProduct(invalid)).toEqual(
      expect.arrayContaining([
        'POD mapping for SHIRT-M-BLK does not match its canonical options.',
        'POD mapping for SHIRT-M-BLK requires manual approval.',
      ]),
    )
  })
  it('resolves only active in-window, segment-eligible offer versions', () => {
    expect(
      resolveActiveOffer(native, {
        variantSku: 'GUIDE-PDF',
        currency: 'USD',
        now: '2026-09-23T00:00:00.000Z',
      })?.version,
    ).toBe(2)
    expect(
      resolveActiveOffer(native, {
        variantSku: 'GUIDE-PDF',
        currency: 'USD',
        now: '2026-11-01T00:00:00.000Z',
      }),
    ).toBeNull()
  })
  it('requires evidence for compare-at pricing and capability-specific recurring terms', () => {
    const invalid = {
      ...native,
      offers: [
        {
          ...native.offers[0],
          compareAtEvidence: undefined,
          recurring: { interval: 'month' as const, intervalCount: 1 },
        },
      ],
    }
    expect(validateCatalogProduct(invalid)).toEqual(
      expect.arrayContaining([
        'Offer guide-usd compare-at price lacks valid evidence.',
        'Offer guide-usd recurring terms require subscription capability.',
      ]),
    )
  })
  it('validates capability-specific physical, subscription and donation semantics', () => {
    expect(
      validateCatalogProduct({
        ...pod,
        variants: [{ ...pod.variants[0], weightGrams: undefined, dimensionsMm: undefined }],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Shippable variant SHIRT-M-BLK requires a positive weight.',
        'Shippable variant SHIRT-M-BLK requires positive integer dimensions.',
      ]),
    )
    expect(
      validateCatalogProduct({
        ...native,
        capabilities: ['subscription', 'donation'],
        digitalDelivery: undefined,
      }),
    ).toEqual(
      expect.arrayContaining([
        'Subscription products require recurring offer terms.',
        'Donation products require donation offer terms.',
      ]),
    )
  })
  it('denies public, infected or unapproved digital originals', () => {
    const invalid = {
      ...native,
      digitalDelivery: {
        ...native.digitalDelivery!,
        assets: [
          {
            mediaId: 'private-guide',
            rightsStatus: 'pending' as const,
            malwareStatus: 'infected' as const,
            publicOriginal: true,
          },
        ],
      },
    }
    expect(validateCatalogProduct(invalid)).toEqual(
      expect.arrayContaining([
        'Digital asset private-guide must not expose its original publicly.',
        'Digital asset private-guide requires approved rights and a clean malware scan.',
      ]),
    )
  })
  it('enforces entitlement expiry, revocation and download limits', () => {
    expect(
      authorizePrivateDownload(
        { id: 'g', entitlementActive: true, downloadCount: 2, downloadLimit: 3 },
        new Date('2026-09-23'),
      ),
    ).toEqual({ allowed: true })
    expect(
      authorizePrivateDownload({
        id: 'g',
        entitlementActive: true,
        downloadCount: 3,
        downloadLimit: 3,
      }),
    ).toEqual({ allowed: false, reason: 'DOWNLOAD_LIMIT_REACHED' })
    expect(authorizePrivateDownload(null)).toEqual({
      allowed: false,
      reason: 'ENTITLEMENT_REQUIRED',
    })
  })
  it('turns stale affiliate price and stock into explicit uncertainty and allowlists tracking', () => {
    expect(affiliateFreshness(affiliate.affiliate!, new Date('2026-09-24T00:00:01.000Z'))).toEqual({
      stale: true,
      availability: 'unknown',
      price: null,
    })
    const destination = new URL(trackedAffiliateUrl(affiliate.affiliate!))
    expect(destination.searchParams.get('utm_source')).toBe('renegade')
    expect(destination.searchParams.has('evil')).toBe(false)
  })
  it('plans deterministic dry-runs and identifies an idempotent import replay', () => {
    const first = planCatalogImport([native, affiliate, pod], [])
    const replay = planCatalogImport([native, affiliate, pod], [native, affiliate, pod])
    expect(first.creates).toHaveLength(3)
    expect(replay.unchanged).toEqual(['field-guide', 'reading-lamp', 'party-shirt'])
    expect(first.checksum).toBe(replay.checksum)
    expect(catalogChecksum({ b: 2, a: 1 })).toBe(catalogChecksum({ a: 1, b: 2 }))
  })
  it('reports readiness and preserves exact minor-unit currency semantics', () => {
    expect(catalogReadiness(native)).toMatchObject({ ready: true, blockers: [] })
    expect(minorMoneyDecimal('1200', 'USD')).toBe('12.00')
    expect(minorMoneyDecimal('1200', 'JPY')).toBe('1200')
  })
  it('registers Product schema and catalog search lifecycle hooks', () => {
    const extension = globalSchemaRegistry.getExtension('products')
    expect(extension?.primarySchemaType).toBe('Product')
    const result = globalSchemaRegistry.buildExtensionNodes('products', {
      canonicalUrl: 'https://party.example/store/field-guide',
      canonicalPath: '/store/field-guide',
      base: 'https://party.example',
      record: {
        ...native,
        site: native.siteId,
        productCapabilities: native.capabilities,
        optionDimensions: native.optionDimensions,
        digitalDelivery: native.digitalDelivery,
      },
      site: { siteName: 'Renegade Party', base: 'https://party.example' },
    })
    expect(result.issues).toEqual([])
    expect(result.nodes[0]).toMatchObject({
      '@type': 'Product',
      name: 'Field Guide',
      offers: [expect.objectContaining({ price: '12.00', priceCurrency: 'USD' })],
    })
    expect(Products.hooks?.afterChange).toHaveLength(2)
    expect(Products.hooks?.afterDelete).toHaveLength(1)
  })
  it('renders an accessible provider-independent product detail surface', () => {
    const html = renderToStaticMarkup(
      createElement(ProductDetail, {
        product: {
          ...native,
          productCapabilities: native.capabilities,
          optionDimensions: native.optionDimensions,
          media: [{ id: 'hero-1', altText: 'Field Guide cover' }],
          summary: 'A practical field guide.',
        },
      }),
    )
    expect(html).toContain('<h1')
    expect(html).toContain('aria-labelledby="purchase-heading"')
    expect(html).toContain('alt="Field Guide cover"')
    expect(html).toContain(
      'Product browsing and published prices do not require payment credentials.',
    )
  })
  it('pins the latest eligible offer in checkout and denies unavailable inventory', () => {
    const product = {
      id: 'native',
      name: 'Field Guide',
      state: 'published',
      kind: 'digital',
      variants: [
        { sku: 'GUIDE-PDF', title: 'PDF', status: 'active', inventoryPolicy: 'untracked' },
      ],
      offers: [
        {
          offerId: 'guide',
          version: 1,
          status: 'active',
          variantSku: 'GUIDE-PDF',
          amountMinor: '1500',
          currency: 'USD',
        },
        {
          offerId: 'guide',
          version: 2,
          status: 'active',
          variantSku: 'GUIDE-PDF',
          amountMinor: '1200',
          currency: 'USD',
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      digitalDelivery: { entitlement: 'product.field-guide' },
    }
    const lines = snapshotQuotedLines({
      cartLines: [
        {
          productId: 'native',
          variantSku: 'GUIDE-PDF',
          quantity: 2,
          merchantConnectionId: 'merchant',
          kind: 'digital',
        },
      ],
      products: [product],
      currency: 'USD',
      now: '2026-09-23T00:00:00.000Z',
    })
    expect(lines[0]).toMatchObject({
      unitAmountMinor: '1200',
      lineAmountMinor: '2400',
      entitlement: 'product.field-guide',
    })
    expect(() =>
      snapshotQuotedLines({
        cartLines: [
          {
            productId: 'native',
            variantSku: 'GUIDE-PDF',
            quantity: 1,
            merchantConnectionId: 'merchant',
            kind: 'digital',
          },
        ],
        products: [{ ...product, variants: [{ ...product.variants[0], status: 'unavailable' }] }],
        currency: 'USD',
      }),
    ).toThrow('unavailable')
  })
  it('validates donation amounts server-side and keeps affiliates out of local checkout', () => {
    const donationProduct = {
      id: 'donation',
      name: 'Support the work',
      state: 'published',
      kind: 'donation',
      productCapabilities: ['donation'],
      variants: [{ sku: 'DONATE', title: 'Donation', status: 'active' }],
      offers: [
        {
          offerId: 'donation-usd',
          version: 1,
          status: 'active',
          currency: 'USD',
          amountMinor: '500',
          donation: { minimumMinor: '500' },
        },
      ],
    }
    expect(
      snapshotQuotedLines({
        cartLines: [
          {
            productId: 'donation',
            variantSku: 'DONATE',
            quantity: 1,
            merchantConnectionId: 'merchant',
            kind: 'donation',
            donationAmountMinor: '2500',
          },
        ],
        products: [donationProduct],
        currency: 'USD',
      })[0],
    ).toMatchObject({ unitAmountMinor: '2500', lineAmountMinor: '2500' })
    expect(() =>
      snapshotQuotedLines({
        cartLines: [
          {
            productId: 'donation',
            variantSku: 'DONATE',
            quantity: 1,
            merchantConnectionId: 'merchant',
            kind: 'donation',
            donationAmountMinor: '499',
          },
        ],
        products: [donationProduct],
        currency: 'USD',
      }),
    ).toThrow('minimum')
    expect(() =>
      snapshotQuotedLines({
        cartLines: [
          {
            productId: 'affiliate',
            variantSku: 'LAMP-REMOTE',
            quantity: 1,
            merchantConnectionId: 'merchant',
            kind: 'physical',
          },
        ],
        products: [
          {
            id: 'affiliate',
            name: 'Lamp',
            state: 'published',
            kind: 'affiliate',
            variants: [{ sku: 'LAMP-REMOTE', title: 'Lamp' }],
            offers: [
              {
                offerId: 'lamp',
                version: 1,
                status: 'active',
                currency: 'USD',
                amountMinor: '3999',
              },
            ],
          },
        ],
        currency: 'USD',
      }),
    ).toThrow('disclosed seller')
  })
  it('derives stable unguessable delivery keys without storing the bearer secret', () => {
    const input = {
      orderId: 'order-1',
      productId: 'native',
      variantSku: 'GUIDE-PDF',
      mediaId: 'asset-1',
    }
    expect(deriveDownloadGrantKey(input, 'a-long-delivery-secret')).toBe(
      deriveDownloadGrantKey(input, 'a-long-delivery-secret'),
    )
    expect(deriveDownloadGrantKey(input, 'another-long-secret')).not.toBe(
      deriveDownloadGrantKey(input, 'a-long-delivery-secret'),
    )
  })
})
