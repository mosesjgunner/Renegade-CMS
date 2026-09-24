import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ============================================================================
// GSM 7-bit Alphabet and Encoding Constants
// ============================================================================

/** Standard GSM 03.38 7-bit default alphabet characters (single septet) */
const GSM_7BIT_CHARS = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
)

/** GSM 03.38 7-bit extension table characters (requires 0x1B escape, counts as 2 septets) */
const GSM_7BIT_EXTENSION_CHARS = new Set('|^€{}[]~\\')

export type SmsEncoding = 'GSM-7' | 'UCS-2'

export type SmsSegmentCalculation = {
  encoding: SmsEncoding
  characterCount: number
  totalSeptetsOrBytes: number
  segmentCount: number
  charactersPerSegment: number
  charactersRemainingInCurrentSegment: number
  containsNonGsmCharacters: boolean
  nonGsmCharacters: string[]
}

/**
 * Calculates accurate SMS segments for GSM-7 and UCS-2 encodings according to 3GPP TS 23.038.
 * In GSM-7: single message is 160 septets; concatenated is 153 septets per segment (7-byte UDH).
 * In UCS-2: single message is 70 characters (140 bytes); concatenated is 67 characters per segment (6-byte UDH).
 * Characters in the GSM 7-bit extension table count as 2 septets.
 */
export function calculateSmsSegments(text: string): SmsSegmentCalculation {
  const normalized = text.normalize('NFC')
  let isGsm = true
  const nonGsmChars = new Set<string>()
  let gsmSeptets = 0

  for (const char of normalized) {
    if (GSM_7BIT_EXTENSION_CHARS.has(char)) {
      gsmSeptets += 2
    } else if (GSM_7BIT_CHARS.has(char)) {
      gsmSeptets += 1
    } else {
      isGsm = false
      nonGsmChars.add(char)
    }
  }

  const characterCount = [...normalized].length

  if (isGsm) {
    if (gsmSeptets <= 160) {
      return {
        encoding: 'GSM-7',
        characterCount,
        totalSeptetsOrBytes: gsmSeptets,
        segmentCount: gsmSeptets === 0 ? 0 : 1,
        charactersPerSegment: 160,
        charactersRemainingInCurrentSegment: Math.max(0, 160 - gsmSeptets),
        containsNonGsmCharacters: false,
        nonGsmCharacters: [],
      }
    }
    const segmentCount = Math.ceil(gsmSeptets / 153)
    const remainder = gsmSeptets % 153
    return {
      encoding: 'GSM-7',
      characterCount,
      totalSeptetsOrBytes: gsmSeptets,
      segmentCount,
      charactersPerSegment: 153,
      charactersRemainingInCurrentSegment: remainder === 0 ? 0 : 153 - remainder,
      containsNonGsmCharacters: false,
      nonGsmCharacters: [],
    }
  }

  // UCS-2 / UTF-16 encoding
  if (characterCount <= 70) {
    return {
      encoding: 'UCS-2',
      characterCount,
      totalSeptetsOrBytes: characterCount * 2,
      segmentCount: characterCount === 0 ? 0 : 1,
      charactersPerSegment: 70,
      charactersRemainingInCurrentSegment: Math.max(0, 70 - characterCount),
      containsNonGsmCharacters: true,
      nonGsmCharacters: [...nonGsmChars],
    }
  }

  const segmentCount = Math.ceil(characterCount / 67)
  const remainder = characterCount % 67
  return {
    encoding: 'UCS-2',
    characterCount,
    totalSeptetsOrBytes: characterCount * 2,
    segmentCount,
    charactersPerSegment: 67,
    charactersRemainingInCurrentSegment: remainder === 0 ? 0 : 67 - remainder,
    containsNonGsmCharacters: true,
    nonGsmCharacters: [...nonGsmChars],
  }
}

// ============================================================================
// Cost and Unit Estimation
// ============================================================================

export type TelecomCostEstimate = {
  channel: 'sms' | 'mms' | 'rcs'
  unitsPerRecipient: number
  totalUnits: number
  estimatedCostPerUnitMinor: number
  estimatedTotalCostMinor: number
  currency: string
  formattedCost: string
  isEstimate: true
  disclaimer: string
}

/** Standard baseline rates in USD minor units (cents / fractions) */
const BASELINE_UNIT_RATES_CENTS: Record<string, number> = {
  'sms:US': 0.79, // $0.0079 per segment
  'sms:CA': 0.79,
  'sms:GB': 3.5,
  'sms:default': 1.5,
  'mms:US': 2.0, // $0.02 per message
  'mms:default': 4.0,
  'rcs-basic:default': 0.65, // $0.0065
  'rcs-rich:default': 1.5, // $0.015
}

export function estimateTelecomCost(input: {
  channel: 'sms' | 'mms' | 'rcs'
  segments?: number
  recipientCount?: number
  countryCode?: string
  isRichCard?: boolean
}): TelecomCostEstimate {
  const recipients = Math.max(1, input.recipientCount ?? 1)
  const segments = Math.max(1, input.segments ?? 1)
  const country = input.countryCode ?? 'US'

  let unitsPerRecipient = 1
  let rateKey = `${input.channel}:default`

  if (input.channel === 'sms') {
    unitsPerRecipient = segments
    rateKey = `sms:${country}` in BASELINE_UNIT_RATES_CENTS ? `sms:${country}` : 'sms:default'
  } else if (input.channel === 'mms') {
    unitsPerRecipient = 1
    rateKey = `mms:${country}` in BASELINE_UNIT_RATES_CENTS ? `mms:${country}` : 'mms:default'
  } else if (input.channel === 'rcs') {
    unitsPerRecipient = 1
    rateKey = input.isRichCard ? 'rcs-rich:default' : 'rcs-basic:default'
  }

  const rateCents = BASELINE_UNIT_RATES_CENTS[rateKey] ?? 1.0
  const totalUnits = unitsPerRecipient * recipients
  const estimatedTotalCostCents = totalUnits * rateCents
  const formattedCost = `$${(estimatedTotalCostCents / 100).toFixed(4)} USD`

  return {
    channel: input.channel,
    unitsPerRecipient,
    totalUnits,
    estimatedCostPerUnitMinor: rateCents,
    estimatedTotalCostMinor: estimatedTotalCostCents,
    currency: 'USD',
    formattedCost,
    isEstimate: true,
    disclaimer:
      'Estimated units and cost are projections only. Actual provider charges may vary by carrier surcharges, destination routing, and local telecom regulations.',
  }
}

// ============================================================================
// Phone Normalization and Parsing
// ============================================================================

export type NormalizedPhone = {
  e164: string
  display: string
  countryCallingCode: string
  nationalNumber: string
}

export const telecomDigest = (value: string) =>
  createHash('sha256').update(value).digest('base64url')

/**
 * Normalizes phone numbers to standard E.164 while retaining the user-entered display.
 * E.164 format: + followed by 7 to 15 digits (ITU-T E.164 recommendation).
 */
export function normalizeE164Phone(
  value: string,
  options?: { defaultCountryCallingCode?: string },
): NormalizedPhone {
  const display = value.normalize('NFKC').trim()
  let cleaned = display.replace(/[\s().-]/g, '')

  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('00')) {
      cleaned = `+${cleaned.slice(2)}`
    } else if (options?.defaultCountryCallingCode) {
      const code = options.defaultCountryCallingCode.startsWith('+')
        ? options.defaultCountryCallingCode
        : `+${options.defaultCountryCallingCode}`
      cleaned = `${code}${cleaned.replace(/^0+/, '')}`
    } else {
      throw new Error('Enter an international phone number including country code (e.g. +1...).')
    }
  }

  if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    throw new Error('Invalid E.164 international phone number.')
  }

  // Determine country calling code prefix (1 to 3 digits)
  let countryCallingCode = '+1'
  let nationalNumber = cleaned.slice(2)

  if (/^\+1\d{10}$/.test(cleaned)) {
    countryCallingCode = '+1'
    nationalNumber = cleaned.slice(2)
  } else if (/^\+(44|33|49|61|81|86|91)\d{8,12}$/.test(cleaned)) {
    countryCallingCode = cleaned.slice(0, 3)
    nationalNumber = cleaned.slice(3)
  } else {
    // General fallback: first 1-3 digits
    countryCallingCode = cleaned.slice(0, 4)
    nationalNumber = cleaned.slice(4)
  }

  return {
    e164: cleaned,
    display,
    countryCallingCode,
    nationalNumber,
  }
}

// ============================================================================
// Inbound Keywords (STOP / START / HELP)
// ============================================================================

export const OPT_OUT_KEYWORDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
  'ARRET', // Standard French Canadian / EU equivalent
])

export const OPT_IN_KEYWORDS = new Set(['START', 'YES', 'UNSTOP', 'CONTINUE'])

export const HELP_KEYWORDS = new Set(['HELP', 'INFO', 'AIDE'])

export type InboundKeywordAction = 'opt-out' | 'opt-in' | 'help' | 'unknown'

export type InboundKeywordResult = {
  rawKeyword: string
  normalizedKeyword: string
  action: InboundKeywordAction
}

export function parseInboundKeyword(text: string): InboundKeywordResult {
  const trimmed = text.normalize('NFKC').trim()
  const firstWord = (trimmed.split(/[\s,.;:!?]+/)[0] || '').toUpperCase()

  if (OPT_OUT_KEYWORDS.has(firstWord)) {
    return { rawKeyword: firstWord, normalizedKeyword: firstWord, action: 'opt-out' }
  }
  if (OPT_IN_KEYWORDS.has(firstWord)) {
    return { rawKeyword: firstWord, normalizedKeyword: firstWord, action: 'opt-in' }
  }
  if (HELP_KEYWORDS.has(firstWord)) {
    return { rawKeyword: firstWord, normalizedKeyword: firstWord, action: 'help' }
  }
  return { rawKeyword: firstWord, normalizedKeyword: firstWord, action: 'unknown' }
}

// ============================================================================
// Quiet Hours and Timezones
// ============================================================================

export type QuietHoursPolicy = {
  startHour: number // 0 - 23, default 21 (9 PM)
  endHour: number // 0 - 23, default 8 (8 AM)
  siteTimezone?: string // default 'UTC'
  unknownTimezonePolicy?: 'conservative-intersection' | 'site-timezone' | 'hold-for-review'
}

/**
 * Checks if a given timestamp falls within quiet hours for a recipient timezone.
 * TCPA / regulatory standard: 9:00 PM to 8:00 AM local recipient time.
 */
export function isWithinQuietHours(
  time: Date,
  recipientTimezone?: string,
  policy: QuietHoursPolicy = { startHour: 21, endHour: 8, siteTimezone: 'UTC' },
): { isQuiet: boolean; resolvedTimezone: string; localHour: number } {
  const start = policy.startHour ?? 21
  const end = policy.endHour ?? 8
  const siteTz = policy.siteTimezone ?? 'UTC'

  if (!recipientTimezone) {
    if (policy.unknownTimezonePolicy === 'hold-for-review') {
      return { isQuiet: true, resolvedTimezone: 'unknown', localHour: -1 }
    }
    if (policy.unknownTimezonePolicy === 'conservative-intersection') {
      // Check across US continental timezones (America/New_York, America/Chicago, America/Denver, America/Los_Angeles)
      const majorTimezones = [
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
      ]
      for (const tz of majorTimezones) {
        const hour = getLocalHour(time, tz)
        if (isHourQuiet(hour, start, end)) {
          return { isQuiet: true, resolvedTimezone: tz, localHour: hour }
        }
      }
      return {
        isQuiet: false,
        resolvedTimezone: 'conservative-safe',
        localHour: getLocalHour(time, siteTz),
      }
    }
    // Default: use site timezone
    const hour = getLocalHour(time, siteTz)
    return { isQuiet: isHourQuiet(hour, start, end), resolvedTimezone: siteTz, localHour: hour }
  }

  try {
    const hour = getLocalHour(time, recipientTimezone)
    return {
      isQuiet: isHourQuiet(hour, start, end),
      resolvedTimezone: recipientTimezone,
      localHour: hour,
    }
  } catch {
    const hour = getLocalHour(time, siteTz)
    return { isQuiet: isHourQuiet(hour, start, end), resolvedTimezone: siteTz, localHour: hour }
  }
}

function isHourQuiet(hour: number, start: number, end: number): boolean {
  if (start > end) {
    // Crosses midnight, e.g. 21 to 8: quiet if hour >= 21 or hour < 8
    return hour >= start || hour < end
  }
  return hour >= start && hour < end
}

function getLocalHour(time: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  })
  const formatted = formatter.format(time)
  return parseInt(formatted, 10)
}

/**
 * Calculates the next available send window when quiet hours end,
 * properly accounting for local daylight saving time transitions.
 */
export function calculateNextSendWindow(
  fromTime: Date,
  recipientTimezone?: string,
  policy: QuietHoursPolicy = { startHour: 21, endHour: 8, siteTimezone: 'UTC' },
): Date {
  const tz = recipientTimezone || policy.siteTimezone || 'UTC'
  const endHour = policy.endHour ?? 8

  // Advance day by day until we find the exact local opening time
  for (let daysAhead = 0; daysAhead <= 2; daysAhead++) {
    const candidate = new Date(fromTime.getTime() + daysAhead * 24 * 60 * 60 * 1000)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const localDateStr = formatter.format(candidate) // YYYY-MM-DD

    // Construct local target time string: YYYY-MM-DDTHH:00:00
    const localIsoTarget = `${localDateStr}T${String(endHour).padStart(2, '0')}:00:00`

    // Parse in target timezone
    const targetDate = parseInTimezone(localIsoTarget, tz)
    if (targetDate.getTime() > fromTime.getTime()) {
      return targetDate
    }
  }

  // Fallback: +12 hours
  return new Date(fromTime.getTime() + 12 * 60 * 60 * 1000)
}

function parseInTimezone(localIso: string, timeZone: string): Date {
  // Uses UTC date guessing and offset correction
  const [datePart, timePart] = localIso.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute, second] = timePart.split(':').map(Number)

  // Start with a UTC representation
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))

  // Format utcGuess in target timezone to see what local time it represents
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  })
  const parts = dtf.formatToParts(utcGuess)
  const p: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      p[part.type] = parseInt(part.value, 10)
    }
  }

  const renderedUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const offsetDiff = renderedUtc - utcGuess.getTime()
  return new Date(utcGuess.getTime() - offsetDiff)
}

// ============================================================================
// RCS & Channel Composition Models
// ============================================================================

export type RcsAction = {
  type: 'reply' | 'open-url' | 'dial'
  text: string
  postbackData?: string
  url?: string
  phoneNumber?: string
}

export type RcsCard = {
  title: string
  description?: string
  media?: {
    url: string
    contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4'
    altText: string
    fileSize?: number
  }
  actions?: RcsAction[]
}

export type RcsContent = {
  type: 'basic' | 'rich-card' | 'carousel'
  text: string
  media?: {
    url: string
    contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4'
    altText: string
    fileSize?: number
  }
  actions?: RcsAction[]
  cards?: RcsCard[]
  fallbackPolicy: 'prohibit' | 'allow-with-configured-text' | 'manual-review'
  fallbackSmsBody?: string
}

export function validateRcsContent(rcs: RcsContent): string[] {
  const errors: string[] = []

  if (!rcs.text?.trim() && (!rcs.cards || rcs.cards.length === 0)) {
    errors.push('RCS message requires text content or cards.')
  }

  if (rcs.media) {
    if (!rcs.media.altText?.trim()) {
      errors.push('RCS media requires non-empty alt text for accessibility.')
    }
    if (rcs.media.fileSize && rcs.media.fileSize > 2 * 1024 * 1024) {
      errors.push('RCS standalone media cannot exceed 2MB.')
    }
  }

  if (rcs.type === 'carousel') {
    if (!rcs.cards || rcs.cards.length < 2 || rcs.cards.length > 10) {
      errors.push('RCS carousel requires between 2 and 10 cards.')
    }
  }

  if (rcs.cards) {
    for (let i = 0; i < rcs.cards.length; i++) {
      const card = rcs.cards[i]
      if (!card.title?.trim()) {
        errors.push(`Card ${i + 1} requires a title.`)
      }
      if (card.media && !card.media.altText?.trim()) {
        errors.push(`Card ${i + 1} media requires non-empty alt text for accessibility.`)
      }
    }
  }

  if (rcs.fallbackPolicy === 'allow-with-configured-text') {
    if (!rcs.fallbackSmsBody?.trim()) {
      errors.push('Configured fallback requires a non-empty fallback SMS body.')
    }
  }

  return errors
}

// ============================================================================
// Provider Capabilities Contract (Version 1)
// ============================================================================

export type TelecomProviderCapabilities = {
  version: 1
  channels: readonly ('sms' | 'mms' | 'rcs')[]
  rcs?: {
    basic: boolean
    richCards: boolean
    carousels: boolean
    capabilityLookup: boolean
    verifiedSender: boolean
  }
  senderTypes: readonly ('shortcode' | 'longcode' | 'toll-free' | 'alphanumeric' | 'rcs-agent')[]
  supportedDestinations: readonly string[] // ISO country codes or ['*']
  rateLimits: {
    messagesPerSecond: number
    maxBurst?: number
  }
  supportsInboundKeywords: boolean
  supportsDeliveryReceipts: boolean
  supportsReconciliation: boolean
}

// ============================================================================
// Error Taxonomy
// ============================================================================

export type TelecomFailureKind = 'retryable' | 'permanent' | 'unknown'

export type TelecomErrorCode =
  | 'telecom_disabled'
  | 'authentication_failed'
  | 'rate_limited'
  | 'carrier_congestion'
  | 'temporary_carrier_error'
  | 'invalid_destination'
  | 'unallocated_number'
  | 'number_reassigned'
  | 'unsubscribed_recipient'
  | 'missing_consent'
  | 'rcs_not_supported_no_fallback'
  | 'media_rejected'
  | 'capability_mismatch'
  | 'forbidden_route'
  | 'quiet_hours_delayed'
  | 'frequency_cap_exceeded'
  | 'timeout'
  | 'unknown_outcome'
  | 'provider_error'

export type TelecomDeliveryFailure = {
  kind: TelecomFailureKind
  code: TelecomErrorCode
  message: string
  retryAfterSeconds?: number
  rawError?: unknown
}

export type RecipientTelecomCapability = {
  phone: string
  rcsSupported: boolean
  carrier?: string
  checkedAt: string
}
