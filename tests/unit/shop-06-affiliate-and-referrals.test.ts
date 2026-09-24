import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  calculateReferralCommission,
  evaluatePricingFreshness,
  interpolateSubId,
  isSafeAffiliateDestinationUrl,
  type AffiliateOffer,
  type ReferralProgram,
  type CommissionLedger,
} from '../../src/modules/commerce/affiliate-referral-contracts'
import {
  checkOfferLinkHealth,
  importConversionEvidence,
  resolveOutboundRedirect,
  validateAffiliateOffer,
  type RawConversionInput,
} from '../../src/modules/commerce/affiliate-service'
import {
  evaluateReferralAttribution,
  matureCommissionLedger,
  reverseCommissionEntry,
  validateReferralProgram,
  type CodeOwnerRecord,
  type ReferralCustomerContext,
} from '../../src/modules/commerce/referral-service'
import {
  approveSettlementBatch,
  createSettlementBatch,
  generateSettlementExport,
  reconcileSettlementExecution,
  summarizeCommissionLiabilities,
} from '../../src/modules/commerce/settlement-service'
import {
  AffiliateDisclosureBanner,
  AffiliateLink,
  validateAffiliateEditorial,
} from '../../src/modules/commerce/disclosures'
import { AffiliateReferralDashboard } from '../../src/modules/admin/AffiliateReferralDashboard'

const baseOffer: AffiliateOffer = {
  id: 'off-guide-1',
  siteId: 'renegade-party',
  slug: 'field-guide-lamp',
  name: 'Field Guide Reading Lamp',
  destinationUrl: 'https://seller.example/lamp?item=123',
  allowedDomains: ['seller.example'],
  networkReference: {
    network: 'amazon-associates',
    programId: 'prog_77',
    accountReference: 'renegade-20',
  },
  disclosure: {
    text: 'We may earn a commission from qualifying purchases through our partner links.',
    required: true,
    placement: 'above',
  },
  subIdTemplate: {
    template: 'subId={clickId}',
    paramName: 'subId',
    allowedTokens: ['clickId', 'clickToken'],
  },
  pricingFreshness: {
    remotePrice: { amountMinor: '3999', currency: 'USD' },
    remoteAvailability: 'in-stock',
    observedAt: '2026-09-23T00:00:00.000Z',
    freshnessHours: 24,
    source: 'api',
  },
  regions: ['US', 'CA'],
  status: 'active',
  linkHealth: {
    status: 'healthy',
    consecutiveFailures: 0,
  },
  trackingParameters: {
    utm_source: 'renegade-cms',
    utm_medium: 'affiliate',
  },
}

const baseProgram: ReferralProgram = {
  id: 'prog-fall-2026',
  siteId: 'renegade-party',
  version: 1,
  name: 'Community Creator Referral Program',
  status: 'active',
  eligibility: {
    allowedMemberRoles: ['member', 'creator', 'subscriber'],
    minimumAccountAgeDays: 7,
    requireVerifiedEmail: true,
  },
  codes: {
    codePrefix: 'REF-',
    minLength: 4,
    maxLength: 16,
  },
  benefit: {
    referrerRewardType: 'basis_points',
    referrerRewardValue: '1000', // 10%
    refereeDiscountType: 'basis_points',
    refereeDiscountValue: '500', // 5%
    maxCommissionPerOrderMinor: '5000', // max $50
  },
  attribution: {
    model: 'last-touch',
    windowDays: 30,
    requireCookieConsent: true,
  },
  selfReferralRules: {
    blockSameMemberId: true,
    blockSameEmail: true,
    blockSamePaymentMethod: true,
    blockSameIpHash: true,
  },
  holdPeriodDays: 14,
  reversalRules: {
    reverseOnOrderRefund: true,
    reverseOnOrderCancel: true,
    reverseOnDispute: true,
  },
  terms: {
    version: '1.0',
    publishedAt: '2026-09-01T00:00:00.000Z',
    text: 'Standard Community Referral Program Terms. No self-referrals or search bidding.',
  },
}

describe('SHOP-06 Affiliate and Referral Shared Contract', () => {
  describe('1. Outbound Redirect Security & Attack Prevention', () => {
    it('blocks open redirects, non-https schemes, and loopback/private IP addresses', () => {
      expect(isSafeAffiliateDestinationUrl('http://insecure.example.com/target')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('javascript:alert(1)')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('data:text/html,<script>evil()</script>')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('https://localhost:8080/evil')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('https://127.0.0.1/evil')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('https://192.168.1.50/evil')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('https://10.0.0.1/evil')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('https://user:pass@seller.example/path')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('https://seller.example/valid')).toBe(true)
    })

    it('enforces destination domain allowlist and rejects unlisted domains', () => {
      expect(
        isSafeAffiliateDestinationUrl('https://attacker.example/lamp', ['seller.example']),
      ).toBe(false)
      expect(isSafeAffiliateDestinationUrl('https://seller.example/lamp', ['seller.example'])).toBe(
        true,
      )
      expect(
        isSafeAffiliateDestinationUrl('https://shop.seller.example/lamp', ['seller.example']),
      ).toBe(true)
    })

    it('discards unapproved parameters and blocks CRLF header/parameter injection', () => {
      const searchParams = new URLSearchParams({
        utm_source: 'newsletter',
        evil_script: '<script>steal()</script>',
        crlf_param: 'line1\r\nHeader-Injection: true',
      })

      const result = resolveOutboundRedirect({
        offer: baseOffer,
        searchParams,
      })

      const target = new URL(result.destinationUrl)
      expect(target.searchParams.get('utm_source')).toBe('newsletter')
      expect(target.searchParams.has('evil_script')).toBe(false)
      expect(target.searchParams.has('crlf_param')).toBe(false)
      expect(result.destinationUrl).not.toContain('\r')
      expect(result.destinationUrl).not.toContain('\n')
    })

    it('interpolates safe sub-ID templates without parameter pollution', () => {
      const interpolated = interpolateSubId(
        {
          template: 'sub_{clickId}_extra',
          paramName: 'subId',
          allowedTokens: ['clickId'],
        },
        { clickId: 'clk_12345;drop table' },
      )
      expect(interpolated.paramName).toBe('subId')
      expect(interpolated.paramValue).toBe('sub_clk_12345droptable_extra')
    })
  })

  describe('2. Accessible Disclosures & Editorial Validation', () => {
    it('renders accessible semantic markup with WCAG compliance and screen-reader indicators', () => {
      const bannerHtml = renderToStaticMarkup(
        createElement(AffiliateDisclosureBanner, {
          text: 'We may earn a commission from affiliate links.',
        }),
      )
      expect(bannerHtml).toContain('<aside')
      expect(bannerHtml).toContain('aria-label="Affiliate and advertising disclosure"')
      expect(bannerHtml).toContain('role="note"')

      const linkHtml = renderToStaticMarkup(
        createElement(
          AffiliateLink,
          { href: 'https://seller.example/lamp' },
          'Buy on Partner Site',
        ),
      )
      expect(linkHtml).toContain('rel="sponsored nofollow noopener"')
      expect(linkHtml).toContain('target="_blank"')
      expect(linkHtml).toContain('sr-only')
    })

    it('editorial validation blocks publication when affiliate content lacks disclosure or has broken links', () => {
      const missingDisclosure = validateAffiliateEditorial({
        hasAffiliateContent: true,
        disclosureText: '',
        offers: [baseOffer],
      })
      expect(missingDisclosure.allowed).toBe(false)
      expect(missingDisclosure.issues).toContain(
        'Affiliate content requires a prominent, accessible disclosure statement.',
      )

      const brokenOffer: AffiliateOffer = {
        ...baseOffer,
        linkHealth: { status: 'broken', consecutiveFailures: 3, error: '404 Not Found' },
      }
      const brokenCheck = validateAffiliateEditorial({
        hasAffiliateContent: true,
        disclosureText: 'We earn commissions from qualifying purchases through our partner links.',
        offers: [brokenOffer],
      })
      expect(brokenCheck.allowed).toBe(false)
      expect(brokenCheck.issues).toContain(
        `Offer '${brokenOffer.name}' has broken link health (404 Not Found).`,
      )
    })
  })

  describe('3. Tracking-Off & Direct Links', () => {
    it('honors DNT, Sec-GPC, tracking=off, and direct preferences without generating click tokens', () => {
      const dntResult = resolveOutboundRedirect({
        offer: baseOffer,
        headers: { dnt: '1' },
      })
      expect(dntResult.trackingOff).toBe(true)
      expect(dntResult.click.trackingAllowed).toBe(false)
      expect(dntResult.click.clickToken).toBe('')
      expect(new URL(dntResult.destinationUrl).searchParams.has('subId')).toBe(false)

      const directResult = resolveOutboundRedirect({
        offer: baseOffer,
        direct: true,
      })
      expect(directResult.trackingOff).toBe(true)
      expect(directResult.click.trackingAllowed).toBe(false)

      const consentDeniedResult = resolveOutboundRedirect({
        offer: baseOffer,
        trackingConsent: false,
      })
      expect(consentDeniedResult.trackingOff).toBe(true)
    })
  })

  describe('4. Bot Detection and Replay Filtering', () => {
    it('detects search bots, corporate scanners, and prefetch headers, denying tracking tokens', () => {
      const botResult = resolveOutboundRedirect({
        offer: baseOffer,
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      })
      expect(botResult.botDetected).toBe(true)
      expect(botResult.click.trackingAllowed).toBe(false)
      expect(botResult.click.clickToken).toBe('')

      const prefetchResult = resolveOutboundRedirect({
        offer: baseOffer,
        headers: { purpose: 'prefetch' },
      })
      expect(prefetchResult.botDetected).toBe(true)
      expect(prefetchResult.click.trackingAllowed).toBe(false)
    })
  })

  describe('5. Stale Links & Terms-Respecting Freshness Jobs', () => {
    it('marks expired observation as stale and reverts price/stock to unknown', () => {
      const now = new Date('2026-09-24T00:00:01.000Z')
      const freshness = evaluatePricingFreshness(baseOffer.pricingFreshness, now)
      expect(freshness.stale).toBe(true)
      expect(freshness.remotePrice).toBeNull()
      expect(freshness.remoteAvailability).toBe('unknown')

      const freshNow = new Date('2026-09-23T12:00:00.000Z')
      const freshResult = evaluatePricingFreshness(baseOffer.pricingFreshness, freshNow)
      expect(freshResult.stale).toBe(false)
      expect(freshResult.remotePrice?.amountMinor).toBe('3999')
      expect(freshResult.remoteAvailability).toBe('in-stock')
    })

    it('respects target rate limits (HTTP 429) and network terms during health checks', async () => {
      const mockFetch429 = async () =>
        new Response(null, {
          status: 429,
          headers: { 'Retry-After': '120' },
        })

      const health = await checkOfferLinkHealth(baseOffer, mockFetch429 as never)
      expect(health.status).toBe('rate-limited')
      expect(health.httpStatus).toBe(429)
      expect(health.error).toContain('HTTP 429 Too Many Requests')
    })
  })

  describe('6. Idempotent Conversion Evidence Imports', () => {
    const clickRecord = {
      id: 'clk_sample_999',
      siteId: 'renegade-party',
      offerId: baseOffer.id,
      clickToken: 'tok_alpha_77',
      timestamp: '2026-09-23T10:00:00.000Z',
      destinationUrl: 'https://seller.example/lamp',
      trackingAllowed: true,
      botDetected: false,
    }

    it('deduplicates replayed webhook or CSV conversions via SHA-256 payload hash', () => {
      const item: RawConversionInput = {
        externalEventId: 'evt_101',
        amountMinor: '3999',
        currency: 'USD',
        commissionAmountMinor: '399',
        attributionHint: 'tok_alpha_77',
        status: 'approved',
      }

      const first = importConversionEvidence({
        siteId: 'renegade-party',
        source: 'webhook',
        network: 'amazon-associates',
        rawPayload: { event: 'evt_101' },
        items: [item],
        existingEvidence: [],
        existingClicks: [clickRecord],
        existingOffers: [baseOffer],
      })
      expect(first.imported).toHaveLength(1)
      expect(first.duplicates).toHaveLength(0)
      expect(first.matchedCount).toBe(1)
      expect(first.imported[0].reconciliationState).toBe('matched')

      // Replay identical item
      const replay = importConversionEvidence({
        siteId: 'renegade-party',
        source: 'webhook',
        network: 'amazon-associates',
        rawPayload: { event: 'evt_101' },
        items: [item],
        existingEvidence: first.imported,
        existingClicks: [clickRecord],
        existingOffers: [baseOffer],
      })
      expect(replay.imported).toHaveLength(0)
      expect(replay.duplicates).toHaveLength(1)
      expect(replay.duplicates[0].externalEventId).toBe('evt_101')
    })

    it('leaves missing evidence as unmatched without inventing success', () => {
      const unmatchedItem: RawConversionInput = {
        externalEventId: 'evt_orphan_888',
        amountMinor: '1999',
        currency: 'USD',
        attributionHint: 'unknown_ghost_subid',
        status: 'approved',
      }

      const result = importConversionEvidence({
        siteId: 'renegade-party',
        source: 'csv',
        network: 'shareasale',
        rawPayload: 'sample_csv_text',
        items: [unmatchedItem],
        existingEvidence: [],
        existingClicks: [clickRecord],
        existingOffers: [baseOffer],
      })

      expect(result.imported).toHaveLength(1)
      expect(result.unmatchedCount).toBe(1)
      expect(result.imported[0].reconciliationState).toBe('unmatched')
      expect(result.imported[0].matchedClickId).toBeUndefined()
      expect(result.imported[0].reconciliationNotes).toContain(
        'could not be verified; preserved as unmatched',
      )
    })
  })

  describe('7. Referral Program Rules, Anti-Self-Referral & Commission Math', () => {
    const owner: CodeOwnerRecord = {
      memberId: 'mem_alice',
      email: 'alice@example.com',
      role: 'creator',
      accountCreatedAt: '2026-08-01T00:00:00.000Z',
      emailVerified: true,
      suspended: false,
    }

    it('strictly blocks self-referrals by member ID and email', () => {
      // Same member ID
      const selfMember = evaluateReferralAttribution({
        program: baseProgram,
        referralCode: 'REF-ALICE',
        codeOwner: owner,
        customer: { memberId: 'mem_alice', email: 'other@example.com' },
        orderAmountMinor: '10000',
        currency: 'USD',
      })
      expect(selfMember.eligible).toBe(false)
      expect(selfMember.snapshot.rejectReason).toBe('SELF_REFERRAL_SAME_MEMBER')

      // Same email
      const selfEmail = evaluateReferralAttribution({
        program: baseProgram,
        referralCode: 'REF-ALICE',
        codeOwner: owner,
        customer: { memberId: 'mem_bob', email: 'Alice@example.com' },
        orderAmountMinor: '10000',
        currency: 'USD',
      })
      expect(selfEmail.eligible).toBe(false)
      expect(selfEmail.snapshot.rejectReason).toBe('SELF_REFERRAL_SAME_EMAIL')
    })

    it('computes integer commission math with deterministic rounding and order caps', () => {
      // 10% on $12.35 ($1235 minor) = 123 minor cents (integer division)
      const math = calculateReferralCommission({
        orderAmountMinor: '1235',
        rewardType: 'basis_points',
        rewardValue: '1000',
        currency: 'USD',
      })
      expect(math.amountMinor).toBe('123')

      // Cap test: 10% on $1000.00 ($100000 minor) would be $100, but capped at $50 ($5000 minor)
      const capped = calculateReferralCommission({
        orderAmountMinor: '100000',
        rewardType: 'basis_points',
        rewardValue: '1000',
        currency: 'USD',
        maxCommissionPerOrderMinor: '5000',
      })
      expect(capped.amountMinor).toBe('5000')
    })

    it('rejects expired attribution windows and respects cookie consent requirements', () => {
      const expiredAttribution = evaluateReferralAttribution({
        program: baseProgram,
        referralCode: 'REF-ALICE',
        codeOwner: owner,
        customer: { memberId: 'mem_bob', email: 'bob@example.com' },
        orderAmountMinor: '5000',
        currency: 'USD',
        attributedAt: new Date('2026-08-01T00:00:00.000Z'),
        now: new Date('2026-09-23T00:00:00.000Z'),
      })
      expect(expiredAttribution.eligible).toBe(false)
      expect(expiredAttribution.snapshot.rejectReason).toBe('ATTRIBUTION_WINDOW_EXPIRED')

      const noConsent = evaluateReferralAttribution({
        program: baseProgram,
        referralCode: 'REF-ALICE',
        codeOwner: owner,
        customer: { memberId: 'mem_bob', email: 'bob@example.com' },
        orderAmountMinor: '5000',
        currency: 'USD',
        consented: false,
      })
      expect(noConsent.eligible).toBe(false)
      expect(noConsent.snapshot.rejectReason).toBe('CONSENT_REQUIRED')
    })
  })

  describe('8. Settlement Liabilities, Currency Separation & Payout Security', () => {
    const ledgers: CommissionLedger[] = [
      {
        id: 'com_1',
        siteId: 'renegade-party',
        programId: 'prog-1',
        programVersion: 1,
        referrerMemberId: 'mem_alice',
        orderId: 'ord_1',
        orderNumber: 'ORD-100',
        currency: 'USD',
        amountMinor: '1000',
        type: 'accrual',
        status: 'eligible',
        matureAt: '2026-09-01T00:00:00.000Z',
        createdAt: '2026-08-15T00:00:00.000Z',
        explanation: '10% on $100.00',
      },
      {
        id: 'com_2',
        siteId: 'renegade-party',
        programId: 'prog-1',
        programVersion: 1,
        referrerMemberId: 'mem_bob',
        orderId: 'ord_2',
        orderNumber: 'ORD-101',
        currency: 'EUR',
        amountMinor: '2500',
        type: 'accrual',
        status: 'eligible',
        matureAt: '2026-09-01T00:00:00.000Z',
        createdAt: '2026-08-15T00:00:00.000Z',
        explanation: '10% on 250.00 EUR',
      },
      {
        id: 'com_3',
        siteId: 'renegade-party',
        programId: 'prog-1',
        programVersion: 1,
        referrerMemberId: 'mem_charlie',
        orderId: 'ord_3',
        orderNumber: 'ORD-102',
        currency: 'USD',
        amountMinor: '1500',
        type: 'accrual',
        status: 'pending',
        matureAt: '2026-10-01T00:00:00.000Z',
        createdAt: '2026-09-15T00:00:00.000Z',
        explanation: '10% on $150.00 (holding)',
      },
    ]

    it('strictly separates liabilities by currency and never mixes USD and EUR amounts', () => {
      const summaries = summarizeCommissionLiabilities(ledgers, 'renegade-party')
      expect(summaries).toHaveLength(2)

      const usd = summaries.find((s) => s.currency === 'USD')!
      expect(usd.eligibleAmountMinor).toBe('1000')
      expect(usd.pendingAmountMinor).toBe('1500')
      expect(usd.eligibleCount).toBe(1)

      const eur = summaries.find((s) => s.currency === 'EUR')!
      expect(eur.eligibleAmountMinor).toBe('2500')
      expect(eur.pendingAmountMinor).toBe('0')
      expect(eur.eligibleCount).toBe(1)
    })

    it('requires human operator approval, excludes referrers on hold, and exports tamper-evident CSV', () => {
      const holds = [
        {
          referrerMemberId: 'mem_alice',
          reason: 'Potential dispute investigation',
          placedBy: 'admin',
          placedAt: '2026-09-20T00:00:00.000Z',
          active: true,
        },
      ]

      // Alice is on hold, so eligible USD batch should exclude her
      const batchResult = createSettlementBatch({
        siteId: 'renegade-party',
        currency: 'USD',
        ledgers,
        holds,
      })
      expect(batchResult.excludedDueToHold).toContain('com_1')
      expect(batchResult.batch.entriesCount).toBe(0)

      // When hold is inactive, create batch for EUR (Bob)
      const eurBatch = createSettlementBatch({
        siteId: 'renegade-party',
        currency: 'EUR',
        ledgers,
        holds: [],
      })
      expect(eurBatch.batch.entriesCount).toBe(1)
      expect(eurBatch.batch.totalAmountMinor).toBe('2500')
      expect(eurBatch.batch.status).toBe('pending_approval')

      // Approve batch
      const approved = approveSettlementBatch({
        batch: eurBatch.batch,
        operatorUser: { id: 'admin_1', role: 'administrator' },
      })
      expect(approved.status).toBe('approved')
      expect(approved.approvedBy).toBe('admin_1')

      // Generate payout export
      const exportData = generateSettlementExport(approved, ledgers)
      expect(exportData.currency).toBe('EUR')
      expect(exportData.lineItems).toHaveLength(1)
      expect(exportData.csvContent).toContain('mem_bob,ORD-101,2500,EUR')
      expect(exportData.payloadHash).toMatch(/^[a-f0-9]{64}$/)

      // Reconcile successful payout execution
      const reconciled = reconcileSettlementExecution({
        batch: approved,
        ledgers: [ledgers[1]],
        success: true,
        externalReference: 'EXT-PAYOUT-789',
      })
      expect(reconciled.batch.status).toBe('completed')
      expect(reconciled.updatedLedgers[0].status).toBe('settled')
      expect(reconciled.updatedLedgers[0].explanation).toContain('EXT-PAYOUT-789')
    })
  })

  describe('9. Complete End-to-End Acceptance Journey', () => {
    it('Scenario A: Disclosed offer records an allowed interaction and reconciles sample conversion evidence without invented success', () => {
      // 1. Offer validation & disclosure check
      expect(validateAffiliateOffer(baseOffer)).toEqual([])

      // 2. Outbound interaction recorded under policy
      const redirect = resolveOutboundRedirect({
        offer: baseOffer,
        searchParams: new URLSearchParams({ utm_campaign: 'fall_guide' }),
        ip: '203.0.113.195',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        trackingConsent: true,
      })
      expect(redirect.trackingOff).toBe(false)
      expect(redirect.botDetected).toBe(false)
      expect(redirect.click.trackingAllowed).toBe(true)
      expect(redirect.click.clickToken).toBeTruthy()

      // 3. Conversion imported from external network
      const matchedItem: RawConversionInput = {
        externalEventId: 'conv_net_9921',
        externalOrderId: 'ord_ext_551',
        amountMinor: '3999',
        currency: 'USD',
        commissionAmountMinor: '399',
        attributionHint: redirect.click.clickToken,
        status: 'approved',
      }
      const unmatchedItem: RawConversionInput = {
        externalEventId: 'conv_ghost_440',
        amountMinor: '1500',
        currency: 'USD',
        attributionHint: 'unknown_token_99',
        status: 'approved',
      }

      const importResult = importConversionEvidence({
        siteId: 'renegade-party',
        source: 'webhook',
        network: 'amazon-associates',
        rawPayload: { events: [matchedItem, unmatchedItem] },
        items: [matchedItem, unmatchedItem],
        existingEvidence: [],
        existingClicks: [redirect.click],
        existingOffers: [baseOffer],
      })

      // Verified: Matched conversion reconciled; unmatched remains strictly unknown
      expect(importResult.matchedCount).toBe(1)
      expect(importResult.unmatchedCount).toBe(1)
      const matched = importResult.imported.find((i) => i.externalEventId === 'conv_net_9921')!
      expect(matched.reconciliationState).toBe('matched')
      expect(matched.matchedOfferId).toBe(baseOffer.id)
      expect(matched.matchedClickId).toBe(redirect.click.id)

      const unmatched = importResult.imported.find((i) => i.externalEventId === 'conv_ghost_440')!
      expect(unmatched.reconciliationState).toBe('unmatched')
      expect(unmatched.matchedOfferId).toBeUndefined()
    })

    it('Scenario B: Referral reaches settled then reversed commission with an explainable trail', () => {
      // 1. Program validation
      expect(validateReferralProgram(baseProgram)).toEqual([])

      const creator: CodeOwnerRecord = {
        memberId: 'mem_creator_jane',
        email: 'jane@creator.example',
        role: 'creator',
        accountCreatedAt: '2026-07-01T00:00:00.000Z',
        emailVerified: true,
        suspended: false,
      }

      const customer: ReferralCustomerContext = {
        memberId: 'mem_buyer_sam',
        email: 'sam@buyer.example',
      }

      // 2. Consented attribution evaluation
      const attribution = evaluateReferralAttribution({
        program: baseProgram,
        referralCode: 'REF-JANE',
        codeOwner: creator,
        customer,
        orderAmountMinor: '5000', // $50.00
        currency: 'USD',
        consented: true,
      })
      expect(attribution.eligible).toBe(true)
      expect(attribution.snapshot.status).toBe('attributed')
      expect(attribution.snapshot.calculatedCommissionMinor).toBe('500') // 10% of $50 = $5.00
      expect(attribution.snapshot.explanation).toContain(
        'Attributed to referrer mem_creator_jane via code REF-JANE',
      )

      // 3. Create initial pending CommissionLedger entry upon settled payment evidence
      const initialLedger: CommissionLedger = {
        id: 'com_jane_101',
        siteId: 'renegade-party',
        programId: baseProgram.id,
        programVersion: baseProgram.version,
        referrerMemberId: creator.memberId,
        orderId: 'ord_sam_99',
        orderNumber: 'ORD-SAM-99',
        currency: 'USD',
        amountMinor: attribution.snapshot.calculatedCommissionMinor,
        type: 'accrual',
        status: 'pending',
        matureAt: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        explanation: attribution.snapshot.explanation,
      }
      expect(initialLedger.status).toBe('pending')

      // 4. Maturity: after 14 days, commission becomes eligible
      const futureDate = new Date(Date.now() + 15 * 86400 * 1000)
      const matured = matureCommissionLedger(initialLedger, futureDate)
      expect(matured.status).toBe('eligible')
      expect(matured.explanation).toContain('Matured to eligible for settlement')

      // 5. Settlement: approved in batch and settled
      const batchResult = createSettlementBatch({
        siteId: 'renegade-party',
        currency: 'USD',
        ledgers: [matured],
      })
      const approvedBatch = approveSettlementBatch({
        batch: batchResult.batch,
        operatorUser: { id: 'admin_exec', role: 'owner' },
      })
      const executionResult = reconcileSettlementExecution({
        batch: approvedBatch,
        ledgers: [matured],
        success: true,
        externalReference: 'PAYOUT-STRIPE-4412',
      })
      const settledLedger = executionResult.updatedLedgers[0]
      expect(settledLedger.status).toBe('settled')
      expect(settledLedger.explanation).toContain('Settled via batch')

      // 6. Order Refund / Cancellation occurs: commission is reversed with explainable audit trail
      const reversalResult = reverseCommissionEntry({
        entry: settledLedger,
        reason: 'order_refunded',
        refundReference: 'REFUND-REQ-77',
      })

      // Original entry marked reversed
      expect(reversalResult.updatedEntry.status).toBe('reversed')
      expect(reversalResult.updatedEntry.reversalReason).toBe('order_refunded')
      expect(reversalResult.updatedEntry.explanation).toContain('Reversed on')
      expect(reversalResult.updatedEntry.explanation).toContain('REFUND-REQ-77')

      // Compensating reversal entry created
      expect(reversalResult.reversalEntry.type).toBe('reversal')
      expect(reversalResult.reversalEntry.amountMinor).toBe(settledLedger.amountMinor)
      expect(reversalResult.reversalEntry.compensatesLedgerId).toBe(settledLedger.id)
      expect(reversalResult.reversalEntry.explanation).toContain(
        'Compensating reversal for commission com_jane_101 on order ORD-SAM-99: order_refunded',
      )
    })
  })
})
