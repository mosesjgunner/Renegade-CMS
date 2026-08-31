import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import { notFound, permanentRedirect, redirect } from 'next/navigation'

import { canRenderPublic, type PublicState } from '@/modules/public/contracts'
import { buildJsonLd, buildMetadata } from '@/modules/public/seo'
import type { Metadata } from 'next'
import { resolveRedirect, type RedirectRule } from '@/modules/public/discovery'
import { PublicLayout } from '@/modules/public/PublicLayout'

type Args = { params: Promise<{ path: string[] }> }
type PublicRecord = PublicState & Record<string, unknown>

const candidates = ['content', 'events', 'timelines', 'albums', 'discussions', 'products'] as const

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
    for (const collection of candidates) {
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
          siteUrl: process.env.APP_URL ?? 'http://localhost:3000',
        })
    }
  } catch {
    /* safe noindex fallback during recovery */
  }
  return { robots: { index: false, follow: false } }
}

export default async function CanonicalPublicPage({ params }: Args) {
  const path = `/${(await params).path.join('/')}`
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
  )
  if (resolution && 'target' in resolution) {
    if (resolution.statusCode === 301 || resolution.statusCode === 308)
      permanentRedirect(resolution.target)
    redirect(resolution.target)
  }
  if (resolution) notFound()

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

  for (const collection of candidates) {
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
          {typeof record.description === 'string' ? (
            <div className="prose dark:prose-invert max-w-none text-base sm:text-lg leading-relaxed text-stone-800 dark:text-stone-200">
              {record.description}
            </div>
          ) : null}
        </article>
      </main>
    )
  }
  notFound()
}
