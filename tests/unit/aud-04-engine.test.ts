import { describe, expect, it } from 'vitest'
import {
  deliverySafety,
  explainSegment,
  recipientSnapshot,
  validateAutomation,
  validateSegmentTree,
} from '../../src/modules/audience/engine'
const p = {
  subscriberId: 's1',
  siteId: 'site-a',
  email: 'a@example.test',
  channelEligible: true,
  consentPurposes: ['newsletter'],
  lists: ['news'],
  tags: ['reader'],
  formIds: [],
  sourceCampaigns: [],
  locale: 'en',
  roles: ['member'],
  commerceFacts: [],
  communityFacts: [],
  engagementAt: '2026-09-19T12:00:00Z',
}
describe('AUD-04 bounded audience engine', () => {
  const tree = {
    all: [
      { predicate: { field: 'list' as const, op: 'is' as const, value: 'news' } },
      { not: { predicate: { field: 'tag' as const, op: 'is' as const, value: 'blocked' } } },
    ],
  }
  it('explains nested rules and snapshots a versioned audience deterministically', () => {
    expect(validateSegmentTree(tree)).toEqual([])
    expect(explainSegment(tree, p).selected).toBe(true)
    const a = recipientSnapshot({
      siteId: 'site-a',
      messageId: 'm1',
      definition: tree,
      recipients: [p],
    })
    const b = recipientSnapshot({
      siteId: 'site-a',
      messageId: 'm1',
      definition: tree,
      recipients: [p],
      evaluatedAt: a.evaluatedAt,
    })
    expect(a.hash).toBe(b.hash)
    expect(a.included).toHaveLength(1)
  })
  it('rejects unbounded automation and keeps send-time safety stronger than snapshots', () => {
    expect(validateAutomation({ trigger: 'anything', actions: [{ type: 'script' }] })).toContain(
      'Unsupported automation trigger.',
    )
    expect(
      deliverySafety({
        consent: false,
        suppressed: false,
        addressHealthy: true,
        sentInWindow: 0,
        cap: 2,
        providerSupports: true,
      }),
    ).toBe('consent-withdrawn')
    expect(
      deliverySafety({
        consent: true,
        suppressed: true,
        addressHealthy: true,
        sentInWindow: 0,
        cap: 2,
        providerSupports: true,
      }),
    ).toBe('suppressed')
  })
})
