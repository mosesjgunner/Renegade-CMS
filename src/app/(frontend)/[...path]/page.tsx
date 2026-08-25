import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { canRenderPublic, type PublicState } from '@/modules/public/contracts'
import { buildJsonLd } from '@/modules/public/seo'
import { PublicLayout } from '@/modules/public/PublicLayout'

type Args = { params: Promise<{ path: string[] }> }
type PublicRecord = PublicState & Record<string, unknown>

const candidates = ['content', 'events', 'timelines', 'albums', 'discussions'] as const

function label(record: PublicRecord): string {
  return String(record.title ?? record.name ?? record.displayName ?? 'Publication')
}

function kind(
  collection: (typeof candidates)[number],
): 'article' | 'event' | 'timeline' | 'album' | 'forum' {
  if (collection === 'events') return 'event'
  if (collection === 'timelines') return 'timeline'
  if (collection === 'albums') return 'album'
  if (collection === 'discussions') return 'forum'
  return 'article'
}

export const dynamic = 'force-dynamic'

export default async function CanonicalPublicPage({ params }: Args) {
  const path = `/${(await params).path.join('/')}`
  const payload = await getPayload({ config })

  const layoutResult = await payload.find({
    collection: 'page-layouts',
    where: { path: { equals: path } },
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
      where: { canonicalPath: { equals: path } },
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
