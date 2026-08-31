import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_SCHEMA_VERSION,
  attributePath,
  isBotOrInternal,
  normalizeEvent,
  sumCompatibleMetricValues,
  type FirstPartyEvent,
  type MetricSnapshot,
} from '../../src/modules/analytics/contracts'
import { commandCenter, type CommandRecord } from '../../src/modules/analytics/command-center'
const event = (
  id: string,
  type: FirstPartyEvent['eventType'],
  at: string,
  channel = 'direct',
): FirstPartyEvent => ({
  id,
  eventType: type,
  occurredAt: at,
  receivedAt: at,
  identity: { anonymousId: 'anon', sessionId: 'session' },
  context: { siteId: 'site', channel },
  consentBasis: 'analytics-consent',
  schemaVersion: ANALYTICS_SCHEMA_VERSION,
  trusted: false,
  dedupeKey: '',
})
describe('analytics contracts', () => {
  it('deduplicates consented first-party funnels and exposes bounded attribution', () => {
    const events = [
      event('social', 'page_view', '2026-08-25T10:00:00Z', 'social'),
      event('article', 'read_depth', '2026-08-25T10:01:00Z'),
      event('signup', 'signup', '2026-08-25T10:02:00Z'),
    ]
    expect(normalizeEvent(events[0])?.dedupeKey).toBe('site:event:social:page_view')
    expect(normalizeEvent({ ...events[0], context: { ...events[0].context, siteId: 'other-site' } })?.dedupeKey).not.toBe(normalizeEvent(events[0])?.dedupeKey)
    expect(attributePath(events, 'signup').map((item) => item.channel)).toEqual([
      'social',
      'social',
    ])
    expect(normalizeEvent({ ...events[0], consentBasis: 'denied' })).toBeNull()
    expect(isBotOrInternal({ userAgent: 'Googlebot' })).toBe(true)
  })
  it('refuses incomparable financial metrics', () => {
    const base: MetricSnapshot = {
      id: '1',
      metric: 'contribution-gross',
      value: '1000',
      definition: 'settled contribution gross',
      grain: 'event',
      windowStart: '2026-08-25T00:00:00Z',
      windowEnd: '2026-08-26T00:00:00Z',
      processor: 'fixture',
      presentmentCurrency: 'USD',
      settlementCurrency: 'USD',
      reconciliationStatus: 'reconciled',
    }
    expect(sumCompatibleMetricValues([base, { ...base, id: '2', value: '250' }])).toBe('1250')
    expect(() =>
      sumCompatibleMetricValues([base, { ...base, id: '3', settlementCurrency: 'EUR' }]),
    ).toThrow('Incompatible')
  })
  it('keeps command center scope-specific and actionable', () => {
    const records: CommandRecord[] = [
      {
        id: 'failure',
        kind: 'provider-failure',
        title: 'POD submission failed',
        status: 'failed',
        action: 'Retry POD submission',
        nextStep: 'Open connection',
        history: ['attempt 1'],
        roles: ['merchant', 'owner'],
      },
      {
        id: 'thread',
        kind: 'moderation-discussion',
        title: 'Helpful answer awaiting review',
        status: 'open',
        action: 'Review answer',
        nextStep: 'Open thread',
        history: [],
        roles: ['moderator', 'owner'],
      },
      {
        id: 'healthy',
        kind: 'job',
        title: 'Healthy job',
        status: 'healthy',
        action: 'none',
        nextStep: 'none',
        history: [],
        roles: ['owner'],
      },
    ]
    expect(
      commandCenter(records, 'merchant').sections['provider-and-system-failures'],
    ).toHaveLength(1)
    expect(commandCenter(records, 'moderator').sections['community-needs-response']).toHaveLength(1)
    expect(commandCenter(records, 'merchant').collapsedHealthy).toBe(0)
  })
})
