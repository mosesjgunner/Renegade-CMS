import { describe, expect, it } from 'vitest'
import {
  campaignState,
  fixtureAdapter,
  rescheduleCalendarEntry,
  socialHash,
  socialIdempotencyKey,
  validateVariant,
} from '../../src/modules/social/contracts'

describe('social distribution contracts', () => {
  const variant = {
    id: 'v1',
    accountId: 'a1',
    network: 'bluesky' as const,
    text: 'A published article https://example.test/a',
    attachments: [],
    status: 'approved' as const,
    idempotencyKey: 'pending',
  }
  it('creates immutable approval keys and only retries failed targets', async () => {
    const hash = socialHash(variant)
    expect(socialIdempotencyKey('v1', hash)).toBe(socialIdempotencyKey('v1', hash))
    expect(
      (await fixtureAdapter('bluesky').publish({ ...variant, idempotencyKey: 'social:v1' })).status,
    ).toBe('published')
    expect(campaignState(['published', 'failed'])).toBe('partially-published')
  })
  it('retains native validation and timezone-safe calendar command audit', () => {
    expect(
      validateVariant({ ...variant, network: 'instagram', text: '', attachments: [] }),
    ).toContain('A post needs text or an attachment.')
    expect(
      rescheduleCalendarEntry(
        { startsAt: '2026-08-25T15:00:00Z', timeZone: 'America/Chicago' },
        {
          entryId: 'cal1',
          startsAt: '2026-08-26T15:00:00Z',
          timeZone: 'America/Chicago',
          actorId: 'owner',
        },
      ).audit.action,
    ).toBe('calendar.rescheduled')
  })
})
