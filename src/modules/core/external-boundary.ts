import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { Agent } from 'undici'

const MAX_REDIRECTS = 3
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15_000

export type Lookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string }>>

export function isPrivateAddress(address: string): boolean {
  address = address.toLowerCase().replace(/^\[|\]$/g, '')
  // WHATWG URLs normalize mapped IPv4 to hexadecimal IPv6 groups.
  const mapped = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mapped) {
    const bits = (parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16)) >>> 0
    return isPrivateAddress(
      [bits >>> 24, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255].join('.'),
    )
  }
  if (address.startsWith('::ffff:')) return isPrivateAddress(address.slice(7))
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }
  const normalized = address
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab][0-9a-f]:/.test(normalized)
  )
}

/** Validates every hop before a server-side request. DNS is resolved first to block SSRF. */
export async function assertSafeOutboundUrl(
  value: string,
  resolve: Lookup = lookup,
  options: { allowHttp?: boolean; allowPrivate?: boolean } = {},
): Promise<URL> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Outbound URL is invalid.')
  }
  if (!options.allowPrivate && (url.hostname === 'localhost' || isPrivateAddress(url.hostname)))
    throw new Error('Outbound URL resolves to a private destination.')
  if (
    (!options.allowHttp && url.protocol !== 'https:') ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Outbound URL must be an unauthenticated HTTPS URL.')
  const addresses = await resolve(url.hostname, { all: true, verbatim: true })
  if (
    !addresses.length ||
    (!options.allowPrivate && addresses.some(({ address }) => isPrivateAddress(address)))
  )
    throw new Error('Outbound URL resolves to a private destination.')
  return url
}

export async function safeFetch(
  input: string,
  init: RequestInit = {},
  options: {
    resolve?: Lookup
    fetcher?: typeof fetch
    maxBytes?: number
    timeoutMs?: number
    allowHttp?: boolean
    allowPrivate?: boolean
    allowedContentTypes?: readonly string[]
    retries?: number
    maxRedirects?: number
  } = {},
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  let url = await assertSafeOutboundUrl(input, options.resolve, options)
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal
    // Validate the addresses used by the socket itself, closing the DNS rebinding
    // gap between URL preflight and fetch's independent DNS resolution.
    const agent = options.fetcher
      ? undefined
      : new Agent({
          connect: {
            lookup: (hostname, lookupOptions, callback) => {
              lookup(hostname, { all: true, verbatim: true })
                .then((addresses) => {
                  if (
                    !addresses.length ||
                    (!options.allowPrivate &&
                      addresses.some(({ address }) => isPrivateAddress(address)))
                  ) {
                    callback(new Error('Outbound URL resolves to a private destination.'), [], 4)
                    return
                  }
                  if (lookupOptions.all) callback(null, addresses)
                  else callback(null, addresses[0].address, addresses[0].family)
                })
                .catch((error: Error) => callback(error, [], 4))
            },
          },
        })
    let response: Response
    try {
      response = await fetcher(url, {
        ...init,
        redirect: 'manual',
        signal,
        ...(agent ? { dispatcher: agent } : {}),
      })
    } finally {
      void agent?.close()
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (Number(response.headers.get('content-length') ?? 0) > maxBytes)
        throw new Error('Outbound response exceeds the size limit.')
      const contentType = response.headers.get('content-type')?.split(';')[0].toLowerCase()
      if (
        options.allowedContentTypes &&
        (!contentType || !options.allowedContentTypes.includes(contentType))
      )
        throw new Error('Outbound response has an unsupported content type.')
      return response
    }
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location || redirect === maxRedirects) throw new Error('Outbound redirect is not allowed.')
    const next = await assertSafeOutboundUrl(
      new URL(location, url).toString(),
      options.resolve,
      options,
    )
    if (next.origin !== url.origin)
      throw new Error('Cross-origin outbound redirect is not allowed.')
    url = next
  }
  throw new Error('Outbound redirect is not allowed.')
}

export async function readBoundedJson(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<unknown> {
  const text = await readBoundedText(response, maxBytes)
  return text === null ? null : JSON.parse(text)
}

export async function readBoundedText(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<string | null> {
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel()
      throw new Error('Outbound response exceeds the size limit.')
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/** Only permit same-origin relative returns; payment completion is never inferred from redirects. */
export function safeRelativeRedirect(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value))
    return fallback
  return value
}
