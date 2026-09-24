import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  assertMoney,
  computeConversionSourceHash,
  evaluatePricingFreshness,
  interpolateSubId,
  isSafeAffiliateDestinationUrl,
  type AffiliateClick,
  type AffiliateLinkHealth,
  type AffiliateOffer,
  type ConversionEvidence,
  type ConversionSource,
  type ConversionStatus,
} from './affiliate-referral-contracts'

export const ALLOWED_PASSTHROUGH_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'tag',
  'aff_id',
  'sub_id',
])

const KNOWN_BOT_PATTERNS = [
  /bot\b/i,
  /crawler\b/i,
  /spider\b/i,
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /headlesschrome/i,
  /lighthouse/i,
  /mimecast/i,
  /barracuda/i,
  /proofpoint/i,
]

export function isBotUserAgent(userAgent?: string): boolean {
  if (!userAgent) return false
  return KNOWN_BOT_PATTERNS.some((pattern) => pattern.test(userAgent))
}

export function hashIp(ip?: string, salt = 'renegade-affiliate-salt'): string | undefined {
  if (!ip) return undefined
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 16)
}

export function validateAffiliateOffer(offer: AffiliateOffer): string[] {
  const issues: string[] = []
  if (!offer.id || !offer.siteId) issues.push('Offer requires an id and siteId.')
  if (!offer.slug || !/^[a-z0-9-]+$/.test(offer.slug)) {
    issues.push('Offer slug must consist of lowercase letters, numbers, and hyphens.')
  }
  if (!offer.name?.trim()) issues.push('Offer requires a name.')

  if (!isSafeAffiliateDestinationUrl(offer.destinationUrl, offer.allowedDomains)) {
    issues.push(
      'Offer destinationUrl must be a safe, allowlisted HTTPS URL without credentials or loopback targets.',
    )
  }

  if (!offer.networkReference?.network) {
    issues.push('Offer requires a networkReference with a valid network name.')
  }

  if (offer.disclosure?.required && !offer.disclosure.text?.trim()) {
    issues.push('Offer requires disclosure text when disclosure is marked required.')
  }

  if (offer.subIdTemplate) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(offer.subIdTemplate.paramName)) {
      issues.push(
        'SubIdTemplate paramName must be alphanumeric with hyphens or underscores (max 32 chars).',
      )
    }
  }

  if (offer.pricingFreshness) {
    if (offer.pricingFreshness.freshnessHours <= 0) {
      issues.push('pricingFreshness.freshnessHours must be a positive number.')
    }
    if (Number.isNaN(Date.parse(offer.pricingFreshness.observedAt))) {
      issues.push('pricingFreshness.observedAt must be a valid ISO date.')
    }
    if (offer.pricingFreshness.remotePrice) {
      try {
        assertMoney(
          offer.pricingFreshness.remotePrice.amountMinor,
          offer.pricingFreshness.remotePrice.currency,
        )
      } catch {
        issues.push(
          'pricingFreshness.remotePrice must have valid integer minor units and uppercase currency.',
        )
      }
    }
  }

  return issues
}

export type OutboundRedirectInput = Readonly<{
  offer: AffiliateOffer
  searchParams?: URLSearchParams
  headers?: Headers | Record<string, string | undefined>
  userAgent?: string
  ip?: string
  trackingConsent?: boolean
  direct?: boolean
  now?: Date
}>

export type OutboundRedirectResult = Readonly<{
  destinationUrl: string
  click: AffiliateClick
  trackingOff: boolean
  botDetected: boolean
}>

/**
 * Resolves safe outbound redirect:
 * - Blocks open redirects and non-HTTPS destinations.
 * - Enforces parameter allowlist, discarding unapproved parameters.
 * - Handles tracking-off / direct links (DNT, Sec-GPC, tracking=off, consent denied).
 * - Filters bots and crawlers from polluting click tokens.
 * - Records privacy-minimized click under policy.
 */
export function resolveOutboundRedirect(input: OutboundRedirectInput): OutboundRedirectResult {
  const { offer, now = new Date() } = input
  if (offer.status !== 'active') {
    throw new Error(`Affiliate offer ${offer.slug} is ${offer.status} and cannot be redirected.`)
  }

  if (!isSafeAffiliateDestinationUrl(offer.destinationUrl, offer.allowedDomains)) {
    throw new Error('Affiliate destination URL is unsafe or not allowed.')
  }

  const getHeader = (name: string): string | undefined => {
    if (!input.headers) return undefined
    if (typeof (input.headers as Headers).get === 'function') {
      return (input.headers as Headers).get(name) ?? undefined
    }
    return (input.headers as Record<string, string | undefined>)[name.toLowerCase()]
  }

  // Detect tracking-off / direct preference
  const dnt = getHeader('dnt') === '1'
  const secGpc = getHeader('sec-gpc') === '1'
  const prefetch = getHeader('purpose') === 'prefetch' || getHeader('sec-purpose') === 'prefetch'
  const paramTrackingOff =
    input.searchParams?.get('tracking') === 'off' ||
    input.searchParams?.get('direct') === '1' ||
    input.searchParams?.get('direct') === 'true'
  const explicitConsentDenied = input.trackingConsent === false
  const directRequested = input.direct === true

  const trackingOff = dnt || secGpc || paramTrackingOff || explicitConsentDenied || directRequested
  const userAgent = input.userAgent ?? getHeader('user-agent') ?? ''
  const botDetected = prefetch || isBotUserAgent(userAgent)

  const url = new URL(offer.destinationUrl)

  // 1. Apply offer tracking parameters
  for (const [key, val] of Object.entries(offer.trackingParameters ?? {})) {
    if (/^[a-zA-Z0-9_-]+$/.test(key)) {
      url.searchParams.set(key, val)
    }
  }

  // 2. Pass through allowlisted request parameters
  if (input.searchParams) {
    for (const [key, val] of input.searchParams.entries()) {
      const lowerKey = key.toLowerCase()
      if (ALLOWED_PASSTHROUGH_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) {
        // Strip CRLF or control characters
        const safeVal = val.replace(/[\r\n\t]/g, '')
        url.searchParams.set(lowerKey, safeVal)
      }
    }
  }

  // 3. Sub-ID & Click tracking (only if tracking is permitted and not a bot)
  let clickToken = ''
  const clickId = `clk_${randomUUID()}`

  if (!trackingOff && !botDetected) {
    clickToken = `tok_${randomBytes(8).toString('hex')}`
    if (offer.subIdTemplate) {
      const interpolated = interpolateSubId(offer.subIdTemplate, {
        clickId,
        clickToken,
        offerId: offer.id,
        slug: offer.slug,
      })
      url.searchParams.set(interpolated.paramName, interpolated.paramValue)
    }
  }

  const referrer = getHeader('referer')

  const click: AffiliateClick = {
    id: clickId,
    siteId: offer.siteId,
    offerId: offer.id,
    clickToken,
    timestamp: now.toISOString(),
    destinationUrl: url.toString(),
    trackingAllowed: !trackingOff && !botDetected,
    botDetected,
    ipHash: hashIp(input.ip),
    userAgentSummary: userAgent ? userAgent.slice(0, 100) : undefined,
    referrer: referrer ? referrer.slice(0, 200) : undefined,
  }

  return {
    destinationUrl: url.toString(),
    click,
    trackingOff,
    botDetected,
  }
}

/**
 * Terms-respecting link-health checker.
 * Handles timeouts, rate limits (HTTP 429), and redirection chains.
 */
export async function checkOfferLinkHealth(
  offer: AffiliateOffer,
  fetchFn: typeof fetch = fetch,
): Promise<AffiliateLinkHealth> {
  const now = new Date().toISOString()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)

    const response = await fetchFn(offer.destinationUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Renegade-LinkHealthBot/1.0 (+https://renegade.cms/bot)',
        Accept: '*/*',
      },
      signal: controller.signal,
      redirect: 'manual',
    })

    clearTimeout(timer)

    if (response.status === 429) {
      return {
        status: 'rate-limited',
        lastCheckedAt: now,
        httpStatus: 429,
        consecutiveFailures: (offer.linkHealth?.consecutiveFailures ?? 0) + 1,
        error: 'Target returned HTTP 429 Too Many Requests; back off per network terms.',
      }
    }

    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (location && !isSafeAffiliateDestinationUrl(location, offer.allowedDomains)) {
        return {
          status: 'warning',
          lastCheckedAt: now,
          httpStatus: response.status,
          consecutiveFailures: 0,
          error: `Redirects to un-allowlisted or insecure location: ${location}`,
        }
      }
      return {
        status: 'redirected',
        lastCheckedAt: now,
        httpStatus: response.status,
        consecutiveFailures: 0,
      }
    }

    if (response.status >= 200 && response.status < 400) {
      return {
        status: 'healthy',
        lastCheckedAt: now,
        httpStatus: response.status,
        consecutiveFailures: 0,
      }
    }

    return {
      status: 'broken',
      lastCheckedAt: now,
      httpStatus: response.status,
      consecutiveFailures: (offer.linkHealth?.consecutiveFailures ?? 0) + 1,
      error: `Target returned HTTP status ${response.status}`,
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      status: 'broken',
      lastCheckedAt: now,
      consecutiveFailures: (offer.linkHealth?.consecutiveFailures ?? 0) + 1,
      error: errorMsg,
    }
  }
}

export type RawConversionInput = Readonly<{
  externalEventId: string
  externalOrderId?: string
  externalTransactionId?: string
  attributionHint?: string
  amountMinor: string
  currency: string
  commissionAmountMinor?: string
  occurredAt?: string
  status?: ConversionStatus
  rawLine?: string
}>

export type ConversionImportResult = Readonly<{
  imported: readonly ConversionEvidence[]
  duplicates: readonly ConversionEvidence[]
  matchedCount: number
  unmatchedCount: number
}>

/**
 * Idempotently imports conversion evidence from webhook, API, or CSV sources.
 * - Retains IDs, attribution hints, money/currency, time, status, and raw SHA-256 payload hash.
 * - Duplicate submissions of known payload hash or externalEventId are recognized as duplicates.
 * - Missing attribution evidence remains strictly UNMATCHED / UNKNOWN (never invent success).
 * - Reversal / refund items trigger status updates and append compensating notes.
 */
export function importConversionEvidence(input: {
  siteId: string
  source: ConversionSource
  network: string
  rawPayload: unknown
  items: readonly RawConversionInput[]
  existingEvidence: readonly ConversionEvidence[]
  existingClicks: readonly AffiliateClick[]
  existingOffers: readonly AffiliateOffer[]
  now?: Date
}): ConversionImportResult {
  const { siteId, source, network, existingEvidence, existingClicks, existingOffers } = input
  const now = input.now ?? new Date()

  const importedList: ConversionEvidence[] = []
  const duplicatesList: ConversionEvidence[] = []
  let matchedCount = 0
  let unmatchedCount = 0

  for (const item of input.items) {
    const rawPayloadHash = computeConversionSourceHash(item.rawLine ?? item)
    const existing = existingEvidence.find(
      (ev) =>
        ev.network === network &&
        (ev.externalEventId === item.externalEventId || ev.rawPayloadHash === rawPayloadHash),
    )

    if (existing) {
      duplicatesList.push(existing)
      continue
    }

    const money = assertMoney(item.amountMinor, item.currency)
    const commissionMoney = item.commissionAmountMinor
      ? assertMoney(item.commissionAmountMinor, item.currency)
      : undefined

    const status: ConversionStatus = item.status ?? 'pending'
    const isReversal = status === 'reversed' || status === 'rejected'

    // Reconciliation matching
    let matchedOfferId: string | undefined
    let matchedClickId: string | undefined
    let reconciliationState: ConversionEvidence['reconciliationState'] = 'unmatched'
    let reconciliationNotes: string | undefined

    if (item.attributionHint) {
      // 1. Match click by token or id
      const matchedClick = existingClicks.find(
        (c) =>
          c.clickToken === item.attributionHint ||
          c.id === item.attributionHint ||
          item.attributionHint?.includes(c.clickToken),
      )

      if (matchedClick) {
        matchedClickId = matchedClick.id
        matchedOfferId = matchedClick.offerId
        reconciliationState = isReversal ? 'reversed' : 'matched'
        reconciliationNotes = `Matched click ${matchedClick.id} for offer ${matchedClick.offerId}`
        matchedCount++
      } else {
        // 2. Try match offer by slug
        const matchedOffer = existingOffers.find((o) => o.slug === item.attributionHint)
        if (matchedOffer) {
          matchedOfferId = matchedOffer.id
          reconciliationState = isReversal ? 'reversed' : 'matched'
          reconciliationNotes = `Matched offer ${matchedOffer.slug} by hint directly`
          matchedCount++
        } else {
          // Missing evidence remains unknown without invented success!
          reconciliationState = isReversal ? 'reversed' : 'unmatched'
          reconciliationNotes = `Attribution hint '${item.attributionHint}' could not be verified; preserved as unmatched.`
          unmatchedCount++
        }
      }
    } else {
      reconciliationState = isReversal ? 'reversed' : 'unmatched'
      reconciliationNotes = 'No attribution hint provided in source conversion evidence.'
      unmatchedCount++
    }

    const evidence: ConversionEvidence = {
      id: `ev_${randomUUID()}`,
      siteId,
      source,
      network,
      externalEventId: item.externalEventId,
      externalOrderId: item.externalOrderId,
      externalTransactionId: item.externalTransactionId,
      attributionHint: item.attributionHint,
      money,
      commissionMoney,
      occurredAt: item.occurredAt ?? now.toISOString(),
      status,
      rawPayloadHash,
      reconciliationState,
      matchedOfferId,
      matchedClickId,
      reconciliationNotes,
    }

    importedList.push(evidence)
  }

  return {
    imported: importedList,
    duplicates: duplicatesList,
    matchedCount,
    unmatchedCount,
  }
}
