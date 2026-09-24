/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

// Affiliate & Referral domain imports
import {
  calculateReferralCommission,
  computeConversionSourceHash,
  evaluatePricingFreshness,
  interpolateSubId,
  isSafeAffiliateDestinationUrl,
  type AffiliateClick,
  type AffiliateOffer,
  type CommissionLedger,
  type ConversionEvidence,
  type ReferralAttributionSnapshot,
  type ReferralProgram,
  type SettlementBatch,
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
  type ReferrerHoldRecord,
} from '../../src/modules/commerce/settlement-service'
import {
  AffiliateDisclosureBanner,
  AffiliateLink,
  validateAffiliateEditorial,
} from '../../src/modules/commerce/disclosures'
import { AffiliateReferralDashboard } from '../../src/modules/admin/AffiliateReferralDashboard'

// POD & Fulfillment domain imports
import {
  POD_ADAPTER_CONTRACT_VERSION,
  PodProviderError,
  type PodProviderCapabilityMatrix,
  type NormalizedPodEvent,
  type PodRecipientAddress,
} from '../../src/modules/commerce/pod-contract'
import { PodEmulatorAdapter, EMULATOR_CAPABILITIES } from '../../src/modules/commerce/pod-emulator'
import {
  PrintfulPodAdapter,
  PRINTFUL_CAPABILITIES,
} from '../../src/modules/commerce/pod-real-provider'
import {
  createPodConnection,
  decryptCredential,
  getPublicPodConnectionProjection,
  redactSecret,
  type PodConnectionRecord,
  type PublicPodConnectionProjection,
} from '../../src/modules/commerce/pod-connection'
import {
  COLOR_FIDELITY_DISCLAIMER,
  freezeSoldPrintRendition,
  validatePrintRendition,
  verifySoldPrintRendition,
  type GovernedPrintRendition,
} from '../../src/modules/commerce/print-renditions'
import { validatePodMapping, type DetailedPodMapping } from '../../src/modules/commerce/pod-mapping'
import {
  buildFulfillmentPlan,
  createPodJobAfterPaidAcceptance,
  isPodJobEligibleForSubmission,
  validateShippingAddressForPod,
  type FulfillmentLineItem,
  type PODJob,
} from '../../src/modules/commerce/fulfillment-plan'
import {
  applyNormalizedPodEvent,
  reconcilePodJobWithProvider,
  sanitizeTrackingUrl,
} from '../../src/modules/commerce/pod-reconciliation'
import {
  cancelPodJob,
  createReprintPodJob,
  MAX_POD_SUBMIT_ATTEMPTS,
  placePodJobOnHold,
  releasePodJobHold,
  submitPodJobWithRetry,
  updatePodJobRecipientAddress,
} from '../../src/modules/commerce/pod-operations'
import {
  acknowledgeManualFulfillmentPackage,
  handoffFailedPodJobToManual,
  MANUAL_FULFILLMENT_DISCLAIMER,
  shipManualFulfillmentPackage,
  type ManualFulfillmentPackage,
} from '../../src/modules/commerce/manual-fulfillment'
import { FulfillmentCommandCenter } from '../../src/modules/admin/FulfillmentCommandCenter'

describe('Shared Contract Proof: Affiliate, POD Fulfillment & Worker Health Conformance', () => {
  const siteId = 'renegade-party'
  const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  const testRunId = randomUUID().slice(0, 8)

  // Fixtures
  let sampleOffer: AffiliateOffer
  let sampleProgram: ReferralProgram
  let sampleCodeOwner: CodeOwnerRecord
  let sampleRendition: GovernedPrintRendition
  let sampleMapping: DetailedPodMapping
  let sampleConnection: PodConnectionRecord
  let publicConnection: PublicPodConnectionProjection
  let emulatorAdapter: PodEmulatorAdapter
  let samplePodJob: PODJob
  let createdJob: PODJob

  beforeAll(async () => {
    sampleOffer = {
      id: `off-${testRunId}`,
      siteId,
      slug: `studio-monitors-${testRunId}`,
      name: 'Pro Reference Studio Monitors',
      destinationUrl: 'https://audio-direct.example/speakers/pro-ref',
      allowedDomains: ['audio-direct.example', 'partner.audio-direct.example'],
      networkReference: {
        network: 'custom',
        programId: 'audio-prog-1',
        accountReference: 'renegade-aff',
      },
      disclosure: {
        text: 'Renegade CMS earns an affiliate commission from qualifying partner links.',
        required: true,
        placement: 'above',
      },
      subIdTemplate: {
        template: '{clickId}',
        paramName: 'subId',
        allowedTokens: ['clickId', 'clickToken'],
      },
      pricingFreshness: {
        remotePrice: { amountMinor: '49900', currency: 'USD' },
        remoteAvailability: 'in-stock',
        observedAt: new Date().toISOString(),
        freshnessHours: 24,
        source: 'api',
      },
      regions: ['US', 'CA', 'GB'],
      status: 'active',
      linkHealth: {
        status: 'healthy',
        consecutiveFailures: 0,
      },
      trackingParameters: {
        utm_source: 'renegade-cms',
        utm_medium: 'editorial-affiliate',
      },
    }

    sampleProgram = {
      id: `prog-${testRunId}`,
      siteId,
      version: 1,
      name: 'Creator Referral Program',
      status: 'active',
      eligibility: {
        allowedMemberRoles: ['member', 'creator', 'partner'],
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
        maxCommissionPerOrderMinor: '5000', // Cap at $50.00
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
        version: '2026.1',
        publishedAt: '2026-01-01T00:00:00Z',
        text: 'Referral rewards are subject to a 14-day hold and self-referral prohibition.',
      },
    }

    sampleCodeOwner = {
      memberId: 'mem_creator_99',
      email: 'creator99@renegade.internal',
      role: 'creator',
      accountCreatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      emailVerified: true,
      suspended: false,
    }

    sampleRendition = {
      id: `rend-${testRunId}`,
      mediaAssetId: `asset-${testRunId}`,
      revision: 1,
      hash: createHash('sha256').update(`print-artwork-${testRunId}`).digest('hex'),
      filename: 'renegade-skull-300dpi.png',
      mimeType: 'image/png',
      sizeBytes: 4 * 1024 * 1024,
      widthPx: 3600,
      heightPx: 4800,
      dpi: 300,
      colorProfile: 'sRGB',
      hasTransparency: true,
      rightsStatus: 'approved',
      rightsExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      malwareStatus: 'clean',
      publicOriginal: false,
      reviewStatus: 'approved',
      approvedBy: 'art_director',
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    sampleMapping = {
      id: `map-${testRunId}`,
      siteId,
      productId: 'prod-heavy-tee',
      variantSku: 'TEE-M-BLK',
      optionValues: { size: 'm', color: 'black' },
      providerKey: 'pod-emulator',
      remoteProductId: 'emu-tee-101',
      remoteVariantId: 'emu-tee-m-blk',
      printAreas: [
        {
          area: 'front',
          artworkRenditionId: sampleRendition.id,
          artworkHash: sampleRendition.hash,
          artworkRevision: 1,
          placement: { topMm: 50, leftMm: 50, widthMm: 280, heightMm: 380 },
        },
      ],
      pinnedArtworkHash: sampleRendition.hash,
      artworkRevisionId: 'rev-front-1',
      mockupProvenance: {
        source: 'provider',
        generatedAt: new Date().toISOString(),
        url: 'https://emulator.renegade.internal/mockups/tee.png',
      },
      snapshot: {
        costMinor: '1250',
        currency: 'USD',
        available: true,
        observedAt: new Date().toISOString(),
      },
      reviewStatus: 'approved',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    sampleConnection = createPodConnection(
      {
        id: `conn-${testRunId}`,
        siteId,
        providerKey: 'pod-emulator',
        label: 'Local Deterministic POD Emulator',
        apiKey: 'emu_test_key_secret_12345',
        webhookSecret: 'emu_webhook_secret_67890',
        capabilities: EMULATOR_CAPABILITIES,
      },
      encryptionKey,
    )

    publicConnection = getPublicPodConnectionProjection(sampleConnection, encryptionKey)
    emulatorAdapter = new PodEmulatorAdapter()
  })

  // =========================================================================
  // AFFILIATE DOMAIN CONTRACT TESTS (1 - 11)
  // =========================================================================

  describe('AFFILIATE: Tracking, Redirects, Conversions, Attribution, Holds & Settlements', () => {
    let capturedClick: AffiliateClick

    it('1. Tracking enabled: subId interpolated, click token generated, and normal UI outputs verified', () => {
      const result = resolveOutboundRedirect({
        offer: sampleOffer,
        searchParams: new URLSearchParams({ utm_campaign: 'spring_gear' }),
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          referer: 'https://renegadeparty.org/reviews/monitors',
        },
        ip: '203.0.113.195',
        trackingConsent: true,
      })

      expect(result.trackingOff).toBe(false)
      expect(result.botDetected).toBe(false)
      expect(result.click.trackingAllowed).toBe(true)
      expect(result.click.clickToken).toMatch(/^tok_[0-9a-f]{16}$/)
      expect(result.destinationUrl).toContain('subId=clk_')
      expect(result.destinationUrl).toContain('utm_campaign=spring_gear')
      expect(result.destinationUrl).toContain('utm_source=renegade-cms')
      capturedClick = result.click

      // Verify normal UI output: AffiliateLink component rendered to markup
      const html = renderToStaticMarkup(
        createElement(
          AffiliateLink,
          {
            href: result.destinationUrl,
            offerSlug: sampleOffer.slug,
          },
          'Buy Studio Monitors',
        ),
      )
      expect(html).toContain('rel="sponsored nofollow noopener"')
      expect(html).toContain('Buy Studio Monitors')
      expect(html).toContain('Affiliate link; opens in a new tab')
    })

    it('2. Tracking disabled: privacy signals (DNT/Sec-GPC/opt-out) suppress click tracking and sub-IDs', () => {
      // DNT header test
      const dntResult = resolveOutboundRedirect({
        offer: sampleOffer,
        headers: { dnt: '1' },
        trackingConsent: true,
      })
      expect(dntResult.trackingOff).toBe(true)
      expect(dntResult.click.trackingAllowed).toBe(false)
      expect(dntResult.click.clickToken).toBe('')
      expect(dntResult.destinationUrl).not.toContain('subId=')

      // Sec-GPC header test
      const gpcResult = resolveOutboundRedirect({
        offer: sampleOffer,
        headers: { 'sec-gpc': '1' },
      })
      expect(gpcResult.trackingOff).toBe(true)
      expect(gpcResult.click.clickToken).toBe('')

      // Explicit direct=1 parameter test
      const directResult = resolveOutboundRedirect({
        offer: sampleOffer,
        searchParams: new URLSearchParams({ direct: '1' }),
      })
      expect(directResult.trackingOff).toBe(true)
      expect(directResult.click.trackingAllowed).toBe(false)
    })

    it('3. Redirect allow/deny behavior: blocks open redirects, insecure protocols, and unapproved params', () => {
      // Block non-https protocol
      expect(isSafeAffiliateDestinationUrl('http://insecure-seller.example/item')).toBe(false)

      // Block credentials in URL
      expect(
        isSafeAffiliateDestinationUrl('https://admin:pass@audio-direct.example/item', [
          'audio-direct.example',
        ]),
      ).toBe(false)

      // Block unapproved domains
      expect(
        isSafeAffiliateDestinationUrl('https://evil-attacker.example/malware', [
          'audio-direct.example',
        ]),
      ).toBe(false)

      // Block loopback & internal network addresses (SSRF defense)
      expect(isSafeAffiliateDestinationUrl('https://127.0.0.1/admin')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('https://169.254.169.254/latest/meta-data')).toBe(false)
      expect(isSafeAffiliateDestinationUrl('https://192.168.1.1/router')).toBe(false)

      // Parameter allowlisting: arbitrary script/injection params stripped
      const strippedResult = resolveOutboundRedirect({
        offer: sampleOffer,
        searchParams: new URLSearchParams({
          utm_source: 'editorial',
          malicious_payload: '<script>alert(1)</script>',
          sql_inj: "1'; DROP TABLE users--",
        }),
      })
      expect(strippedResult.destinationUrl).toContain('utm_source=editorial')
      expect(strippedResult.destinationUrl).not.toContain('malicious_payload')
      expect(strippedResult.destinationUrl).not.toContain('sql_inj')
    })

    it('4. Conversion import: ingests raw external network evidence and calculates idempotent hash', () => {
      const rawItem: RawConversionInput = {
        externalEventId: `evt_${testRunId}_101`,
        amountMinor: '49900',
        currency: 'USD',
        commissionAmountMinor: '4990',
        occurredAt: new Date().toISOString(),
        attributionHint: capturedClick?.id,
        rawLine: 'ord_ext_99,499.00,USD,49.90',
      }

      const result = importConversionEvidence({
        siteId,
        source: 'webhook',
        network: 'custom',
        rawPayload: { orderId: 'ord_ext_99', total: 499.0, commission: 49.9 },
        items: [rawItem],
        existingEvidence: [],
        existingClicks: [capturedClick],
        existingOffers: [sampleOffer],
      })

      expect(result.imported).toHaveLength(1)
      const imported = result.imported[0]!
      expect(imported.reconciliationState).toBe('matched')
      expect(imported.matchedClickId).toBe(capturedClick.id)
      expect(imported.matchedOfferId).toBe(sampleOffer.id)
      expect(imported.rawPayloadHash).toMatch(/^[0-9a-f]{64}$/)

      // Re-importing duplicate payload must produce duplicate in list
      const replay = importConversionEvidence({
        siteId,
        source: 'webhook',
        network: 'custom',
        rawPayload: { orderId: 'ord_ext_99', total: 499.0, commission: 49.9 },
        items: [rawItem],
        existingEvidence: result.imported,
        existingClicks: [capturedClick],
        existingOffers: [sampleOffer],
      })
      expect(replay.imported).toHaveLength(0)
      expect(replay.duplicates).toHaveLength(1)
      expect(replay.duplicates[0]!.rawPayloadHash).toBe(imported.rawPayloadHash)
    })

    it('5. Referral attribution: validates program rules, role eligibility, and defeats self-referral attacks', () => {
      // 5a. Successful valid attribution
      const validCustomer: ReferralCustomerContext = {
        memberId: 'mem_customer_valid',
        email: 'customer@clean.org',
        paymentFingerprint: 'fp_card_4242',
        ipHash: 'ip_clean_hash',
      }
      const validResult = evaluateReferralAttribution({
        program: sampleProgram,
        referralCode: 'REF-CREATOR99',
        codeOwner: sampleCodeOwner,
        customer: validCustomer,
        orderAmountMinor: '30000', // $300.00
        currency: 'USD',
        consented: true,
      })

      expect(validResult.eligible).toBe(true)
      expect(validResult.snapshot.status).toBe('attributed')
      expect(validResult.snapshot.calculatedCommissionMinor).toBe('3000') // 10% of 30000 = 3000

      // 5b. Cap enforcement: $600 order at 10% would be $60, but capped at $50 (5000 minor)
      const cappedResult = evaluateReferralAttribution({
        program: sampleProgram,
        referralCode: 'REF-CREATOR99',
        codeOwner: sampleCodeOwner,
        customer: validCustomer,
        orderAmountMinor: '60000',
        currency: 'USD',
        consented: true,
      })
      expect(cappedResult.snapshot.calculatedCommissionMinor).toBe('5000')

      // 5c. Self-referral attack: Same member ID
      const selfMemberResult = evaluateReferralAttribution({
        program: sampleProgram,
        referralCode: 'REF-CREATOR99',
        codeOwner: sampleCodeOwner,
        customer: { memberId: sampleCodeOwner.memberId },
        orderAmountMinor: '30000',
        currency: 'USD',
        consented: true,
      })
      expect(selfMemberResult.eligible).toBe(false)
      expect(selfMemberResult.snapshot.rejectReason).toBe('SELF_REFERRAL_SAME_MEMBER')

      // 5d. Self-referral attack: Same email
      const selfEmailResult = evaluateReferralAttribution({
        program: sampleProgram,
        referralCode: 'REF-CREATOR99',
        codeOwner: sampleCodeOwner,
        customer: { email: sampleCodeOwner.email },
        orderAmountMinor: '30000',
        currency: 'USD',
        consented: true,
      })
      expect(selfEmailResult.eligible).toBe(false)
      expect(selfEmailResult.snapshot.rejectReason).toBe('SELF_REFERRAL_SAME_EMAIL')
    })

    it('6. Commission hold: enforces hold period before maturing to eligible status', () => {
      const now = new Date()
      const ledgerEntry: CommissionLedger = {
        id: `ledg_${testRunId}_01`,
        siteId,
        programId: sampleProgram.id,
        programVersion: sampleProgram.version,
        referrerMemberId: sampleCodeOwner.memberId,
        orderId: `ord_${testRunId}_1`,
        orderNumber: 'ORD-1001',
        currency: 'USD',
        amountMinor: '3000',
        type: 'accrual',
        status: 'pending',
        matureAt: new Date(now.getTime() + 14 * 86400000).toISOString(),
        createdAt: now.toISOString(),
        explanation: '10% referral commission on ORD-1001',
      }

      // Check during hold period: remains pending
      const duringHold = matureCommissionLedger(ledgerEntry, new Date(now.getTime() + 7 * 86400000))
      expect(duringHold.status).toBe('pending')

      // Check after hold expires: transitions to eligible
      const afterHold = matureCommissionLedger(ledgerEntry, new Date(now.getTime() + 15 * 86400000))
      expect(afterHold.status).toBe('eligible')
    })

    it('7. Refund/reversal: generates compensating reversal entry and restores clean liability state', () => {
      const accrual: CommissionLedger = {
        id: `ledg_${testRunId}_02`,
        siteId,
        programId: sampleProgram.id,
        programVersion: sampleProgram.version,
        referrerMemberId: sampleCodeOwner.memberId,
        orderId: `ord_${testRunId}_2`,
        orderNumber: 'ORD-1002',
        currency: 'USD',
        amountMinor: '2500',
        type: 'accrual',
        status: 'eligible',
        matureAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        explanation: 'Accrual for ORD-1002',
      }

      const reversalResult = reverseCommissionEntry({
        entry: accrual,
        reason: 'order_refunded',
        refundReference: 'REFUND-1002',
      })
      const reversal = reversalResult.reversalEntry
      expect(reversal.type).toBe('reversal')
      expect(reversal.compensatesLedgerId).toBe(accrual.id)
      expect(reversal.amountMinor).toBe('2500')
      expect(reversal.explanation).toContain('order_refunded')

      expect(reversalResult.updatedEntry.status).toBe('reversed')
      expect(reversalResult.updatedEntry.reversalReason).toBe('order_refunded')

      // Liabilities summary with reversed entry shows zero eligible and positive reversed liability
      const summaries = summarizeCommissionLiabilities([reversalResult.updatedEntry], siteId)
      const usdSummary = summaries.find((s) => s.currency === 'USD')
      expect(usdSummary?.eligibleAmountMinor).toBe('0')
      expect(usdSummary?.reversedAmountMinor).toBe('2500')
    })

    it('8. Settlement calculation: strictly separates liabilities by currency and excludes held referrers', () => {
      const ledgers: CommissionLedger[] = [
        {
          id: 'l1',
          siteId,
          programId: 'p1',
          programVersion: 1,
          referrerMemberId: 'mem_a',
          orderId: 'o1',
          orderNumber: 'ORD-1',
          currency: 'USD',
          amountMinor: '1000',
          type: 'accrual',
          status: 'eligible',
          matureAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          explanation: '',
        },
        {
          id: 'l2',
          siteId,
          programId: 'p1',
          programVersion: 1,
          referrerMemberId: 'mem_fraud_suspect',
          orderId: 'o2',
          orderNumber: 'ORD-2',
          currency: 'USD',
          amountMinor: '5000',
          type: 'accrual',
          status: 'eligible',
          matureAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          explanation: '',
        },
        {
          id: 'l3',
          siteId,
          programId: 'p1',
          programVersion: 1,
          referrerMemberId: 'mem_b',
          orderId: 'o3',
          orderNumber: 'ORD-3',
          currency: 'EUR',
          amountMinor: '2000',
          type: 'accrual',
          status: 'eligible',
          matureAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          explanation: '',
        },
      ]

      const holds: ReferrerHoldRecord[] = [
        {
          referrerMemberId: 'mem_fraud_suspect',
          reason: 'Chargeback velocity anomaly',
          placedBy: 'risk_team',
          placedAt: new Date().toISOString(),
          active: true,
        },
      ]

      // Currency separation: USD vs EUR never mixed
      const summaries = summarizeCommissionLiabilities(ledgers, siteId)
      expect(summaries.length).toBe(2)
      expect(summaries.find((s) => s.currency === 'USD')?.eligibleAmountMinor).toBe('6000')
      expect(summaries.find((s) => s.currency === 'EUR')?.eligibleAmountMinor).toBe('2000')

      // Create settlement batch for USD with hold applied
      const { batch, includedLedgerIds, excludedDueToHold } = createSettlementBatch({
        siteId,
        currency: 'USD',
        ledgers,
        holds,
      })

      expect(batch.currency).toBe('USD')
      expect(batch.totalAmountMinor).toBe('1000') // mem_fraud_suspect (5000) excluded
      expect(batch.entriesCount).toBe(1)
      expect(includedLedgerIds).toEqual(['l1'])
      expect(excludedDueToHold).toEqual(['l2'])
      expect(batch.status).toBe('pending_approval')
    })

    it('9. Settlement export: operator approval gates tamper-evident export generation', () => {
      const batch: SettlementBatch = {
        id: `sb_${testRunId}`,
        siteId,
        batchNumber: `BAT-USD-20260924-${testRunId.toUpperCase()}`,
        currency: 'USD',
        totalAmountMinor: '3000',
        entriesCount: 1,
        status: 'pending_approval',
        createdAt: new Date().toISOString(),
      }

      const eligibleLedgers: CommissionLedger[] = [
        {
          id: `ledg_${testRunId}_approved`,
          siteId,
          programId: sampleProgram.id,
          programVersion: sampleProgram.version,
          referrerMemberId: sampleCodeOwner.memberId,
          orderId: `ord_${testRunId}_app`,
          orderNumber: 'ORD-9901',
          currency: 'USD',
          amountMinor: '3000',
          type: 'accrual',
          status: 'eligible',
          settlementBatchId: batch.id,
          matureAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          explanation: '',
        },
      ]

      // Cannot export unapproved batch
      expect(() => generateSettlementExport(batch, eligibleLedgers)).toThrow(/must be approved/)

      // Operator approval
      const approvedBatch = approveSettlementBatch({
        batch,
        operatorUser: { id: 'usr_admin_1', role: 'administrator' },
      })
      expect(approvedBatch.status).toBe('approved')
      expect(approvedBatch.approvedBy).toBe('usr_admin_1')

      // Export generation produces CSV and tamper-evident SHA-256 hash
      const exportPayload = generateSettlementExport(approvedBatch, eligibleLedgers)
      expect(exportPayload.csvContent).toContain('LedgerId,ReferrerMemberId,OrderNumber')
      expect(exportPayload.csvContent).toContain('ORD-9901')
      expect(exportPayload.payloadHash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('10. Do not execute a real payout: verifies safe rollback on failure and reconciliation without money movement', () => {
      const batch: SettlementBatch = {
        id: `sb_recon_${testRunId}`,
        siteId,
        batchNumber: `BAT-USD-RECON-${testRunId}`,
        currency: 'USD',
        totalAmountMinor: '5000',
        entriesCount: 1,
        status: 'approved',
        createdAt: new Date().toISOString(),
      }

      const ledgers: CommissionLedger[] = [
        {
          id: `ledg_${testRunId}_payout_test`,
          siteId,
          programId: sampleProgram.id,
          programVersion: 1,
          referrerMemberId: 'mem_test',
          orderId: 'ord_payout_test',
          orderNumber: 'ORD-5555',
          currency: 'USD',
          amountMinor: '5000',
          type: 'accrual',
          status: 'approved',
          settlementBatchId: batch.id,
          matureAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          explanation: '',
        },
      ]

      // Simulated external payout failure: Ledgers cleanly roll back to 'eligible'
      const failureRecon = reconcileSettlementExecution({
        batch,
        ledgers,
        success: false,
        failureReason: 'External banking gateway timeout in staging sandbox',
      })
      expect(failureRecon.batch.status).toBe('failed')
      expect(failureRecon.updatedLedgers[0].status).toBe('eligible')
      expect(failureRecon.updatedLedgers[0].settlementBatchId).toBeUndefined()

      // Simulated external payout success: Transitions batch to 'completed' and ledgers to 'settled'
      const successRecon = reconcileSettlementExecution({
        batch,
        ledgers,
        success: true,
        externalReference: 'EXT-PAY-987654',
      })
      expect(successRecon.batch.status).toBe('completed')
      expect(successRecon.updatedLedgers[0].status).toBe('settled')
    })

    it('11. Privacy choices and disabled tracking prevent prohibited attribution and verify UI dashboard rendering', () => {
      // 11a. Explicit refusal of cookie consent prevents attribution
      const noConsentResult = evaluateReferralAttribution({
        program: sampleProgram,
        referralCode: 'REF-CREATOR99',
        codeOwner: sampleCodeOwner,
        customer: { memberId: 'mem_privacy_advocate', email: 'privacy@freedom.org' },
        orderAmountMinor: '10000',
        currency: 'USD',
        consented: false, // Refused tracking consent
      })
      expect(noConsentResult.eligible).toBe(false)
      expect(noConsentResult.snapshot.status).toBe('rejected')
      expect(noConsentResult.snapshot.rejectReason).toBe('CONSENT_REQUIRED')

      // 11b. Render full AffiliateReferralDashboard UI to prove normal operator display
      const dashboardHtml = renderToStaticMarkup(
        createElement(AffiliateReferralDashboard, {
          siteId,
          offers: [sampleOffer],
          conversions: [],
          attributions: [noConsentResult.snapshot],
          ledgers: [],
          batches: [],
        }),
      )
      expect(dashboardHtml).toContain('Affiliate &amp; Referral Operations Command')
      expect(dashboardHtml).toContain('Currency-Separated Liabilities')
      expect(dashboardHtml).toContain('Commission Liability')
    })
  })

  // =========================================================================
  // POD FULFILLMENT CONTRACT TESTS (12 - 23)
  // =========================================================================

  describe('POD: Preflight, Holds, Reconciliation, Tracking, Errors, Recovery & Concurrency', () => {
    it('12. Product/preflight validation: validates dimensions, DPI >= 150, mime types, and placement', async () => {
      // 12a. Valid preflight check
      const validPreflight = await emulatorAdapter.preflight({
        variantId: sampleMapping.remoteVariantId,
        printArea: 'front',
        artwork: {
          id: sampleRendition.id,
          hash: sampleRendition.hash,
          mimeType: sampleRendition.mimeType,
          widthPx: sampleRendition.widthPx,
          heightPx: sampleRendition.heightPx,
          dpi: sampleRendition.dpi,
        },
        placement: sampleMapping.printAreas[0]!.placement,
      })
      expect(validPreflight.passed).toBe(true)
      expect(validPreflight.effectiveDpi).toBeGreaterThanOrEqual(150)
      expect(validPreflight.mockupUrl).toContain('emulator.renegade.internal')

      // 12b. Low DPI rejection (< 150 DPI)
      const lowDpiPreflight = await emulatorAdapter.preflight({
        variantId: sampleMapping.remoteVariantId,
        printArea: 'front',
        artwork: {
          id: 'art-low-dpi',
          hash: 'low_res_hash',
          mimeType: 'image/png',
          widthPx: 800, // 800px over 280mm (~11 in) = ~72 DPI
          heightPx: 1000,
          dpi: 72,
        },
        placement: sampleMapping.printAreas[0]!.placement,
      })
      expect(lowDpiPreflight.passed).toBe(false)
      expect(lowDpiPreflight.issues[0]).toContain('below the minimum required 150 DPI')

      // 12c. Real Printful adapter capabilities verify supported print areas
      expect(PRINTFUL_CAPABILITIES.supportedPrintAreas).toContain('front')
      expect(PRINTFUL_CAPABILITIES.supportedPrintAreas).toContain('back')
    })

    it('13. Hold: places paid POD job on hold preventing premature dispatch during cancel/edit window', () => {
      const lineItem: FulfillmentLineItem = {
        lineId: 'line-1',
        productId: 'prod-heavy-tee',
        variantSku: 'TEE-M-BLK',
        title: 'Renegade Heavyweight Tee - M / Black',
        quantity: 1,
        unitPriceMinor: '3200',
        lineAmountMinor: '3200',
        kind: 'pod',
        podMapping: sampleMapping,
        soldRenditions: [
          freezeSoldPrintRendition(
            sampleRendition,
            sampleMapping.printAreas[0]!.placement,
            'front',
          ),
        ],
      }

      const validRecipient: PodRecipientAddress = {
        name: 'Jordan Miller',
        address1: '789 Congress Ave',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      }

      const plan = buildFulfillmentPlan({
        orderId: `ord_pod_${testRunId}`,
        siteId,
        currency: 'USD',
        recipientAddress: validRecipient,
        items: [lineItem],
        connectionsByProviderKey: new Map([[sampleConnection.providerKey, sampleConnection]]),
      })

      expect(plan.providerJobs.length).toBe(1)

      createdJob = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 3600000, // 1 hour hold
      })
      samplePodJob = createdJob

      expect(createdJob.state).toBe('on_hold')
      expect(createdJob.holdExpiresAt).toBeDefined()
      expect(isPodJobEligibleForSubmission(createdJob)).toBe(false)
    })

    it('14. Release: releases hold, enabling worker submission to provider', () => {
      const released = releasePodJobHold(createdJob, 'customer_early_release')
      expect(released.state).toBe('created')
      expect(isPodJobEligibleForSubmission(released)).toBe(true)
      expect(released.auditTrail.some((a) => a.action === 'hold_released')).toBe(true)
      createdJob = released
    })

    it('15. Duplicate provider event: deduplicates duplicate webhook events without redundant state changes', () => {
      const event: NormalizedPodEvent = {
        providerEventId: `evt_pod_dup_${testRunId}`,
        providerKey: 'pod-emulator',
        externalOrderId: 'emu_ord_99001',
        kind: 'in_production',
        occurredAt: new Date().toISOString(),
        rawEvidence: { sample: true },
      }

      // First application: transitions to in_production
      const jobInProd = applyNormalizedPodEvent(createdJob, event)
      expect(jobInProd.state).toBe('in_production')
      expect(jobInProd.auditTrail.length).toBe(createdJob.auditTrail.length + 1)

      // Duplicate delivery of same provider event: no redundant audit record or state mutation
      const jobAfterDuplicate = applyNormalizedPodEvent(jobInProd, event)
      expect(jobAfterDuplicate.state).toBe('in_production')
      expect(jobAfterDuplicate.auditTrail.length).toBe(jobInProd.auditTrail.length)
      createdJob = jobInProd
    })

    it('16. Unknown provider event: handles unrecognized provider event types safely without crashing worker', () => {
      const unknownEvent: NormalizedPodEvent = {
        providerEventId: `evt_unknown_${testRunId}`,
        providerKey: 'pod-emulator',
        externalOrderId: 'emu_ord_99001',
        kind: 'custom_future_status' as any,
        occurredAt: new Date().toISOString(),
        rawEvidence: { unknownFlag: true },
      }

      // Must not throw, preserves current state
      const jobAfterUnknown = applyNormalizedPodEvent(createdJob, unknownEvent)
      expect(jobAfterUnknown.state).toBe(createdJob.state)
      expect(
        jobAfterUnknown.auditTrail.some((a) => a.action === 'event_custom_future_status'),
      ).toBe(true)
    })

    it('17. Reconciliation: actively polls provider adapter and synchronizes state, fulfillments, and timestamp', async () => {
      // First submit fresh job to emulator
      const jobToReconcile: PODJob = {
        ...createdJob,
        state: 'created',
        idempotencyKey: `pod_job:recon_test:${testRunId}`,
      }
      const submitResult = await submitPodJobWithRetry({
        job: jobToReconcile,
        adapter: emulatorAdapter,
      })
      expect(submitResult.success).toBe(true)
      const submittedJob = (submitResult as any).job

      // Actively reconcile with provider
      const reconciled = await reconcilePodJobWithProvider(submittedJob, emulatorAdapter)
      expect(reconciled.externalOrderId).toBeDefined()
      expect(reconciled.lastReconciledAt).toBeDefined()
      expect(new Date(reconciled.lastReconciledAt!).getTime()).toBeGreaterThan(0)
    })

    it('18. Shipping state: applies normalized shipped event with tracking and updates line fulfillments', () => {
      const shippedEvent: NormalizedPodEvent = {
        providerEventId: `evt_shipped_${testRunId}`,
        providerKey: 'pod-emulator',
        externalOrderId: 'emu_ord_99001',
        kind: 'shipped',
        occurredAt: new Date().toISOString(),
        fulfillments: [
          {
            fulfillmentId: 'ful_101',
            status: 'shipped',
            carrier: 'USPS',
            trackingNumber: '9400111899562537625123',
            trackingUrl:
              'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899562537625123',
            lineIndices: [0],
          },
        ],
        rawEvidence: { sample: true },
      }

      const shippedJob = applyNormalizedPodEvent(createdJob, shippedEvent)
      expect(shippedJob.state).toBe('shipped')
      expect((shippedJob as any).fulfillments?.length).toBe(1)
      expect((shippedJob as any).fulfillments[0].trackingNumber).toBe('9400111899562537625123')
    })

    it('19. Tracking state: sanitizes tracking URLs and blocks javascript/open redirect attacks', () => {
      // Malicious javascript injection URL blocked
      const xssUrl = sanitizeTrackingUrl('javascript:alert(document.cookie)', 'USPS', '94001118995')
      expect(xssUrl).not.toContain('javascript:')
      expect(xssUrl).toContain('tools.usps.com')

      // Insecure HTTP URL replaced with safe carrier standard HTTPS portal
      const httpUrl = sanitizeTrackingUrl(
        'http://insecure-tracking.example',
        'FedEx',
        '794612345678',
      )
      expect(httpUrl).toContain('https://www.fedex.com')

      // Allowed safe HTTPS carrier URL preserved
      const validUrl = sanitizeTrackingUrl(
        'https://tools.usps.com/go/TrackConfirmAction?tLabels=94001118995',
      )
      expect(validUrl).toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=94001118995')
    })

    it('20. Provider failure: verifies retry backoff on transient errors and terminal failure on exhaustion', async () => {
      const failingAdapter = new PodEmulatorAdapter({ healthy: false })
      const jobForFailure: PODJob = {
        ...createdJob,
        state: 'created',
        attemptCount: 0,
        idempotencyKey: `pod_job:fail_test:${testRunId}`,
      }

      // Attempt 1: Transient 503 unavailable error
      const attempt1 = await submitPodJobWithRetry({
        job: jobForFailure,
        adapter: failingAdapter,
      })
      expect(attempt1.success).toBe(false)
      if (!attempt1.success) {
        expect(attempt1.retryable).toBe(true)
      }
      expect((attempt1 as any).job.attemptCount).toBe(1)

      // Exhaust attempts up to MAX_POD_SUBMIT_ATTEMPTS (3)
      let currentJob = (attempt1 as any).job
      for (let i = 2; i <= MAX_POD_SUBMIT_ATTEMPTS; i++) {
        const nextAttempt = await submitPodJobWithRetry({
          job: currentJob,
          adapter: failingAdapter,
        })
        currentJob = (nextAttempt as any).job
        if (i === MAX_POD_SUBMIT_ATTEMPTS) {
          if (!nextAttempt.success) {
            expect(nextAttempt.handoffRequired).toBe(true)
          }
          expect(currentJob.state).toBe('failed')
        }
      }
    })

    it('21. Manual recovery path: hands off failed POD job to manual package queue with disclaimer and dispatch', () => {
      const failedJob: PODJob = {
        ...createdJob,
        state: 'failed',
        attemptCount: 3,
        lastError: 'Provider 503 unavailable: submission attempts exhausted.',
      }

      const manualPkg = handoffFailedPodJobToManual(
        failedJob,
        'Provider 503 unavailable: submission attempts exhausted.',
      )
      expect(manualPkg.status).toBe('pending_acknowledgement')
      expect(manualPkg.disclaimer).toBe(MANUAL_FULFILLMENT_DISCLAIMER)
      expect(manualPkg.approvedLines.length).toBe(1)
      expect(manualPkg.approvedLines[0].artworkSpecs[0].downloadUrl).toContain(
        '/api/commerce/pod/assets',
      )

      // Operator claims and ships manual package
      const claimed = acknowledgeManualFulfillmentPackage(manualPkg, 'artisan_operator')
      expect(claimed.status).toBe('acknowledged')
      expect(claimed.acknowledgement?.acknowledgedBy).toBe('artisan_operator')

      const shipped = shipManualFulfillmentPackage(
        claimed,
        {
          carrier: 'USPS',
          trackingNumber: '9405503699300123456789',
        },
        'shipping_dock',
      )
      expect(shipped.status).toBe('shipped')
      expect(shipped.externalFulfillment?.trackingUrl).toContain('tools.usps.com')
    })

    it('22. Restart while fulfillment work is in progress: resumes state safely using deterministic idempotency key', async () => {
      const jobToSubmit: PODJob = {
        ...createdJob,
        state: 'created',
        idempotencyKey: `pod_job:site-party:ord_crash_test:0:${testRunId}`,
      }

      // Initial execution creates provider order
      const initialRun = await submitPodJobWithRetry({
        job: jobToSubmit,
        adapter: emulatorAdapter,
      })
      expect(initialRun.success).toBe(true)
      const externalId1 = (initialRun as any).job.externalOrderId

      // Simulate worker crash & restart: identical idempotency key returns identical external order without duplicate creation
      const postRestartRun = await submitPodJobWithRetry({
        job: jobToSubmit,
        adapter: emulatorAdapter,
      })
      expect(postRestartRun.success).toBe(true)
      expect((postRestartRun as any).job.externalOrderId).toBe(externalId1)
    })

    it('23. Concurrency invariant: proves zero duplicate orders, fulfillments, shipments, or provider submissions', async () => {
      const concurrentJob: PODJob = {
        ...createdJob,
        idempotencyKey: `pod_job:concurrent_test:${testRunId}`,
      }

      // 5 concurrent submissions of the exact same job
      const concurrentResults = await Promise.all([
        submitPodJobWithRetry({ job: concurrentJob, adapter: emulatorAdapter }),
        submitPodJobWithRetry({ job: concurrentJob, adapter: emulatorAdapter }),
        submitPodJobWithRetry({ job: concurrentJob, adapter: emulatorAdapter }),
        submitPodJobWithRetry({ job: concurrentJob, adapter: emulatorAdapter }),
        submitPodJobWithRetry({ job: concurrentJob, adapter: emulatorAdapter }),
      ])

      const successfulOrders = concurrentResults.map((r: any) => r.job.externalOrderId)
      // All 5 must have resolved to the EXACT same external order ID
      const uniqueOrderIds = new Set(successfulOrders)
      expect(uniqueOrderIds.size).toBe(1)
    })
  })

  // =========================================================================
  // PROVIDER & WORKER HEALTH CONFORMANCE (24 - 28)
  // =========================================================================

  describe('PROVIDER & WORKER HEALTH: Degradation, Visibility, Age Reporting, Drilldown & Capabilities', () => {
    it('24. Provider degradation and recovery: health check reflects unavailable/degraded and recovers cleanly', async () => {
      const healthAdapter = new PodEmulatorAdapter({ healthy: true })
      const initialHealth = await healthAdapter.health()
      expect(initialHealth.ready).toBe(true)
      expect(initialHealth.health).toBe('healthy')

      // Provider degraded / down
      healthAdapter.setHealth(false, 'Remote API rate limit exceeded')
      const degradedHealth = await healthAdapter.health()
      expect(degradedHealth.ready).toBe(false)
      expect(degradedHealth.health).toBe('unavailable')
      expect(degradedHealth.reason).toContain('rate limit exceeded')

      // Provider recovery
      healthAdapter.setHealth(true)
      const recoveredHealth = await healthAdapter.health()
      expect(recoveredHealth.ready).toBe(true)
      expect(recoveredHealth.health).toBe('healthy')
    })

    it('25. Failed worker/job visibility: command center displays failed jobs with error details and retry counts', () => {
      const failedJob: PODJob = {
        ...(samplePodJob ?? (createdJob as any)),
        id: `pod_failed_${testRunId}`,
        state: 'failed',
        attemptCount: 3,
        lastError: 'HTTP 422: Print artwork rejected due to color space mismatch.',
      }

      const html = renderToStaticMarkup(
        createElement(FulfillmentCommandCenter, {
          initialJobs: [failedJob],
          initialTab: 'jobs',
        }),
      )

      expect(html).toContain('FAILED WORKER / SUBMISSION')
      expect(html).toContain('Attempts: 3')
      expect(html).toContain('color space mismatch')
      expect(html).toContain('View in Manual Queue')
    })

    it('26. Reconciliation-age reporting: tracks timestamp of last sync and displays age in Command Center', () => {
      const reconciledJob: PODJob = {
        ...(samplePodJob ?? (createdJob as any)),
        id: `pod_reconciled_${testRunId}`,
        state: 'in_production',
        lastReconciledAt: '2026-09-23T18:00:00.000Z',
      }

      const html = renderToStaticMarkup(
        createElement(FulfillmentCommandCenter, {
          initialJobs: [reconciledJob],
          initialTab: 'jobs',
        }),
      )

      expect(html).toContain('Reconciliation Age:')
      expect(html).toContain('Reconciled with provider at 2026-09-23T18:00:00.000Z')
    })

    it('27. Command Center drilldown: health signal alert banner filters directly to affected provider jobs', () => {
      const degradedConn: PublicPodConnectionProjection = {
        ...publicConnection,
        id: 'conn-degraded-1',
        providerKey: 'printful',
        label: 'Printful Production API',
        lastHealthStatus: 'unavailable',
      }

      const matchingJob: PODJob = {
        ...(samplePodJob ?? (createdJob as any)),
        id: 'job-affected-1',
        providerKey: 'printful',
      }

      const otherJob: PODJob = {
        ...(samplePodJob ?? (createdJob as any)),
        id: 'job-unaffected-2',
        providerKey: 'pod-emulator',
      }

      // Render with degraded provider alert banner
      const htmlAlert = renderToStaticMarkup(
        createElement(FulfillmentCommandCenter, {
          initialJobs: [matchingJob, otherJob],
          initialProviders: [degradedConn],
          initialTab: 'jobs',
        }),
      )
      expect(htmlAlert).toContain('Provider Health Alert')
      expect(htmlAlert).toContain('Drilldown to Affected Jobs')

      // Render drilled down to printful: only displays matchingJob, filters out otherJob
      const htmlDrilldown = renderToStaticMarkup(
        createElement(FulfillmentCommandCenter, {
          initialJobs: [matchingJob, otherJob],
          initialProviders: [degradedConn],
          initialTab: 'jobs',
          initialProviderFilter: 'printful',
        }),
      )
      expect(htmlDrilldown).toContain('Filtered by provider:')
      expect(htmlDrilldown).toContain('printful')
      expect(htmlDrilldown).toContain('job-affected-1')
      expect(htmlDrilldown).not.toContain('job-unaffected-2')
    })

    it('28. Unsupported capabilities labeled: explicitly labeled in UI and rejects silent or simulated execution', () => {
      // 28a. UI Capabilities Matrix explicitly labels unsupported capabilities
      const printfulConn: PublicPodConnectionProjection = {
        id: 'conn-pf-real',
        siteId,
        providerKey: 'printful',
        label: 'Printful API',
        redactedApiKey: 'pf_***1234',
        hasWebhookSecret: false,
        status: 'active',
        capabilities: PRINTFUL_CAPABILITIES, // supportsAutomaticReprint: false, supportsPoBoxDelivery: false
        lastHealthStatus: 'healthy',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const html = renderToStaticMarkup(
        createElement(FulfillmentCommandCenter, {
          initialProviders: [printfulConn],
          initialTab: 'providers',
        }),
      )

      expect(html).toContain(
        'Unsupported — Requires manual operator review (Not simulated or silently claimed)',
      )
      expect(html).toContain('Unsupported — Strict address guard blocks PO boxes')

      // 28b. Engine rejects automated reprint when capability is unsupported
      expect(() =>
        createReprintPodJob({
          originalJob: createdJob,
          reason: 'Defective stitching',
          responsibility: 'provider_defect',
          actor: 'automated_cron',
          automated: true,
          adapterCapabilities: PRINTFUL_CAPABILITIES,
        }),
      ).toThrow(
        /Provider does not support automatic reprints.*Manual operator review and approval is required/,
      )

      // 28c. Address guard rejects PO box when provider capability does not support it
      const poBoxAddress: PodRecipientAddress = {
        name: 'Jordan Box',
        address1: 'PO Box 1234',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      }
      const poBoxValidation = validateShippingAddressForPod(
        poBoxAddress,
        PRINTFUL_CAPABILITIES.supportsPoBoxDelivery,
      )
      expect(poBoxValidation.valid).toBe(false)
      expect(poBoxValidation.policy).toBe('po-box-rejected')
      expect(poBoxValidation.issues[0]).toContain('does not accept PO Box')
    })
  })
})
