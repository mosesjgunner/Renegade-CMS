import { assertIanaTimeZone } from './contracts'

export class DSTNonexistentTimeError extends Error {
  constructor(localTime: string, timeZone: string) {
    super(
      `The local time "${localTime}" does not exist in timezone "${timeZone}" due to Daylight Saving Time (Spring Forward).`,
    )
    this.name = 'DSTNonexistentTimeError'
  }
}

export class DSTAmbiguousTimeError extends Error {
  constructor(localTime: string, timeZone: string) {
    super(
      `The local time "${localTime}" is ambiguous in timezone "${timeZone}" due to Daylight Saving Time (Fall Back).`,
    )
    this.name = 'DSTAmbiguousTimeError'
  }
}

export type LocalToUtcOptions = {
  nonexistentHandling?: 'advance' | 'reject'
  ambiguousPreference?: 'earlier' | 'later'
}

export type UtcConversionResult = {
  utcInstant: string
  timeZone: string
  localFormatted: string
  isDst: boolean
  isAmbiguous: boolean
  wasNonexistent: boolean
  appliedOffsetMinutes: number
}

/**
 * Parses a local date/time string (e.g., "2026-03-08T02:30:00" or "2026-03-08 02:30")
 * in a specified IANA timezone and converts it deterministically to an ISO UTC string.
 */
export function convertLocalToUtc(
  localDateTimeStr: string,
  timeZone: string,
  options: LocalToUtcOptions = {},
): UtcConversionResult {
  assertIanaTimeZone(timeZone)

  const nonexistentHandling = options.nonexistentHandling ?? 'advance'
  const ambiguousPreference = options.ambiguousPreference ?? 'earlier'

  const match = localDateTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) {
    throw new Error(
      `Invalid local date/time format: "${localDateTimeStr}". Expected YYYY-MM-DDTHH:mm[:ss].`,
    )
  }

  const [, yStr, mStr, dStr, hrStr, minStr, secStr = '00'] = match
  const year = parseInt(yStr, 10)
  const month = parseInt(mStr, 10) - 1
  const day = parseInt(dStr, 10)
  const hour = parseInt(hrStr, 10)
  const minute = parseInt(minStr, 10)
  const second = parseInt(secStr, 10)

  const approxUtc = Date.UTC(year, month, day, hour, minute, second)

  const getOffsetMinutes = (epochMs: number): number => {
    const d = new Date(epochMs)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })

    const parts = formatter.formatToParts(d)
    const yearP = parseInt(parts.find((p) => p.type === 'year')!.value, 10)
    const monthP = parseInt(parts.find((p) => p.type === 'month')!.value, 10) - 1
    const dayP = parseInt(parts.find((p) => p.type === 'day')!.value, 10)
    let hourP = parseInt(parts.find((p) => p.type === 'hour')!.value, 10)
    if (hourP === 24) hourP = 0
    const minuteP = parseInt(parts.find((p) => p.type === 'minute')!.value, 10)
    const secondP = parseInt(parts.find((p) => p.type === 'second')!.value, 10)

    const localEpoch = Date.UTC(yearP, monthP, dayP, hourP, minuteP, secondP)
    return Math.round((localEpoch - epochMs) / 60000)
  }

  // Determine standard and daylight offsets for this timezone
  const janOffset = getOffsetMinutes(Date.UTC(year, 0, 15))
  const julOffset = getOffsetMinutes(Date.UTC(year, 6, 15))

  const candidateMsList = [approxUtc - janOffset * 60000, approxUtc - julOffset * 60000]

  const checkMatchesLocal = (ms: number): boolean => {
    const d = new Date(ms)
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const p = f.formatToParts(d)
    const y = parseInt(p.find((item) => item.type === 'year')!.value, 10)
    const m = parseInt(p.find((item) => item.type === 'month')!.value, 10) - 1
    const dy = parseInt(p.find((item) => item.type === 'day')!.value, 10)
    let hr = parseInt(p.find((item) => item.type === 'hour')!.value, 10)
    if (hr === 24) hr = 0
    const mn = parseInt(p.find((item) => item.type === 'minute')!.value, 10)
    const sc = parseInt(p.find((item) => item.type === 'second')!.value, 10)

    return y === year && m === month && dy === day && hr === hour && mn === minute && sc === second
  }

  const validCandidates = Array.from(new Set(candidateMsList.filter(checkMatchesLocal)))

  let finalEpochMs: number
  let isAmbiguous = false
  let wasNonexistent = false

  if (validCandidates.length > 1) {
    isAmbiguous = true
    finalEpochMs =
      ambiguousPreference === 'earlier'
        ? Math.min(...validCandidates)
        : Math.max(...validCandidates)
  } else if (validCandidates.length === 1) {
    finalEpochMs = validCandidates[0]
  } else {
    wasNonexistent = true
    if (nonexistentHandling === 'reject') {
      throw new DSTNonexistentTimeError(localDateTimeStr, timeZone)
    }
    // Advance by 1 hour (DST gap)
    const advancedLocalMs = approxUtc + 3600 * 1000
    const advancedOffset = getOffsetMinutes(advancedLocalMs)
    finalEpochMs = approxUtc + 3600 * 1000 - advancedOffset * 60000
  }

  const appliedOffsetMinutes = getOffsetMinutes(finalEpochMs)
  const utcInstant = new Date(finalEpochMs).toISOString()
  const localFormatted = formatUtcInTimeZone(utcInstant, timeZone)
  const isDst = appliedOffsetMinutes !== janOffset

  return {
    utcInstant,
    timeZone,
    localFormatted,
    isDst,
    isAmbiguous,
    wasNonexistent,
    appliedOffsetMinutes,
  }
}

/**
 * Formats a UTC instant into a human-readable local datetime string in the given IANA timezone.
 */
export function formatUtcInTimeZone(utcIsoString: string, timeZone: string): string {
  assertIanaTimeZone(timeZone)
  const d = new Date(utcIsoString)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid UTC date: "${utcIsoString}".`)

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const p = formatter.formatToParts(d)
  const y = p.find((item) => item.type === 'year')!.value
  const m = p.find((item) => item.type === 'month')!.value
  const dy = p.find((item) => item.type === 'day')!.value
  let hr = p.find((item) => item.type === 'hour')!.value
  if (hr === '24') hr = '00'
  const mn = p.find((item) => item.type === 'minute')!.value
  const sc = p.find((item) => item.type === 'second')!.value

  return `${y}-${m}-${dy} ${hr}:${mn}:${sc} (${timeZone})`
}
