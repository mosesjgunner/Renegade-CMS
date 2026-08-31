/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { publicVideo } from '@/modules/media/publishing'

export const dynamic = 'force-dynamic'

export default async function VideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const result = await payload.find({
    collection: 'videos',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  } as never)
  const video = result.docs[0] as any
  if (!video) notFound()
  const state = publicVideo(video)
  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-5">
      <h1>{video.title}</h1>
      {!state.available ? (
        <p role="status">{state.message}</p>
      ) : state.kind === 'native' ? (
        <video
          controls
          poster={
            video.thumbnail
              ? `/media/${typeof video.thumbnail === 'string' ? video.thumbnail : video.thumbnail.id}`
              : undefined
          }
        >
          <source
            src={`/media/${typeof video.nativeMedia === 'string' ? video.nativeMedia : video.nativeMedia.id}`}
            type="video/mp4"
          />
          {(video.captions ?? []).map((caption: any) => (
            <track
              key={typeof caption === 'string' ? caption : caption.id}
              kind="captions"
              src={`/media/${typeof caption === 'string' ? caption : caption.id}`}
            />
          ))}
        </video>
      ) : (
        <iframe
          title={video.title}
          src={state.embedUrl}
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
        />
      )}
      {video.description ? <p>{video.description}</p> : null}
    </main>
  )
}
