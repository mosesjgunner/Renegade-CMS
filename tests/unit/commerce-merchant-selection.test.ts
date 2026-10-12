import { expect, it } from 'vitest'
import { configuredCheckoutMerchant } from '../../src/modules/commerce/merchant-selection'
const merchants = [
  {
    id: 'recurring',
    site: 'site',
    providerKey: 'stripe-test',
    merchantCountry: 'US',
    status: 'active',
  },
  {
    id: 'cart',
    site: 'site',
    providerKey: 'deterministic-test',
    merchantCountry: 'US',
    status: 'active',
  },
]
const method = {
  merchantConnection: 'cart',
  site: 'site',
  providerKey: 'deterministic-test',
  enabled: true,
  health: 'healthy',
  merchantCountries: ['US'],
  presentmentCurrencies: ['USD'],
}
it('skips a recurring-only merchant without cart payment methods', () => {
  expect(
    configuredCheckoutMerchant(merchants, [method], { siteId: 'site', currency: 'USD' })?.id,
  ).toBe('cart')
})
it('does not select foreign or disabled methods or unsupported currencies', () => {
  for (const change of [
    { site: 'foreign' },
    { enabled: false },
    { health: 'unavailable' },
    { providerKey: 'foreign-provider' },
    { presentmentCurrencies: ['EUR'] },
  ])
    expect(
      configuredCheckoutMerchant(merchants, [{ ...method, ...change }], {
        siteId: 'site',
        currency: 'USD',
      }),
    ).toBeUndefined()
})
it('honors an explicit merchant without silently switching providers', () => {
  expect(
    configuredCheckoutMerchant(merchants, [method], {
      siteId: 'site',
      currency: 'USD',
      preferredMerchantId: 'recurring',
    }),
  ).toBeUndefined()
})
