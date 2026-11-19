/**
 * Shared validation helpers for the Podcast Studio contracts.
 *
 * House style follows `src/modules/media/contracts.ts`: plain TypeScript
 * types plus runtime `assertX()` functions that throw `Error` with a clear
 * message. No zod or other schema library is used anywhere in this module.
 *
 * Parsers in this folder validate the fields they know and preserve every
 * other field untouched, so optional extensions and future fields survive a
 * parse -> serialize round trip losslessly.
 */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const assertRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`)
  return value
}

export const assertVersion1 = (value: Record<string, unknown>, label: string) => {
  if (value.version !== 1)
    throw new Error(`${label} version must be 1; received ${JSON.stringify(value.version)}.`)
}

export const requireField = (value: Record<string, unknown>, field: string, label: string) => {
  if (value[field] === undefined || value[field] === null)
    throw new Error(`${label} is missing required field "${field}".`)
  return value[field]
}

/** Like `requireField`, but a present `null` counts (for nullable fields such as `actualSec`). */
export const requirePresentField = (
  value: Record<string, unknown>,
  field: string,
  label: string,
) => {
  if (!(field in value) || value[field] === undefined)
    throw new Error(`${label} is missing required field "${field}".`)
  return value[field]
}

export const assertString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`)
  return value
}

export const assertNonEmptyString = (value: unknown, label: string): string => {
  const text = assertString(value, label)
  if (!text.trim()) throw new Error(`${label} must not be empty.`)
  return text
}

export const assertOptionalString = (value: unknown, label: string) => {
  if (value !== undefined && value !== null && typeof value !== 'string')
    throw new Error(`${label} must be a string when present.`)
}

export const assertFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${label} must be a finite number.`)
  return value
}

/** A time or duration in seconds: finite and never negative. */
export const assertNonNegativeTime = (value: unknown, label: string): number => {
  const time = assertFiniteNumber(value, label)
  if (time < 0) throw new Error(`${label} must not be negative.`)
  return time
}

export const assertPositiveNumber = (value: unknown, label: string): number => {
  const number = assertFiniteNumber(value, label)
  if (number <= 0) throw new Error(`${label} must be greater than zero.`)
  return number
}

export const assertNonNegativeInteger = (value: unknown, label: string): number => {
  const number = assertFiniteNumber(value, label)
  if (!Number.isInteger(number) || number < 0)
    throw new Error(`${label} must be a non-negative integer.`)
  return number
}

export const assertPositiveInteger = (value: unknown, label: string): number => {
  const number = assertFiniteNumber(value, label)
  if (!Number.isInteger(number) || number <= 0)
    throw new Error(`${label} must be a positive integer.`)
  return number
}

export const assertBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`)
  return value
}

export const assertArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`)
  return value
}

const SHA256_HEX = /^[0-9a-fA-F]{64}$/

export const assertChecksumSha256 = (value: unknown, label: string): string => {
  const checksum = assertString(value, label)
  if (!SHA256_HEX.test(checksum))
    throw new Error(`${label} must be a 64-character hex SHA-256 checksum.`)
  return checksum
}

/** Accepts a parsed value or a JSON string, as produced by the serializers. */
export const coerceInput = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error(`${label} must be valid JSON.`)
    }
    return assertRecord(parsed, label)
  }
  return assertRecord(value, label)
}
