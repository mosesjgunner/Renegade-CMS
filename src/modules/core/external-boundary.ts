import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

const MAX_REDIRECTS = 3
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15_000

export type Lookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string }>>

export function isPrivateAddress(address: string): boolean {
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
  const normalized = address.toLowerCase().replace(/^::ffff:/, '')
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
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
  } = {},
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  let url = await assertSafeOutboundUrl(input, options.resolve, options)
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetcher(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
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
    if (!location || redirect === MAX_REDIRECTS)
      throw new Error('Outbound redirect is not allowed.')
    url = await assertSafeOutboundUrl(new URL(location, url).toString(), options.resolve, options)
  }
  throw new Error('Outbound redirect is not allowed.')
}

export async function readBoundedJson(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<unknown> {
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
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)))
}

/** Only permit same-origin relative returns; payment completion is never inferred from redirects. */
export function safeRelativeRedirect(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value))
    return fallback
  return value
}
