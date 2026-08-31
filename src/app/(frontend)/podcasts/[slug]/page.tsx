/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { canRenderPublic } from '@/modules/public/contracts'

export const dynamic = 'force-dynamic'

export default async function PodcastShowPage({ params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const result = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const show = result.docs[0] as any
  if (!show || !canRenderPublic(show)) notFound()
  const episodes = await payload.find({
    collection: 'podcast-episodes',
    where: { show: { equals: show.id } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  } as never)
  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      <h1>{show.title}</h1>
      {show.description ? <p>{show.description}</p> : null}
      {show.rssEnabled ? (
        <p>
          <Link href={`/podcasts/${show.slug}/feed.xml`}>Subscribe via RSS</Link>
        </p>
      ) : null}
      <section aria-label="Episodes">
        <h2>Episodes</h2>
        <ul>
          {(episodes.docs as any[])
            .filter((episode) => canRenderPublic(episode))
            .map((episode) => (
              <li key={episode.id}>
                <Link href={`/podcasts/episodes/${episode.slug}`}>{episode.title}</Link>
              </li>
            ))}
        </ul>
      </section>
    </main>
  )
}
