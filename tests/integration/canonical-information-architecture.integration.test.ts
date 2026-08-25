/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { down as canonicalDown } from '../../src/migrations/20260813_054441_canonical_information_architecture'
import { seed } from '../../src/scripts/seed'
import {
  canCreateRelationship,
  discoverableRecords,
  orderedAuthors,
  publicSourceProjection,
  queryTimelineEvents,
} from '../../src/modules/publications/information-architecture'

type Collection = Parameters<Payload['find']>[0]['collection']

let payload: Payload

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String(value.id)
  if (value && typeof value === 'object' && 'value' in value) return String(value.value)
  return String(value)
}

async function create(args: Record<string, unknown>): Promise<Record<string, any>> {
  return payload.create(args as never) as Promise<Record<string, any>>
}
async function findOne(collection: Collection, where: Record<string, unknown>) {
  const result = await payload.find({
    collection,
    where: where as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = result.docs[0]
  expect(doc).toBeTruthy()
  return doc as unknown as Record<string, any>
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
})

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('canonical information architecture integration', () => {
  it('keeps main publication, member space, and member blog ownership isolated', async () => {
    const member = await findOne('members', { email: { equals: 'river@example.test' } })
    const space = await findOne('spaces', { handle: { equals: 'river-morgan' } })
    const main = await findOne('publications', { slug: { equals: 'main' } })
    const blog = await findOne('publications', { slug: { equals: 'river-morgan' } })

    expect(main.owner).toBeNull()
    expect(idOf(space.member)).toBe(member.id)
    expect(idOf(blog.owner)).toBe(member.id)
    expect(idOf(blog.space)).toBe(space.id)
    expect(blog.canonicalBasePath).toBe('/blogs/river-morgan')
  })

  it('hides disabled space creation capability without deleting existing records', async () => {
    const space = await findOne('spaces', { handle: { equals: 'river-morgan' } })
    const album = await findOne('albums', { canonicalPath: { equals: '/albums/demo-portfolio' } })

    await payload.update({
      collection: 'spaces',
      id: space.id,
      data: { capabilities: [{ key: 'space.albums', status: 'disabled' }] },
      overrideAccess: true,
    })
    const disabled = await findOne('spaces', { handle: { equals: 'river-morgan' } })
    expect(disabled.capabilities).toEqual([
      { id: expect.any(String), key: 'space.albums', status: 'disabled' },
    ])
    expect(
      (await payload.findByID({ collection: 'albums', id: album.id, overrideAccess: true })).id,
    ).toBe(album.id)

    await payload.update({
      collection: 'spaces',
      id: space.id,
      data: { capabilities: [{ key: 'space.albums', status: 'enabled' }] },
      overrideAccess: true,
    })
    const enabled = await findOne('spaces', { handle: { equals: 'river-morgan' } })
    expect(enabled.capabilities[0].status).toBe('enabled')
  })

  it('uses album visibility and shared media references without byte duplication', async () => {
    const media = await findOne('media-assets', {
      storageLocation: { equals: 'local://demo/shared-photo.jpg' },
    })
    const album = await findOne('albums', { canonicalPath: { equals: '/albums/demo-portfolio' } })
    const usages = await payload.find({
      collection: 'media-usages',
      where: { media: { equals: media.id } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })

    expect(album.visibility).toBe('public')
    expect(idOf(album.cover)).toBe(media.id)
    expect(idOf(album.items[0].media)).toBe(media.id)
    expect(usages.docs.map((usage) => usage.usageKey).sort()).toEqual([
      'album:demo-portfolio:item-1',
      'content:demo-field-report:hero',
      'event:demo-briefing:hero',
      'event:demo-open-house:hero',
      'timeline:demo-civic-schedule:hero',
    ])
  })

  it('enforces relationship uniqueness and active block precedence', async () => {
    const member = await findOne('members', { email: { equals: 'river@example.test' } })
    const publication = await findOne('publications', { slug: { equals: 'main' } })
    const other = await create({
      collection: 'members',
      data: {
        displayName: `Blocked ${randomUUID()}`,
        email: `${randomUUID()}@example.test`,
        status: 'active',
      },
      overrideAccess: true,
    })

    await expect(
      create({
        collection: 'relationships',
        data: {
          site: publication.site,
          subject: member.id,
          object: { relationTo: 'publications', value: publication.id },
          kind: 'publication-membership',
          status: 'active',
          role: 'author',
          visibility: 'private',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()

    await create({
      collection: 'relationships',
      data: {
        site: publication.site,
        subject: member.id,
        object: { relationTo: 'members', value: other.id },
        kind: 'block',
        status: 'active',
        visibility: 'private',
      },
      overrideAccess: true,
    })
    const blocks = await payload.find({
      collection: 'relationships',
      where: { kind: { equals: 'block' } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    const normalizedBlocks = blocks.docs.map((relationship) => ({
      subject: idOf(relationship.subject),
      object: idOf(relationship.object),
      kind: relationship.kind,
      status: relationship.status,
    }))
    expect(canCreateRelationship(normalizedBlocks, member.id, other.id, 'follow')).toBe(false)
  })

  it('enforces discussion shape and keeps post permalinks stable across edits', async () => {
    const post = await findOne('discussion-posts', {
      permalink: { equals: '/notes/demo-field-report#post-1' },
    })
    const forum = await findOne('forums', { slug: { equals: 'introductions' } })

    await expect(
      create({
        collection: 'discussions',
        data: {
          site: forum.site,
          publication: forum.publication,
          kind: 'thread',
          title: 'Invalid',
          canonicalPath: `/invalid/${randomUUID()}`,
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow('standalone thread requires a forum')

    const updated = await payload.update({
      collection: 'discussion-posts',
      id: post.id,
      data: { body: 'Edited body with stable permalink.' },
      overrideAccess: true,
    })
    expect(updated.permalink).toBe('/notes/demo-field-report#post-1')
  })

  it('validates calendar scope, privacy, timezone, and references', async () => {
    const event = await findOne('calendar-entries', {
      canonicalPath: { equals: '/events/demo-open-house' },
    })
    const privateEntry = await findOne('calendar-entries', {
      canonicalPath: { equals: '/internal/demo-ops-window' },
    })

    expect(event.visibility).toBe('public')
    expect(event.timeZone).toBe('America/Chicago')
    expect(event.references).toHaveLength(4)
    expect(privateEntry.visibility).toBe('private')

    await expect(
      create({
        collection: 'calendar-entries',
        data: {
          site: event.site,
          publication: event.publication,
          title: 'Invalid timezone',
          startsAt: '2026-08-22T18:00:00.000Z',
          timeZone: 'Not/AZone',
          canonicalPath: `/events/${randomUUID()}`,
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow('valid IANA timezone')
  })

  it('keeps native events separate from calendar planning entries', async () => {
    const event = await findOne('events', { canonicalPath: { equals: '/events/demo-open-house' } })
    const calendarEntry = await findOne('calendar-entries', {
      canonicalPath: { equals: '/events/demo-open-house' },
    })

    expect(idOf(event.calendarEntry)).toBe(calendarEntry.id)
    expect(idOf(calendarEntry.event)).toBe(event.id)
    expect(event.structuredDataMode).toBe('event-derived')
    expect(event.publicRenderStrategy).toBe('event-page')
    expect(event.eventCardVariant).toBe('standard-card')
  })

  it('queries timelines from PostgreSQL first and filters expired events by retention', async () => {
    const timeline = await findOne('timelines', {
      canonicalPath: { equals: '/timelines/demo-civic-schedule' },
    })
    const site = await findOne('sites', { slug: { equals: 'demo-publication' } })
    const expiredEvent = await create({
      collection: 'events',
      data: {
        site: site.id,
        title: `Expired timeline event ${randomUUID()}`,
        slug: `expired-timeline-event-${randomUUID()}`,
        canonicalPath: `/events/expired-${randomUUID()}`,
        status: 'published',
        allDay: false,
        startsAt: '2026-07-01T17:00:00.000Z',
        endsAt: '2026-07-01T18:00:00.000Z',
        timeZone: 'America/Chicago',
        visibility: 'public',
        attendanceMode: 'in-person',
        structuredDataMode: 'event-derived',
        structuredDataPrimaryType: 'Event',
        structuredDataVersion: 1,
        knowledgeGraphProjectionStatus: 'disabled',
        publicRenderStrategy: 'event-card-list',
        exportFormatVersion: 1,
        retentionMode: 'expire-at',
        retentionExpiresAt: '2026-08-01T00:00:00.000Z',
        retentionHold: 'none',
        removeFromDiscovery: true,
      },
      overrideAccess: true,
    })

    await create({
      collection: 'timeline-memberships',
      data: {
        timeline: timeline.id,
        event: expiredEvent.id,
        position: 99,
      },
      overrideAccess: true,
    })

    const rows = await queryTimelineEvents(
      payload.db.pool as Parameters<typeof queryTimelineEvents>[0],
      timeline.id,
      new Date('2026-08-14T00:00:00.000Z'),
    )

    expect(rows.map((row) => row.eventTitle)).toEqual(['Opening Briefing', 'Public Open House'])
    expect(rows[0]?.eventCardVariant).toBe('briefing-card')
    expect(rows[1]?.timelineEmbedVariant).toBe('embeddable-timeline')
  })

  it('protects taxonomy cycles and records scoped redirect outcomes for moves', async () => {
    const category = await findOne('categories', {
      canonicalPath: { equals: '/categories/notes/field-reports' },
    })
    const subcategory = await findOne('categories', {
      canonicalPath: { equals: '/categories/notes/field-reports/meetups' },
    })

    await expect(
      payload.update({
        collection: 'categories',
        id: category.id,
        data: { parent: subcategory.id },
        overrideAccess: true,
      }),
    ).rejects.toThrow('descendants')

    const fromPath = `/categories/archive/${randomUUID()}`
    const redirect = await create({
      collection: 'taxonomy-redirects',
      data: {
        site: category.site,
        fromPath,
        toPath: subcategory.canonicalPath,
        reason: 'move',
        targetCategory: subcategory.id,
      },
      overrideAccess: true,
    })
    expect(redirect).toMatchObject({
      fromPath,
      toPath: '/categories/notes/field-reports/meetups',
      reason: 'move',
    })
  })

  it('keeps private source notes out of public projections and orders authorship display', async () => {
    const source = await findOne('sources', {
      url: { equals: 'https://example.test/source/demo-report' },
    })
    const content = await findOne('content', {
      canonicalPath: { equals: '/notes/demo-field-report' },
    })
    const projection = publicSourceProjection(source)
    const authorRows = orderedAuthors(
      content.authors.map((row: Record<string, any>) => ({
        displayName: idOf(row.author),
        displayOrder: row.displayOrder,
        role: row.role,
      })),
    )

    expect(source.editorialNotes).toContain('must not appear')
    expect(projection).not.toHaveProperty('editorialNotes')
    expect(projection).not.toHaveProperty('credibilityNotes')
    expect(authorRows.map((row) => row.role)).toEqual(['Reporter', 'Contributor'])
  })

  it('removes expired retained records from discovery while honoring legal holds', async () => {
    const site = await findOne('sites', { slug: { equals: 'demo-publication' } })
    const expired = await create({
      collection: 'content',
      data: {
        site: site.id,
        contentType: 'article',
        title: `Expired ${randomUUID()}`,
        slug: `expired-${randomUUID()}`,
        canonicalPath: `/expired/${randomUUID()}`,
        status: 'published',
        commentsPolicy: 'open',
        retentionMode: 'expire-at',
        retentionExpiresAt: '2026-08-01T00:00:00.000Z',
        retentionHold: 'none',
        removeFromDiscovery: true,
      },
      overrideAccess: true,
    })
    const held = await create({
      collection: 'content',
      data: {
        site: site.id,
        contentType: 'article',
        title: `Held ${randomUUID()}`,
        slug: `held-${randomUUID()}`,
        canonicalPath: `/held/${randomUUID()}`,
        status: 'published',
        commentsPolicy: 'open',
        retentionMode: 'expire-at',
        retentionExpiresAt: '2026-08-01T00:00:00.000Z',
        retentionHold: 'legal',
        removeFromDiscovery: true,
      },
      overrideAccess: true,
    })

    expect(
      discoverableRecords([expired, held] as never, new Date('2026-08-13T00:00:00.000Z')).map(
        (doc) => doc.id,
      ),
    ).toEqual([held.id])
  })

  it('has the migrated canonical tables and refuses unsafe automatic down migration', async () => {
    const tables = await payload.db.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('publications', 'spaces', 'calendar_entries') ORDER BY table_name`,
    )
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      'calendar_entries',
      'publications',
      'spaces',
    ])
    await expect(canonicalDown({} as never)).rejects.toThrow(
      'Refusing to roll back canonical_information_architecture',
    )
  })
})
