type Merchant = {
  id: string
  site: unknown
  space?: unknown
  providerKey: string
  merchantCountry: string
  status: string
}
type Method = {
  merchantConnection: unknown
  site: unknown
  space?: unknown
  providerKey: string
  enabled?: boolean | null
  health?: string | null
  merchantCountries?: unknown
  presentmentCurrencies?: unknown
}
const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')

/** A recurring-only connection must not displace a merchant configured for cart payments. */
export function configuredCheckoutMerchant(
  merchants: Merchant[],
  methods: Method[],
  input: { siteId: string; spaceId?: string; currency: string; preferredMerchantId?: string },
) {
  return merchants.find(
    (merchant) =>
      merchant.status === 'active' &&
      id(merchant.site) === input.siteId &&
      id(merchant.space) === (input.spaceId ?? '') &&
      (!input.preferredMerchantId || merchant.id === input.preferredMerchantId) &&
      methods.some(
        (method) =>
          id(method.merchantConnection) === merchant.id &&
          id(method.site) === input.siteId &&
          id(method.space) === (input.spaceId ?? '') &&
          method.providerKey === merchant.providerKey &&
          method.enabled &&
          method.health === 'healthy' &&
          Array.isArray(method.merchantCountries) &&
          method.merchantCountries.includes(merchant.merchantCountry) &&
          Array.isArray(method.presentmentCurrencies) &&
          method.presentmentCurrencies.includes(input.currency),
      ),
  )
}
