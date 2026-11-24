/**
 * RC3-20 SHOP-UX Pass 05 — buyer-facing payment method presentation.
 *
 * The capability registry knows adapter keys (`btcpay`, `custodial-crypto`,
 * `deterministic-test`); buyers must never see those. This module is the
 * single translation layer between a payment-method capability + its rail
 * descriptor and what the buyer is shown: a recognizable method name, who
 * holds the money (custody), which networks/assets apply, and whether the
 * method is a test mode. Custodial and noncustodial crypto are distinct
 * methods with distinct explanations — never one generic "crypto" label.
 */
import {
  createBuiltinAdapterRegistries,
  custodialCryptoConfigFromMerchant,
  type PaymentRailAdapterDescriptor,
} from './adapters'
import type { PaymentMethodCapability } from './contracts'

export type PresentedPaymentMethod = {
  id: string
  label: string
  detail: string | null
  family: PaymentMethodCapability['family']
  providerKey: string
  custody: 'processor-managed' | 'noncustodial' | null
  networks: readonly string[]
  /** Buyer payment options within the method, e.g. ['lightning', 'on-chain']. */
  paymentOptions: readonly string[]
  testMode: boolean
}

let registries: ReturnType<typeof createBuiltinAdapterRegistries> | null = null
function railDescriptor(providerKey: string): PaymentRailAdapterDescriptor | undefined {
  registries ??= createBuiltinAdapterRegistries()
  // A capability can exist for a rail this build has not registered (the
  // registry's get() throws by design); presentation must degrade to the
  // family label, never crash checkout.
  return registries.paymentRails.has(providerKey)
    ? registries.paymentRails.get(providerKey)
    : undefined
}

const NETWORK_LABELS: Record<string, string> = {
  bitcoin: 'Bitcoin',
  dogecoin: 'Dogecoin',
  'evm:1': 'Ethereum',
}

export function networkLabel(network: string): string {
  return NETWORK_LABELS[network] ?? network
}

export function presentPaymentMethod(
  capability: PaymentMethodCapability,
  merchantConfiguration?: Record<string, unknown> | null,
): PresentedPaymentMethod {
  const descriptor = railDescriptor(capability.providerKey)
  const testMode =
    descriptor?.implementation === 'test' ||
    descriptor?.implementation === 'deterministic-emulator' ||
    descriptor?.implementation === 'fixture'
  const networks = descriptor?.networks ?? []
  const base = {
    id: capability.id,
    family: capability.family,
    providerKey: capability.providerKey,
    custody: descriptor?.custody ?? null,
    networks,
    paymentOptions: [] as readonly string[],
    testMode,
  }
  switch (capability.family) {
    case 'card':
      return {
        ...base,
        label: 'Card',
        detail: testMode ? 'Test payment — no real charge' : 'Pay by credit or debit card',
      }
    case 'wallet':
      return {
        ...base,
        label: capability.providerKey === 'paypal' ? 'PayPal' : 'Digital wallet',
        detail: testMode ? 'Test payment — no real charge' : null,
      }
    case 'bank-debit':
      return {
        ...base,
        label: 'Bank debit',
        detail: testMode ? 'Test payment — no real charge' : null,
      }
    case 'bank-transfer':
      return { ...base, label: 'Bank transfer', detail: null }
    case 'open-banking':
      return { ...base, label: 'Pay by bank', detail: null }
    case 'mobile-money':
      return { ...base, label: 'Mobile money', detail: null }
    case 'cash-voucher':
      return { ...base, label: 'Cash voucher', detail: null }
    case 'buy-now-pay-later':
      return { ...base, label: 'Pay over time', detail: null }
    case 'external-link':
      return { ...base, label: 'Pay on the provider’s site', detail: null }
    case 'crypto': {
      const paymentOptions = (descriptor?.capabilities ?? []).filter((capabilityName) =>
        ['lightning', 'on-chain'].includes(capabilityName),
      )
      if (capability.providerKey === 'btcpay') {
        return {
          ...base,
          label: 'Bitcoin',
          detail:
            'Lightning or on-chain, paid to the seller’s own Bitcoin server. No middleman holds your payment.',
          paymentOptions,
        }
      }
      if (capability.providerKey === 'custodial-crypto') {
        const processor = custodialCryptoConfigFromMerchant(merchantConfiguration ?? {})
        return {
          ...base,
          label: 'Bitcoin',
          detail: processor
            ? `Lightning or on-chain, handled by ${processor.processorName}. The processor receives your payment and settles with the seller.`
            : 'Lightning or on-chain, handled by a payment processor that settles with the seller.',
          paymentOptions,
        }
      }
      const networkName = networks.length ? networkLabel(networks[0]) : 'cryptocurrency'
      return {
        ...base,
        label: networks.length === 1 && networks[0] === 'dogecoin' ? 'Dogecoin' : 'Cryptocurrency',
        detail: `Paid directly to the seller’s ${networkName} wallet address.`,
        paymentOptions,
      }
    }
    default:
      return { ...base, label: 'Payment method', detail: null }
  }
}
