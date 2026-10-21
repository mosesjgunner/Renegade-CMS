import { validateOutboundUrl } from './security'

export class SocialBoundaryError extends Error {}

export function socialProviderMode(endpoint: string): 'local-harness' | 'remote-sandbox' | 'live' {
  const url = new URL(endpoint)
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return 'local-harness'
  const sandboxes = (process.env.SOCIAL_REMOTE_SANDBOX_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
  return url.protocol === 'https:' && sandboxes.includes(url.origin) ? 'remote-sandbox' : 'live'
}

export function assertSocialEndpoint(endpoint: string): void {
  const url = new URL(endpoint)
  const local = socialProviderMode(endpoint) === 'local-harness'
  const allowed = (process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
  if (local && !allowed.includes(url.origin))
    throw new SocialBoundaryError(
      'Local social adapters require an explicitly configured SOCIAL_LOCAL_ADAPTER_ORIGINS origin.',
    )
  const result = validateOutboundUrl(endpoint, {
    allowHttpInDev: local && allowed.includes(url.origin),
  })
  if (!result.isValid) throw new SocialBoundaryError(`SSRF Blocked: ${result.reason}`)
}

export function socialRequestSignal(endpoint: string): AbortSignal {
  assertSocialEndpoint(endpoint)
  const configured = Number(process.env.SOCIAL_LOCAL_ADAPTER_TIMEOUT_MS)
  const duration =
    socialProviderMode(endpoint) === 'local-harness' && configured >= 100 && configured <= 30000
      ? configured
      : 30000
  return AbortSignal.timeout(duration)
}

export function socialFetch(endpoint: string, init: RequestInit = {}): Promise<Response> {
  return fetch(endpoint, { ...init, redirect: 'error', signal: socialRequestSignal(endpoint) })
}

/** Retry-After permits seconds or an HTTP date; common reset headers use epoch seconds. */
export function socialRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
): string | undefined {
  if (!value) return undefined
  const numeric = Number(value)
  const timestamp = Number.isFinite(numeric)
    ? numeric < 0
      ? Number.NaN
      : numeric > 1000000000
        ? numeric * 1000
        : now + numeric * 1000
    : Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}
