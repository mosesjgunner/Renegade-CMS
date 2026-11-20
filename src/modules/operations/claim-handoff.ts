/**
 * UXI-04 — fragment-based bootstrap claim handoff.
 *
 * The claim link is `<public-origin>/setup#claim=<token>`. The token
 * travels in the URL fragment, which browsers never send to the server:
 * it appears in no HTTP request line, no access log, and no Referer
 * header, and this app loads no analytics on the setup page. The setup
 * page reads the fragment client-side, removes it from the address bar
 * and history immediately (history.replaceState), and exchanges the
 * token through the existing enrollment API over a POST body. The
 * token itself is unchanged machinery from installation.ts: single-use,
 * stored only as an HMAC hash, 15-minute expiry.
 *
 * The log/CLI retrieval path remains the documented fallback for
 * operators whose browser cannot run the setup page's JavaScript (with
 * no JS the fragment is simply never read, and the token can still be
 * pasted into the form manually).
 *
 * This module is pure and framework-free so the browser side, the
 * installer side, and tests share one implementation.
 */

export const CLAIM_FRAGMENT_KEY = 'claim'

/** Bootstrap tokens are 32 random bytes, base64url-encoded: exactly 43 chars. */
const CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isClaimTokenShape(value: string): boolean {
  return CLAIM_TOKEN_PATTERN.test(value)
}

/** Build the claim link for a public origin and a raw bootstrap token. */
export function buildClaimUrl(publicOrigin: string, token: string): string {
  const origin = publicOrigin.replace(/\/+$/, '')
  return `${origin}/setup#${CLAIM_FRAGMENT_KEY}=${encodeURIComponent(token)}`
}

/**
 * Parse a claim token out of a URL fragment (`#claim=...`). Returns null
 * for a missing, malformed, or wrong-shaped token — a malformed fragment
 * is treated as no claim, never as a partial token.
 */
export function parseClaimFragment(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  if (!fragment) return null
  let params: URLSearchParams
  try {
    params = new URLSearchParams(fragment)
  } catch {
    return null
  }
  const token = params.get(CLAIM_FRAGMENT_KEY)
  if (!token || !isClaimTokenShape(token)) return null
  return token
}

type FragmentLocation = {
  hash: string
  pathname: string
  search: string
}

type FragmentHistory = {
  replaceState: (data: unknown, unused: string, url: string) => void
}

/**
 * Read the claim token from the current location and immediately clear
 * the fragment from the URL and history, so the token does not linger
 * in the address bar, browser history, or any later navigation's
 * Referer. Clearing happens whenever a claim parameter is present at
 * all — even a malformed one — so a bad link cannot strand a token in
 * history. Returns the token, or null when there was no usable claim.
 */
export function consumeClaimFragment(
  location: FragmentLocation,
  history: FragmentHistory,
): string | null {
  if (!location.hash) return null
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  let hasClaimParam = false
  try {
    hasClaimParam = new URLSearchParams(fragment).has(CLAIM_FRAGMENT_KEY)
  } catch {
    hasClaimParam = false
  }
  if (!hasClaimParam) return null
  const token = parseClaimFragment(location.hash)
  history.replaceState(null, '', `${location.pathname}${location.search}`)
  return token
}

/**
 * Wrong-origin guard for the claim exchange. Browsers always send an
 * Origin (or at least a Referer) on the enrollment POST; when one is
 * present it must name the configured public origin exactly, or the
 * exchange is refused before the token is checked. Non-browser operator
 * clients that send neither header are unaffected, matching the
 * posture of request-origin.ts. The refusal reuses the generic
 * invalid-token error so a foreign origin learns nothing new.
 */
export function isClaimOriginAllowed(
  headers: Headers | Record<string, string | null | undefined>,
  appUrl: string,
): boolean {
  const get = (name: string): string | null => {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name)
    const record = headers as Record<string, string | null | undefined>
    for (const key of Object.keys(record)) {
      if (key.toLowerCase() === name) return record[key] ?? null
    }
    return null
  }
  const candidate = get('origin') ?? get('referer')
  if (candidate === null) return true
  try {
    return new URL(candidate).origin === new URL(appUrl).origin
  } catch {
    return false
  }
}
