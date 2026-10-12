import { expect, it } from 'vitest'
import { resolveProviderPlanChange } from '../../src/modules/commerce/subscription-service'
const plans = [
  { id: 'old', providerMappings: { 'stripe-test': 'price_basic' } },
  { id: 'purchased', providerMappings: { 'stripe-test': 'price_basic' } },
  { id: 'plus', providerMappings: { 'stripe-test': 'price_plus' } },
]
it('preserves the purchased agreement when its provider price did not change', () => {
  expect(resolveProviderPlanChange(plans, 'stripe-test', 'price_basic', 'price_basic')).toEqual({
    plan: null,
    ambiguous: false,
  })
})
it('changes only to a uniquely mapped provider price', () => {
  expect(resolveProviderPlanChange(plans, 'stripe-test', 'price_plus', 'price_basic')).toEqual({
    plan: plans[2],
    ambiguous: false,
  })
})
it('does not choose an arbitrary agreement for an ambiguous changed price', () => {
  expect(resolveProviderPlanChange(plans, 'stripe-test', 'price_basic', 'price_plus')).toEqual({
    plan: null,
    ambiguous: true,
  })
})
