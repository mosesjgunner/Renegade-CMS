import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import {
  analyticsSubjectHash,
  hasCurrentAnalyticsConsent,
} from '../../src/modules/analytics/privacy'
import {
  attributeCampaignFunnel,
  attributePath,
  defaultPrivacyPolicy,
  normalizeConsentChoices,
  type FirstPartyEvent,
} from '../../src/modules/analytics/contracts'
import { reportableAnalyticsRows } from '../../src/modules/analytics/reporting'
import { AnalyticsEvents, AnalyticsConsentRecords } from '../../src/collections/Analytics'

const consent = {
  subject: 'subject',
  version: 'v1',
  siteId: 'alpha',
  choices: normalizeConsentChoices({ analytics: true }),
}
const policy = { ...defaultPrivacyPolicy, analyticsEnabled: true, consentVersion: 'v1' }
const event = (
  id: string,
  siteId = 'alpha',
  anonymousId: string | undefined = 'subject',
): FirstPartyEvent => ({
  id,
  eventType: 'page_view',
  occurredAt: '2026-11-01T00:00:00Z',
  receivedAt: '2026-11-01T00:00:00Z',
  identity: { anonymousId },
  context: { siteId, channel: id },
  consentBasis: 'analytics-consent',
  schemaVersion: 1,
  trusted: false,
  dedupeKey: id,
})
describe('15A persisted privacy boundaries', () => {
  it.each([
    { docs: [], expected: false },
    {
      docs: [{ consentVersion: 'v1', action: 'withdraw', categories: { analytics: false } }],
      expected: false,
    },
    {
      docs: [{ consentVersion: 'old', action: 'grant', categories: { analytics: true } }],
      expected: false,
    },
    {
      docs: [{ consentVersion: 'v1', action: 'grant', categories: { analytics: true } }],
      expected: true,
    },
  ])(
    'uses latest persisted consent rather than the signed cookie ($expected)',
    async ({ docs, expected }) => {
      const find = vi.fn().mockResolvedValue({ docs })
      expect(
        await hasCurrentAnalyticsConsent(
          { find } as unknown as Payload,
          consent,
          'alpha',
          'secret',
          policy,
          {},
        ),
      ).toBe(expected)
      expect(find).toHaveBeenCalledWith(expect.objectContaining({ sort: '-occurredAt', limit: 1 }))
    },
  )
  it('does not query or accept consent from a different site or with GPC', async () => {
    const find = vi.fn()
    const payload = { find } as unknown as Payload
    expect(await hasCurrentAnalyticsConsent(payload, consent, 'beta', 'secret', policy, {})).toBe(
      false,
    )
    expect(
      await hasCurrentAnalyticsConsent(payload, consent, 'alpha', 'secret', policy, {
        globalPrivacyControl: true,
      }),
    ).toBe(false)
    expect(find).not.toHaveBeenCalled()
    expect(analyticsSubjectHash(consent, 'alpha', 'secret')).not.toBe(
      analyticsSubjectHash(consent, 'beta', 'secret'),
    )
  })
  it('never attributes across sites, denied consent, or unrelated identities', () => {
    const events = [
      event('foreign', 'beta'),
      event('other', 'alpha', 'other'),
      { ...event('denied'), consentBasis: 'denied' as const },
      event('conversion'),
    ]
    expect(attributePath(events, 'conversion')[0].path).toEqual(['conversion'])
    expect(attributeCampaignFunnel(events, 'conversion').touchpoints.map((e) => e.eventId)).toEqual(
      ['conversion'],
    )
  })
  it('does not infer a path for missing identity', () => {
    const events = [event('unlinked', 'alpha', undefined), event('conversion', 'alpha', undefined)]
    events.forEach((e) => {
      ;(e as { identity: object }).identity = {}
    })
    const result = attributeCampaignFunnel(events, 'conversion')
    expect(result.confidence).toBe('unlinked')
    expect(result.touchpoints.map((e) => e.eventId)).toEqual(['conversion'])
  })
  it('native analytics and consent mutation is unavailable even to operators', async () => {
    for (const collection of [AnalyticsEvents, AnalyticsConsentRecords]) {
      for (const key of ['create', 'update', 'delete'] as const)
        expect(await collection.access![key]!({ req: { user: { role: 'owner' } } } as never)).toBe(
          false,
        )
    }
  })
})

describe('15A report eligibility', () => {
  const record = {
    subjectHash: 'hash',
    consentVersion: 'v1',
    action: 'grant',
    categories: { analytics: true },
  }
  const rows = [
    { anonymousHash: 'hash', consentBasis: 'analytics-consent' },
    { anonymousHash: 'legacy', consentBasis: 'analytics-consent' },
    { anonymousHash: 'hash', consentBasis: 'denied' },
  ]
  it('excludes legacy, missing and denied identity evidence', async () => {
    const payload = {
      findGlobal: vi.fn().mockResolvedValue({ privacy: policy }),
      find: vi.fn().mockResolvedValue({ docs: [record] }),
    } as unknown as Payload
    expect(await reportableAnalyticsRows(payload, 'alpha', rows)).toEqual([rows[0]])
  })
  it('latest withdrawal overrides every historical grant', async () => {
    const payload = {
      findGlobal: vi.fn().mockResolvedValue({ privacy: policy }),
      find: vi.fn().mockResolvedValue({
        docs: [{ ...record, action: 'withdraw', categories: { analytics: false } }, record],
      }),
    } as unknown as Payload
    expect(await reportableAnalyticsRows(payload, 'alpha', rows)).toEqual([])
  })
  it('disabled analytics returns no browser events even if historical consent exists', async () => {
    const find = vi.fn()
    const payload = {
      findGlobal: vi.fn().mockResolvedValue({ privacy: { ...policy, analyticsEnabled: false } }),
      find,
    } as unknown as Payload
    expect(await reportableAnalyticsRows(payload, 'alpha', rows)).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })
})
