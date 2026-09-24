import { assertMoney } from './contracts'
import type { ValidatedAddress } from './shipping'
import type { PricedInputLine } from './pricing'

export type TaxCalculationInput = Readonly<{
  siteId: string
  currency: string
  destination: ValidatedAddress
  lines: readonly PricedInputLine[]
  shippingAmountMinor: string
  taxShipping?: boolean
}>

export type TaxCalculationResult = Readonly<{
  reliable: boolean
  jurisdiction: string
  effectiveRateBasisPoints: number
  taxAmountMinor: string
  taxableAmountMinor: string
  taxDisplay: 'inclusive' | 'exclusive'
  source: 'provider' | 'bounded-rule'
  calculatedAt: string
  disclaimer: string
}>

export class TaxCalculationUnavailableError extends Error {
  constructor(
    message: string,
    public readonly destinationCountry?: string,
  ) {
    super(message)
    this.name = 'TaxCalculationUnavailableError'
  }
}

export interface TaxAdapter {
  key: string
  calculateTax(input: TaxCalculationInput): Promise<TaxCalculationResult>
}

// Bounded jurisdiction tax rates in basis points (100 bps = 1.00%)
// Note: Only for well-defined bounded rules; any unmapped or missing taxable region must block.
export const BOUNDED_STATE_TAX_RATES_BPS: Record<string, number> = {
  // US states with standard statewide rates (simplified bounded baseline)
  'US:CA': 725, // California base 7.25%
  'US:NY': 800, // New York base 8.00%
  'US:TX': 625, // Texas base 6.25%
  'US:FL': 600, // Florida base 6.00%
  'US:WA': 650, // Washington base 6.50%
  'US:IL': 625, // Illinois base 6.25%
  // US States with zero sales tax (NOMAD states)
  'US:OR': 0, // Oregon (exempt)
  'US:DE': 0, // Delaware (exempt)
  'US:NH': 0, // New Hampshire (exempt)
  'US:MT': 0, // Montana (exempt)
}

export const BOUNDED_COUNTRY_VAT_RATES_BPS: Record<string, number> = {
  GB: 2000, // UK 20%
  DE: 1900, // Germany 19%
  FR: 2000, // France 20%
  CA: 500, // Canada GST 5%
}

const TRANSACTION_TAX_DISCLAIMER =
  'Calculated transactional sales/VAT tax for order settlement. Does not imply tax return filing or certified legal tax representation.'

export class BoundedJurisdictionTaxAdapter implements TaxAdapter {
  public readonly key = 'bounded-jurisdiction'
  private externalProvider?: TaxAdapter

  constructor(externalProvider?: TaxAdapter) {
    this.externalProvider = externalProvider
  }

  async calculateTax(input: TaxCalculationInput): Promise<TaxCalculationResult> {
    const dest = input.destination.normalized
    const country = dest.country
    const state = dest.state

    // If an external provider is supplied, attempt it first
    if (this.externalProvider) {
      try {
        const result = await this.externalProvider.calculateTax(input)
        if (result.reliable) return result
      } catch (err) {
        // Fall through to bounded local rules
      }
    }

    // Determine applicable jurisdiction key
    let rateBasisPoints: number | undefined
    let jurisdiction = country

    if (country === 'US') {
      if (!state) {
        throw new TaxCalculationUnavailableError(
          'US destination address requires a valid state to calculate sales tax.',
          country,
        )
      }
      const stateKey = `US:${state}`
      rateBasisPoints = BOUNDED_STATE_TAX_RATES_BPS[stateKey]
      jurisdiction = stateKey
    } else if (BOUNDED_COUNTRY_VAT_RATES_BPS[country] !== undefined) {
      rateBasisPoints = BOUNDED_COUNTRY_VAT_RATES_BPS[country]
      jurisdiction = country
    }

    // STRICT INVARIANT:
    // If we have no reliable rate for this destination, BLOCK.
    // Never invent zero tax for unconfigured regions.
    if (rateBasisPoints === undefined) {
      throw new TaxCalculationUnavailableError(
        `Reliable tax rates are unavailable for destination (${jurisdiction}). Checkout is blocked until a valid tax rule is configured.`,
        country,
      )
    }

    // Calculate taxable base
    let taxableBase = 0n
    for (const line of input.lines) {
      if (line.taxable !== false && line.taxDisplay !== 'not-applicable') {
        const lineNet =
          BigInt(assertMoney(line.unitPriceMinor, input.currency).amountMinor) *
          BigInt(line.quantity)
        taxableBase += lineNet
      }
    }

    if (input.taxShipping && input.shippingAmountMinor) {
      taxableBase += BigInt(assertMoney(input.shippingAmountMinor, input.currency).amountMinor)
    }

    const taxAmount = (taxableBase * BigInt(rateBasisPoints)) / 10000n

    return {
      reliable: true,
      jurisdiction,
      effectiveRateBasisPoints: rateBasisPoints,
      taxAmountMinor: taxAmount.toString(),
      taxableAmountMinor: taxableBase.toString(),
      taxDisplay:
        country === 'GB' || country === 'DE' || country === 'FR' ? 'inclusive' : 'exclusive',
      source: 'bounded-rule',
      calculatedAt: new Date().toISOString(),
      disclaimer: TRANSACTION_TAX_DISCLAIMER,
    }
  }
}
