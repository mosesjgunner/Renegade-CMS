import { describe, expect, it } from 'vitest'
import {
  assertCampaign,
  assertDonationAuditEvent,
  assertDonationIntent,
  assertDonationPaymentBinding,
  assertCampaignTransition,
  feeCoverAmount,
  type Campaign,
  donationDisclosures,
  calculateDonationProgress,
} from '../../src/modules/commerce/donations'

const campaign: Campaign = {
  id: 'campaign-1',
  campaignKey: 'annual',
  version: 2,
  tenantId: 'tenant-1',
  siteId: 'site-1',
  title: 'Annual drive',
  purpose: 'Support this project',
  designations: [{ key: 'general', label: 'General' }],
  media: [],
  goalRules: {},
  allowedAmounts: ['2500'],
  currency: 'USD',
  recurrence: ['one-time', 'recurring'],
  privacyDefault: 'private',
  disclosures: ['No tax status or deductibility is represented.'],
  lifecycle: 'active',
}

describe('SHOP-07 donation contracts', () => {
  it('validates campaign scope, dates, currency, recurrence, disclosures, and designations', () => {
    expect(assertCampaign(campaign)).toMatchObject({ version: 2, lifecycle: 'active' })
    expect(() =>
      assertCampaign({ ...campaign, endsAt: '2026-01-01', startsAt: '2026-02-01' }),
    ).toThrow()
    expect(() => assertCampaign({ ...campaign, disclosures: [] })).toThrow()
    expect(() => assertCampaignTransition('active', 'paused')).not.toThrow()
    expect(() => assertCampaignTransition('archived', 'active')).toThrow()
  })

  it('pins intent to the exact campaign revision and supported amount', () => {
    const intent = {
      id: 'intent-1',
      siteId: 'site-1',
      campaignId: campaign.id,
      campaignVersion: 2,
      designation: 'general',
      donorSnapshot: { guestName: 'A Donor' },
      money: { baseAmountMinor: '2500', feeCoveredAmountMinor: '75', currency: 'USD' },
      recognition: 'anonymous' as const,
      trackingSource: {},
      recurrence: 'one-time' as const,
      lifecycle: 'created' as const,
      paymentIntentId: 'payment-1',
    }
    expect(assertDonationIntent(intent, campaign)).toMatchObject({ campaignVersion: 2 })
    expect(() =>
      assertDonationIntent(
        { ...intent, money: { ...intent.money, baseAmountMinor: '1200' } },
        campaign,
      ),
    ).not.toThrow()
    expect(() =>
      assertDonationIntent(
        { ...intent, money: { ...intent.money, baseAmountMinor: '2501' } },
        campaign,
      ),
    ).toThrow('campaign maximum')
    expect(() => assertDonationIntent({ ...intent, campaignVersion: 1 }, campaign)).toThrow()
    expect(() =>
      assertDonationIntent({ ...intent, money: { ...intent.money, currency: 'CAD' } }, campaign),
    ).toThrow()
    expect(() =>
      assertDonationPaymentBinding(intent, {
        id: 'payment-1',
        amountMinor: '2575',
        currency: 'USD',
        state: 'paid',
      }),
    ).not.toThrow()
    expect(() =>
      assertDonationPaymentBinding(intent, {
        id: 'payment-1',
        amountMinor: '2500',
        currency: 'USD',
        state: 'paid',
      }),
    ).toThrow()
  })

  it('uses integer-only fee-cover math and requires exactly one event target', () => {
    expect(
      feeCoverAmount('10000', {
        mode: 'percentage-plus-fixed',
        basisPoints: 250,
        fixedAmountMinor: '30',
        maximumFeeMinor: '200',
      }),
    ).toBe('200')
    expect(() =>
      feeCoverAmount('1.00', {
        mode: 'percentage-plus-fixed',
        basisPoints: 0,
        fixedAmountMinor: '0',
      }),
    ).toThrow()
    expect(() =>
      assertDonationAuditEvent({
        id: 'event-1',
        eventKey: 'evt-1',
        kind: 'created',
        occurredAt: '2026-09-23T00:00:00Z',
        evidence: {},
      }),
    ).toThrow()
  })

  it('fails closed on tax claims and aggregates settled gifts by currency', () => {
    expect(donationDisclosures({})).toEqual([
      'No representation is made that this contribution is tax deductible.',
    ])
    expect(
      donationDisclosures({ verified501c3Status: true, verifiedTaxDeductibility: true }),
    ).toContain('This organization is recognized as a 501(c)(3).')
    expect(
      calculateDonationProgress(
        [
          { lifecycle: 'succeeded', currency: 'USD', baseAmountMinor: '1200' },
          { lifecycle: 'pending', currency: 'USD', baseAmountMinor: '900' },
          { lifecycle: 'succeeded', currency: 'EUR', baseAmountMinor: '700' },
        ],
        'USD',
        '2000',
      ),
    ).toMatchObject({ settledAmountMinor: '1200', settledGiftCount: 1, percent: 60 })
  })
})
