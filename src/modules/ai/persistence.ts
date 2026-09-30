/** Payload JSON fields accept objects and arrays, but not primitive strings. */
export function encodeProposalValue(value: unknown): Record<string, unknown> | unknown[] | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return { type: 'text', value }
  if (typeof value === 'object') return value as Record<string, unknown> | unknown[]
  throw new Error('Unsupported AI proposal value.')
}

export function decodeProposalValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>
    if (object.type === 'text' && typeof object.value === 'string') return object.value
  }
  return value
}
