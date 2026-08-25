import { describe, expect, it } from 'vitest'
import {
  appendFinancialEvent,
  assertSingleMerchant,
  canWalletLoginAlterPaymentIntent,
  cryptoRequestFingerprint,
  eligiblePaymentMethods,
  entitlementActive,
  reconcileSupporter,
  type PaymentIntent,
  type PaymentMethodCapability,
} from '../../src/modules/commerce/contracts'
const scope = { siteId: 'site', spaceId: 'space-a', merchantConnectionId: 'merchant-a' }
const hosted: PaymentMethodCapability = {
  ...scope,
  id: 'hosted',
  providerKey: 'fixture-hosted',
  railKey: 'card',
  family: 'card',
  flow: 'hosted',
  merchantCountries: ['US'],
  buyerCountries: ['US'],
  presentmentCurrencies: ['USD'],
  settlementCurrencies: ['USD'],
  recurring: true,
  refunds: true,
  enabled: true,
  health: 'healthy',
  requiredCustomerFields: [],
  instructions: 'Hosted checkout',
}
const local: PaymentMethodCapability = {
  ...scope,
  id: 'local',
  providerKey: 'fixture-local',
  railKey: 'voucher',
  family: 'cash-voucher',
  flow: 'asynchronous',
  merchantCountries: ['MX'],
  buyerCountries: ['MX'],
  presentmentCurrencies: ['MXN'],
  settlementCurrencies: ['MXN'],
  recurring: false,
  refunds: false,
  enabled: true,
  health: 'healthy',
  requiredCustomerFields: ['name'],
  instructions: 'Pay with the issued voucher.',
}
describe('M13 sovereign commerce acceptance contracts', () => {
  it('discovers two materially different fixture flows from merchant/buyer/currency capability evidence', () => {
    expect(
      eligiblePaymentMethods([hosted, local], {
        merchant: scope,
        merchantCountry: 'US',
        buyerCountry: 'US',
        currency: 'USD',
        amountMinor: '1000',
        recurring: false,
      }).map((x) => x.capability.id),
    ).toEqual(['hosted'])
    expect(
      eligiblePaymentMethods([hosted, local], {
        merchant: scope,
        merchantCountry: 'MX',
        selectedCountry: 'MX',
        ipCountryHint: 'US',
        currency: 'MXN',
        amountMinor: '1000',
        recurring: false,
      }).map((x) => x.capability.id),
    ).toEqual(['local'])
  })
  it('keeps financial history append-only and deduplicates replayed provider webhooks', () => {
    const intent: PaymentIntent = {
      id: 'pi',
      scope,
      money: {
        amountMinor: '1000',
        currency: 'USD',
        quotedAt: '2026-08-25T00:00:00Z',
        quoteSource: null,
        buyerConfirmedConversion: false,
      },
      state: 'pending',
      capabilityId: 'hosted',
      expiresAt: '2026-08-26T00:00:00Z',
      financialEvents: [],
    }
    const event = {
      id: 'event-1',
      intentId: 'pi',
      kind: 'confirmed' as const,
      money: intent.money,
      providerEventId: 'evt-1',
      occurredAt: '2026-08-25T00:01:00Z',
    }
    expect(
      appendFinancialEvent(appendFinancialEvent(intent, event), event).financialEvents,
    ).toHaveLength(1)
  })
  it('separates membership entitlement, supporter identity, carts and wallet login from provider assumptions', () => {
    expect(
      entitlementActive(
        {
          id: 'g',
          supporterId: 's',
          entitlement: 'publication.read',
          source: 'tier',
          startsAt: '2026-01-01T00:00:00Z',
          endsAt: '2026-12-01T00:00:00Z',
        },
        '2026-08-25T00:00:00Z',
      ),
    ).toBe(true)
    expect(
      reconcileSupporter(
        [
          {
            id: 's',
            scope,
            memberId: 'member-1',
            providerReferences: [{ providerKey: 'patreon', externalId: 'p1' }],
          },
        ],
        { providerKey: 'ko-fi', externalId: 'k1' },
        'member-1',
      )?.id,
    ).toBe('s')
    expect(() =>
      assertSingleMerchant([{ merchantConnectionId: 'a' }, { merchantConnectionId: 'b' }]),
    ).toThrow('cannot combine')
    expect(canWalletLoginAlterPaymentIntent()).toBe(false)
    expect(
      cryptoRequestFingerprint({
        intentId: 'pi',
        network: 'dogecoin',
        asset: 'DOGE',
        address: 'Dfixture',
        money: {
          amountMinor: '1',
          currency: 'DOGE',
          quotedAt: '2026-08-25T00:00:00Z',
          quoteSource: 'fixture',
          buyerConfirmedConversion: false,
        },
        expiresAt: '2026-08-26T00:00:00Z',
        confirmationPolicy: 6,
        privateKeyBoundary: 'never-received',
      }),
    ).toMatch(/^sha256:/)
  })
})
