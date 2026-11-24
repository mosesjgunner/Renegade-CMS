/**
 * RC3-20 SHOP-UX Pass 04 — merchant-configured commerce settings.
 *
 * A merchant connection's `configuration` JSON is the canonical record for
 * how that merchant sells: payment provider settings already live there
 * (slice 2: `btcpay`, `crypto`). This module adds the remaining Pass 04
 * surfaces with defensive parsing — malformed entries are ignored, never
 * trusted:
 *
 * - `configuration.shipping`: the merchant's own delivery rates for the
 *   local fallback adapter (flat rate, free-shipping threshold, pickup).
 *   Unconfigured merchants get the platform defaults, which are starting
 *   points, not merchant truth.
 * - `configuration.tax`: the merchant's configured tax rates per
 *   jurisdiction (`US:CA` style keys or bare country codes), consulted
 *   BEFORE the bounded statewide baseline, plus whether shipping is taxed.
 *   A merchant-configured rate — including an explicit 0 — is the
 *   merchant's assertion and is labeled `merchant-configured` on the tax
 *   snapshot. Destinations with neither a merchant rate nor a bounded rule
 *   still fail closed before any charge.
 * - `configuration.policies`: the merchant's policy records with versions
 *   (terms / privacy / returns / shipping). Versions are stamped into the
 *   consent record at proposal time so a completed order can prove which
 *   policy text the buyer accepted.
 */
import type { FallbackShippingConfig } from './shipping'

export type MerchantConfiguration = Record<string, unknown> | null | undefined

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const minorString = (value: unknown): string | null =>
  typeof value === 'string' && /^\d+$/.test(value) ? value : null

export const DEFAULT_SHIPPING_CONFIG = {
  standardRateMinor: '500',
  freeShippingThresholdMinor: '5000',
  enableLocalPickup: true,
} as const

export function merchantShippingConfig(
  configuration: MerchantConfiguration,
  currency: string,
): FallbackShippingConfig {
  const shipping = record(record(configuration).shipping)
  const threshold =
    shipping.freeShippingThresholdMinor === null
      ? undefined
      : (minorString(shipping.freeShippingThresholdMinor) ??
        DEFAULT_SHIPPING_CONFIG.freeShippingThresholdMinor)
  return {
    standardRateMinor:
      minorString(shipping.standardRateMinor) ?? DEFAULT_SHIPPING_CONFIG.standardRateMinor,
    currency,
    ...(threshold ? { freeShippingThresholdMinor: threshold } : {}),
    enableLocalPickup:
      typeof shipping.enableLocalPickup === 'boolean'
        ? shipping.enableLocalPickup
        : DEFAULT_SHIPPING_CONFIG.enableLocalPickup,
    ...(minorString(shipping.localPickupRateMinor)
      ? { localPickupRateMinor: minorString(shipping.localPickupRateMinor)! }
      : {}),
  }
}

export type MerchantTaxConfig = {
  ratesBps: Record<string, number>
  taxShipping: boolean
}

export function merchantTaxConfig(configuration: MerchantConfiguration): MerchantTaxConfig {
  const tax = record(record(configuration).tax)
  const rawRates = record(tax.ratesBps)
  const ratesBps: Record<string, number> = {}
  for (const [key, value] of Object.entries(rawRates)) {
    if (!/^(US:[A-Z]{2}|[A-Z]{2})$/.test(key)) continue
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10000)
      ratesBps[key] = value
  }
  return { ratesBps, taxShipping: tax.taxShipping === true }
}

export type MerchantPolicyType = 'terms' | 'privacy' | 'returns' | 'shipping'

export type MerchantPolicy = {
  type: MerchantPolicyType
  version: string
  title: string
  url?: string
  body?: string
}

const POLICY_TYPES: readonly MerchantPolicyType[] = ['terms', 'privacy', 'returns', 'shipping']

export function merchantPolicies(configuration: MerchantConfiguration): MerchantPolicy[] {
  const raw = record(configuration).policies
  if (!Array.isArray(raw)) return []
  const policies: MerchantPolicy[] = []
  for (const entry of raw) {
    const item = record(entry)
    const type = item.type as MerchantPolicyType
    if (!POLICY_TYPES.includes(type)) continue
    if (typeof item.version !== 'string' || !item.version.trim()) continue
    policies.push({
      type,
      version: item.version.trim(),
      title:
        typeof item.title === 'string' && item.title.trim()
          ? item.title.trim()
          : `${type[0].toUpperCase()}${type.slice(1)} policy`,
      ...(typeof item.url === 'string' && /^https?:\/\//.test(item.url) ? { url: item.url } : {}),
      ...(typeof item.body === 'string' && item.body.trim() ? { body: item.body } : {}),
    })
  }
  return policies
}

/** Versions to stamp into a consent record: { terms: '3', privacy: '2' }. */
export function merchantPolicyVersions(
  configuration: MerchantConfiguration,
): Record<string, string> {
  const versions: Record<string, string> = {}
  for (const policy of merchantPolicies(configuration)) versions[policy.type] = policy.version
  return versions
}
