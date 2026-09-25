import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import config from '@payload-config'
import { getPayload } from 'payload'
import { communitySiteForHost } from '@/modules/community/site-scope'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Community Forums',
  description: 'Discuss, ask questions, and share knowledge with community members.',
}

export default async function ForumsIndexPage() {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const siteId = await communitySiteForHost(payload, requestHeaders.get('host')).catch(
    () => 'default',
  )

  const sectionsRes = await payload.find({
    collection: 'forum-sections',
    where: { site: { equals: siteId } },
    sort: 'sortOrder',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })

  const forumsRes = await payload.find({
    collection: 'forums',
    where: { site: { equals: siteId } },
    sort: 'sortOrder',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })

  const sections = sectionsRes.docs
  const forums = forumsRes.docs

  return (
    <main className="container mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Community Forums</h1>
        <p className="mt-2 text-stone-600 dark:text-stone-300">
          Browse sections and participate in community discussions.
        </p>
      </header>

      {sections.length === 0 && forums.length === 0 ? (
        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 p-8 text-center text-stone-500">
          No forums have been published yet for this community.
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => {
            const sectionForums = forums.filter((f) => {
              const rel = f.section
              const secId = typeof rel === 'object' && rel ? (rel as { id?: string }).id : rel
              return secId === section.id
            })

            return (
              <section
                key={section.id}
                aria-labelledby={`sec-${section.id}`}
                className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden bg-white dark:bg-stone-900 shadow-sm"
              >
                <div className="bg-stone-50 dark:bg-stone-800/60 px-6 py-4 border-b border-stone-200 dark:border-stone-800">
                  <h2 id={`sec-${section.id}`} className="text-xl font-semibold">
                    {section.name}
                  </h2>
                  {section.description ? (
                    <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                      {section.description}
                    </p>
                  ) : null}
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {sectionForums.length === 0 ? (
                    <p className="px-6 py-4 text-sm text-stone-500">
                      No forums in this section yet.
                    </p>
                  ) : (
                    sectionForums.map((forum) => (
                      <article
                        key={forum.id}
                        className="p-6 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div>
                          <h3 className="text-lg font-semibold">
                            <Link
                              href={`/forums/${forum.slug}`}
                              className="hover:underline text-stone-900 dark:text-stone-100"
                            >
                              {forum.name}
                            </Link>
                          </h3>
                          {forum.description ? (
                            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                              {forum.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3">
                          <Link href={`/forums/${forum.slug}`} className="btn btn-sm">
                            Browse topics &rarr;
                          </Link>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
