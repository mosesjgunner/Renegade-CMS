import { assertMoney } from './contracts'

export type RawAddressInput = Readonly<{
  name: string
  company?: string
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode: string
  country: string // ISO 3166-1 alpha-2 or raw input
  phone?: string
}>

export type ValidatedAddress = Readonly<{
  rawInput: RawAddressInput
  normalized: Readonly<{
    name: string
    company?: string
    line1: string
    line2?: string
    city: string
    state?: string
    postalCode: string
    country: string // ISO 3166-1 alpha-2 uppercase
    phone?: string
  }>
  isValid: boolean
  validationErrors: readonly string[]
}>

export type ShippingRate = Readonly<{
  id: string
  title: string
  amountMinor: string
  currency: string
  estimatedDaysMin?: number
  estimatedDaysMax?: number
  source: 'carrier' | 'configured-flat' | 'configured-free' | 'configured-pickup'
  quotedAt: string
  expiresAt: string
}>

export type ShippingRateQuery = Readonly<{
  siteId: string
  currency: string
  itemsSubtotalMinor: string
  destination: ValidatedAddress
  items: readonly Readonly<{
    productId: string
    variantSku: string
    quantity: number
    weightGrams?: number
    shippable: boolean
  }>[]
}>

export interface ShippingRateAdapter {
  key: string
  getRates(query: ShippingRateQuery): Promise<ShippingRate[]>
}

const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/
const DANGEROUS_CHARS_REGEX = /[<>{}\\]/

/**
 * Validates address input while strictly preserving raw user input verbatim.
 * Prevents HTML/script injection and validates essential postal requirements.
 */
export function validateAddress(input: RawAddressInput): ValidatedAddress {
  const errors: string[] = []

  const clean = (val?: string) => (val ?? '').trim()
  const name = clean(input.name)
  const line1 = clean(input.line1)
  const city = clean(input.city)
  const country = clean(input.country).toUpperCase()
  const postalCode = clean(input.postalCode).toUpperCase()
  const state = clean(input.state).toUpperCase()

  if (!name) errors.push('Name is required.')
  if (!line1) errors.push('Street address is required.')
  if (!city) errors.push('City is required.')
  if (!country || !ISO_COUNTRY_REGEX.test(country))
    errors.push('A valid 2-letter ISO country code is required.')
  if (!postalCode) errors.push('Postal code is required.')

  // Check injection
  for (const [field, val] of Object.entries(input)) {
    if (typeof val === 'string' && DANGEROUS_CHARS_REGEX.test(val)) {
      errors.push(`Field '${field}' contains invalid characters.`)
    }
  }

  // Country-specific validations
  if (country === 'US') {
    if (!state) errors.push('State is required for US addresses.')
    if (!/^\d{5}(-\d{4})?$/.test(postalCode))
      errors.push('US ZIP code must be 5 digits (e.g. 90210) or 9 digits.')
  } else if (country === 'CA') {
    if (!state) errors.push('Province is required for Canadian addresses.')
    if (!/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(postalCode))
      errors.push('Canadian postal code must follow A1A 1A1 format.')
  }

  return {
    rawInput: { ...input },
    normalized: {
      name,
      company: clean(input.company) || undefined,
      line1,
      line2: clean(input.line2) || undefined,
      city,
      state: state || undefined,
      postalCode,
      country,
      phone: clean(input.phone) || undefined,
    },
    isValid: errors.length === 0,
    validationErrors: errors,
  }
}

export type FallbackShippingConfig = Readonly<{
  standardRateMinor: string
  currency: string
  freeShippingThresholdMinor?: string
  enableLocalPickup?: boolean
  localPickupRateMinor?: string
}>

/**
 * Local fallback shipping adapter that guarantees deterministic rate quotes
 * with configured flat, free-tier, and pickup options when remote carrier quotes are unavailable.
 */
export class LocalFallbackShippingAdapter implements ShippingRateAdapter {
  public readonly key = 'local-fallback'
  private config: FallbackShippingConfig

  constructor(config: FallbackShippingConfig) {
    this.config = config
  }

  async getRates(query: ShippingRateQuery): Promise<ShippingRate[]> {
    const shippableItems = query.items.filter((i) => i.shippable)
    if (shippableItems.length === 0) {
      // Non-physical / digital orders require no shipping
      return []
    }

    const now = new Date()
    const quotedAt = now.toISOString()
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString() // 1 hour TTL
    const rates: ShippingRate[] = []
    const currency = this.config.currency

    const subtotal = BigInt(assertMoney(query.itemsSubtotalMinor, currency).amountMinor)

    // Check free shipping threshold
    const standardAmount = BigInt(assertMoney(this.config.standardRateMinor, currency).amountMinor)
    if (this.config.freeShippingThresholdMinor) {
      const threshold = BigInt(
        assertMoney(this.config.freeShippingThresholdMinor, currency).amountMinor,
      )
      if (subtotal >= threshold) {
        rates.push({
          id: 'rate_standard_free',
          title: 'Standard Shipping (Free qualifying order)',
          amountMinor: '0',
          currency,
          estimatedDaysMin: 3,
          estimatedDaysMax: 7,
          source: 'configured-free',
          quotedAt,
          expiresAt,
        })
      }
    }

    // Standard flat rate (if not free)
    if (rates.length === 0) {
      rates.push({
        id: 'rate_standard_flat',
        title: 'Standard Flat Rate Shipping',
        amountMinor: standardAmount.toString(),
        currency,
        estimatedDaysMin: 3,
        estimatedDaysMax: 7,
        source: 'configured-flat',
        quotedAt,
        expiresAt,
      })
    }

    // Local pickup if enabled
    if (this.config.enableLocalPickup) {
      const pickupAmount = this.config.localPickupRateMinor ?? '0'
      rates.push({
        id: 'rate_local_pickup',
        title: 'Local Pickup',
        amountMinor: pickupAmount,
        currency,
        estimatedDaysMin: 1,
        estimatedDaysMax: 2,
        source: 'configured-pickup',
        quotedAt,
        expiresAt,
      })
    }

    return rates
  }
}
