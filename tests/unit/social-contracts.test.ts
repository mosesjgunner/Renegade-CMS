import { describe, expect, it } from 'vitest'
import {
  campaignState,
  fixtureAdapter,
  rescheduleCalendarEntry,
  socialHash,
  socialIdempotencyKey,
  validateForProvider,
  validateVariant,
} from '../../src/modules/social/contracts'
import { socialProviderFor } from '../../src/modules/social/provider-runtime'

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
  it('declares live, unavailable, and manual boundaries and rejects unsupported media', () => {
    const bluesky = socialProviderFor('bluesky')
    expect(bluesky.mode).toBe('live')
    expect(
      validateForProvider(
        { ...variant, attachments: [{ mediaAssetId: 'm1', role: 'video' }] },
        bluesky.capabilities,
      ),
    ).toContain('This provider does not support video attachments.')
    expect(socialProviderFor('x').mode).toBe('manual-handoff')
    expect(socialProviderFor('activitypub').mode).toBe('unavailable')
  })
  it('reports expired credentials and provider outages deterministically', async () => {
    const adapter = socialProviderFor('bluesky')
    expect(await adapter.publish?.(variant, { accountId: 'a1', credentials: null })).toMatchObject({
      status: 'failed',
      error: { kind: 'reconnect-required' },
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('offline')
    }
    const outage = await adapter.publish?.(variant, {
      accountId: 'a1',
      credentials: { identifier: 'a', appPassword: 'b' },
    })
    globalThis.fetch = originalFetch
    expect(outage).toMatchObject({ status: 'failed', error: { kind: 'transient' } })
  })
})
