import { describe, expect, it } from 'vitest'
import {
  resolvePublicExperimentVariant,
  CANONICAL_PUBLIC_EXPERIMENT,
} from '../../src/modules/experiences/public-experiment'
import { consentSetCookie } from '../../src/modules/analytics/privacy'
import { defaultPrivacyPolicy } from '../../src/modules/analytics/contracts'
const secret = 'local-unit-only-secret'
const experiment = {
  ...CANONICAL_PUBLIC_EXPERIMENT,
  dbId: 'exp',
  siteId: 'alpha',
  configurationStatus: 'configured' as const,
  configurationIssue: null,
  winnerDecision: null,
}
const policy = { ...defaultPrivacyPolicy, analyticsEnabled: true, consentVersion: 'v1' }
const cookie = (changes = {}) =>
  consentSetCookie(
    {
      subject: 'visitor',
      siteId: 'alpha',
      version: 'v1',
      choices: { necessary: true, analytics: true, personalization: true, marketing: false },
      ...changes,
    },
    secret,
    false,
  )
const resolve = (cookieHeader: string | null, changes = {}, headers = new Headers()) =>
  resolvePublicExperimentVariant({
    experiment: { ...experiment, ...changes },
    cookieHeader,
    headers,
    secret,
    privacyPolicy: policy,
  })
describe('15C public assignment privacy and lifecycle', () => {
  it('keeps assignment stable for repeated consented visits', () => {
    expect(resolve(cookie()).assignment).toEqual(resolve(cookie()).assignment)
    expect(resolve(cookie()).consented).toBe(true)
  })
  it.each([
    null,
    cookie({ siteId: 'foreign' }),
    cookie({ version: 'obsolete' }),
    cookie({
      choices: { necessary: true, analytics: true, personalization: false, marketing: false },
    }),
  ])('uses untracked control for missing, foreign, stale or partial consent', (value) => {
    expect(resolve(value)).toMatchObject({ consented: false, assignment: { isDefault: true } })
  })
  it.each(['paused', 'draft', 'stopped'])('does not collect %s experiments', (state) => {
    expect(resolve(cookie(), { state })).toMatchObject({
      consented: false,
      assignment: { isDefault: true },
    })
  })
  it('collection disabled cannot report an active consented assignment', () => {
    expect(resolve(cookie(), { collectionEnabled: false }).consented).toBe(false)
  })
  it.each(['DNT', 'Sec-GPC'])('honors privacy signal %s', (name) => {
    expect(resolve(cookie(), {}, new Headers({ [name]: '1' })).consented).toBe(false)
  })
  it('rollback state ignores the historical winner', () => {
    expect(
      resolve(null, { state: 'paused', winnerDecision: { selectedVariantId: 'variant-treatment' } })
        .variant.isControl,
    ).toBe(true)
  })
})
