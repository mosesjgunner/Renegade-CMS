/**
 * RC3-CE money helpers.
 *
 * All money in the Creator Earnings Engine is integer minor units
 * carried as decimal strings (the Commerce convention). Unknown money
 * is `null`, never zero: a fee a provider did not report is not a fee
 * of zero, and a statement that hides that distinction is lying.
 * Arithmetic is BigInt throughout; no floating point ever touches a
 * ledger figure.
 */

export type Minor = string

const MINOR_PATTERN = /^(0|[1-9][0-9]*)$/
const SIGNED_MINOR_PATTERN = /^-?(0|[1-9][0-9]*)$/

export function isMinor(value: unknown): value is Minor {
  return typeof value === 'string' && MINOR_PATTERN.test(value)
}

/** Parse a nullable minor-unit field; malformed values become null (unknown), never a guess. */
export function parseMinor(value: unknown): bigint | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  if (!SIGNED_MINOR_PATTERN.test(value.trim())) return null
  try {
    return BigInt(value.trim())
  } catch {
    return null
  }
}

export function minorOrZero(value: unknown): bigint {
  return parseMinor(value) ?? 0n
}

export function addMinor(a: bigint | null, b: bigint | null): bigint | null {
  if (a === null || b === null) return null
  return a + b
}

export function toMinorString(value: bigint): Minor {
  return value.toString()
}

export function assertCurrency(currency: unknown): string {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))
    throw new Error('Currency must be an ISO-4217 uppercase code.')
  return currency
}

/**
 * Deterministic basis-point allocation: floor shares, remainder
 * distributed one unit at a time to the earliest beneficiaries, so
 * the parts always sum exactly to the whole. Used for agency fees and
 * any split of collected revenue.
 */
export function allocateByBps(totalMinor: bigint, sharesBps: readonly number[]): readonly bigint[] {
  if (totalMinor < 0n) throw new Error('Cannot allocate a negative amount.')
  for (const bps of sharesBps)
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000)
      throw new Error('Shares must be integer basis points between 0 and 10000.')
  const totalBps = sharesBps.reduce((sum, bps) => sum + bps, 0)
  if (totalBps !== 10_000) throw new Error('Shares must sum to 10000 basis points.')
  const parts = sharesBps.map((bps) => (totalMinor * BigInt(bps)) / 10_000n)
  let remainder = totalMinor - parts.reduce((sum, part) => sum + part, 0n)
  for (let i = 0; remainder > 0n && parts.length > 0; i = (i + 1) % parts.length) {
    parts[i] += 1n
    remainder -= 1n
  }
  return parts
}

/** Fee for a basis-point rate over a collected amount, rounded down; the creator keeps the rest. */
export function bpsFee(amountMinor: bigint, feeBps: number): bigint {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000)
    throw new Error('Fee must be integer basis points between 0 and 10000.')
  if (amountMinor < 0n) return 0n
  return (amountMinor * BigInt(feeBps)) / 10_000n
}

/** Sum rows per currency without ever mixing currencies. Returns sorted currency buckets. */
export function sumByCurrency<T>(
  rows: readonly T[],
  currencyOf: (row: T) => string,
  amountOf: (row: T) => bigint | null,
): ReadonlyMap<string, { total: bigint; unknownCount: number; rowCount: number }> {
  const buckets = new Map<string, { total: bigint; unknownCount: number; rowCount: number }>()
  for (const row of rows) {
    const currency = currencyOf(row)
    const bucket = buckets.get(currency) ?? { total: 0n, unknownCount: 0, rowCount: 0 }
    const amount = amountOf(row)
    if (amount === null) bucket.unknownCount += 1
    else bucket.total += amount
    bucket.rowCount += 1
    buckets.set(currency, bucket)
  }
  return new Map([...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)))
}
