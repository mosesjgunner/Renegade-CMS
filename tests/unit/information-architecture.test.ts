import { describe, expect, it } from 'vitest'

import {
  assertAcyclicCategoryMove,
  assertCalendarRange,
  assertDiscussionShape,
  canCreateInSpace,
  canCreateRelationship,
  categoryPath,
  discoverableRecords,
  memberPublicationPath,
  taxonomyRedirect,
} from '../../src/modules/publications/information-architecture'

describe('canonical information architecture contracts', () => {
  it('uses a documented member publication base path and preserves taxonomy redirects', () => {
    expect(memberPublicationPath('lee')).toBe('/blogs/lee')
    expect(categoryPath('/categories/news', 'local')).toBe('/categories/news/local')
    expect(taxonomyRedirect('/categories/news', '/categories/reporting', 'rename')).toEqual({
      fromPath: '/categories/news',
      toPath: '/categories/reporting',
      reason: 'rename',
    })
  })

  it('prevents category cycles', () => {
    const parentById = new Map([
      ['news', null],
      ['local', 'news'],
      ['city-hall', 'local'],
    ])
    expect(() => assertAcyclicCategoryMove('news', 'city-hall', parentById)).toThrow('descendants')
    expect(() => assertAcyclicCategoryMove('city-hall', 'news', parentById)).not.toThrow()
  })

  it('preserves data when a capability is disabled while removing its creation action', () => {
    expect(canCreateInSpace([{ key: 'space.blog', status: 'enabled' }], 'space.blog')).toBe(true)
    expect(canCreateInSpace([{ key: 'space.blog', status: 'disabled' }], 'space.blog')).toBe(false)
  })

  it('gives an active block precedence over follow and membership actions', () => {
    const relationships = [{ subject: 'a', object: 'b', kind: 'block', status: 'active' as const }]
    expect(canCreateRelationship(relationships, 'a', 'b', 'follow')).toBe(false)
    expect(canCreateRelationship(relationships, 'b', 'a', 'publication-membership')).toBe(false)
  })

  it('distinguishes attached discussions from standalone threads', () => {
    expect(() => assertDiscussionShape({ kind: 'attached' })).toThrow('requires')
    expect(() => assertDiscussionShape({ kind: 'thread' })).toThrow('requires')
    expect(() => assertDiscussionShape({ kind: 'attached', attachedTo: 'article-1' })).not.toThrow()
    expect(() => assertDiscussionShape({ kind: 'thread', forum: 'support' })).not.toThrow()
  })

  it('validates calendar timing and removes expired records from discovery', () => {
    expect(() =>
      assertCalendarRange({
        startsAt: '2026-08-12T10:00:00Z',
        endsAt: '2026-08-12T09:00:00Z',
        timeZone: 'America/Chicago',
      }),
    ).toThrow('end before')
    expect(() =>
      assertCalendarRange({ startsAt: '2026-08-12T10:00:00Z', timeZone: 'Not/AZone' }),
    ).toThrow('IANA')
    expect(
      discoverableRecords(
        [
          { id: 'active', retentionMode: 'permanent' },
          {
            id: 'expired',
            retentionMode: 'expire-at',
            retentionExpiresAt: '2026-08-11T00:00:00Z',
            retentionHold: 'none',
          },
          {
            id: 'held',
            retentionMode: 'expire-at',
            retentionExpiresAt: '2026-08-11T00:00:00Z',
            retentionHold: 'legal',
          },
        ],
        new Date('2026-08-12T00:00:00Z'),
      ).map((record) => record.id),
    ).toEqual(['active', 'held'])
  })
})
