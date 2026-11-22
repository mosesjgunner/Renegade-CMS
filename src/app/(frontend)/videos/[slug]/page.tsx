import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound, permanentRedirect } from 'next/navigation'
import { headers } from 'next/headers'
import { isRegisteredCollection } from '@/modules/public/registered-collections'
import { communitySiteForHost } from '@/modules/community/site-scope'
import { SubmissionTargetLink } from '@/modules/creator-studio/SubmissionTargetLink'
import type { Metadata } from 'next'

import { VideoPlayer } from '@/modules/media/VideoPlayer'
import {
  discoveryToMetadata,
  resolveDiscoveryDocument,
  serializeJsonLd,
} from '@/modules/public/discovery'

export const dynamic = 'force-dynamic'
const identifier = (value: unknown) => String((value as { id?: string } | null)?.id ?? value ?? '')

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const payload = await getPayload({ config })
  const { slug } = await params
  const discovery = await resolveDiscoveryDocument(payload, {
    collection: 'videos',
    slug,
    path: `/videos/${slug}`,
  })
  if (discovery.canonicalPath !== `/videos/${slug}`) permanentRedirect(discovery.canonicalPath)
  return discoveryToMetadata(discovery)
}

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
  const siteId = await communitySiteForHost(payload, (await headers()).get('host')).catch(() => '')
  const submissions = siteId
    ? <SubmissionTargetLink payload={payload} siteId={siteId} target={`theater:${String(video.id)}`} />
    : null
  // Externally hosted videos (YouTube/Vimeo/etc.) have no native asset; they
  // render through their provider embed instead of 404ing while the sitemap
  // advertises them. Only https embed URLs are honored.
  const embedUrl = typeof video.embedUrl === 'string' ? video.embedUrl.trim() : ''
  if (embedUrl && /^https:\/\//i.test(embedUrl)) {
    const embedTitle = String(video.title ?? '')
    const embedDiscovery = await resolveDiscoveryDocument(payload, {
      collection: 'videos',
      slug,
      path: `/videos/${slug}`,
      record: video,
    })
    if (embedDiscovery.canonicalPath !== `/videos/${slug}`)
      permanentRedirect(embedDiscovery.canonicalPath)
    return (
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(embedDiscovery.schema.jsonLd),
          }}
        />
        <h1 className="text-4xl font-bold">{embedTitle}</h1>
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            src={embedUrl}
            title={embedTitle}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        {video.body ? (
          <article className="prose max-w-none whitespace-pre-wrap">{String(video.body)}</article>
        ) : null}
        {submissions}
      </main>
    )
  }
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

  const discovery = await resolveDiscoveryDocument(payload, {
    collection: 'videos',
    slug,
    path: `/videos/${slug}`,
    record: video,
  })
  if (discovery.canonicalPath !== `/videos/${slug}`) permanentRedirect(discovery.canonicalPath)

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(discovery.schema.jsonLd),
        }}
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
      {submissions}
    </main>
  )
}
