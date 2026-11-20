import { describe, expect, it, vi } from 'vitest'

import {
  buildClaimUrl,
  consumeClaimFragment,
  isClaimOriginAllowed,
  isClaimTokenShape,
  parseClaimFragment,
} from '../../src/modules/operations/claim-handoff'

// 32 random bytes, base64url — the shape installation.ts mints.
const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
const ORIGIN = 'https://cms.example.test'

describe('claim token shape and link building', () => {
  it('accepts exactly the minted token shape', () => {
    expect(TOKEN).toHaveLength(43)
    expect(isClaimTokenShape(TOKEN)).toBe(true)
    expect(isClaimTokenShape('short')).toBe(false)
    expect(isClaimTokenShape(`${TOKEN}=`)).toBe(false)
    expect(isClaimTokenShape('has spaces in it has spaces in it has space')).toBe(false)
  })

  it('builds a fragment claim link with no query string and no trailing-slash doubling', () => {
    expect(buildClaimUrl(ORIGIN, TOKEN)).toBe(`${ORIGIN}/setup#claim=${TOKEN}`)
    expect(buildClaimUrl(`${ORIGIN}/`, TOKEN)).toBe(`${ORIGIN}/setup#claim=${TOKEN}`)
    const url = buildClaimUrl(ORIGIN, TOKEN)
    expect(url).not.toContain('?claim=')
  })
})

describe('fragment parsing', () => {
  it('round-trips a built claim link fragment', () => {
    const url = buildClaimUrl(ORIGIN, TOKEN)
    const hash = url.slice(url.indexOf('#'))
    expect(parseClaimFragment(hash)).toBe(TOKEN)
    expect(parseClaimFragment(`claim=${TOKEN}`)).toBe(TOKEN)
  })

  it('returns null for missing, empty, or malformed fragments', () => {
    expect(parseClaimFragment('')).toBeNull()
    expect(parseClaimFragment('#')).toBeNull()
    expect(parseClaimFragment('#other=1')).toBeNull()
    expect(parseClaimFragment('#claim=')).toBeNull()
    expect(parseClaimFragment('#claim=too-short')).toBeNull()
    expect(parseClaimFragment(`#claim=${TOKEN}extra-padding-to-break-shape`)).toBeNull()
  })
})

describe('fragment consumption (read once, clear immediately)', () => {
  function fakeLocation(hash: string) {
    return { hash, pathname: '/setup', search: '' }
  }

  it('returns the token and clears the fragment from history', () => {
    const replaceState = vi.fn()
    const token = consumeClaimFragment(fakeLocation(`#claim=${TOKEN}`), { replaceState })
    expect(token).toBe(TOKEN)
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/setup')
    const clearedUrl = replaceState.mock.calls[0][2] as string
    expect(clearedUrl).not.toContain(TOKEN)
    expect(clearedUrl).not.toContain('#')
  })

  it('clears even a malformed claim so no token-like value lingers in history', () => {
    const replaceState = vi.fn()
    const token = consumeClaimFragment(fakeLocation('#claim=partial-value'), { replaceState })
    expect(token).toBeNull()
    expect(replaceState).toHaveBeenCalledWith(null, '', '/setup')
  })

  it('does nothing when there is no claim parameter', () => {
    const replaceState = vi.fn()
    expect(consumeClaimFragment(fakeLocation(''), { replaceState })).toBeNull()
    expect(consumeClaimFragment(fakeLocation('#section'), { replaceState })).toBeNull()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('preserves the query string when clearing', () => {
    const replaceState = vi.fn()
    const location = { hash: `#claim=${TOKEN}`, pathname: '/setup', search: '?step=1' }
    expect(consumeClaimFragment(location, { replaceState })).toBe(TOKEN)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/setup?step=1')
  })
})

describe('claim origin guard', () => {
  it('allows the configured origin and its referers', () => {
    expect(isClaimOriginAllowed({ origin: ORIGIN }, ORIGIN)).toBe(true)
    expect(isClaimOriginAllowed({ referer: `${ORIGIN}/setup` }, ORIGIN)).toBe(true)
    expect(isClaimOriginAllowed(new Headers({ origin: ORIGIN }), ORIGIN)).toBe(true)
  })

  it('refuses foreign, subdomain, wrong-port, and malformed origins', () => {
    expect(isClaimOriginAllowed({ origin: 'https://evil.example.test' }, ORIGIN)).toBe(false)
    expect(isClaimOriginAllowed({ origin: 'https://sub.cms.example.test' }, ORIGIN)).toBe(false)
    expect(isClaimOriginAllowed({ origin: 'http://cms.example.test' }, ORIGIN)).toBe(false)
    expect(isClaimOriginAllowed({ origin: 'null' }, ORIGIN)).toBe(false)
    expect(isClaimOriginAllowed({ referer: 'https://evil.example.test/setup' }, ORIGIN)).toBe(false)
  })

  it('allows non-browser operator clients that send neither header', () => {
    expect(isClaimOriginAllowed({}, ORIGIN)).toBe(true)
    expect(isClaimOriginAllowed(new Headers(), ORIGIN)).toBe(true)
  })
})
