import { describe, expect, it } from 'vitest'

import {
  normalizeEmailAddress,
  normalizePhoneAddress,
  signAudienceClaims,
  verifyAudienceClaims,
} from '../../src/modules/audience/contracts'
import { previewAudienceCsv } from '../../src/modules/audience/service'

describe('AUD-01 audience evidence boundaries', () => {
  it('normalizes Unicode/case email without changing channel identity semantics', () => {
    expect(normalizeEmailAddress('  READER@Example.TEST ')).toBe('reader@example.test')
    expect(normalizeEmailAddress('Ｒｅａｄｅｒ@Example.test')).toBe('reader@example.test')
  })

  it('only accepts stored international E.164 phone addresses', () => {
    expect(normalizePhoneAddress('+44 (20) 7946-0958')).toBe('+442079460958')
    expect(() => normalizePhoneAddress('020 7946 0958')).toThrow('international')
  })

  it('binds signed audience links to site, subject, purpose, and expiry', () => {
    const secret = 'test-secret'
    const token = signAudienceClaims(
      {
        v: 1,
        siteId: 'site-a',
        subscriberId: 'sub-a',
        purpose: 'preferences',
        exp: Math.floor(Date.now() / 1000) + 60,
        nonce: 'nonce',
      },
      secret,
    )
    expect(verifyAudienceClaims(token, secret, 'preferences')).toMatchObject({
      siteId: 'site-a',
      subscriberId: 'sub-a',
    })
    expect(verifyAudienceClaims(token, secret, 'unsubscribe')).toBeNull()
    expect(verifyAudienceClaims(`${token}x`, secret, 'preferences')).toBeNull()
    const expired = signAudienceClaims(
      {
        v: 1,
        siteId: 'site-a',
        subscriberId: 'sub-a',
        purpose: 'preferences',
        exp: 1,
        nonce: 'nonce',
      },
      secret,
    )
    expect(verifyAudienceClaims(expired, secret, 'preferences')).toBeNull()
  })

  it('quarantines import rows unless an explicit basis and source are declared and never grants consent', () => {
    const preview = previewAudienceCsv(
      'email,name\nReader@Example.test,A\nreader@example.test,B\nnope,C',
      'site-a',
    )
    expect(preview.accepted).toBe(0)
    expect(preview.quarantined).toBe(3)
    expect(preview.rows.map((row) => row.action)).toEqual([
      'quarantine',
      'quarantine',
      'quarantine',
    ])
    expect(
      previewAudienceCsv('email\na@example.test', 'site-a', {
        basis: 'contract',
        source: 'crm-export',
      }).rows[0],
    ).toMatchObject({ action: 'review' })
  })
})
