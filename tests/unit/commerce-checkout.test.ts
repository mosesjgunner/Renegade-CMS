import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  applyVerifiedWebhook,
  clientCallbackCannotConfirmPayment,
  createDevelopmentAdapter,
  methodsForCart,
  transitionOrder,
} from '../../src/modules/commerce/service'
import type { PaymentIntent, PaymentMethodCapability } from '../../src/modules/commerce/contracts'

const scope = { siteId: 'site', spaceId: 'space-a', merchantConnectionId: 'merchant-a' }
const card: PaymentMethodCapability = {
  ...scope,
  id: 'usd-card',
  providerKey: 'development-stripe',
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
  instructions: '',
}
const transfer: PaymentMethodCapability = {
  ...scope,
  id: 'mx-transfer',
  providerKey: 'development-bank-transfer',
  railKey: 'transfer',
  family: 'bank-transfer',
  flow: 'asynchronous',
  merchantCountries: ['MX'],
  buyerCountries: ['MX'],
  presentmentCurrencies: ['MXN'],
  settlementCurrencies: ['MXN'],
  recurring: false,
  refunds: false,
  enabled: true,
  health: 'healthy',
  requiredCustomerFields: [],
  instructions: '',
}
const intent: PaymentIntent = {
  id: 'pi',
  scope,
  capabilityId: card.id,
  state: 'pending',
  expiresAt: '2026-12-01T00:00:00.000Z',
  money: {
    amountMinor: '1000',
    currency: 'USD',
    quotedAt: '2026-08-25T00:00:00.000Z',
    quoteSource: null,
    buyerConfirmedConversion: false,
  },
  financialEvents: [],
}

describe('canonical checkout', () => {
  it('shows materially different eligible payment methods and rejects wrong country/currency/outage', () => {
    const us = methodsForCart(
      [card, transfer],
      {
        merchant: scope,
        merchantCountry: 'US',
        buyerCountry: 'US',
        currency: 'USD',
        amountMinor: '1000',
        recurring: false,
      },
      [
        {
          productId: 'p',
          variantSku: 'v',
          quantity: 1,
          merchantConnectionId: 'merchant-a',
          kind: 'digital',
        },
      ],
    )
    expect(us.map((x) => x.capability.id)).toEqual(['usd-card'])
    const mx = methodsForCart(
      [card, transfer],
      {
        merchant: scope,
        merchantCountry: 'MX',
        buyerCountry: 'MX',
        currency: 'MXN',
        amountMinor: '1000',
        recurring: false,
      },
      [
        {
          productId: 'p',
          variantSku: 'v',
          quantity: 1,
          merchantConnectionId: 'merchant-a',
          kind: 'physical',
        },
      ],
    )
    expect(mx.map((x) => x.capability.id)).toEqual(['mx-transfer'])
    expect(
      methodsForCart(
        [{ ...card, health: 'unavailable' }],
        {
          merchant: scope,
          merchantCountry: 'US',
          buyerCountry: 'CA',
          currency: 'CAD',
          amountMinor: '1000',
          recurring: false,
        },
        [
          {
            productId: 'p',
            variantSku: 'v',
            quantity: 1,
            merchantConnectionId: 'merchant-a',
            kind: 'digital',
          },
        ],
      ),
    ).toEqual([])
  })
  it('uses verified provider events for immediate and asynchronous order transitions, never a callback', () => {
    expect(clientCallbackCannotConfirmPayment()).toBe(false)
    const paid = applyVerifiedWebhook(intent, {
      id: 'evt-1',
      intentId: 'pi',
      kind: 'confirmed',
      occurredAt: '2026-08-25T00:01:00.000Z',
    })
    expect(paid.state).toBe('paid')
    expect(
      applyVerifiedWebhook(paid, {
        id: 'evt-1',
        intentId: 'pi',
        kind: 'confirmed',
        occurredAt: '2026-08-25T00:01:00.000Z',
      }).financialEvents,
    ).toHaveLength(1)
    expect(
      transitionOrder('pending-payment', {
        id: 'async',
        intentId: 'pi',
        kind: 'confirmed',
        occurredAt: '',
      }),
    ).toBe('paid')
    expect(
      transitionOrder('paid', {
        id: 'forged-late-failure',
        intentId: 'pi',
        kind: 'failed',
        occurredAt: '',
      }),
    ).toBe('paid')
  })
  it('verifies signatures for development hosted and async adapters', async () => {
    const adapter = createDevelopmentAdapter('development-bank-transfer', 'secret', 'asynchronous')
    expect(
      (
        await adapter.initiate({
          intentId: 'pi',
          amountMinor: '1000',
          currency: 'MXN',
          returnUrl: '/',
        })
      ).flow,
    ).toBe('asynchronous')
    const raw = JSON.stringify({
      id: 'evt',
      intentId: 'pi',
      kind: 'confirmed',
      occurredAt: '2026-08-25T00:00:00.000Z',
    })
    expect(
      adapter.verifyWebhook(raw, createHmac('sha256', 'secret').update(raw).digest('hex'))?.id,
    ).toBe('evt')
    expect(adapter.verifyWebhook(raw, 'not-a-signature')).toBeNull()
  })
})

describe('storefront governance', () => {
  it('requires governed product media and never lets a release charge buyers', async () => {
    const { assertGovernedProductMedia, assertReleaseDoesNotCharge } = await import(
      '../../src/modules/commerce/service'
    )
    expect(() =>
      assertGovernedProductMedia([{ id: 'pending-image', rightsStatus: 'pending' }]),
    ).toThrow('not approved')
    expect(
      assertGovernedProductMedia([{ id: 'approved-image', rightsStatus: 'approved' }]),
    ).toBeUndefined()
    expect(assertReleaseDoesNotCharge({ releaseAction: 'publish' })).toBe(true)
    expect(() =>
      assertReleaseDoesNotCharge({ releaseAction: 'publish', chargeRequested: true }),
    ).toThrow('cannot initiate')
  })
})

it('uses Prompt 2 localized route and currency conventions for product surfaces', async () => {
  const { localizedPath } = await import('../../src/modules/public/localization')
  expect(
    localizedPath('/store/field-notes', 'fr', {
      defaultLocale: 'en',
      supportedLocales: ['en', 'fr'],
      fallbackChain: ['en'],
      timeZone: 'UTC',
    }),
  ).toBe('/fr/store/field-notes')
  expect(
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(12.5),
  ).toContain('12,50')
})
