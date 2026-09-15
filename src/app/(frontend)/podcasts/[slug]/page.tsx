/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { canRenderPodcast } from '@/modules/media/publishing'

import {
  discoveryToMetadata,
  resolveDiscoveryDocument,
  serializeJsonLd,
} from '@/modules/public/discovery'

export const dynamic = 'force-dynamic'

const value = (item: unknown) =>
  typeof item === 'string' ? item : String((item as { id?: unknown } | null)?.id ?? '')

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return null
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return remainingMins > 0 ? `${hrs} hr ${remainingMins} min` : `${hrs} hr`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const payload = await getPayload({ config })
  const { slug } = await params
  const discovery = await resolveDiscoveryDocument(payload, {
    collection: 'podcast-shows',
    slug,
    path: `/podcasts/${slug}`,
  })
  return discoveryToMetadata(discovery)
}

export default async function PodcastShowPage({ params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params

  const result = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  } as never)
  const show = result.docs[0] as any

  if (!show || !canRenderPodcast(show)) {
    // Check public redirects table for show renames or legacy URLs
    const currentPath = `/podcasts/${slug}`
    const redirects = await payload
      .find({
        collection: 'public-redirects',
        where: { fromPath: { equals: currentPath } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [] }))
    const redirectDoc = redirects.docs[0] as any
    if (redirectDoc && redirectDoc.enabled !== false && redirectDoc.toPath) {
      if (Number(redirectDoc.statusCode) === 301 || Number(redirectDoc.statusCode) === 308) {
        permanentRedirect(redirectDoc.toPath)
      }
      redirect(redirectDoc.toPath)
    }
    notFound()
  }

  const episodesResult = await payload.find({
    collection: 'podcast-episodes',
    where: { show: { equals: show.id } },
    limit: 100,
    depth: 1,
    overrideAccess: true,
  } as never)

  const publishedEpisodes = (episodesResult.docs as any[])
    .filter((episode) => canRenderPodcast(episode))
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())

  const artworkId = show.artwork ? value(show.artwork) : null
  const discovery = await resolveDiscoveryDocument(payload, {
    collection: 'podcast-shows',
    slug,
    path: `/podcasts/${slug}`,
  })

  const hostsList = Array.isArray(show.hosts) ? show.hosts : []

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(discovery.schema.jsonLd),
        }}
      />

      {/* Show Hero Header */}
      <header className="flex flex-col md:flex-row items-start gap-8 border-b border-neutral-800 pb-10">
        {artworkId && (
          <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-neutral-800 shadow-xl shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/media/${artworkId}`}
              alt={`Artwork for ${show.title}`}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="space-y-4 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/60">
              Podcast Show
            </span>
            {show.explicit ? (
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                Explicit
              </span>
            ) : (
              <span className="text-xs font-medium text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded">
                Clean
              </span>
            )}
            {show.language && (
              <span className="text-xs text-neutral-400 uppercase font-mono">{show.language}</span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {show.title}
          </h1>

          {show.description && (
            <p className="text-neutral-300 text-base leading-relaxed max-w-3xl">
              {show.description}
            </p>
          )}

          {hostsList.length > 0 && (
            <div className="text-xs text-neutral-400">
              <span className="font-semibold text-neutral-300">Hosted by: </span>
              {hostsList.map((host: any, i: number) => (
                <span key={host.id || i}>
                  {host.name || host.title || 'Host'}
                  {i < hostsList.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}

          {show.rssEnabled && (
            <div className="pt-2">
              <Link
                href={`/podcasts/${show.slug}/feed.xml`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-100 text-sm font-medium transition shadow"
              >
                <svg
                  className="w-4 h-4 text-orange-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle cx="6.18" cy="17.82" r="2.18" />
                  <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z" />
                </svg>
                Subscribe via RSS
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Episodes Archive */}
      <section aria-label="Episodes" className="space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h2 className="text-xl font-bold text-white">Episodes ({publishedEpisodes.length})</h2>
        </div>

        {publishedEpisodes.length === 0 ? (
          <p className="text-neutral-400 italic">No published episodes yet.</p>
        ) : (
          <ul className="space-y-4">
            {publishedEpisodes.map((episode) => {
              const epArtwork = episode.artwork ? value(episode.artwork) : artworkId
              const durationText = formatDuration(Number(episode.audio?.durationSeconds))
              const dateStr = episode.publishedAt
                ? new Date(episode.publishedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : null

              return (
                <li
                  key={episode.id}
                  className="p-5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition flex flex-col sm:flex-row gap-5 items-start"
                >
                  {epArtwork && (
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-800 shrink-0 shadow">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/media/${epArtwork}`}
                        alt={`Artwork for ${episode.title}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      {episode.seasonNumber !== undefined && episode.episodeNumber !== undefined ? (
                        <span className="font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                          S{episode.seasonNumber} E{episode.episodeNumber}
                        </span>
                      ) : episode.episodeNumber !== undefined ? (
                        <span className="font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                          Episode {episode.episodeNumber}
                        </span>
                      ) : null}

                      {dateStr && <span className="text-neutral-400">{dateStr}</span>}
                      {durationText && (
                        <span className="text-neutral-500 font-mono">· {durationText}</span>
                      )}

                      {episode.explicit && (
                        <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60">
                          Explicit
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-white hover:text-emerald-400 transition">
                      <Link href={`/podcasts/episodes/${episode.slug}`}>{episode.title}</Link>
                    </h3>

                    {episode.description && (
                      <p className="text-neutral-400 text-sm line-clamp-2 leading-relaxed">
                        {episode.description}
                      </p>
                    )}

                    <div className="pt-2">
                      <Link
                        href={`/podcasts/episodes/${episode.slug}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                      >
                        Listen to episode →
                      </Link>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
