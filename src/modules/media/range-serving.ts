/**
 * Shared HTTP byte-range serving for media bytes (extracted from the
 * public media route in POD-03 so the token-scoped podcast enclosure
 * route reuses the exact same range semantics instead of duplicating
 * them). Pure helpers: callers own auth/entitlement checks and storage
 * lookups; this module only turns bytes + a Range header into a
 * 200 / 206 / 416 response.
 */

export type ByteRange = { from: number; to: number }

/**
 * Parses a single `bytes=` range header against a body length.
 * Returns the range, `null` for a malformed/unsatisfiable range
 * (caller answers 416), or `undefined` when no usable range was sent.
 */
export function parseByteRange(
  header: string | null,
  length: number,
): ByteRange | null | undefined {
  if (!header?.startsWith('bytes=')) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match) return null
  const start = match[1] ? Number(match[1]) : undefined
  const end = match[2] ? Number(match[2]) : undefined
  const from = start ?? (end === undefined ? 0 : Math.max(0, length - end))
  const to = start === undefined ? length - 1 : Math.min(end ?? length - 1, length - 1)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > to || from >= length)
    return null
  return { from, to }
}

/**
 * Builds the response for a full media body, honouring the request's
 * Range header (206 + Content-Range) and If-None-Match (304) exactly
 * like the public `/media/[id]` original-bytes path.
 */
export function mediaBytesResponse(input: {
  bytes: Uint8Array
  mimeType: string
  checksum?: string
  rangeHeader: string | null
  ifNoneMatch?: string | null
  headers?: Record<string, string>
}): Response {
  const { bytes } = input
  const checksum = input.checksum ?? ''
  if (input.ifNoneMatch && checksum && input.ifNoneMatch === checksum) {
    return new Response(null, {
      status: 304,
      headers: { ...(input.headers ?? {}), ETag: checksum },
    })
  }
  const headers: Record<string, string> = {
    'Content-Type': input.mimeType,
    'Content-Length': String(bytes.byteLength),
    ...(input.headers ?? {}),
    ...(checksum ? { ETag: checksum } : {}),
    'X-Content-Type-Options': 'nosniff',
  }
  const range = parseByteRange(input.rangeHeader, bytes.byteLength)
  if (range === null)
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${bytes.byteLength}`, 'Accept-Ranges': 'bytes' },
    })
  if (range) {
    const body = bytes.slice(range.from, range.to + 1)
    return new Response(Buffer.from(body), {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(body.byteLength),
        'Content-Range': `bytes ${range.from}-${range.to}/${bytes.byteLength}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }
  headers['Accept-Ranges'] = 'bytes'
  return new Response(Buffer.from(bytes), { headers })
}
