import type { Payload, SanitizedConfig } from 'payload'
import { getPayload } from 'payload'

type Collection = Parameters<Payload['find']>[0]['collection']

type UpsertArgs = {
  collection: Collection
  data: Record<string, unknown>
  where: Record<string, { equals: unknown }>
}

async function upsert(payload: Payload, { collection, data, where }: UpsertArgs) {
  const existing = await payload.find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.docs[0]) {
    return payload.update({ collection, id: existing.docs[0].id, data, overrideAccess: true })
  }

  return payload.create({ collection, data, overrideAccess: true })
}

const rel = (relationTo: string, value: unknown) => ({ relationTo, value })

export async function seed(payload: Payload): Promise<void> {
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      ownerKind: 'organization',
      organizationName: 'Civic Demo Studio',
      defaultTitle: 'Civic Demo Studio',
      defaultDescription: 'A neutral fixture proving the portable publishing foundation.',
      sameAs: ['https://example.test/civic-demo'],
      robotsDefaults: { index: true, follow: true },
      inheritancePolicy: 'site-publication-brand',
      structuredDataMode: 'manual',
      structuredDataPrimaryType: 'Organization',
      structuredDataVersion: 1,
    },
    overrideAccess: true,
  })
  const site = await upsert(payload, {
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    data: {
      name: 'Demo Publication',
      slug: 'demo-publication',
      description: 'A neutral fixture proving the portable publishing foundation.',
      lifecycle: 'active',
    },
  })

  const brand = await upsert(payload, {
    collection: 'brands',
    where: { name: { equals: 'Civic Demo Studio' } },
    data: {
      name: 'Civic Demo Studio',
      legalName: 'Civic Demo Studio',
      kind: 'organization',
      tagline: 'Portable publishing fixtures for local verification.',
      mission:
        'Demonstrate canonical ownership, publishing, media, and community records without partisan content.',
      audience: 'Operators validating a local CMS installation.',
      voice: 'Clear, practical, and neutral.',
      vocabulary: ['publication', 'source', 'calendar', 'discussion'],
      avoidedPhrases: ['breaking', 'exclusive'],
      colors: { primary: '#1f6f78', accent: '#b84a39' },
      typography: { heading: 'system', body: 'system' },
    },
  })

  const mainPublication = await upsert(payload, {
    collection: 'publications',
    where: { slug: { equals: 'main' } },
    data: {
      site: site.id,
      name: 'Main Demo Publication',
      slug: 'main',
      canonicalBasePath: '/',
      status: 'active',
      visibility: 'public',
      brand: brand.id,
      capabilities: [
        { key: 'publication.content', status: 'enabled' },
        { key: 'publication.discussions', status: 'enabled' },
        { key: 'publication.calendar', status: 'enabled' },
      ],
      navigation: [{ label: 'Notes', href: '/sections/notes' }],
      feeds: [{ kind: 'rss', path: '/feed.xml' }],
    },
  })

  const member = await upsert(payload, {
    collection: 'members',
    where: { email: { equals: 'river@example.test' } },
    data: { displayName: 'River Morgan', email: 'river@example.test', status: 'active' },
  })

  const profile = await upsert(payload, {
    collection: 'profiles',
    where: { member: { equals: member.id } },
    data: {
      member: member.id,
      displayName: 'River Morgan',
      handle: 'river-morgan',
      bio: 'A demo member profile used for ownership and authorship tests.',
      visibility: 'public',
      fieldAudience: { email: 'private', bio: 'public' },
    },
  })

  const space = await upsert(payload, {
    collection: 'spaces',
    where: { handle: { equals: 'river-morgan' } },
    data: {
      member: member.id,
      profile: profile.id,
      handle: 'river-morgan',
      canonicalPath: '/members/river-morgan',
      displayName: 'River Morgan Space',
      bio: 'Member-owned demo space.',
      visibility: 'public',
      capabilities: [
        { key: 'space.blog', status: 'enabled' },
        { key: 'space.albums', status: 'enabled' },
        { key: 'space.calendar', status: 'disabled' },
      ],
      providerOwnership: { local: true },
      moderationState: 'clear',
    },
  })

  await upsert(payload, {
    collection: 'publications',
    where: { slug: { equals: 'river-morgan' } },
    data: {
      site: site.id,
      owner: member.id,
      space: space.id,
      name: 'River Morgan Blog',
      slug: 'river-morgan',
      canonicalBasePath: '/blogs/river-morgan',
      status: 'active',
      visibility: 'public',
      brand: brand.id,
      profile: profile.id,
      capabilities: [{ key: 'publication.content', status: 'enabled' }],
    },
  })

  const memberAuthor = await upsert(payload, {
    collection: 'authors',
    where: { slug: { equals: 'river-morgan' } },
    data: {
      displayName: 'River Morgan',
      slug: 'river-morgan',
      member: member.id,
      bio: 'Demo member author.',
    },
  })

  const guestAuthor = await upsert(payload, {
    collection: 'authors',
    where: { slug: { equals: 'casey-guest' } },
    data: {
      displayName: 'Casey Guest',
      slug: 'casey-guest',
      bio: 'Guest contributor without a canonical member account.',
      website: 'https://example.test/casey',
    },
  })

  await upsert(payload, {
    collection: 'brands',
    where: { name: { equals: 'Civic Demo Studio' } },
    data: { primaryAuthor: memberAuthor.id },
  })

  const section = await upsert(payload, {
    collection: 'sections',
    where: { slug: { equals: 'notes' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      scope: 'publication',
      name: 'Notes',
      slug: 'notes',
      description: 'General demo notes.',
      sortOrder: 10,
    },
  })

  const category = await upsert(payload, {
    collection: 'categories',
    where: { canonicalPath: { equals: '/categories/notes/field-reports' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      scope: 'publication',
      section: section.id,
      name: 'Field Reports',
      slug: 'field-reports',
      canonicalPath: '/categories/notes/field-reports',
      description: 'First-level demo category.',
      sortOrder: 20,
    },
  })

  const subcategory = await upsert(payload, {
    collection: 'categories',
    where: { canonicalPath: { equals: '/categories/notes/field-reports/meetups' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      scope: 'publication',
      section: section.id,
      parent: category.id,
      name: 'Meetups',
      slug: 'meetups',
      canonicalPath: '/categories/notes/field-reports/meetups',
      description: 'Second-level demo category.',
      sortOrder: 30,
    },
  })

  const tag = await upsert(payload, {
    collection: 'tags',
    where: { slug: { equals: 'demo' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      scope: 'publication',
      name: 'Demo',
      slug: 'demo',
    },
  })

  const source = await upsert(payload, {
    collection: 'sources',
    where: { url: { equals: 'https://example.test/source/demo-report' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      title: 'Demo Reference Report',
      publisher: 'Example Test Archive',
      authors: ['A. Example'],
      url: 'https://example.test/source/demo-report',
      publishedAt: '2026-01-15T00:00:00.000Z',
      accessedAt: '2026-08-13T00:00:00.000Z',
      sourceType: 'report',
      excerpt: 'A short neutral source excerpt for fixture data.',
      quoteMetadata: { page: 3 },
      archiveMetadata: { captured: false },
      credibilityNotes: 'Private staff-only assessment for verification.',
      editorialNotes: 'Private editorial note that must not appear in public projections.',
      reuseNotes: 'Reusable source for seeded article and discussion post.',
    },
  })

  const media = await upsert(payload, {
    collection: 'media-assets',
    where: { storageLocation: { equals: 'local://demo/shared-photo.jpg' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      title: 'Shared Demo Photo',
      kind: 'image',
      storageLocation: 'local://demo/shared-photo.jpg',
      storageProvider: 'local',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      width: 1600,
      height: 900,
      altText: 'A neutral demo image placeholder.',
      caption: 'Shared media referenced by content and albums.',
      tags: [tag.id],
      variants: [
        {
          label: 'thumbnail',
          location: 'local://demo/shared-photo-thumb.jpg',
          mimeType: 'image/jpeg',
        },
      ],
      originalExportAllowed: true,
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  const article = await upsert(payload, {
    collection: 'content',
    where: { canonicalPath: { equals: '/notes/demo-field-report' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      contentType: 'article',
      title: 'Demo Field Report',
      slug: 'demo-field-report',
      canonicalPath: '/notes/demo-field-report',
      summary: 'Neutral seeded article used for canonical IA tests.',
      status: 'published',
      publishedAt: '2026-08-13T12:00:00.000Z',
      authors: [
        { author: memberAuthor.id, displayOrder: 1, role: 'Reporter' },
        { author: guestAuthor.id, displayOrder: 2, role: 'Contributor' },
      ],
      sections: [section.id],
      categories: [category.id, subcategory.id],
      tags: [tag.id],
      heroMedia: media.id,
      commentsPolicy: 'open',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  const album = await upsert(payload, {
    collection: 'albums',
    where: { canonicalPath: { equals: '/albums/demo-portfolio' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      kind: 'portfolio',
      title: 'Demo Portfolio',
      slug: 'demo-portfolio',
      canonicalPath: '/albums/demo-portfolio',
      description: 'Portfolio that references shared media without duplicating bytes.',
      cover: media.id,
      visibility: 'public',
      items: [{ media: media.id, displayOrder: 1, caption: 'Shared media in a portfolio.' }],
      originalDownloadPolicy: 'allowed',
      exifPolicy: 'strip',
      commentsPolicy: 'open',
      moderationState: 'clear',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  await upsert(payload, {
    collection: 'media-usages',
    where: { usageKey: { equals: 'content:demo-field-report:hero' } },
    data: {
      media: media.id,
      usedBy: rel('content', article.id),
      usageKey: 'content:demo-field-report:hero',
      purpose: 'hero',
    },
  })

  await upsert(payload, {
    collection: 'media-usages',
    where: { usageKey: { equals: 'album:demo-portfolio:item-1' } },
    data: {
      media: media.id,
      usedBy: rel('albums', album.id),
      usageKey: 'album:demo-portfolio:item-1',
      purpose: 'inline',
    },
  })

  const openHouseEvent = await upsert(payload, {
    collection: 'events',
    where: { canonicalPath: { equals: '/events/demo-open-house' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      title: 'Demo Open House',
      slug: 'demo-open-house',
      canonicalPath: '/events/demo-open-house',
      summary: 'Canonical native event record linked to a scheduling entry and a timeline.',
      status: 'published',
      allDay: false,
      startsAt: '2026-08-22T18:00:00.000Z',
      endsAt: '2026-08-22T20:00:00.000Z',
      timeZone: 'America/Chicago',
      visibility: 'public',
      venueName: 'Demo Hall',
      venueRegion: 'Chicago, IL',
      attendanceMode: 'hybrid',
      heroMedia: media.id,
      audience: { public: true, members: true },
      seoTitle: 'Demo Open House | Civic Demo Studio',
      seoDescription: 'A native structured event fixture for reconciliation testing.',
      seoCanonicalURL: 'https://example.test/events/demo-open-house',
      seoKeywords: ['demo', 'events'],
      seoFocusKeyphrase: 'demo open house',
      structuredDataMode: 'event-derived',
      structuredDataPrimaryType: 'Event',
      structuredDataSourceCollection: 'calendar-entries',
      structuredDataSourceIdentifier: '/events/demo-open-house',
      structuredDataVersion: 1,
      knowledgeGraphProjectionStatus: 'pending',
      knowledgeGraphNodeKey: 'event:demo-open-house',
      knowledgeGraphProjectionBoundary: {
        canonicalStore: 'postgresql',
        projector: 'neo4j-optional',
        projectedCollections: ['events', 'timelines'],
      },
      importSourceSystem: 'fixture',
      importSourceIdentifier: 'demo-open-house',
      exportFormatVersion: 1,
      exportOwnership: { module: 'calendar.events' },
      publicRenderStrategy: 'event-page',
      publicRenderVariant: 'default-event',
      publicRenderContext: { milestone: 5 },
      eventCardVariant: 'standard-card',
      eventListVariant: 'chronological-list',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  const briefingEvent = await upsert(payload, {
    collection: 'events',
    where: { canonicalPath: { equals: '/events/demo-briefing' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      title: 'Demo Briefing',
      slug: 'demo-briefing',
      canonicalPath: '/events/demo-briefing',
      summary: 'Second native event fixture for ordered timeline queries.',
      status: 'published',
      allDay: false,
      startsAt: '2026-08-18T17:00:00.000Z',
      endsAt: '2026-08-18T18:00:00.000Z',
      timeZone: 'America/Chicago',
      visibility: 'public',
      venueName: 'Civic Press Room',
      venueRegion: 'Chicago, IL',
      attendanceMode: 'in-person',
      heroMedia: media.id,
      seoTitle: 'Demo Briefing | Civic Demo Studio',
      seoDescription: 'A second native event fixture for timeline ordering.',
      seoCanonicalURL: 'https://example.test/events/demo-briefing',
      seoKeywords: ['demo', 'briefing'],
      seoFocusKeyphrase: 'demo briefing',
      structuredDataMode: 'event-derived',
      structuredDataPrimaryType: 'Event',
      structuredDataSourceCollection: 'events',
      structuredDataSourceIdentifier: '/events/demo-briefing',
      structuredDataVersion: 1,
      knowledgeGraphProjectionStatus: 'disabled',
      knowledgeGraphProjectionBoundary: {
        canonicalStore: 'postgresql',
        projector: 'none',
      },
      importSourceSystem: 'fixture',
      importSourceIdentifier: 'demo-briefing',
      exportFormatVersion: 1,
      exportOwnership: { module: 'calendar.events' },
      publicRenderStrategy: 'event-card-list',
      publicRenderVariant: 'briefing-card',
      publicRenderContext: { milestone: 5 },
      eventCardVariant: 'briefing-card',
      eventListVariant: 'briefing-list',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  await upsert(payload, {
    collection: 'media-usages',
    where: { usageKey: { equals: 'event:demo-open-house:hero' } },
    data: {
      media: media.id,
      usedBy: rel('events', openHouseEvent.id),
      usageKey: 'event:demo-open-house:hero',
      purpose: 'hero',
    },
  })

  await upsert(payload, {
    collection: 'media-usages',
    where: { usageKey: { equals: 'event:demo-briefing:hero' } },
    data: {
      media: media.id,
      usedBy: rel('events', briefingEvent.id),
      usageKey: 'event:demo-briefing:hero',
      purpose: 'hero',
    },
  })

  await upsert(payload, {
    collection: 'calendar-entries',
    where: { canonicalPath: { equals: '/internal/demo-ops-window' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      title: 'Demo Operations Window',
      startsAt: '2026-08-20T15:00:00.000Z',
      endsAt: '2026-08-20T16:00:00.000Z',
      timeZone: 'America/Chicago',
      status: 'scheduled',
      visibility: 'private',
      calendarPlacement: 'operations',
      canonicalPath: '/internal/demo-ops-window',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  const openHouseCalendarEntry = await upsert(payload, {
    collection: 'calendar-entries',
    where: { canonicalPath: { equals: '/events/demo-open-house' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      title: 'Demo Open House',
      startsAt: '2026-08-22T18:00:00.000Z',
      endsAt: '2026-08-22T20:00:00.000Z',
      timeZone: 'America/Chicago',
      status: 'scheduled',
      visibility: 'public',
      calendarPlacement: 'events',
      canonicalPath: '/events/demo-open-house',
      event: openHouseEvent.id,
      structuredData: { '@type': 'Event', name: 'Demo Open House' },
      references: [
        rel('content', article.id),
        rel('publications', mainPublication.id),
        rel('media-assets', media.id),
        rel('events', openHouseEvent.id),
      ],
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  await upsert(payload, {
    collection: 'events',
    where: { canonicalPath: { equals: '/events/demo-open-house' } },
    data: {
      calendarEntry: openHouseCalendarEntry.id,
    },
  })

  const civicTimeline = await upsert(payload, {
    collection: 'timelines',
    where: { canonicalPath: { equals: '/timelines/demo-civic-schedule' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      title: 'Demo Civic Schedule',
      slug: 'demo-civic-schedule',
      canonicalPath: '/timelines/demo-civic-schedule',
      summary:
        'A timeline fixture proving native timeline memberships and PostgreSQL-first ordering.',
      status: 'published',
      visibility: 'public',
      orderingMode: 'chronological',
      heroMedia: media.id,
      postgresQueryScope: { canonicalStore: 'postgresql', ordering: 'startsAt' },
      seoTitle: 'Demo Civic Schedule | Civic Demo Studio',
      seoDescription: 'A native timeline fixture for reconciliation testing.',
      seoCanonicalURL: 'https://example.test/timelines/demo-civic-schedule',
      seoKeywords: ['demo', 'timeline'],
      seoFocusKeyphrase: 'demo civic schedule',
      structuredDataMode: 'timeline-derived',
      structuredDataPrimaryType: 'ItemList',
      structuredDataSourceCollection: 'timelines',
      structuredDataSourceIdentifier: '/timelines/demo-civic-schedule',
      structuredDataVersion: 1,
      knowledgeGraphProjectionStatus: 'pending',
      knowledgeGraphNodeKey: 'timeline:demo-civic-schedule',
      knowledgeGraphProjectionBoundary: {
        canonicalStore: 'postgresql',
        projector: 'neo4j-optional',
      },
      importSourceSystem: 'fixture',
      importSourceIdentifier: 'demo-civic-schedule',
      exportFormatVersion: 1,
      exportOwnership: { module: 'calendar.timelines' },
      publicRenderStrategy: 'timeline-page',
      publicRenderVariant: 'default-timeline',
      publicRenderContext: { milestone: 5 },
      eventCardVariant: 'timeline-card',
      eventListVariant: 'timeline-list',
      timelineEmbedVariant: 'embeddable-timeline',
      timelineBlockVariant: 'timeline-block',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  await upsert(payload, {
    collection: 'media-usages',
    where: { usageKey: { equals: 'timeline:demo-civic-schedule:hero' } },
    data: {
      media: media.id,
      usedBy: rel('timelines', civicTimeline.id),
      usageKey: 'timeline:demo-civic-schedule:hero',
      purpose: 'hero',
    },
  })

  await upsert(payload, {
    collection: 'timeline-memberships',
    where: { membershipKey: { equals: `${civicTimeline.id}:${briefingEvent.id}` } },
    data: {
      timeline: civicTimeline.id,
      event: briefingEvent.id,
      displayTitle: 'Opening Briefing',
      displaySummary: 'First item in the seeded native timeline.',
      eraLabel: 'Preparation',
      position: 1,
      displayStartsAt: '2026-08-18T17:00:00.000Z',
      displayEndsAt: '2026-08-18T18:00:00.000Z',
      renderVariant: 'compact-card',
    },
  })

  await upsert(payload, {
    collection: 'timeline-memberships',
    where: { membershipKey: { equals: `${civicTimeline.id}:${openHouseEvent.id}` } },
    data: {
      timeline: civicTimeline.id,
      event: openHouseEvent.id,
      displayTitle: 'Public Open House',
      displaySummary: 'Second item in the seeded native timeline.',
      eraLabel: 'Launch',
      position: 2,
      displayStartsAt: '2026-08-22T18:00:00.000Z',
      displayEndsAt: '2026-08-22T20:00:00.000Z',
      renderVariant: 'featured-card',
    },
  })

  const forumSection = await upsert(payload, {
    collection: 'forum-sections',
    where: { slug: { equals: 'general' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      name: 'General',
      slug: 'general',
      description: 'General demo forum section.',
    },
  })

  const forum = await upsert(payload, {
    collection: 'forums',
    where: { slug: { equals: 'introductions' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      section: forumSection.id,
      name: 'Introductions',
      slug: 'introductions',
      description: 'Demo introductions forum.',
    },
  })

  const attachedDiscussion = await upsert(payload, {
    collection: 'discussions',
    where: { canonicalPath: { equals: '/notes/demo-field-report#discussion' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      kind: 'attached',
      title: 'Discussion for Demo Field Report',
      attachedTo: rel('content', article.id),
      canonicalPath: '/notes/demo-field-report#discussion',
      status: 'open',
      visibility: 'public',
      moderationState: 'clear',
      commentsPolicy: 'open',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  const thread = await upsert(payload, {
    collection: 'discussions',
    where: { canonicalPath: { equals: '/forums/introductions/welcome-thread' } },
    data: {
      site: site.id,
      publication: mainPublication.id,
      owner: member.id,
      kind: 'thread',
      title: 'Welcome Thread',
      forum: forum.id,
      canonicalPath: '/forums/introductions/welcome-thread',
      status: 'open',
      visibility: 'public',
      moderationState: 'clear',
      commentsPolicy: 'open',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  const attachedPost = await upsert(payload, {
    collection: 'discussion-posts',
    where: { permalink: { equals: '/notes/demo-field-report#post-1' } },
    data: {
      discussion: attachedDiscussion.id,
      authorMember: member.id,
      body: 'This seeded comment is attached to an article discussion.',
      displayOrder: 1,
      permalink: '/notes/demo-field-report#post-1',
      paginationAnchor: 'post-1',
      sources: [source.id],
      status: 'published',
      visibility: 'public',
      moderationState: 'clear',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  await upsert(payload, {
    collection: 'discussion-posts',
    where: { permalink: { equals: '/forums/introductions/welcome-thread#post-1' } },
    data: {
      discussion: thread.id,
      authorGuest: guestAuthor.id,
      body: 'This seeded post starts a standalone forum thread.',
      parent: attachedPost.id,
      displayOrder: 1,
      permalink: '/forums/introductions/welcome-thread#post-1',
      paginationAnchor: 'post-1',
      attachments: [media.id],
      status: 'published',
      visibility: 'public',
      moderationState: 'clear',
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: true,
    },
  })

  await upsert(payload, {
    collection: 'relationships',
    where: { pairKey: { equals: `publication-membership:${member.id}:${mainPublication.id}` } },
    data: {
      site: site.id,
      subject: member.id,
      object: rel('publications', mainPublication.id),
      kind: 'publication-membership',
      status: 'active',
      role: 'author',
      visibility: 'private',
      startedAt: '2026-08-13T00:00:00.000Z',
    },
  })

  payload.logger.info('Canonical neutral demo information architecture is ready.')
}

export const script = async (config: SanitizedConfig): Promise<void> => {
  if (process.env.ALLOW_FIXTURE_SEED !== 'true') {
    throw new Error('Fixture seed is disabled. Set ALLOW_FIXTURE_SEED=true for smoke-only data.')
  }
  const payload = await getPayload({ config })
  await seed(payload)
  await payload.db.destroy?.()
  process.exit(0)
}
