import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { VideoPlayer } from '@/modules/media/VideoPlayer'

export const dynamic = 'force-dynamic'
const identifier = (value: unknown) => String((value as { id?: string } | null)?.id ?? value ?? '')

export default async function VideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const found = await payload.find({
    collection: 'videos' as never,
    where: {
      and: [
        { slug: { equals: slug } },
        { status: { equals: 'published' } },
        { visibility: { in: ['public', 'unlisted'] } },
      ],
    },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)
  const video = found.docs[0] as unknown as Record<string, unknown> | undefined
  if (!video) notFound()
  const asset = video.videoAsset as Record<string, unknown> | undefined
  if (!asset || (!Array.isArray(asset.outputs) && !Array.isArray(asset.lastGoodOutputs))) notFound()
  const outputs =
    asset.processingState === 'ready' && Array.isArray(asset.outputs)
      ? asset.outputs
      : (asset.lastGoodOutputs as Array<Record<string, unknown>>)
  const baseline = outputs.find((item) => item.filename === 'baseline.mp4')
  if (!baseline) notFound()
  const captions = Array.isArray(video.captions)
    ? video.captions.map((caption) => {
        const item = caption as Record<string, unknown>
        return {
          src: `/video-captions/${identifier(item.id)}`,
          language: String(item.language),
          label: String(item.label),
          default: Boolean(item.default),
          kind: String(item.kind) as 'captions' | 'subtitles',
        }
      })
    : []
  const poster = outputs.find((item) => item.filename === 'poster.jpg')
  const title = String(video.title)
  const metadata = asset.metadata as Record<string, unknown> | undefined
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: title,
    description: video.description,
    uploadDate: video.publishedAt,
    duration: metadata?.durationSeconds
      ? `PT${Math.round(Number(metadata.durationSeconds))}S`
      : undefined,
    contentUrl: `/video-media/${asset.id}/baseline.mp4`,
    thumbnailUrl: poster ? `/video-media/${asset.id}/poster.jpg` : undefined,
  }
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
      />
      <h1 className="text-4xl font-bold">{title}</h1>
      <VideoPlayer
        title={title}
        src={`/video-media/${asset.id}/baseline.mp4`}
        hlsSrc={
          outputs.some((item) => item.filename === 'stream.m3u8')
            ? `/video-media/${asset.id}/stream.m3u8`
            : undefined
        }
        poster={poster ? `/video-media/${asset.id}/poster.jpg` : undefined}
        captions={captions}
      />
      {video.body ? (
        <article className="prose max-w-none whitespace-pre-wrap">{String(video.body)}</article>
      ) : null}
      {video.transcript ? (
        <section aria-labelledby="transcript">
          <h2 id="transcript">Transcript</h2>
          <p>The publisher-provided transcript is available with this video.</p>
        </section>
      ) : null}
    </main>
  )
}
