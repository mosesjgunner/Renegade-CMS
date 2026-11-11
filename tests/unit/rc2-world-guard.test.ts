import { describe, expect, it } from 'vitest'

import { isFixtureSafeDatabase } from '../fixtures/rc2-world'

/**
 * RC2-A-04: the fixture world's production-safety guard, kept in the
 * fast unit gate so the refusal can never silently regress.
 */
describe('RC2-A-04 fixture safety guard', () => {
  it('accepts dedicated acceptance databases only', () => {
    expect(isFixtureSafeDatabase('postgresql://u:p@db:5432/renegade_release_acceptance')).toBe(true)
    expect(isFixtureSafeDatabase('postgres://u:p@db:5432/site_release_acceptance')).toBe(true)
  })

  it('refuses ordinary, production-shaped, and malformed targets', () => {
    expect(isFixtureSafeDatabase('postgresql://u:p@db:5432/renegade')).toBe(false)
    expect(isFixtureSafeDatabase('postgresql://u:p@db:5432/production')).toBe(false)
    expect(isFixtureSafeDatabase('postgresql://u:p@db:5432/release_acceptance_old')).toBe(false)
    expect(isFixtureSafeDatabase(undefined)).toBe(false)
    expect(isFixtureSafeDatabase('')).toBe(false)
    expect(isFixtureSafeDatabase('not a url')).toBe(false)
  })
})
