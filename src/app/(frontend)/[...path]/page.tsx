import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import { notFound, permanentRedirect, redirect } from 'next/navigation'

import { canRenderPublic, type PublicState } from '@/modules/public/contracts'
import { buildJsonLd, buildMetadata } from '@/modules/public/seo'
import type { Metadata } from 'next'
import { resolveRedirect, type RedirectRule } from '@/modules/public/discovery'
import { PublicLayout } from '@/modules/public/PublicLayout'
import { PublicForm } from '@/modules/audience/PublicForm'
import type { FormField } from '@/modules/audience/contracts'
import { BookReader, isReleasedChapter, relatedId } from '@/modules/media/books'
import { EditorialArticleView } from '@/modules/editorial/ArticleView'
import { loadPublishedArticleByPath } from '@/modules/editorial/persistence'
import { findIfRegistered, registeredOnly } from '@/modules/public/registered-collections'
import { resolveSiteSettings } from '@/modules/core/site-settings'

type Args = {
  params: Promise<{ path: string[] }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}
type PublicRecord = PublicState & Record<string, unknown>

const candidates = [
  'content',
  'books',
  'events',
  'timelines',
  'albums',
  'discussions',
  'products',
] as const

function label(record: PublicRecord): string {
  return String(record.title ?? record.name ?? record.displayName ?? 'Publication')
}

function kind(
  collection: (typeof candidates)[number],
): 'article' | 'event' | 'timeline' | 'album' | 'forum' | 'product' {
  if (collection === 'events') return 'event'
  if (collection === 'timelines') return 'timeline'
  if (collection === 'albums') return 'album'
  if (collection === 'discussions') return 'forum'
  return 'article'
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const path = `/${(await params).path.join('/')}`
  try {
    const payload = await getPayload({ config })
    const settings = await resolveSiteSettings(payload)
    const publications = await payload.find({
      collection: 'publications',
      where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const publication = publications.docs[0] as unknown as Record<string, unknown> | undefined
    const siteId =
      typeof publication?.site === 'string'
        ? publication.site
        : String((publication?.site as { id?: unknown } | undefined)?.id ?? '')
    const layoutFound = await payload.find({
      collection: 'page-layouts',
      where: { and: [{ path: { equals: path } }, { site: { equals: siteId } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const layout = layoutFound.docs[0] as unknown as PublicRecord | undefined
    if (layout && canRenderPublic(layout)) {
      return buildMetadata({
        ...layout,
        title:
          label(layout) !== 'Publication'
            ? label(layout)
            : path.slice(1).replace(/-/g, ' ') || 'Home',
        canonicalPath: path,
        siteUrl: settings.canonicalOrigin,
        siteNoIndex: settings.indexingMode === 'noindex',
      })
    }
    for (const collection of registeredOnly(payload, candidates)) {
      const found = await payload.find({
        collection,
        where: { and: [{ canonicalPath: { equals: path } }, { site: { equals: siteId } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      const record = found.docs[0] as unknown as PublicRecord | undefined
      if (record && canRenderPublic(record))
        return buildMetadata({
          ...record,
          title: label(record),
          description:
            typeof record.summary === 'string'
              ? record.summary
              : typeof record.description === 'string'
                ? record.description
                : null,
          canonicalPath: path,
          siteUrl: settings.canonicalOrigin,
          siteNoIndex: settings.indexingMode === 'noindex',
        })
    }
  } catch {
    /* safe noindex fallback during recovery */
  }
  return { robots: { index: false, follow: false } }
}

export default async function CanonicalPublicPage({ params, searchParams }: Args) {
  const path = `/${(await params).path.join('/')}`
  const query = new URLSearchParams(
    Object.entries((await searchParams) ?? {}).flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map((entry) => [key, entry])
        : value === undefined
          ? []
          : [[key, value]],
    ),
  ).toString()
  const payload = await getPayload({ config })

  const publications = await payload.find({
    collection: 'publications',
    where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const publication = publications.docs[0] as unknown as Record<string, unknown> | undefined
  if (!publication) notFound()
  const siteId =
    typeof publication.site === 'string'
      ? publication.site
      : String((publication.site as { id?: unknown } | undefined)?.id ?? '')

  const redirects = await payload
    .find({
      collection: 'public-redirects',
      where: { site: { equals: siteId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => ({ docs: [] }))
  const resolution = resolveRedirect(
    (redirects.docs as unknown as Array<Record<string, unknown>>).map((item) => ({
      id: String(item.id),
      siteId,
      fromPath: String(item.fromPath),
      toPath: String(item.toPath),
      match: item.match as RedirectRule['match'],
      statusCode: Number(item.statusCode) as RedirectRule['statusCode'],
      preserveQuery: item.preserveQuery !== false,
      enabled: item.enabled !== false,
    })),
    siteId,
    path,
    query ? `?${query}` : '',
  )
  if (resolution && 'target' in resolution) {
    // Best-effort telemetry must not make a redirect unavailable.
    await Promise.all(
      resolution.ruleIds.map((id) =>
        payload.update({
          collection: 'public-redirects',
          id,
          data: {
            hitCount:
              Number(
                (redirects.docs as Array<{ id: unknown; hitCount?: unknown }>).find(
                  (rule) => String(rule.id) === id,
                )?.hitCount ?? 0,
              ) + 1,
            lastHitAt: new Date().toISOString(),
          },
          overrideAccess: true,
        } as never),
      ),
    ).catch(() => undefined)

    // Add additional redirect metadata for analytics
    try {
      const reqHeaders = await (await import('next/headers')).headers()
      const userAgent = reqHeaders.get('user-agent') ?? 'unknown'
      const referer = reqHeaders.get('referer') ?? 'direct'

      // Log redirect event for analytics (in a real implementation, this would go to an analytics service)
      console.log('Redirect event:', {
        from: path,
        to: resolution.target,
        statusCode: resolution.statusCode,
        userAgent,
        referer,
        timestamp: new Date().toISOString(),
      })
    } catch {
      // Ignore analytics logging errors
    }

    if (resolution.statusCode === 301 || resolution.statusCode === 308)
      permanentRedirect(resolution.target)
    redirect(resolution.target)
  }
  if (resolution) notFound()

  const formResult = await findIfRegistered(payload, {
    collection: 'form-definitions',
    where: { and: [{ publicPath: { equals: path } }, { site: { equals: siteId } }] },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  } as never)
  const form = formResult.docs[0] as unknown as {
    id: string
    name: string
    visibility: string
    activeSchema?: {
      schema?: { fields?: FormField[] }
      consentText?: string
      state?: string
    }
  }
  if (form) {
    const schema = form.activeSchema
    if (form.visibility !== 'public' || schema?.state !== 'published' || !schema.schema?.fields)
      notFound()
    return (
      <main className="max-w-xl mx-auto px-6 py-20">
        <section className="surface-card p-8 space-y-6">
          <h1 className="text-3xl font-bold">{form.name}</h1>
          <PublicForm
            formId={form.id}
            fields={schema.schema.fields}
            consentText={schema.consentText}
          />
        </section>
      </main>
    )
  }

  const layoutResult = await payload.find({
    collection: 'page-layouts',
    where: { and: [{ path: { equals: path } }, { site: { equals: siteId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const layoutRecord = layoutResult.docs[0] as unknown as PublicRecord | undefined
  if (layoutRecord) {
    if (!canRenderPublic(layoutRecord)) notFound()
    return <PublicLayout record={layoutRecord} path={path} />
  }

  let editorialArticle: Awaited<ReturnType<typeof loadPublishedArticleByPath>> | undefined
  try {
    editorialArticle = await loadPublishedArticleByPath(payload, { siteId, path })
  } catch {
    // Continue to non-editorial canonical collections below.
  }
  if (editorialArticle) {
    return <EditorialArticleView article={editorialArticle} />
  }

  const bookResult = await findIfRegistered(payload, {
    collection: 'books',
    where: { and: [{ site: { equals: siteId } }, { canonicalPath: { equals: path } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const book = bookResult.docs[0] as unknown as PublicRecord | undefined
  if (book && canRenderPublic(book)) {
    const chapters = (
      await payload.find({
        collection: 'book-chapters',
        where: { book: { equals: String(book.id) } },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs as unknown as PublicRecord[]
    return <BookReader book={book} chapters={chapters} />
  }
  const chapterResult = await findIfRegistered(payload, {
    collection: 'book-chapters',
    where: { canonicalPath: { equals: path } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const chapter = chapterResult.docs[0] as unknown as PublicRecord | undefined
  if (chapter && isReleasedChapter(chapter)) {
    const chapterBook = (await payload.findByID({
      collection: 'books',
      id: relatedId(chapter.book),
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as PublicRecord
    if (!chapterBook || relatedId(chapterBook.site) !== siteId || !canRenderPublic(chapterBook))
      notFound()
    const chapters = (
      await payload.find({
        collection: 'book-chapters',
        where: { book: { equals: String(chapterBook.id) } },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs as unknown as PublicRecord[]
    const articleResult = relatedId(chapter.content)
      ? await payload.find({
          collection: 'article-family-content',
          where: { content: { equals: relatedId(chapter.content) } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        } as never)
      : { docs: [] }
    return (
      <BookReader
        book={chapterBook}
        chapter={chapter}
        chapters={chapters}
        article={(articleResult.docs[0] ?? null) as unknown as PublicRecord | null}
      />
    )
  }

  for (const collection of registeredOnly(payload, candidates)) {
    const result = await payload.find({
      collection,
      where: { and: [{ canonicalPath: { equals: path } }, { site: { equals: siteId } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const record = result.docs[0] as unknown as PublicRecord | undefined
    if (!record) continue
    if (!canRenderPublic(record)) notFound()

    const name = label(record)
    let articleBody: string | null = null
    if (collection === 'content') {
      const articleResult = await payload.find({
        collection: 'article-family-content',
        where: { content: { equals: String(record.id) } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      const projection = (
        articleResult.docs[0] as unknown as { plainTextProjection?: string } | undefined
      )?.plainTextProjection
      if (typeof projection === 'string' && projection) {
        articleBody = projection
      }
    }
    const jsonLd = buildJsonLd({
      siteUrl: process.env.APP_URL ?? 'http://localhost:3000',
      path,
      site: { ownerKind: 'organization', name: 'Renegade CMS' },
      breadcrumb: [
        { name: 'Home', path: '/' },
        { name, path },
      ],
      entity: {
        kind: kind(collection),
        id: String(record.id),
        name,
        description:
          typeof record.summary === 'string'
            ? record.summary
            : typeof record.description === 'string'
              ? record.description
              : null,
        startsAt: typeof record.startsAt === 'string' ? record.startsAt : null,
        endsAt: typeof record.endsAt === 'string' ? record.endsAt : null,
        attendanceMode: record.attendanceMode as 'in-person' | 'virtual' | 'hybrid' | null,
        locationName: typeof record.venueName === 'string' ? record.venueName : null,
        locationAddress: typeof record.venueAddress === 'string' ? record.venueAddress : null,
        onlineUrl: typeof record.onlineUrl === 'string' ? record.onlineUrl : null,
        organizerName: typeof record.organizerName === 'string' ? record.organizerName : null,
        organizerUrl: typeof record.organizerUrl === 'string' ? record.organizerUrl : null,
      },
    })
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 space-y-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs font-semibold text-stone-500"
        >
          <Link href="/" className="hover:text-red-600 transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="badge badge-neutral">{kind(collection)}</span>
          <span>/</span>
          <span aria-current="page" className="text-stone-900 dark:text-stone-100">
            {name}
          </span>
        </nav>
        <article className="surface-card p-8 sm:p-10 space-y-6">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-stone-950 dark:text-stone-50 font-display">
            {name}
          </h1>
          {typeof record.summary === 'string' ? (
            <p className="text-lg sm:text-xl text-stone-600 dark:text-stone-300 font-display italic leading-relaxed">
              {record.summary}
            </p>
          ) : null}
          {articleBody ? (
            <div className="prose dark:prose-invert max-w-none text-base sm:text-lg leading-relaxed text-stone-800 dark:text-stone-200 whitespace-pre-line">
              {articleBody}
            </div>
          ) : typeof record.description === 'string' ? (
            <div className="prose dark:prose-invert max-w-none text-base sm:text-lg leading-relaxed text-stone-800 dark:text-stone-200">
              {record.description}
            </div>
          ) : null}
          {collection === 'events' && typeof record.startsAt === 'string' ? (
            <section aria-label="Event details" className="border-t pt-5 space-y-2">
              <h2>Event details</h2>
              <p>
                <time dateTime={record.startsAt}>
                  Starts{' '}
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'full',
                    timeStyle: record.allDay ? undefined : 'short',
                    timeZone: String(record.timeZone ?? 'UTC'),
                  }).format(new Date(record.startsAt))}
                </time>{' '}
                · {String(record.timeZone ?? 'UTC')}
              </p>
              {typeof record.endsAt === 'string' ? (
                <p>
                  <time dateTime={record.endsAt}>
                    Ends{' '}
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'full',
                      timeStyle: record.allDay ? undefined : 'short',
                      timeZone: String(record.timeZone ?? 'UTC'),
                    }).format(new Date(record.endsAt))}
                  </time>
                </p>
              ) : null}
              {typeof record.venueName === 'string' ? (
                <p>
                  {record.venueName}
                  {typeof record.venueAddress === 'string' ? ` — ${record.venueAddress}` : ''}
                </p>
              ) : null}
              {typeof record.onlineUrl === 'string' ? (
                <p>
                  <a href={record.onlineUrl}>Join online</a>
                </p>
              ) : null}
              {typeof record.organizerName === 'string' ? (
                <p>Organizer: {record.organizerName}</p>
              ) : null}
              {typeof record.registrationUrl === 'string' ? (
                <p>
                  <a href={record.registrationUrl}>Register</a>
                </p>
              ) : null}
              <p>
                <a href={`/events/${record.slug}/ics`}>Add to calendar (ICS)</a>
              </p>
            </section>
          ) : null}
        </article>
      </main>
    )
  }
  notFound()
}
