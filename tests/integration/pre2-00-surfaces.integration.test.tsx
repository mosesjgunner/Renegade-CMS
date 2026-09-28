/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import {
  resolveDiscoveryDocument,
  discoveryToMetadata,
  serializeJsonLd,
} from '../../src/modules/public/discovery'
import {
  resolveTheme,
  resolveSurfaceTemplate,
  isSupportedSurface,
  supportedSurfaces,
  UnsupportedSurfaceGapError,
} from '../../src/modules/presentation/registry'
import { PresentationSurface } from '../../src/modules/presentation/Surface'
import { TemplateInspector } from '../../src/modules/presentation/TemplateInspector'
import { podcastRss } from '../../src/modules/media/publishing'
import { eventIcs } from '../../src/modules/events/contracts'
import { EditorialArticleView } from '../../src/modules/editorial/ArticleView'
import type { Surface } from '../../src/modules/presentation/contracts'
import { isRegisteredCollection } from '../../src/modules/public/registered-collections'

let payload: Payload
let siteId: string
let publicationId: string
let suffix: string

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)

  const pub = (
    await payload.find({
      collection: 'publications',
      where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as any

  expect(pub).toBeTruthy()
  publicationId = String(pub.id)
  siteId = typeof pub.site === 'string' ? pub.site : String(pub.site?.id ?? '')
  suffix = randomUUID().slice(0, 8)
})

afterAll(async () => {
  await payload?.db?.destroy?.()
})

describe('PRE2-00 Public HTML Surfaces & Template Resolver Gate Integration Suite', () => {
  it('1. Publishes representative records across all existing domains and verifies presentation resolution & SSR HTML', async () => {
    // -------------------------------------------------------------
    // Domain A: Article (Content)
    // -------------------------------------------------------------
    const articleSlug = `art-${suffix}`
    const articlePath = `/${articleSlug}`
    const article = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        slug: articleSlug,
        canonicalPath: articlePath,
        title: `Representative Article ${suffix}`,
        summary: 'Article summary for presentation gate test.',
        status: 'published',
        visibility: 'public',
        contentType: 'article',
      },
      overrideAccess: true,
    } as never)) as any

    const articleDiscovery = await resolveDiscoveryDocument(payload, {
      path: articlePath,
      record: article,
      collection: 'content',
      siteId,
    })
    const articleMeta = discoveryToMetadata(articleDiscovery)
    expect(articleDiscovery.canonicalUrl).toContain(articlePath)
    expect(articleMeta.title).toBe(article.title)

    const articleHtml = renderToStaticMarkup(
      <PresentationSurface surface="article" record={article} themeId="neutral-starter">
        <main>
          <h1>{article.title}</h1>
        </main>
      </PresentationSurface>,
    )
    expect(articleHtml).toContain('data-surface="article"')
    expect(articleHtml).toContain('data-testid="template-inspector"')
    expect(articleHtml).toContain('data-template-id="article"')
    expect(articleHtml).toContain('data-template-level="type_template"')
    expect(articleHtml).toContain(article.title)

    // -------------------------------------------------------------
    // Domain B: Page (Content)
    // -------------------------------------------------------------
    const pageSlug = `page-${suffix}`
    const pagePath = `/${pageSlug}`
    const page = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        slug: pageSlug,
        canonicalPath: pagePath,
        title: `Representative Page ${suffix}`,
        status: 'published',
        visibility: 'public',
        contentType: 'page',
      },
      overrideAccess: true,
    } as never)) as any

    const pageHtml = renderToStaticMarkup(
      <PresentationSurface surface="page" record={page} themeId="neutral-starter">
        <main>
          <h1>{page.title}</h1>
        </main>
      </PresentationSurface>,
    )
    expect(pageHtml).toContain('data-surface="page"')
    expect(pageHtml).toContain('data-template-id="page"')
    expect(pageHtml).toContain('data-template-level="type_template"')

    // -------------------------------------------------------------
    // Domain C: Custom Page (Page Layout)
    // -------------------------------------------------------------
    const layoutPath = `/layout-${suffix}`
    const layout = (await payload.create({
      collection: 'page-layouts',
      data: {
        site: siteId,
        name: `Custom Landing Page ${suffix}`,
        path: layoutPath,
        status: 'published',
        visibility: 'public',
        themeId: 'neutral-starter',
        templateVariant: 'custom-page-landing',
      },
      overrideAccess: true,
    } as never)) as any

    const layoutHtml = renderToStaticMarkup(
      <PresentationSurface
        surface="custom-page"
        record={{ ...layout, templateVariant: 'custom-page-landing' }}
        themeId="neutral-starter"
      >
        <main>
          <h1>{layout.name}</h1>
        </main>
      </PresentationSurface>,
    )
    expect(layoutHtml).toContain('data-surface="custom-page"')
    expect(layoutHtml).toContain('data-template-id="custom-page-landing"')
    expect(layoutHtml).toContain('data-template-level="conditional_variant"')

    // -------------------------------------------------------------
    // Domain D: Book & Chapter
    // -------------------------------------------------------------
    const bookSlug = `book-${suffix}`
    const bookPath = `/${bookSlug}`
    const book = isRegisteredCollection(payload, 'books')
      ? ((await payload.create({
          collection: 'books',
          data: {
            site: siteId,
            title: `Representative Book ${suffix}`,
            slug: bookSlug,
            canonicalPath: bookPath,
            status: 'published',
            visibility: 'public',
          },
          overrideAccess: true,
        } as never)) as any)
      : {
          id: `book-${suffix}`,
          site: siteId,
          title: `Representative Book ${suffix}`,
          slug: bookSlug,
          canonicalPath: bookPath,
          status: 'published',
          visibility: 'public',
        }

    const bookHtml = renderToStaticMarkup(
      <PresentationSurface surface="book" record={book} themeId="neutral-starter">
        <main>
          <h1>{book.title}</h1>
        </main>
      </PresentationSurface>,
    )
    expect(bookHtml).toContain('data-surface="book"')
    expect(bookHtml).toContain('data-template-id="book"')
    expect(bookHtml).toContain('data-template-level="type_template"')

    // -------------------------------------------------------------
    // Domain E: Podcast Series & Episode
    // -------------------------------------------------------------
    const podcastSlug = `podcast-${suffix}`
    const podcast = isRegisteredCollection(payload, 'podcasts')
      ? ((await payload.create({
          collection: 'podcasts',
          data: {
            site: siteId,
            title: `Representative Podcast ${suffix}`,
            slug: podcastSlug,
            canonicalPath: `/podcasts/${podcastSlug}`,
            status: 'published',
            visibility: 'public',
          },
          overrideAccess: true,
        } as never)) as any)
      : {
          id: `pod-${suffix}`,
          site: siteId,
          title: `Representative Podcast ${suffix}`,
          slug: podcastSlug,
          canonicalPath: `/podcasts/${podcastSlug}`,
          status: 'published',
          visibility: 'public',
        }

    const podcastHtml = renderToStaticMarkup(
      <PresentationSurface surface="podcast" record={podcast} themeId="neutral-starter">
        <div>Podcast Detail View</div>
      </PresentationSurface>,
    )
    expect(podcastHtml).toContain('data-surface="podcast"')
    expect(podcastHtml).toContain('data-template-id="podcast"')

    const episodeSlug = `ep-${suffix}`
    const episode = isRegisteredCollection(payload, 'podcast-episodes')
      ? ((await payload.create({
          collection: 'podcast-episodes',
          data: {
            site: siteId,
            podcast: podcast.id,
            title: `Episode 1 - ${suffix}`,
            slug: episodeSlug,
            canonicalPath: `/podcasts/episodes/${episodeSlug}`,
            status: 'published',
            visibility: 'public',
          },
          overrideAccess: true,
        } as never)) as any)
      : {
          id: `ep-${suffix}`,
          site: siteId,
          podcast: podcast.id,
          title: `Episode 1 - ${suffix}`,
          slug: episodeSlug,
          canonicalPath: `/podcasts/episodes/${episodeSlug}`,
          status: 'published',
          visibility: 'public',
        }

    const episodeHtml = renderToStaticMarkup(
      <PresentationSurface surface="podcast-episode" record={episode} themeId="neutral-starter">
        <div>Episode Audio Player</div>
      </PresentationSurface>,
    )
    expect(episodeHtml).toContain('data-surface="podcast-episode"')
    expect(episodeHtml).toContain('data-template-id="podcast-episode"')

    // -------------------------------------------------------------
    // Domain F: Video
    // -------------------------------------------------------------
    const videoSlug = `video-${suffix}`
    const video = isRegisteredCollection(payload, 'videos')
      ? ((await payload.create({
          collection: 'videos',
          data: {
            site: siteId,
            title: `Representative Video ${suffix}`,
            slug: videoSlug,
            canonicalPath: `/videos/${videoSlug}`,
            status: 'published',
            visibility: 'public',
            templateVariant: 'video-featured',
          },
          overrideAccess: true,
        } as never)) as any)
      : {
          id: `vid-${suffix}`,
          site: siteId,
          title: `Representative Video ${suffix}`,
          slug: videoSlug,
          canonicalPath: `/videos/${videoSlug}`,
          status: 'published',
          visibility: 'public',
          templateVariant: 'video-featured',
        }

    const videoHtml = renderToStaticMarkup(
      <PresentationSurface surface="video" record={video} themeId="neutral-starter">
        <div>Video Player Surface</div>
      </PresentationSurface>,
    )
    expect(videoHtml).toContain('data-surface="video"')
    expect(videoHtml).toContain('data-template-id="video-featured"')
    expect(videoHtml).toContain('data-template-level="conditional_variant"')

    // -------------------------------------------------------------
    // Domain G: Product (Commerce)
    // -------------------------------------------------------------
    const productSlug = `prod-${suffix}`
    const product = isRegisteredCollection(payload, 'products')
      ? ((await payload.create({
          collection: 'products',
          data: {
            site: siteId,
            name: `Test Product ${suffix}`,
            slug: productSlug,
            canonicalPath: `/store/${productSlug}`,
            state: 'published',
            visibility: 'public',
            basePrice: 2500,
            currency: 'USD',
          },
          overrideAccess: true,
        } as never)) as any)
      : {
          id: `prod-${suffix}`,
          site: siteId,
          name: `Test Product ${suffix}`,
          slug: productSlug,
          canonicalPath: `/store/${productSlug}`,
          state: 'published',
          visibility: 'public',
          basePrice: 2500,
          currency: 'USD',
        }

    const productHtml = renderToStaticMarkup(
      <PresentationSurface surface="product" record={product} themeId="neutral-starter">
        <div>Product Buy Box & Description</div>
      </PresentationSurface>,
    )
    expect(productHtml).toContain('data-surface="product"')
    expect(productHtml).toContain('data-template-id="product"')

    // -------------------------------------------------------------
    // Domain H: Event
    // -------------------------------------------------------------
    const eventSlug = `event-${suffix}`
    const event = isRegisteredCollection(payload, 'events')
      ? ((await payload.create({
          collection: 'events',
          data: {
            site: siteId,
            title: `Community Summit ${suffix}`,
            slug: eventSlug,
            canonicalPath: `/events/${eventSlug}`,
            status: 'published',
            visibility: 'public',
            startsAt: new Date(Date.now() + 86400000).toISOString(),
            timeZone: 'UTC',
          },
          overrideAccess: true,
        } as never)) as any)
      : {
          id: `event-${suffix}`,
          site: siteId,
          title: `Community Summit ${suffix}`,
          slug: eventSlug,
          canonicalPath: `/events/${eventSlug}`,
          status: 'published',
          visibility: 'public',
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          timeZone: 'UTC',
        }

    const eventHtml = renderToStaticMarkup(
      <PresentationSurface surface="event" record={event} themeId="neutral-starter">
        <div>Event Registration & Calendar Link</div>
      </PresentationSurface>,
    )
    expect(eventHtml).toContain('data-surface="event"')
    expect(eventHtml).toContain('data-template-id="event"')

    // -------------------------------------------------------------
    // Domain I: Forum & Discussion
    // -------------------------------------------------------------
    const forumSlug = `forum-${suffix}`
    const forum = isRegisteredCollection(payload, 'forums')
      ? ((await payload.create({
          collection: 'forums',
          data: {
            site: siteId,
            title: `Community Discussion ${suffix}`,
            slug: forumSlug,
            canonicalPath: `/forums/${forumSlug}`,
            status: 'published',
            visibility: 'public',
          },
          overrideAccess: true,
        } as never)) as any)
      : {
          id: `forum-${suffix}`,
          site: siteId,
          title: `Community Discussion ${suffix}`,
          slug: forumSlug,
          canonicalPath: `/forums/${forumSlug}`,
          status: 'published',
          visibility: 'public',
        }

    const forumHtml = renderToStaticMarkup(
      <PresentationSurface surface="forum" record={forum} themeId="neutral-starter">
        <div>Forum Topics List</div>
      </PresentationSurface>,
    )
    expect(forumHtml).toContain('data-surface="forum"')
    expect(forumHtml).toContain('data-template-id="forum"')

    // -------------------------------------------------------------
    // Domain J: Topic Archive
    // -------------------------------------------------------------
    const topicSlug = `topic-${suffix}`
    const topic = isRegisteredCollection(payload, 'topics')
      ? ((await payload.create({
          collection: 'topics',
          data: {
            site: siteId,
            publication: publicationId,
            name: `Engineering ${suffix}`,
            slug: topicSlug,
            canonicalPath: `/${topicSlug}`,
          },
          overrideAccess: true,
        } as never)) as any)
      : {
          id: `topic-${suffix}`,
          site: siteId,
          publication: publicationId,
          name: `Engineering ${suffix}`,
          slug: topicSlug,
          canonicalPath: `/${topicSlug}`,
        }

    const topicHtml = renderToStaticMarkup(
      <PresentationSurface surface="archive" record={topic} themeId="neutral-starter">
        <div>Topic Article Feed</div>
      </PresentationSurface>,
    )
    expect(topicHtml).toContain('data-surface="archive"')
    expect(topicHtml).toContain('data-template-id="archive"')

    // -------------------------------------------------------------
    // Domain K: Member Profile
    // -------------------------------------------------------------
    const memberHandle = `author_${suffix}`
    const profileHtml = renderToStaticMarkup(
      <PresentationSurface
        surface="profile"
        record={{ handle: memberHandle, displayName: 'Dr. Jane Author' }}
        themeId="neutral-starter"
      >
        <div>Author Profile & Bio</div>
      </PresentationSurface>,
    )
    expect(profileHtml).toContain('data-surface="profile"')
    expect(profileHtml).toContain('data-template-id="profile"')
  })

  it('2. Enforces explicit gap for unsupported domains without fake templates', () => {
    // 1. Throws UnsupportedSurfaceGapError when attempting to resolve an unsupported domain
    expect(() =>
      resolveSurfaceTemplate({
        theme: resolveTheme('neutral-starter'),
        surface: 'unsupported-custom-domain' as Surface,
      }),
    ).toThrow(UnsupportedSurfaceGapError)

    // 2. PresentationSurface renders explicit gap HTML element rather than a synthetic template
    const gapHtml = renderToStaticMarkup(
      <PresentationSurface
        surface={'unsupported-custom-domain' as Surface}
        themeId="neutral-starter"
      >
        <div>Content that should be blocked</div>
      </PresentationSurface>,
    )

    expect(gapHtml).toContain('data-testid="unsupported-domain-gap"')
    expect(gapHtml).toContain('data-presentation-gap="unsupported-domain"')
    expect(gapHtml).toContain('Explicit Domain Gap: Unsupported Domain')
    expect(gapHtml).toContain('unsupported-custom-domain')
    expect(gapHtml).not.toContain('Content that should be blocked')
  })

  it('3. Preserves specialized behaviors: podcast RSS, event ICS, and canonical metadata', () => {
    // Podcast RSS generation
    const feedXml = podcastRss({
      title: 'Preserved Podcast Feed',
      description: 'Preserved feed description',
      siteUrl: 'https://example.com',
      path: '/podcasts/test/feed.xml',
      episodes: [
        {
          id: 'ep-1',
          title: 'Episode 1',
          slug: 'ep-1',
          description: 'Episode 1 notes',
          audioUrl: 'https://cdn.example.com/audio1.mp3',
          bytes: 1234567,
          mimeType: 'audio/mpeg',
          publishedAt: new Date().toISOString(),
          guid: 'ep-1-guid',
        },
      ],
    })
    expect(feedXml).toContain('<?xml')
    expect(feedXml).toContain('<rss')
    expect(feedXml).toContain('<enclosure url="https://cdn.example.com/audio1.mp3"')

    // Event ICS calendar generation
    const icsContent = eventIcs(
      {
        id: 'summit-2026',
        title: 'Renegade Summit',
        summary: 'Annual gathering',
        status: 'published' as any,
        occurrenceStartsAt: new Date(Date.now() + 86400000).toISOString(),
        occurrenceEndsAt: new Date(Date.now() + 90000000).toISOString(),
        venueName: 'Civic Center',
      } as any,
      'https://example.com/events/summit',
    )
    expect(icsContent).toContain('BEGIN:VCALENDAR')
    expect(icsContent).toContain('SUMMARY:Renegade Summit')
    expect(icsContent).toContain('END:VCALENDAR')
  })

  it('4. Enforces 4-tier precedence: entry override > conditional variant > type template > site default', () => {
    const theme = resolveTheme('neutral-starter')

    // Tier 1: Entry Override
    const t1 = resolveSurfaceTemplate({
      theme,
      surface: 'article',
      entryOverride: 'article-editorial',
      conditionalVariant: 'article',
      siteDefault: 'article',
    })
    expect(t1.level).toBe('entry_override')
    expect(t1.selectedTemplateId).toBe('article-editorial')

    // Tier 2: Conditional Variant
    const t2 = resolveSurfaceTemplate({
      theme,
      surface: 'video',
      conditionalVariant: 'video-featured',
    })
    expect(t2.level).toBe('conditional_variant')
    expect(t2.selectedTemplateId).toBe('video-featured')

    // Tier 3: Type Template
    const t3 = resolveSurfaceTemplate({
      theme,
      surface: 'event',
    })
    expect(t3.level).toBe('type_template')
    expect(t3.selectedTemplateId).toBe('event')

    // Tier 4: Site Default
    const themeWithoutPodcast = {
      ...theme,
      templateRegistry: { ...theme.templateRegistry },
    }
    delete (themeWithoutPodcast.templateRegistry as Record<string, unknown>)['podcast']

    const t4 = resolveSurfaceTemplate({
      theme: themeWithoutPodcast,
      surface: 'podcast',
      siteDefault: 'page',
    })
    expect(t4.level).toBe('site_default')
    expect(t4.selectedTemplateId).toBe('page')
  })
})
