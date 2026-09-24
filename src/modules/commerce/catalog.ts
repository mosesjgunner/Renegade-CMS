import { createHash } from 'node:crypto'

export const PRODUCT_CAPABILITIES = [
  'shippable',
  'digital-entitlement',
  'subscription',
  'donation',
  'affiliate',
  'pod',
] as const
export type ProductCapability = (typeof PRODUCT_CAPABILITIES)[number]

export type OptionDimension = Readonly<{ key: string; label: string; values: readonly string[] }>
export type CatalogVariant = Readonly<{
  sku: string
  title: string
  optionValues: Readonly<Record<string, string>>
  status?: 'active' | 'unavailable' | 'archived'
  weightGrams?: number
  dimensionsMm?: Readonly<{ length: number; width: number; height: number }>
  inventory?: Readonly<{ policy: 'untracked' | 'tracked' | 'affiliate' | 'pod'; quantity?: number }>
}>
export type CatalogOffer = Readonly<{
  id: string
  version: number
  status: 'draft' | 'active' | 'retired'
  variantSku?: string
  amountMinor: string
  currency: string
  compareAtMinor?: string
  compareAtEvidence?: Readonly<{ source: string; observedAt: string }>
  startsAt?: string
  endsAt?: string
  segmentPolicy?: Readonly<{ mode: 'public' | 'allowlist'; segmentIds?: readonly string[] }>
  taxDisplay: 'inclusive' | 'exclusive' | 'not-applicable'
  recurring?: Readonly<{ interval: 'month' | 'year'; intervalCount: number }>
  donation?: Readonly<{ minimumMinor: string; suggestedMinor?: readonly string[] }>
}>

export type AffiliatePolicy = Readonly<{
  destinationUrl: string
  disclosure: string
  observedAt: string
  freshnessHours: number
  trackingParameters?: Readonly<Record<string, string>>
  remotePrice?: Readonly<{ amountMinor: string; currency: string }>
  remoteAvailability?: 'in-stock' | 'out-of-stock' | 'unknown'
}>

export type PodMapping = Readonly<{
  providerKey: string
  remoteProductId: string
  remoteVariantId: string
  variantSku: string
  optionValues: Readonly<Record<string, string>>
  artworkRevisionId: string
  mockupProvenance: Readonly<{ source: 'provider' | 'publisher'; generatedAt: string }>
  snapshot: Readonly<{
    costMinor: string
    currency: string
    available: boolean
    observedAt: string
  }>
  reviewStatus: 'pending' | 'approved' | 'rejected'
}>

export type CatalogProduct = Readonly<{
  id?: string
  siteId: string
  slug: string
  canonicalPath: string
  name: string
  summary?: string
  description?: string
  state: 'draft' | 'review' | 'approved' | 'published' | 'archived'
  categoryId?: string
  topicIds?: readonly string[]
  tagIds?: readonly string[]
  collectionIds?: readonly string[]
  mediaIds?: readonly string[]
  relationshipIds?: readonly string[]
  disclosures?: readonly unknown[]
  seo?: Readonly<{
    title?: string
    description?: string
    canonicalUrl?: string
    noIndex?: boolean
    keywords?: readonly string[]
  }>
  capabilities: readonly ProductCapability[]
  optionDimensions?: readonly OptionDimension[]
  variants: readonly CatalogVariant[]
  offers: readonly CatalogOffer[]
  affiliate?: AffiliatePolicy
  podMappings?: readonly PodMapping[]
  digitalDelivery?: Readonly<{
    entitlement: string
    downloadLimit?: number
    expiresAfterDays?: number
    assets: readonly Readonly<{
      mediaId: string
      rightsStatus: 'approved' | 'pending' | 'restricted'
      malwareStatus: 'clean' | 'pending' | 'infected'
      publicOriginal: boolean
    }>[]
  }>
}>

/** Adapts Payload's editor-friendly field names to the canonical catalog contract. */
export function catalogProductFromDocument(document: Record<string, unknown>): CatalogProduct {
  const relationId = (value: unknown) =>
    typeof value === 'object' && value !== null && 'id' in value
      ? String((value as { id: unknown }).id)
      : String(value ?? '')
  const relationIds = (value: unknown) =>
    (Array.isArray(value) ? value : []).map(relationId).filter(Boolean)
  return {
    id: document.id ? String(document.id) : undefined,
    siteId: relationId(document.site),
    slug: String(document.slug ?? ''),
    canonicalPath: String(document.canonicalPath ?? ''),
    name: String(document.name ?? ''),
    summary: typeof document.summary === 'string' ? document.summary : undefined,
    description: typeof document.description === 'string' ? document.description : undefined,
    state: String(document.state ?? 'draft') as CatalogProduct['state'],
    categoryId: relationId(document.categories) || undefined,
    topicIds: relationIds(document.topics),
    tagIds: relationIds(document.tags),
    collectionIds: relationIds(document.collections),
    mediaIds: relationIds(document.media),
    relationshipIds: relationIds(document.relationships),
    disclosures: Array.isArray(document.disclosures) ? document.disclosures : [],
    seo: {
      title: typeof document.seoTitle === 'string' ? document.seoTitle : undefined,
      description:
        typeof document.seoDescription === 'string' ? document.seoDescription : undefined,
      canonicalUrl:
        typeof document.seoCanonicalURL === 'string' ? document.seoCanonicalURL : undefined,
      noIndex: document.seoNoIndex === true,
      keywords: Array.isArray(document.seoKeywords) ? document.seoKeywords.map(String) : undefined,
    },
    capabilities: (Array.isArray(document.productCapabilities)
      ? document.productCapabilities
      : []) as ProductCapability[],
    optionDimensions: (Array.isArray(document.optionDimensions)
      ? document.optionDimensions
      : []) as unknown as OptionDimension[],
    variants: (Array.isArray(document.variants) ? document.variants : []).map((item) => {
      const variant = item as Record<string, unknown>
      return {
        sku: String(variant.sku ?? ''),
        title: String(variant.title ?? ''),
        optionValues: (variant.optionValues ?? variant.attributes ?? {}) as Record<string, string>,
        status: String(variant.status ?? 'active') as CatalogVariant['status'],
        weightGrams:
          variant.weightGrams === undefined || variant.weightGrams === null
            ? undefined
            : Number(variant.weightGrams),
        dimensionsMm: variant.dimensionsMm as CatalogVariant['dimensionsMm'],
        inventory: {
          policy: String(variant.inventoryPolicy ?? 'untracked') as NonNullable<
            CatalogVariant['inventory']
          >['policy'],
          quantity:
            variant.inventoryQuantity === undefined || variant.inventoryQuantity === null
              ? undefined
              : Number(variant.inventoryQuantity),
        },
      }
    }),
    offers: (Array.isArray(document.offers) ? document.offers : []).map((item) => {
      const offer = item as Record<string, unknown>
      return {
        ...offer,
        id: String(offer.offerId ?? offer.id ?? ''),
        version: Number(offer.version ?? 0),
        status: String(offer.status ?? 'draft'),
        amountMinor: String(offer.amountMinor ?? ''),
        currency: String(offer.currency ?? ''),
        taxDisplay: String(offer.taxDisplay ?? 'exclusive'),
      } as CatalogOffer
    }),
    affiliate: document.affiliatePolicy as AffiliatePolicy | undefined,
    podMappings: (Array.isArray(document.podMappings)
      ? document.podMappings
      : []) as unknown as PodMapping[],
    digitalDelivery: document.digitalDelivery as CatalogProduct['digitalDelivery'],
  }
}

export class CatalogValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(issues.join(' '))
    this.name = 'CatalogValidationError'
  }
}

const integerMoney = (value: string) => /^(0|[1-9][0-9]*)$/.test(value)
const validDate = (value?: string) => !value || Number.isFinite(Date.parse(value))

export function validateCatalogProduct(product: CatalogProduct): readonly string[] {
  const issues: string[] = []
  if (!product.siteId) issues.push('Product site identity is required.')
  if (!product.name.trim()) issues.push('Product name is required.')
  const unknownCapabilities = product.capabilities.filter(
    (capability) => !PRODUCT_CAPABILITIES.includes(capability),
  )
  if (unknownCapabilities.length)
    issues.push(`Unknown product capabilities: ${unknownCapabilities.join(', ')}.`)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) issues.push('Product slug is invalid.')
  if (product.canonicalPath !== `/store/${product.slug}`)
    issues.push('Canonical path must be /store/<slug>.')
  if (product.seo?.canonicalUrl) {
    try {
      const canonical = new URL(product.seo.canonicalUrl)
      if (canonical.protocol !== 'https:' || canonical.username || canonical.password)
        issues.push('SEO canonical URL must be a safe HTTPS URL.')
    } catch {
      issues.push('SEO canonical URL must be a safe HTTPS URL.')
    }
  }
  if (!product.capabilities.length) issues.push('At least one product capability is required.')
  if (new Set(product.capabilities).size !== product.capabilities.length)
    issues.push('Product capabilities must be unique.')
  const dimensions = product.optionDimensions ?? []
  const dimensionKeys = new Set<string>()
  for (const dimension of dimensions) {
    if (!/^[a-z][a-z0-9-]*$/.test(dimension.key) || dimensionKeys.has(dimension.key))
      issues.push(`Option dimension ${dimension.key || '(blank)'} is invalid or duplicated.`)
    dimensionKeys.add(dimension.key)
    if (!dimension.values.length || new Set(dimension.values).size !== dimension.values.length)
      issues.push(`Option dimension ${dimension.key} must have unique declared values.`)
  }
  const skus = new Set<string>()
  const combinations = new Set<string>()
  if (!product.variants.length) issues.push('At least one deliberate variant is required.')
  for (const variant of product.variants) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(variant.sku) || skus.has(variant.sku))
      issues.push(`Variant SKU ${variant.sku || '(blank)'} is invalid or duplicated.`)
    skus.add(variant.sku)
    const keys = Object.keys(variant.optionValues)
    if (keys.length !== dimensions.length || keys.some((key) => !dimensionKeys.has(key)))
      issues.push(
        `Variant ${variant.sku} must deliberately select every declared option dimension.`,
      )
    for (const dimension of dimensions) {
      if (!dimension.values.includes(variant.optionValues[dimension.key] ?? ''))
        issues.push(`Variant ${variant.sku} uses an undeclared ${dimension.key} value.`)
    }
    const combination = dimensions
      .map((dimension) => `${dimension.key}=${variant.optionValues[dimension.key]}`)
      .join('|')
    if (combinations.has(combination))
      issues.push(`Variant option combination ${combination} is duplicated.`)
    combinations.add(combination)
    if (
      variant.weightGrams !== undefined &&
      (!Number.isInteger(variant.weightGrams) || variant.weightGrams <= 0)
    )
      issues.push(`Variant ${variant.sku} weight must be a positive integer.`)
    if (
      variant.inventory?.policy === 'tracked' &&
      (!Number.isInteger(variant.inventory.quantity) || Number(variant.inventory.quantity) < 0)
    )
      issues.push(`Variant ${variant.sku} tracked inventory must be a non-negative integer.`)
    if (product.capabilities.includes('shippable') && variant.status !== 'archived') {
      if (!variant.weightGrams)
        issues.push(`Shippable variant ${variant.sku} requires a positive weight.`)
      const dimensions = variant.dimensionsMm
      if (
        !dimensions ||
        ![dimensions.length, dimensions.width, dimensions.height].every(
          (value) => Number.isInteger(value) && value > 0,
        )
      )
        issues.push(`Shippable variant ${variant.sku} requires positive integer dimensions.`)
    }
  }
  const offerVersions = new Set<string>()
  for (const offer of product.offers) {
    const versionKey = `${offer.id}:${offer.version}`
    if (offerVersions.has(versionKey) || !Number.isInteger(offer.version) || offer.version < 1)
      issues.push(`Offer ${versionKey} has an invalid or duplicate version.`)
    offerVersions.add(versionKey)
    if (!integerMoney(offer.amountMinor) || !/^[A-Z]{3}$/.test(offer.currency))
      issues.push(`Offer ${offer.id} money must use integer minor units and uppercase currency.`)
    if (offer.variantSku && !skus.has(offer.variantSku))
      issues.push(`Offer ${offer.id} references an unknown SKU.`)
    if (
      !validDate(offer.startsAt) ||
      !validDate(offer.endsAt) ||
      (offer.startsAt && offer.endsAt && Date.parse(offer.startsAt) >= Date.parse(offer.endsAt))
    )
      issues.push(`Offer ${offer.id} has an invalid availability window.`)
    if (offer.compareAtMinor) {
      const validOfferMoney = integerMoney(offer.amountMinor)
      const validCompareAt = integerMoney(offer.compareAtMinor)
      if (
        !validCompareAt ||
        !validOfferMoney ||
        (validCompareAt &&
          validOfferMoney &&
          BigInt(offer.compareAtMinor) <= BigInt(offer.amountMinor)) ||
        !offer.compareAtEvidence?.source ||
        !validDate(offer.compareAtEvidence.observedAt)
      )
        issues.push(`Offer ${offer.id} compare-at price lacks valid evidence.`)
    }
    if (offer.segmentPolicy?.mode === 'allowlist' && !offer.segmentPolicy.segmentIds?.length)
      issues.push(`Offer ${offer.id} segment allowlist is empty.`)
    if (offer.recurring && !product.capabilities.includes('subscription'))
      issues.push(`Offer ${offer.id} recurring terms require subscription capability.`)
    if (
      offer.recurring &&
      (!Number.isInteger(offer.recurring.intervalCount) || offer.recurring.intervalCount < 1)
    )
      issues.push(`Offer ${offer.id} recurring interval count must be a positive integer.`)
    if (offer.donation && !product.capabilities.includes('donation'))
      issues.push(`Offer ${offer.id} donation terms require donation capability.`)
    if (
      offer.donation &&
      (!integerMoney(offer.donation.minimumMinor) ||
        offer.donation.suggestedMinor?.some(
          (amount) =>
            !integerMoney(amount) ||
            (integerMoney(offer.donation!.minimumMinor) &&
              BigInt(amount) < BigInt(offer.donation!.minimumMinor)),
        ))
    )
      issues.push(`Offer ${offer.id} donation amounts must be valid and meet the minimum.`)
  }
  if (
    product.capabilities.includes('subscription') &&
    !product.offers.some((offer) => offer.recurring)
  )
    issues.push('Subscription products require recurring offer terms.')
  if (product.capabilities.includes('donation') && !product.offers.some((offer) => offer.donation))
    issues.push('Donation products require donation offer terms.')
  if (product.capabilities.includes('digital-entitlement')) {
    if (!product.digitalDelivery?.entitlement || !product.digitalDelivery.assets.length)
      issues.push(
        'Digital entitlement products require an entitlement and at least one private asset.',
      )
    for (const asset of product.digitalDelivery?.assets ?? []) {
      if (asset.publicOriginal)
        issues.push(`Digital asset ${asset.mediaId} must not expose its original publicly.`)
      if (asset.rightsStatus !== 'approved' || asset.malwareStatus !== 'clean')
        issues.push(
          `Digital asset ${asset.mediaId} requires approved rights and a clean malware scan.`,
        )
    }
    if (
      product.digitalDelivery?.downloadLimit !== undefined &&
      (!Number.isInteger(product.digitalDelivery.downloadLimit) ||
        product.digitalDelivery.downloadLimit < 1)
    )
      issues.push('Digital delivery download limit must be a positive integer.')
    if (
      product.digitalDelivery?.expiresAfterDays !== undefined &&
      (!Number.isInteger(product.digitalDelivery.expiresAfterDays) ||
        product.digitalDelivery.expiresAfterDays < 1)
    )
      issues.push('Digital delivery expiry must be a positive number of days.')
  }
  if (product.capabilities.includes('affiliate')) {
    if (
      !product.affiliate?.disclosure ||
      !isSafeAffiliateDestination(product.affiliate?.destinationUrl)
    )
      issues.push('Affiliate products require a disclosure and a safe HTTPS destination.')
    if (
      !product.affiliate?.observedAt ||
      !validDate(product.affiliate.observedAt) ||
      !Number.isFinite(product.affiliate?.freshnessHours) ||
      Number(product.affiliate?.freshnessHours) <= 0
    )
      issues.push('Affiliate products require a valid observation and freshness window.')
    if (
      product.affiliate?.remotePrice &&
      (!integerMoney(product.affiliate.remotePrice.amountMinor) ||
        !/^[A-Z]{3}$/.test(product.affiliate.remotePrice.currency))
    )
      issues.push('Affiliate remote price must use integer minor units and uppercase currency.')
    for (const variant of product.variants)
      if (variant.status !== 'archived' && variant.inventory?.policy !== 'affiliate')
        issues.push(`Affiliate variant ${variant.sku} must use affiliate availability.`)
  }
  if (product.capabilities.includes('pod')) {
    if (!product.podMappings?.length)
      issues.push('POD products require reviewed provider mappings.')
    for (const mapping of product.podMappings ?? []) {
      const variant = product.variants.find((item) => item.sku === mapping.variantSku)
      if (!variant || JSON.stringify(variant.optionValues) !== JSON.stringify(mapping.optionValues))
        issues.push(`POD mapping for ${mapping.variantSku} does not match its canonical options.`)
      if (mapping.reviewStatus !== 'approved')
        issues.push(`POD mapping for ${mapping.variantSku} requires manual approval.`)
      if (!mapping.artworkRevisionId)
        issues.push(`POD mapping for ${mapping.variantSku} must pin an artwork revision.`)
      if (
        !mapping.providerKey ||
        !mapping.remoteProductId ||
        !mapping.remoteVariantId ||
        !mapping.mockupProvenance?.source ||
        !mapping.mockupProvenance?.generatedAt ||
        !validDate(mapping.mockupProvenance?.generatedAt)
      )
        issues.push(`POD mapping for ${mapping.variantSku} lacks provider or mockup provenance.`)
      if (
        !integerMoney(mapping.snapshot?.costMinor ?? '') ||
        !/^[A-Z]{3}$/.test(mapping.snapshot?.currency ?? '') ||
        !mapping.snapshot?.observedAt ||
        !validDate(mapping.snapshot?.observedAt)
      )
        issues.push(`POD mapping for ${mapping.variantSku} lacks a valid cost snapshot.`)
    }
    for (const variant of product.variants)
      if (variant.status !== 'archived' && variant.inventory?.policy !== 'pod')
        issues.push(`POD variant ${variant.sku} must use POD availability.`)
  }
  return issues
}

const offerIsCurrentlyActive = (offer: CatalogOffer, now: number) =>
  offer.status === 'active' &&
  (!offer.startsAt || Date.parse(offer.startsAt) <= now) &&
  (!offer.endsAt || Date.parse(offer.endsAt) > now)

export function assertCatalogReady(product: CatalogProduct, now = new Date()) {
  const issues = [...validateCatalogProduct(product)]
  if (!product.variants.some((variant) => variant.status !== 'archived'))
    issues.push('At least one non-archived variant is required.')
  if (!product.offers.some((offer) => offerIsCurrentlyActive(offer, now.getTime())))
    issues.push('At least one active offer must be inside its availability window.')
  if (issues.length) throw new CatalogValidationError(issues)
  return product
}

export function resolveActiveOffer(
  product: CatalogProduct,
  input: { variantSku?: string; currency: string; segmentIds?: readonly string[]; now?: string },
) {
  const now = Date.parse(input.now ?? new Date().toISOString())
  return (
    product.offers
      .filter(
        (offer) =>
          offer.status === 'active' &&
          offer.currency === input.currency &&
          (!offer.variantSku || offer.variantSku === input.variantSku) &&
          (!offer.startsAt || Date.parse(offer.startsAt) <= now) &&
          (!offer.endsAt || Date.parse(offer.endsAt) > now) &&
          (offer.segmentPolicy?.mode !== 'allowlist' ||
            offer.segmentPolicy.segmentIds?.some((id) => input.segmentIds?.includes(id))),
      )
      .sort((a, b) => b.version - a.version)[0] ?? null
  )
}

export function affiliateFreshness(
  policy: AffiliatePolicy,
  now = new Date(),
): {
  stale: boolean
  availability: AffiliatePolicy['remoteAvailability']
  price: AffiliatePolicy['remotePrice'] | null
} {
  const observedAt = Date.parse(policy.observedAt)
  const stale =
    !Number.isFinite(observedAt) ||
    !Number.isFinite(policy.freshnessHours) ||
    policy.freshnessHours <= 0 ||
    now.getTime() - observedAt > policy.freshnessHours * 3_600_000
  return {
    stale,
    availability: stale ? 'unknown' : (policy.remoteAvailability ?? 'unknown'),
    price: stale ? null : (policy.remotePrice ?? null),
  }
}

export function formatMinorMoney(amountMinor: string, currency: string, locale = 'en-US'): string {
  if (!integerMoney(amountMinor) || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid money.')
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency })
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  const divisor = 10n ** BigInt(digits)
  const whole = BigInt(amountMinor) / divisor
  const fraction = (BigInt(amountMinor) % divisor).toString().padStart(digits, '0')
  return formatter.format(Number(`${whole}${digits ? `.${fraction}` : ''}`))
}

export function minorMoneyDecimal(amountMinor: string, currency: string): string {
  if (!integerMoney(amountMinor) || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid money.')
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  const value = amountMinor.padStart(digits + 1, '0')
  return digits ? `${value.slice(0, -digits)}.${value.slice(-digits)}` : value
}

export function isSafeAffiliateDestination(value?: string): boolean {
  try {
    const url = new URL(value ?? '')
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    )
  } catch {
    return false
  }
}

export function trackedAffiliateUrl(policy: AffiliatePolicy): string {
  if (!isSafeAffiliateDestination(policy.destinationUrl))
    throw new Error('Unsafe affiliate destination.')
  const url = new URL(policy.destinationUrl)
  for (const [key, value] of Object.entries(policy.trackingParameters ?? {})) {
    if (/^(utm_[a-z0-9_]+|ref|tag)$/i.test(key)) url.searchParams.set(key, value)
  }
  return url.toString()
}

export type DownloadGrant = Readonly<{
  id: string
  entitlementActive: boolean
  expiresAt?: string
  downloadLimit?: number
  downloadCount: number
  revokedAt?: string
}>
export function authorizePrivateDownload(
  grant: DownloadGrant | null,
  now = new Date(),
): { allowed: boolean; reason?: string } {
  if (!grant || !grant.entitlementActive) return { allowed: false, reason: 'ENTITLEMENT_REQUIRED' }
  if (grant.revokedAt) return { allowed: false, reason: 'GRANT_REVOKED' }
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now.getTime())
    return { allowed: false, reason: 'GRANT_EXPIRED' }
  if (grant.downloadLimit !== undefined && grant.downloadCount >= grant.downloadLimit)
    return { allowed: false, reason: 'DOWNLOAD_LIMIT_REACHED' }
  return { allowed: true }
}

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
export function catalogChecksum(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

export type CatalogImportPlan = Readonly<{
  creates: readonly CatalogProduct[]
  updates: readonly CatalogProduct[]
  unchanged: readonly string[]
  errors: readonly { index: number; issues: readonly string[] }[]
  checksum: string
}>
export function planCatalogImport(
  input: readonly CatalogProduct[],
  existing: readonly CatalogProduct[],
): CatalogImportPlan {
  const creates: CatalogProduct[] = [],
    updates: CatalogProduct[] = [],
    unchanged: string[] = [],
    errors: { index: number; issues: readonly string[] }[] = []
  input.forEach((product, index) => {
    const issues = validateCatalogProduct(product)
    if (issues.length) return errors.push({ index, issues })
    const prior = existing.find(
      (item) => item.siteId === product.siteId && item.slug === product.slug,
    )
    if (!prior) creates.push(product)
    else if (catalogChecksum(prior) === catalogChecksum(product)) unchanged.push(product.slug)
    else updates.push(product)
  })
  return { creates, updates, unchanged, errors, checksum: catalogChecksum(input) }
}

export function catalogReadiness(product: CatalogProduct, now = new Date()) {
  const blockers = [...validateCatalogProduct(product)]
  if (!product.variants.some((variant) => variant.status !== 'archived'))
    blockers.push('At least one non-archived variant is required.')
  if (!product.offers.some((offer) => offerIsCurrentlyActive(offer, now.getTime())))
    blockers.push('At least one active offer must be inside its availability window.')
  return {
    ready: blockers.length === 0,
    blockers,
    warnings: product.state === 'published' ? [] : ['Product is not publicly published.'],
  }
}
