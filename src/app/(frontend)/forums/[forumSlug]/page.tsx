import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import config from '@payload-config'
import { getPayload } from 'payload'
import { communitySiteForHost } from '@/modules/community/site-scope'
import { ForumThreadComposer } from '@/modules/community/ForumThreadComposer'
import { resolvePublicUrl } from '@/modules/public/semantic-url'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ forumSlug: string }>
}): Promise<Metadata> {
  const { forumSlug } = await params
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'forums',
    where: { slug: { equals: forumSlug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const forum = res.docs[0]
  if (!forum) return { title: 'Forum Not Found' }
  return {
    title: `${forum.name} · Community Forums`,
    description: forum.description ? String(forum.description).slice(0, 160) : undefined,
  }
}

export default async function ForumTopicsPage({
  params,
}: {
  params: Promise<{ forumSlug: string }>
}) {
  const { forumSlug } = await params
  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const siteId = await communitySiteForHost(payload, requestHeaders.get('host')).catch(
    () => 'default',
  )

  const forumRes = await payload.find({
    collection: 'forums',
    where: {
      and: [{ site: { equals: siteId } }, { slug: { equals: forumSlug } }],
    },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })

  const forum = forumRes.docs[0]
  if (!forum) notFound()

  const discussionsRes = await payload.find({
    collection: 'discussions',
    where: {
      and: [
        { site: { equals: siteId } },
        { forum: { equals: forum.id } },
        { kind: { equals: 'thread' } },
        { moderationState: { not_equals: 'removed' } },
      ],
    },
    sort: '-createdAt',
    limit: 50,
    depth: 1,
    overrideAccess: true,
  })

  const discussions = discussionsRes.docs

  return (
    <main className="container mx-auto max-w-5xl px-6 py-12">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-stone-500">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/forums" className="hover:underline">
              Forums
            </Link>
          </li>
          <li aria-hidden="true">&rsaquo;</li>
          <li className="text-stone-800 dark:text-stone-200 font-medium">{forum.name}</li>
        </ol>
      </nav>

      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{forum.name}</h1>
          {forum.description ? (
            <p className="mt-2 text-stone-600 dark:text-stone-300">{forum.description}</p>
          ) : null}
        </div>
      </header>

      <ForumThreadComposer siteId={siteId} forumId={forum.id} forumSlug={forum.slug} />

      <section aria-labelledby="topics-heading" className="mt-8">
        <h2 id="topics-heading" className="sr-only">
          Topics in {forum.name}
        </h2>
        {discussions.length === 0 ? (
          <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 p-8 text-center text-stone-500">
            No topics yet in this forum. Be the first to start a discussion!
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800 shadow-sm">
            {discussions.map((disc) => {
              const targetHref =
                disc.canonicalPath || resolvePublicUrl({ kind: 'forum', slug: forum.slug })
              const isLocked = disc.status === 'locked'

              return (
                <article
                  key={disc.id}
                  className="p-5 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold truncate">
                        <Link
                          href={targetHref}
                          className="hover:underline text-stone-900 dark:text-stone-100"
                        >
                          {disc.title}
                        </Link>
                      </h3>
                      {isLocked ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                          Locked
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-stone-500">
                      <span>Created {new Date(disc.createdAt).toLocaleDateString()}</span>
                      {disc.visibility === 'members' ? <span>&middot; Members Only</span> : null}
                    </div>
                  </div>
                  <div>
                    <Link href={targetHref} className="btn btn-sm">
                      View &rarr;
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
