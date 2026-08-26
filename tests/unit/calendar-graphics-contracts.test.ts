import { describe, expect, it } from 'vitest'
import { assertIanaTimeZone, isInScope, unscheduled } from '../../src/modules/calendar/contracts'
import { graphicTemplatePresets } from '../../src/modules/graphics/service'

describe('Calendar Center and Graphics Studio contracts', () => {
  it('keeps projections scope-safe and treats null schedules as an unscheduled queue', () => {
    const entry = {
      id: 'r1',
      sourceType: 'content-release' as const,
      sourceId: 'r1',
      title: 'Release',
      siteId: 'site-a',
      publicationId: 'pub-a',
      spaceId: 'space-a',
      startsAt: null,
      timeZone: 'America/Chicago',
      status: 'draft',
      editHref: '/',
    }
    expect(isInScope(entry, { siteId: 'site-a', publicationId: 'pub-a', spaceId: 'space-a' })).toBe(
      true,
    )
    expect(isInScope(entry, { siteId: 'site-b' })).toBe(false)
    expect(unscheduled([entry])).toEqual([entry])
  })
  it('requires IANA timezones and registers approved template variants', () => {
    expect(() => assertIanaTimeZone('Not/AZone')).toThrow('IANA')
    expect(graphicTemplatePresets['article-social']).toMatchObject({ width: 1080, height: 1080 })
    expect(graphicTemplatePresets.og.preset).toBe('og')
  })
})
