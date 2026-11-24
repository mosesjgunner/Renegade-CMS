import { createHash } from 'node:crypto'
import type { MoneySnapshot } from './contracts'
import type { ShippingRate, ShippingRateAdapter, ShippingRateQuery } from './shipping'

/**
 * RC3-20 Layer A — adapter registries over the existing commerce seams.
 *
 * The catch-all shop does not add a new engine. It names the three seams the
 * code already has — where a sellable line comes from (ProductSource), who
 * fulfills it (FulfillmentProvider), and how money moves (PaymentRail) — and
 * registers the existing implementations under them, so new sources,
 * suppliers, and rails arrive as adapters, never as new pipelines.
 *
 * Conventions follow the codebase: adapters are versioned, money is integer
 * minor units, remote facts are observations with a freshness window, and
 * nothing downstream of payment consumes anything but immutable snapshots.
 */

export const ADAPTER_REGISTRY_CONTRACT_VERSION = 'rc320.adapters.v1' as const

// ---------------------------------------------------------------------------
// ProductSource — where a sellable line comes from
// ---------------------------------------------------------------------------

export type ProductSourceType = 'own' | 'affiliate' | 'pod' | 'dropship'

export type ObservedSupplierFacts = Readonly<{
  priceMinor?: string
  costMinor?: string
  currency?: string
  available?: boolean
  observedAt: string
}>

export type ProductSourceDescriptor = Readonly<{
  type: ProductSourceType
  /** Registry key of the source adapter that serves this line. */
  providerKey: string
  /** Remote product/variant reference for supplier/affiliate sources. */
  externalRef?: string
  /** Last synced remote facts — observations, never authoritative writes. */
  observed?: ObservedSupplierFacts
  /** After this many hours the observed facts are stale. */
  freshnessHours?: number
}>

/** Structural view of a product + variant, as loaded by the commerce routes. */
export type SourceProductView = Readonly<{
  kind: string
  productCapabilities?: readonly string[]
  affiliatePolicy?: {
    destinationUrl?: string
    disclosure?: string
    remotePrice?: { amountMinor?: string; currency?: string }
    remoteAvailability?: boolean
    observedAt?: string
    freshnessHours?: number
  } | null
  sourcePolicy?: {
    variants?: Readonly<Record<string, ProductSourceDescriptor>>
  } | null
  variants?: readonly {
    sku?: string
    inventoryPolicy?: string
    inventoryReference?: string
    podReference?: unknown
  }[]
}>

const OWN_SOURCE: ProductSourceDescriptor = { type: 'own', providerKey: 'own-inventory' }

/**
 * Resolves the source descriptor for one product variant from the fields the
 * catalog already carries. Affiliate wins first (it is never a payable line),
 * then an explicit reviewed sourcePolicy descriptor, then the POD seam, then
 * own inventory. An `external-hook` variant without a reviewed sourcePolicy
 * descriptor stays 'own' — a supplier relationship is never inferred.
 */
export function resolveProductSource(
  product: SourceProductView,
  variantSku: string,
): ProductSourceDescriptor {
  const variant = product.variants?.find((candidate) => candidate.sku === variantSku)
  if (
    product.kind === 'affiliate' ||
    product.productCapabilities?.includes('affiliate') ||
    variant?.inventoryPolicy === 'affiliate'
  ) {
    const policy = product.affiliatePolicy ?? undefined
    return {
      type: 'affiliate',
      providerKey: 'affiliate-referral',
      externalRef: variant?.inventoryReference,
      observed: policy?.observedAt
        ? {
            priceMinor: policy.remotePrice?.amountMinor,
            currency: policy.remotePrice?.currency,
            available: policy.remoteAvailability,
            observedAt: policy.observedAt,
          }
        : undefined,
      freshnessHours: policy?.freshnessHours,
    }
  }
  const declared = product.sourcePolicy?.variants?.[variantSku]
  if (declared && declared.type === 'dropship') {
    if (!declared.providerKey)
      throw new Error('Dropship source descriptor requires a provider key.')
    return declared
  }
  if (
    product.kind === 'pod-reference' ||
    variant?.inventoryPolicy === 'pod' ||
    variant?.inventoryPolicy === 'pod-provider'
  ) {
    return { type: 'pod', providerKey: 'pod-provider', externalRef: variant?.inventoryReference }
  }
  return OWN_SOURCE
}

export function isAffiliateProduct(product: SourceProductView): boolean {
  return product.kind === 'affiliate' || Boolean(product.productCapabilities?.includes('affiliate'))
}

/** The fulfillment group a sourced line belongs to in a checkout proposal. */
export function fulfillmentGroupKindForLine(input: {
  itemKind: string
  source: ProductSourceDescriptor
}): 'physical' | 'digital' | 'pod' | 'dropship' | 'referral' {
  if (input.source.type === 'affiliate') return 'referral'
  if (input.source.type === 'dropship') return 'dropship'
  if (input.source.type === 'pod') return 'pod'
  if (['digital', 'subscription', 'donation', 'membership'].includes(input.itemKind))
    return 'digital'
  return 'physical'
}

// ---------------------------------------------------------------------------
// Registries — one keyed registry shape for all three seams
// ---------------------------------------------------------------------------

export type AdapterDescriptor = Readonly<{
  key: string
  contractVersion: string
  capabilities: readonly string[]
}>

export class AdapterRegistry<T extends AdapterDescriptor> {
  private readonly entries = new Map<string, T>()
  register(adapter: T): void {
    if (!adapter.key) throw new Error('Adapter requires a key.')
    if (this.entries.has(adapter.key))
      throw new Error(`Adapter ${adapter.key} is already registered.`)
    this.entries.set(adapter.key, adapter)
  }
  get(key: string): T {
    const adapter = this.entries.get(key)
    if (!adapter) throw new Error(`Adapter ${key} is not registered.`)
    return adapter
  }
  has(key: string): boolean {
    return this.entries.has(key)
  }
  list(): readonly T[] {
    return [...this.entries.values()]
  }
}

export type ProductSourceAdapterDescriptor = AdapterDescriptor &
  Readonly<{ sourceType: ProductSourceType | 'mixed' }>

export type FulfillmentProviderAdapterDescriptor = AdapterDescriptor &
  Readonly<{ kind: 'self' | 'supplier' | 'referral' | 'digital' }>

export type PaymentRailAdapterDescriptor = AdapterDescriptor &
  Readonly<{
    family: 'card' | 'crypto' | 'external-link' | 'manual'
    implementation: 'live-configured' | 'deterministic-emulator' | 'fixture' | 'test'
    networks?: readonly string[]
    /**
     * RC3-20 SHOP-UX Pass 05: who holds the buyer's funds. Custodial
     * (processor-managed) and noncustodial (merchant's own server/wallet)
     * crypto are distinct buyer-facing capabilities and must never be
     * presented as the same method.
     */
    custody?: 'processor-managed' | 'noncustodial'
  }>

export type AdapterRegistries = Readonly<{
  sources: AdapterRegistry<ProductSourceAdapterDescriptor>
  fulfillmentProviders: AdapterRegistry<FulfillmentProviderAdapterDescriptor>
  paymentRails: AdapterRegistry<PaymentRailAdapterDescriptor>
}>

/**
 * The built-in registrations. Every entry names an implementation that exists
 * in this codebase today; the registry is the resolution point checkout and
 * order code use instead of hardcoding provider keys.
 */
export function createBuiltinAdapterRegistries(): AdapterRegistries {
  const sources = new AdapterRegistry<ProductSourceAdapterDescriptor>()
  sources.register({
    key: 'own-inventory',
    sourceType: 'own',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['catalog-local', 'tracked-inventory', 'untracked-inventory'],
  })
  sources.register({
    key: 'affiliate-referral',
    sourceType: 'affiliate',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['catalog-observation-sync', 'link-health', 'referral-handoff'],
  })
  sources.register({
    key: 'pod-provider',
    sourceType: 'pod',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['catalog-sync', 'cost-estimate', 'order-submit', 'tracking-events'],
  })
  sources.register({
    key: 'generic-dropship',
    sourceType: 'dropship',
    contractVersion: DROPSHIP_ADAPTER_CONTRACT_VERSION,
    capabilities: ['catalog-sync', 'stock-read', 'order-submit', 'tracking-read', 'order-cancel'],
  })

  const fulfillmentProviders = new AdapterRegistry<FulfillmentProviderAdapterDescriptor>()
  fulfillmentProviders.register({
    key: 'self-manual',
    kind: 'self',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['operator-lifecycle', 'carrier-tracking-entry'],
  })
  fulfillmentProviders.register({
    key: 'pod-supplier',
    kind: 'supplier',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['package-plan', 'paid-gated-submit', 'webhook-events', 'polling-reconcile'],
  })
  fulfillmentProviders.register({
    key: 'generic-dropship',
    kind: 'supplier',
    contractVersion: DROPSHIP_ADAPTER_CONTRACT_VERSION,
    capabilities: ['package-plan', 'paid-gated-submit', 'tracking-read', 'polling-reconcile'],
  })
  fulfillmentProviders.register({
    key: 'affiliate-referral',
    kind: 'referral',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['terminal-at-checkout', 'disclosed-handoff'],
  })
  fulfillmentProviders.register({
    key: 'digital-delivery',
    kind: 'digital',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['entitlement-grant', 'download-grant'],
  })

  const paymentRails = new AdapterRegistry<PaymentRailAdapterDescriptor>()
  paymentRails.register({
    key: 'stripe-test',
    family: 'card',
    implementation: 'test',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['hosted-checkout', 'refund', 'disputes', 'signed-webhooks'],
  })
  paymentRails.register({
    key: 'deterministic-test',
    family: 'card',
    implementation: 'deterministic-emulator',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['hosted-checkout', 'signed-webhooks'],
  })
  paymentRails.register({
    key: 'fixture-crypto',
    family: 'crypto',
    implementation: 'fixture',
    contractVersion: ADAPTER_REGISTRY_CONTRACT_VERSION,
    capabilities: ['invoice', 'fixture-observations'],
    networks: ['dogecoin', 'evm:1'],
    custody: 'noncustodial',
  })
  paymentRails.register({
    key: 'btcpay',
    family: 'crypto',
    implementation: 'live-configured',
    contractVersion: BTCPAY_ADAPTER_CONTRACT_VERSION,
    capabilities: ['invoice', 'server-verified-settlement', 'fx-quote', 'lightning', 'on-chain'],
    networks: ['bitcoin'],
    custody: 'noncustodial',
  })
  paymentRails.register({
    key: 'custodial-crypto',
    family: 'crypto',
    implementation: 'deterministic-emulator',
    contractVersion: CUSTODIAL_CRYPTO_ADAPTER_CONTRACT_VERSION,
    capabilities: [
      'invoice',
      'fx-quote',
      'lightning',
      'on-chain',
      'processor-settlement',
      'fixture-observations',
    ],
    networks: ['bitcoin'],
    custody: 'processor-managed',
  })

  return { sources, fulfillmentProviders, paymentRails }
}

// ---------------------------------------------------------------------------
// Per-fulfillment-group shipping
// ---------------------------------------------------------------------------

export type ShippingGroupQuote = Readonly<{
  groupKey: string
  rate?: ShippingRate
  amountMinor: string
  /** Every rate quoted for the group, so checkout can offer an explicit
   * shipping-method choice (RC3-20 SHOP-UX Pass 04). */
  options?: readonly ShippingRate[]
}>

/**
 * Quotes shipping per fulfillment group instead of one rate per cart. Each
 * group ships separately, so each group is quoted on its own items and its
 * own subtotal (free-shipping thresholds therefore apply per shipment). The
 * buyer's selected rate id is honored per group when that group offers it.
 */
export async function quoteShippingForGroups(input: {
  adapter: ShippingRateAdapter
  base: Omit<ShippingRateQuery, 'items' | 'itemsSubtotalMinor'>
  groups: readonly Readonly<{
    groupKey: string
    itemsSubtotalMinor: string
    items: ShippingRateQuery['items']
  }>[]
  selectedRateId?: string
}): Promise<{ quotes: readonly ShippingGroupQuote[]; totalMinor: string }> {
  const quotes: ShippingGroupQuote[] = []
  let total = 0n
  for (const group of input.groups) {
    if (group.items.length === 0) {
      quotes.push({ groupKey: group.groupKey, amountMinor: '0' })
      continue
    }
    const rates = await input.adapter.getRates({
      ...input.base,
      itemsSubtotalMinor: group.itemsSubtotalMinor,
      items: group.items,
    })
    const rate = rates.find((candidate) => candidate.id === input.selectedRateId) ?? rates[0]
    if (!rate)
      throw new Error(`No shipping rate available for fulfillment group ${group.groupKey}.`)
    total += BigInt(rate.amountMinor)
    quotes.push({ groupKey: group.groupKey, rate, amountMinor: rate.amountMinor, options: rates })
  }
  return { quotes, totalMinor: total.toString() }
}

// ---------------------------------------------------------------------------
// Generic dropship supplier — the POD adapter shape minus print files
// ---------------------------------------------------------------------------

export const DROPSHIP_ADAPTER_CONTRACT_VERSION = 'rc320.dropship.v1' as const

export type DropshipCatalogVariant = Readonly<{
  externalSku: string
  title: string
  costMinor: string
  currency: string
  available: boolean
  stockQuantity?: number
}>

export type DropshipCatalogItem = Readonly<{
  externalRef: string
  title: string
  variants: readonly DropshipCatalogVariant[]
}>

export type DropshipOrderState =
  | 'submitted'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'failed'

export type DropshipOrderResult = Readonly<{
  externalOrderId: string
  state: DropshipOrderState
  costMinor?: string
  currency?: string
  tracking?: Readonly<{ carrier: string; trackingNumber: string; trackingUrl?: string }>
  error?: string
  replay?: boolean
}>

export interface DropshipSupplierAdapter {
  readonly key: string
  readonly contractVersion: typeof DROPSHIP_ADAPTER_CONTRACT_VERSION
  health(): Promise<{
    ready: boolean
    health: 'healthy' | 'degraded' | 'unavailable'
    reason?: string
  }>
  getCatalog(): Promise<readonly DropshipCatalogItem[]>
  getStock(
    externalSku: string,
  ): Promise<Readonly<{ available: boolean; stockQuantity?: number; observedAt: string }>>
  createOrder(input: {
    orderId: string
    idempotencyKey: string
    recipient: Readonly<{
      name: string
      address1: string
      address2?: string
      city: string
      state?: string
      postalCode: string
      country: string
    }>
    items: readonly Readonly<{ externalSku: string; quantity: number }>[]
  }): Promise<DropshipOrderResult>
  getOrder(externalOrderId: string): Promise<DropshipOrderResult>
  cancelOrder(
    externalOrderId: string,
    reason?: string,
  ): Promise<Readonly<{ cancelled: boolean; reason?: string }>>
}

export type DropshipEmulatorSeed = Readonly<{
  catalog: readonly DropshipCatalogItem[]
  carrier?: string
}>

/**
 * Deterministic in-memory dropship supplier. It is the dropship counterpart
 * of the POD emulator: real contract behavior (idempotent order creation,
 * stock accounting, honest failure on insufficient stock, tracking on
 * shipment) with no network and no randomness, so journeys are reproducible.
 * An order reads back as shipped with tracking on first read — the emulator
 * models a supplier whose warehouse ships immediately; live suppliers report
 * their own progression through the same getOrder contract.
 */
export function createEmulatorDropshipAdapter(
  key = 'generic-dropship',
  seed: DropshipEmulatorSeed = { catalog: [] },
): DropshipSupplierAdapter & {
  readonly orders: ReadonlyMap<string, DropshipOrderResult>
} {
  const stock = new Map<string, { variant: DropshipCatalogVariant; quantity: number }>()
  for (const item of seed.catalog)
    for (const variant of item.variants)
      stock.set(variant.externalSku, {
        variant,
        quantity: variant.stockQuantity ?? (variant.available ? Number.MAX_SAFE_INTEGER : 0),
      })
  const orders = new Map<string, DropshipOrderResult>()
  const byIdempotencyKey = new Map<string, string>()
  const carrier = seed.carrier ?? 'USPS'

  const snapshot = (order: DropshipOrderResult): DropshipOrderResult => ({ ...order })

  return {
    key,
    contractVersion: DROPSHIP_ADAPTER_CONTRACT_VERSION,
    orders,
    async health() {
      return { ready: true, health: 'healthy' as const }
    },
    async getCatalog() {
      return seed.catalog.map((item) => ({
        ...item,
        variants: item.variants.map((variant) => {
          const record = stock.get(variant.externalSku)
          return {
            ...variant,
            available: (record?.quantity ?? 0) > 0,
            stockQuantity: record?.quantity,
          }
        }),
      }))
    },
    async getStock(externalSku) {
      const record = stock.get(externalSku)
      return {
        available: (record?.quantity ?? 0) > 0,
        stockQuantity: record?.quantity,
        observedAt: new Date(0).toISOString(),
      }
    },
    async createOrder(input) {
      const existing = byIdempotencyKey.get(input.idempotencyKey)
      if (existing) return { ...snapshot(orders.get(existing)!), replay: true }
      const externalOrderId = `${key}:${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 16)}`
      let cost = 0n
      let currency: string | undefined
      for (const line of input.items) {
        const record = stock.get(line.externalSku)
        if (!record || record.quantity < line.quantity) {
          const failed: DropshipOrderResult = {
            externalOrderId,
            state: 'failed',
            error: `Supplier stock unavailable for ${line.externalSku}.`,
          }
          orders.set(externalOrderId, failed)
          byIdempotencyKey.set(input.idempotencyKey, externalOrderId)
          return snapshot(failed)
        }
        currency = record.variant.currency
        cost += BigInt(record.variant.costMinor) * BigInt(line.quantity)
      }
      for (const line of input.items) {
        const record = stock.get(line.externalSku)!
        stock.set(line.externalSku, { ...record, quantity: record.quantity - line.quantity })
      }
      const created: DropshipOrderResult = {
        externalOrderId,
        state: 'submitted',
        costMinor: cost.toString(),
        currency,
      }
      orders.set(externalOrderId, created)
      byIdempotencyKey.set(input.idempotencyKey, externalOrderId)
      return snapshot(created)
    },
    async getOrder(externalOrderId) {
      const order = orders.get(externalOrderId)
      if (!order) throw new Error(`Supplier order ${externalOrderId} was not found.`)
      if (order.state === 'submitted' || order.state === 'processing') {
        const shipped: DropshipOrderResult = {
          ...order,
          state: 'shipped',
          tracking: {
            carrier,
            trackingNumber: `EMU${createHash('sha256').update(externalOrderId).digest('hex').slice(0, 12).toUpperCase()}`,
          },
        }
        orders.set(externalOrderId, shipped)
        return snapshot(shipped)
      }
      return snapshot(order)
    },
    async cancelOrder(externalOrderId) {
      const order = orders.get(externalOrderId)
      if (!order) return { cancelled: false, reason: 'Supplier order was not found.' }
      if (order.state === 'shipped' || order.state === 'delivered')
        return { cancelled: false, reason: 'Supplier order has already shipped.' }
      orders.set(externalOrderId, { ...order, state: 'cancelled' })
      return { cancelled: true }
    },
  }
}

// ---------------------------------------------------------------------------
// BTCPay Server rail — Greenfield API, merchant's own server, server-verified
// ---------------------------------------------------------------------------

export const BTCPAY_ADAPTER_CONTRACT_VERSION = 'rc320.btcpay.v1' as const
export const CUSTODIAL_CRYPTO_ADAPTER_CONTRACT_VERSION = 'rc320.custodial-crypto.v1' as const

export type BtcpayFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>

export type BtcpayConfig = Readonly<{
  /** The merchant's own BTCPay Server base URL. Never a platform server. */
  serverUrl: string
  storeId: string
  /** Greenfield API key for the merchant's store, resolved server-side. */
  apiKey: string
  requiredConfirmations?: number
  fetchFn?: BtcpayFetch
}>

export type BtcpayInvoiceStatus = Readonly<{
  status: string
  additionalStatus?: string
}>

const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
}

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency] ?? 2
}

/** Parses a decimal string into an exact BigInt rational. */
export function parseDecimalRational(value: string): { numerator: bigint; denominator: bigint } {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!match) throw new Error(`Invalid decimal value: ${value}`)
  const [, sign, whole, fraction = ''] = match
  const denominator = 10n ** BigInt(fraction.length)
  const numerator = BigInt(whole) * denominator + BigInt(fraction || '0')
  return { numerator: sign === '-' ? -numerator : numerator, denominator }
}

/**
 * Converts a fiat minor-unit amount into satoshis at a fiat-per-BTC rate,
 * rounding UP so the merchant is never short-changed by the conversion.
 */
export function convertFiatMinorToSatoshis(input: {
  amountMinor: string
  currency: string
  rateFiatPerBtc: string
}): string {
  const rate = parseDecimalRational(input.rateFiatPerBtc)
  if (rate.numerator <= 0n) throw new Error('FX rate must be positive.')
  const amount = BigInt(input.amountMinor)
  const exponent = BigInt(currencyExponent(input.currency))
  const numerator = amount * 100_000_000n * rate.denominator
  const denominator = 10n ** exponent * rate.numerator
  const quotient = numerator / denominator
  return (numerator % denominator === 0n ? quotient : quotient + 1n).toString()
}

export function formatSatoshisAsBtc(satoshis: string): string {
  const value = BigInt(satoshis)
  const whole = value / 100_000_000n
  const fraction = (value % 100_000_000n).toString().padStart(8, '0')
  return `${whole.toString()}.${fraction}`
}

/**
 * Maps a BTCPay invoice status onto the canonical crypto invoice states.
 * Settlement is accepted ONLY on a plain Settled invoice. Overpaid and late
 * settlements are real money in the wrong shape: they route to manual
 * reconciliation, exactly like the chain-observation verifier treats them.
 */
export function mapBtcpayStatus(status: BtcpayInvoiceStatus): {
  state: import('./contracts').CryptoInvoiceState
  accepted: boolean
  manualReconciliationAllowed: boolean
} {
  const additional = status.additionalStatus ?? 'None'
  switch (status.status) {
    case 'New':
      return { state: 'created', accepted: false, manualReconciliationAllowed: false }
    case 'Processing':
      return { state: 'confirming', accepted: false, manualReconciliationAllowed: false }
    case 'Settled':
      if (additional === 'PaidOver')
        return { state: 'overpaid', accepted: false, manualReconciliationAllowed: true }
      if (additional === 'PaidLate')
        return { state: 'late', accepted: false, manualReconciliationAllowed: true }
      return { state: 'confirmed', accepted: true, manualReconciliationAllowed: false }
    case 'Expired':
      if (additional === 'PaidLate')
        return { state: 'late', accepted: false, manualReconciliationAllowed: true }
      if (additional === 'PaidPartial')
        return { state: 'underpaid', accepted: false, manualReconciliationAllowed: true }
      return { state: 'expired', accepted: false, manualReconciliationAllowed: false }
    case 'Invalid':
      return { state: 'exception', accepted: false, manualReconciliationAllowed: true }
    default:
      throw new Error(`Unknown BTCPay invoice status: ${status.status}`)
  }
}

export type BtcpayAdapter = Readonly<{
  key: 'btcpay'
  contractVersion: typeof BTCPAY_ADAPTER_CONTRACT_VERSION
  getFiatRate(currency: string): Promise<{ rateFiatPerBtc: string; observedAt: string }>
  quoteInvoiceAmount(input: {
    amountMinor: string
    currency: string
    now: string
    buyerConfirmedConversion: boolean
  }): Promise<{
    exactAmountAtomic: string
    money: MoneySnapshot & { exactAmountAtomic: string }
  }>
  createInvoice(input: {
    intentId: string
    exactAmountAtomic: string
    expiresAt: string
    buyerEmail?: string
  }): Promise<import('./contracts').CryptoInvoice>
  getInvoiceStatus(invoiceId: string): Promise<BtcpayInvoiceStatus>
  verifySettlement(input: {
    invoiceId: string
    invoice: import('./contracts').CryptoInvoice
    now: string
  }): Promise<import('./contracts').CryptoVerification>
}>

/**
 * A real Greenfield API adapter for the merchant's own BTCPay Server.
 * Settlement truth comes only from querying that server — never from a
 * redirect, a wallet signature, or a submitted transaction hash.
 */
export function createBtcpayAdapter(config: BtcpayConfig): BtcpayAdapter {
  const base = config.serverUrl.replace(/\/+$/, '')
  const fetchFn: BtcpayFetch = config.fetchFn ?? ((url, init) => fetch(url, init))
  const request = async (path: string, init?: { method?: string; body?: string }) => {
    const response = await fetchFn(`${base}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `token ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: init?.body,
    })
    if (!response.ok) throw new Error(`BTCPay request failed (${response.status}): ${path}`)
    return response.json()
  }

  return {
    key: 'btcpay',
    contractVersion: BTCPAY_ADAPTER_CONTRACT_VERSION,
    async getFiatRate(currency) {
      const pair = `BTC_${currency.toUpperCase()}`
      const rows = await request(
        `/api/v1/stores/${config.storeId}/rates?currencyPair=${encodeURIComponent(pair)}`,
      )
      const row = Array.isArray(rows)
        ? rows.find((candidate: any) => candidate?.currencyPair === pair)
        : undefined
      if (!row || row.rate == null) throw new Error(`BTCPay returned no rate for ${pair}.`)
      return { rateFiatPerBtc: String(row.rate), observedAt: new Date().toISOString() }
    },
    async quoteInvoiceAmount(input) {
      const { rateFiatPerBtc } = await this.getFiatRate(input.currency)
      const exactAmountAtomic = convertFiatMinorToSatoshis({
        amountMinor: input.amountMinor,
        currency: input.currency,
        rateFiatPerBtc,
      })
      return {
        exactAmountAtomic,
        money: {
          amountMinor: input.amountMinor,
          currency: input.currency,
          quotedAt: input.now,
          quoteSource: 'btcpay-rates',
          buyerConfirmedConversion: input.buyerConfirmedConversion,
          exactAmountAtomic,
        },
      }
    },
    async createInvoice(input) {
      const created = await request(`/api/v1/stores/${config.storeId}/invoices`, {
        method: 'POST',
        body: JSON.stringify({
          amount: formatSatoshisAsBtc(input.exactAmountAtomic),
          currency: 'BTC',
          metadata: { orderId: input.intentId, buyerEmail: input.buyerEmail },
          checkout: {
            paymentMethods: ['BTC-CHAIN', 'BTC-LN'],
            expirationDate: input.expiresAt,
          },
        }),
      })
      const invoiceId = String(created?.id ?? '')
      if (!invoiceId) throw new Error('BTCPay did not return an invoice id.')
      let destination = ''
      let paymentLink: string | undefined
      try {
        const methods = await request(
          `/api/v1/stores/${config.storeId}/invoices/${invoiceId}/payment-methods`,
        )
        const chain = Array.isArray(methods)
          ? methods.find((method: any) => String(method?.paymentMethodId ?? '').startsWith('BTC'))
          : undefined
        destination = String(chain?.destination ?? '')
        paymentLink = chain?.paymentLink ? String(chain.paymentLink) : undefined
      } catch {
        // The invoice exists; destination discovery can be retried by the
        // verify path. Never fabricate a destination.
      }
      const uri = paymentLink ?? (created?.checkoutLink ? String(created.checkoutLink) : undefined)
      return {
        network: 'bitcoin',
        asset: 'BTC',
        exactAmountAtomic: input.exactAmountAtomic,
        destination,
        reference: invoiceId,
        uri,
        qrPayload: uri ?? '',
        expiresAt: input.expiresAt,
        requiredConfirmations: config.requiredConfirmations ?? 1,
        state: 'created',
        confirmations: 0,
        transactionIds: [],
      }
    },
    async getInvoiceStatus(invoiceId) {
      const invoice = await request(`/api/v1/stores/${config.storeId}/invoices/${invoiceId}`)
      return {
        status: String(invoice?.status ?? ''),
        additionalStatus: invoice?.additionalStatus ? String(invoice.additionalStatus) : undefined,
      }
    },
    async verifySettlement(input) {
      if (!input.invoice.reference) throw new Error('BTCPay invoice has no server reference.')
      const status = await this.getInvoiceStatus(input.invoice.reference)
      const mapped = mapBtcpayStatus(status)
      return {
        invoice: {
          ...input.invoice,
          state: mapped.state,
          confirmations: mapped.accepted
            ? Math.max(input.invoice.confirmations, input.invoice.requiredConfirmations)
            : input.invoice.confirmations,
          observedAt: input.now,
        },
        accepted: mapped.accepted,
        manualReconciliationAllowed: mapped.manualReconciliationAllowed,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Custodial crypto — a processor-managed rail (RC3-20 SHOP-UX Pass 05)
// ---------------------------------------------------------------------------

export type CustodialCryptoConfig = Readonly<{
  /** Buyer-facing processor name, e.g. "ProcessorPay". */
  processorName: string
  /** The processor's deposit address — funds go to the PROCESSOR, never to
   * a merchant wallet. That is what makes this rail custodial. */
  depositAddress: string
  /** Optional Lightning address the processor accepts payment at. */
  lightningAddress?: string
  settlementMode: 'fiat' | 'crypto' | 'mixed'
  /** Processor fee in basis points, disclosed on the frozen quote. */
  feeBasisPoints: number
  /** The processor's quoted fiat-per-BTC rate (deterministic in fixture
   * mode; a live integration reads it from the processor's rate API). */
  rateFiatPerBtc: string
  requiredConfirmations?: number
  /** Processor-reported chain observations (fixture evidence in tests; a
   * live integration sources these from the processor's API/webhooks). */
  observations?: readonly import('./contracts').ChainPaymentObservation[]
}>

/** Reads `configuration.custodialCrypto` from a merchant connection.
 * Returns null when the rail is not completely configured. */
export function custodialCryptoConfigFromMerchant(
  configuration: Record<string, unknown> | null | undefined,
): CustodialCryptoConfig | null {
  const raw = (configuration ?? {}).custodialCrypto as Record<string, unknown> | undefined
  if (!raw || typeof raw !== 'object') return null
  const processorName = typeof raw.processorName === 'string' ? raw.processorName.trim() : ''
  const depositAddress = typeof raw.depositAddress === 'string' ? raw.depositAddress.trim() : ''
  const rateFiatPerBtc = typeof raw.rateFiatPerBtc === 'string' ? raw.rateFiatPerBtc.trim() : ''
  const settlementMode = raw.settlementMode
  const feeBasisPoints = raw.feeBasisPoints
  if (!processorName || !depositAddress || !rateFiatPerBtc) return null
  if (settlementMode !== 'fiat' && settlementMode !== 'crypto' && settlementMode !== 'mixed')
    return null
  if (
    typeof feeBasisPoints !== 'number' ||
    !Number.isInteger(feeBasisPoints) ||
    feeBasisPoints < 0 ||
    feeBasisPoints > 10000
  )
    return null
  return {
    processorName,
    depositAddress,
    ...(typeof raw.lightningAddress === 'string' && raw.lightningAddress.trim()
      ? { lightningAddress: raw.lightningAddress.trim() }
      : {}),
    settlementMode,
    feeBasisPoints,
    rateFiatPerBtc,
    requiredConfirmations:
      typeof raw.requiredConfirmations === 'number' ? raw.requiredConfirmations : 1,
    observations: Array.isArray(raw.observations)
      ? (raw.observations as CustodialCryptoConfig['observations'])
      : [],
  }
}

export type CustodialSettlement = Readonly<{
  settlementMode: CustodialCryptoConfig['settlementMode']
  feeBasisPoints: number
  feeAmountMinor: string
  netAmountMinor: string
  currency: string
}>

export type CustodialCryptoAdapter = Readonly<{
  key: 'custodial-crypto'
  contractVersion: typeof CUSTODIAL_CRYPTO_ADAPTER_CONTRACT_VERSION
  processorName: string
  quoteInvoiceAmount(input: {
    amountMinor: string
    currency: string
    now: string
    buyerConfirmedConversion: boolean
  }): {
    exactAmountAtomic: string
    money: MoneySnapshot & { exactAmountAtomic: string }
    settlement: CustodialSettlement
  }
  settlementFor(amountMinor: string, currency: string): CustodialSettlement
  createInvoice(input: {
    intentId: string
    network: string
    asset: string
    exactAmountAtomic: string
    destination: string
    expiresAt: string
    requiredConfirmations: number
  }): Promise<import('./contracts').CryptoInvoice>
  getObservation(
    transactionId: string,
  ): Promise<import('./contracts').ChainPaymentObservation | null>
}>

/**
 * Deterministic processor-managed crypto adapter. The buyer pays the
 * PROCESSOR's deposit address (or its Lightning address); the processor
 * reports observations and settles to the merchant minus its disclosed fee.
 * This is the custodial counterpart to the noncustodial BTCPay rail: same
 * invoice/verification contract, opposite custody. Fixture observations are
 * the evidence source in this build — a live processor integration swaps
 * the observation feed, not the contract.
 */
export function createCustodialCryptoAdapter(
  config: CustodialCryptoConfig,
): CustodialCryptoAdapter {
  const settlementFor = (amountMinor: string, currency: string): CustodialSettlement => {
    const amount = BigInt(amountMinor)
    // Fee rounds UP so the disclosed fee is never understated.
    const fee = (amount * BigInt(config.feeBasisPoints) + 9999n) / 10000n
    return {
      settlementMode: config.settlementMode,
      feeBasisPoints: config.feeBasisPoints,
      feeAmountMinor: fee.toString(),
      netAmountMinor: (amount - fee).toString(),
      currency,
    }
  }
  return {
    key: 'custodial-crypto',
    contractVersion: CUSTODIAL_CRYPTO_ADAPTER_CONTRACT_VERSION,
    processorName: config.processorName,
    settlementFor,
    quoteInvoiceAmount(input) {
      const exactAmountAtomic = convertFiatMinorToSatoshis({
        amountMinor: input.amountMinor,
        currency: input.currency,
        rateFiatPerBtc: config.rateFiatPerBtc,
      })
      return {
        exactAmountAtomic,
        money: {
          amountMinor: input.amountMinor,
          currency: input.currency,
          quotedAt: input.now,
          quoteSource: 'custodial-processor',
          buyerConfirmedConversion: input.buyerConfirmedConversion,
          exactAmountAtomic,
        },
        settlement: settlementFor(input.amountMinor, input.currency),
      }
    },
    async createInvoice(input) {
      const uri = `bitcoin:${config.depositAddress}?amount=${formatSatoshisAsBtc(input.exactAmountAtomic)}`
      return {
        network: 'bitcoin',
        asset: 'BTC',
        exactAmountAtomic: input.exactAmountAtomic,
        destination: config.depositAddress,
        reference: input.intentId,
        uri,
        qrPayload: uri,
        expiresAt: input.expiresAt,
        requiredConfirmations: input.requiredConfirmations,
        state: 'created',
        confirmations: 0,
        transactionIds: [],
      }
    },
    async getObservation(transactionId) {
      return (
        (config.observations ?? []).find(
          (observation) => observation.transactionId === transactionId,
        ) ?? null
      )
    },
  }
}
