/* eslint-disable @typescript-eslint/no-explicit-any */
// RC2-F-02 setup: donation campaign, two published subscription plans with
// distinct entitlements, affiliate offers (valid + a creation-refused unsafe
// one), a first-party referral program + code, and a small product the
// referral purchase will buy. Operator-path creation in-process where the
// product's own creation functions are the operator surface.
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { getPayload } from 'payload'
import { createAffiliateOffer } from '../../src/modules/commerce/affiliate-offers-runtime'
import { createReferralCode } from '../../src/modules/commerce/referral-lifecycle'

describe('RC2-F-02 revenue setup', () => {
  it('provisions campaign, plans, offers, referral code and a product for Site A', async () => {
    const payload: any = await getPayload({ config })
    const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
    const siteId = String(world.siteA.siteId)
    const suffix = String(world.suffix)
    const findOrCreate = async (collection: string, where: any, data: any) => {
      const found: any = await payload.find({
        collection,
        where,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (found.docs[0]) return found.docs[0]
      return payload.create({ collection, data, overrideAccess: true })
    }

    // Donation campaign (draft -> active, as an operator would)
    const campaign: any = await findOrCreate(
      'donation-campaigns',
      { campaignKey: { equals: `f02-fund-${suffix}` } },
      {
        site: siteId,
        campaignKey: `f02-fund-${suffix}`,
        version: 1,
        title: 'F-02 Community Fund',
        purpose: 'Support the F-02 journey.',
        allowedAmounts: ['1000'],
        currency: 'USD',
        recurrence: ['one-time'],
        privacyDefault: 'anonymous',
        disclosures: ['No tax deductibility represented.'],
        lifecycle: 'draft',
      },
    )
    if (campaign.lifecycle !== 'active')
      await payload.update({
        collection: 'donation-campaigns',
        id: campaign.id,
        data: { lifecycle: 'active' },
        overrideAccess: true,
      })

    // Two published plans with distinct entitlements on the sandbox provider
    const planBase = {
      site: siteId,
      revision: 1,
      currency: 'USD',
      interval: 'month',
      intervalCount: 1,
      trialDays: 0,
      trialEligibility: 'unrestricted',
      cancelPolicy: 'period_end',
      changePolicy: 'immediate',
      taxPolicy: 'exclusive',
      lifecycle: 'published',
      publishedAt: new Date().toISOString(),
    }
    const planA: any = await findOrCreate(
      'plan-revisions',
      { planKey: { equals: `f02-premium-${suffix}` } },
      {
        ...planBase,
        planKey: `f02-premium-${suffix}`,
        name: 'F-02 Premium Reading',
        amountMinor: '1000',
        entitlements: [
          { siteId, resource: 'publication', capability: 'read-premium', term: 'subscription' },
        ],
        providerMappings: { 'deterministic-test': `price_f02a_${suffix}` },
      },
    )
    const planB: any = await findOrCreate(
      'plan-revisions',
      { planKey: { equals: `f02-media-${suffix}` } },
      {
        ...planBase,
        planKey: `f02-media-${suffix}`,
        name: 'F-02 Media Downloads',
        amountMinor: '1500',
        entitlements: [
          { siteId, resource: 'media', capability: 'download-hd', term: 'subscription' },
        ],
        providerMappings: { 'deterministic-test': `price_f02b_${suffix}` },
      },
    )

    // Affiliate offer through the validated creation path (reuse on re-run)
    const existingOffer = (
      await payload.db.pool.query('SELECT id FROM affiliate_offers WHERE site_id=$1 AND slug=$2', [
        siteId,
        `f02-partner-${suffix}`,
      ])
    ).rows[0]
    const offer =
      existingOffer ??
      (await createAffiliateOffer(payload, siteId, {
        slug: `f02-partner-${suffix}`,
        name: 'F-02 Partner Offer',
        destinationUrl: 'https://partner.example.com/product/123',
        allowedDomains: ['partner.example.com'],
        networkReference: { network: 'custom', programId: 'f02' },
        disclosure: { required: true, text: 'We may earn a commission.', placement: 'above' },
        status: 'active',
        trackingParameters: { ref: 'renegade' },
      }))
    // An offer whose destination escapes its allowlist is refused at creation
    let unsafeRefused = false
    try {
      await createAffiliateOffer(payload, siteId, {
        slug: `f02-unsafe-${suffix}`,
        name: 'F-02 Unsafe Offer',
        destinationUrl: 'https://evil.example.com/landing',
        allowedDomains: ['partner.example.com'],
        networkReference: { network: 'custom', programId: 'f02' },
        disclosure: { required: true, text: 'We may earn a commission.', placement: 'above' },
        status: 'active',
        trackingParameters: {},
      })
    } catch {
      unsafeRefused = true
    }

    // First-party referral program + code (operator service path)
    // Referrer: an active member holding a site role row (required by the
    // referral service — the same role-row seam as RC2-DEBT-19)
    const referrer: any = await findOrCreate(
      'members',
      { email: { equals: `f02-referrer-${suffix}@example.com` } },
      {
        email: `f02-referrer-${suffix}@example.com`,
        displayName: 'F-02 Referrer',
        status: 'active',
      },
    )
    await findOrCreate(
      'member-site-roles',
      {
        and: [{ member: { equals: referrer.id } }, { site: { equals: siteId } }],
      },
      { member: referrer.id, site: siteId, role: 'member' },
    )

    const existingCode = (
      await payload.db.pool.query('SELECT id FROM referral_codes WHERE site_id=$1 AND code=$2', [
        siteId,
        `F02REF${suffix.slice(0, 4).toUpperCase()}`,
      ])
    ).rows[0]
    const referral =
      existingCode ??
      (await createReferralCode(
        payload,
        siteId,
        {
          memberId: String(referrer.id),
          code: `F02REF${suffix.slice(0, 4).toUpperCase()}`,
          program: {
            version: 1,
            name: 'F-02 Referral Program',
            status: 'active',
            eligibility: {
              allowedMemberRoles: ['member'],
              minimumAccountAgeDays: 0,
              requireVerifiedEmail: false,
            },
            codes: { codePrefix: 'F02-', minLength: 4, maxLength: 16 },
            benefit: {
              referrerRewardType: 'basis_points',
              referrerRewardValue: '1000',
              refereeDiscountType: 'basis_points',
              refereeDiscountValue: '500',
              maxCommissionPerOrderMinor: '5000',
            },
            attribution: { model: 'last-touch', windowDays: 30, requireCookieConsent: true },
            selfReferralRules: {
              blockSameMemberId: true,
              blockSameEmail: true,
              blockSamePaymentMethod: false,
              blockSameIpHash: false,
            },
            holdPeriodDays: 14,
            reversalRules: {
              reverseOnOrderRefund: true,
              reverseOnOrderCancel: true,
              reverseOnDispute: true,
            },
            terms: {
              version: '1.0',
              publishedAt: '2026-11-01T00:00:00.000Z',
              text: 'F-02 journey referral terms.',
            },
          },
        },
        'f02-operator',
      ))

    // Small product for the referral purchase (published by the journey)
    const f01 = JSON.parse(readFileSync('/tmp/f01-setup.json', 'utf8'))
    const sku = `F02-MUG-${suffix}`
    const product: any = await findOrCreate(
      'products',
      { slug: { equals: `f02-mug-${suffix}` } },
      {
        site: siteId,
        merchantConnection: f01.merchantId,
        name: `F-02 Referral Mug ${suffix}`,
        slug: `f02-mug-${suffix}`,
        canonicalPath: `/store/f02-mug-${suffix}`,
        kind: 'physical',
        state: 'draft',
        productCapabilities: ['shippable'],
        optionDimensions: [{ key: 'color', label: 'Color', values: ['Black'] }],
        variants: [
          {
            sku,
            title: 'Referral Mug Black',
            status: 'active',
            optionValues: { color: 'Black' },
            inventoryPolicy: 'tracked',
            inventoryQuantity: 5,
            weightGrams: 300,
            dimensionsMm: { length: 120, width: 90, height: 90 },
          },
        ],
        prices: [{ currency: 'USD', amountMinor: '1000', variantSku: sku }],
        offers: [
          {
            id: `offer-f02-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: sku,
            amountMinor: '1000',
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
      },
    )

    // --- Site B provisioning: in this topology the loopback host resolves to
    // Site B, and the deterministic sandbox only enables on loopback (or a
    // .test host matching APP_URL). Donation + subscription legs therefore
    // run on Site B, whose host IS reachable both ways.
    const siteB = String(world.siteB.siteId)
    const merchantB: any = await findOrCreate(
      'merchant-connections',
      {
        and: [{ site: { equals: siteB } }, { providerKey: { equals: 'deterministic-test' } }],
      },
      {
        site: siteB,
        label: `F-02 Sandbox Merchant B ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    )
    await findOrCreate(
      'payment-method-capabilities',
      {
        and: [
          { merchantConnection: { equals: merchantB.id } },
          { providerKey: { equals: 'deterministic-test' } },
        ],
      },
      {
        site: siteB,
        merchantConnection: merchantB.id,
        providerKey: 'deterministic-test',
        railKey: `local-card-f02b-${suffix}`,
        family: 'card',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['USD'],
        settlementCurrencies: ['USD'],
        enabled: true,
        health: 'healthy',
      },
    )
    const campaignB: any = await findOrCreate(
      'donation-campaigns',
      { campaignKey: { equals: `f02-fund-b-${suffix}` } },
      {
        site: siteB,
        campaignKey: `f02-fund-b-${suffix}`,
        version: 1,
        title: 'F-02 Community Fund B',
        purpose: 'Support the F-02 journey (Site B).',
        allowedAmounts: ['1000'],
        currency: 'USD',
        recurrence: ['one-time'],
        privacyDefault: 'anonymous',
        disclosures: ['No tax deductibility represented.'],
        lifecycle: 'draft',
      },
    )
    if (campaignB.lifecycle !== 'active')
      await payload.update({
        collection: 'donation-campaigns',
        id: campaignB.id,
        data: { lifecycle: 'active' },
        overrideAccess: true,
      })
    const planBaseB = { ...planBase, site: siteB }
    const planAB: any = await findOrCreate(
      'plan-revisions',
      { planKey: { equals: `f02-premium-b-${suffix}` } },
      {
        ...planBaseB,
        planKey: `f02-premium-b-${suffix}`,
        name: 'F-02 Premium Reading',
        amountMinor: '1000',
        entitlements: [
          {
            siteId: siteB,
            resource: 'publication',
            capability: 'read-premium',
            term: 'subscription',
          },
        ],
        providerMappings: { 'deterministic-test': `price_f02a_${suffix}` },
      },
    )
    const planBB: any = await findOrCreate(
      'plan-revisions',
      { planKey: { equals: `f02-media-b-${suffix}` } },
      {
        ...planBaseB,
        planKey: `f02-media-b-${suffix}`,
        name: 'F-02 Media Downloads',
        amountMinor: '1500',
        entitlements: [
          { siteId: siteB, resource: 'media', capability: 'download-hd', term: 'subscription' },
        ],
        providerMappings: { 'deterministic-test': `price_f02b_${suffix}` },
      },
    )

    writeFileSync(
      '/tmp/f02-setup-b.json',
      JSON.stringify({
        siteId: siteB,
        merchantBId: String(merchantB.id),
        campaignBId: String(campaignB.id),
        planABId: String(planAB.id),
        planBBId: String(planBB.id),
      }),
    )

    writeFileSync(
      '/tmp/f02-setup.json',
      JSON.stringify({
        siteId,
        campaignId: String(campaign.id),
        campaignKey: `f02-fund-${suffix}`,
        planAId: String(planA.id),
        planBId: String(planB.id),
        offerId: String(offer.id),
        unsafeRefused,
        referralCode: `F02REF${suffix.slice(0, 4).toUpperCase()}`,
        referral: referral ?? null,
        productId: String(product.id),
        sku,
      }),
    )
    expect(unsafeRefused).toBe(true)
    expect(planA.id && planB.id && campaign.id).toBeTruthy()
  }, 120000)
})
