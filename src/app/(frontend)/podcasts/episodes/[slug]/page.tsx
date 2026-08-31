/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { canRenderPublic } from '@/modules/public/contracts'

export const dynamic = 'force-dynamic'

export default async function PodcastEpisodePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const result = await payload.find({
    collection: 'podcast-episodes',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  } as never)
  const episode = result.docs[0] as any
  if (!episode || !canRenderPublic(episode)) notFound()
  const audio = episode.audio as any
  if (!audio && !episode.externalUrl)
    return (
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1>{episode.title}</h1>
        <p role="status">Audio is unavailable.</p>
      </main>
    )
  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-5">
      <h1>{episode.title}</h1>
      {audio ? (
        <audio controls>
          <source src={`/media/${audio.id}`} type={audio.mimeType || 'audio/mpeg'} />
        </audio>
      ) : (
        <a href={episode.externalUrl}>Listen to episode</a>
      )}
      {episode.description ? <p>{episode.description}</p> : null}
      {Array.isArray(episode.chapters) ? (
        <ol aria-label="Chapters">
          {episode.chapters.map((chapter: any, index: number) => (
            <li key={index}>{chapter.title ?? `Chapter ${index + 1}`}</li>
          ))}
        </ol>
      ) : null}
    </main>
  )
}
