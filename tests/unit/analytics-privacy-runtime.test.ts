import { describe, expect, it } from 'vitest'
import {
  analyticsAllowed,
  defaultPrivacyPolicy,
  expiredAnalyticsRecordIds,
  normalizeConsentChoices,
} from '../../src/modules/analytics/contracts'
import { consentSetCookie, readConsent } from '../../src/modules/analytics/privacy'

describe('browser privacy runtime', () => {
  it('starts with no non-essential category, respects GPC/DNT, and signs a versioned necessary consent cookie', () => {
    const choices = normalizeConsentChoices(undefined)
    expect(choices).toEqual({
      necessary: true,
      analytics: false,
      personalization: false,
      marketing: false,
    })
    expect(
      analyticsAllowed({
        choices: { ...choices, analytics: true },
        policy: { ...defaultPrivacyPolicy, analyticsEnabled: true },
        globalPrivacyControl: true,
      }),
    ).toBe(false)
    const cookie = consentSetCookie(
      { subject: 'browser-1', version: 'v1', choices: { ...choices, analytics: true } },
      'secret',
      false,
    )
    expect(readConsent(cookie, 'secret')).toMatchObject({
      subject: 'browser-1',
      version: 'v1',
      choices: { analytics: true },
    })
    expect(readConsent(cookie, 'wrong-secret')).toBeNull()
  })
  it('models reject, selective acceptance, withdrawal, returning state, and raw retention cleanup', () => {
    const selected = normalizeConsentChoices({ analytics: true, personalization: true })
    expect(selected).toMatchObject({
      necessary: true,
      analytics: true,
      personalization: true,
      marketing: false,
    })
    expect(normalizeConsentChoices({ necessary: true })).toEqual({
      necessary: true,
      analytics: false,
      personalization: false,
      marketing: false,
    })
    expect(
      expiredAnalyticsRecordIds(
        [
          { id: 'old', occurredAt: '2026-01-01T00:00:00Z' },
          { id: 'new', occurredAt: '2026-08-31T00:00:00Z' },
        ],
        new Date('2026-08-31T00:00:00Z'),
        90,
      ),
    ).toEqual(['old'])
  })
})
