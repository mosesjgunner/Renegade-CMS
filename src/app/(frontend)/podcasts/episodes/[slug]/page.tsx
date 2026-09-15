/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { canRenderPodcast } from '@/modules/media/publishing'
import { PodcastPlayer } from '@/modules/media/PodcastPlayer'
import {
  discoveryToMetadata,
  resolveDiscoveryDocument,
  serializeJsonLd,
} from '@/modules/public/discovery'

export const dynamic = 'force-dynamic'

const value = (item: unknown) =>
  typeof item === 'string' ? item : String((item as { id?: unknown } | null)?.id ?? '')

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const payload = await getPayload({ config })
  const { slug } = await params
  const discovery = await resolveDiscoveryDocument(payload, {
    collection: 'podcast-episodes',
    slug,
    path: `/podcasts/episodes/${slug}`,
  })
  return discoveryToMetadata(discovery)
}

export default async function PodcastEpisodePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const query = (await searchParams) || {}

  const result = await payload.find({
    collection: 'podcast-episodes',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)
  const episode = result.docs[0] as any

  // Auth & preview check
  let reqHeaders: Headers | undefined
  try {
    reqHeaders = await headers()
  } catch {
    // Outside active request scope (e.g. tests or pre-rendering)
  }
  const auth = reqHeaders
    ? await payload.auth({ headers: reqHeaders }).catch(() => ({ user: null }))
    : { user: null }
  const isStaff = Boolean(
    auth.user && ['owner', 'administrator', 'staff'].includes(String(auth.user.role)),
  )
  const isPreview = query.preview === 'true' || Boolean(query.previewToken)
  const allowedInPreview = isStaff && isPreview

  if (!episode) {
    // Check public redirects table for episode renames
    const currentPath = `/podcasts/episodes/${slug}`
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

  // Gate public access unless staff preview is active
  if (!canRenderPodcast(episode) && !allowedInPreview) {
    notFound()
  }

  const show = typeof episode.show === 'object' && episode.show !== null ? episode.show : null
  const audio = episode.audio as any
  const artworkId = episode.artwork
    ? value(episode.artwork)
    : show?.artwork
      ? value(show.artwork)
      : null
  const audioUrl = audio ? `/media/${audio.id}` : episode.externalUrl
  const audioMime = audio?.mimeType || episode.enclosureMimeType || 'audio/mpeg'

  const chapters = Array.isArray(episode.chapters) ? episode.chapters : []
  const transcriptSegments = Array.isArray(episode.transcript?.segments)
    ? episode.transcript.segments
    : Array.isArray(episode.transcript)
      ? episode.transcript
      : []

  const dateStr = episode.publishedAt
    ? new Date(episode.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const discovery = await resolveDiscoveryDocument(payload, {
    collection: 'podcast-episodes',
    slug,
    path: `/podcasts/episodes/${slug}`,
  })

  const downloadableFiles = Array.isArray(episode.downloadableFiles)
    ? episode.downloadableFiles
    : []
  const guests = Array.isArray(episode.guests) ? episode.guests : []
  const authors = Array.isArray(episode.authors) ? episode.authors : []

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(discovery.schema.jsonLd),
        }}
      />

      {/* Authenticated draft / scheduled preview indicator */}
      {allowedInPreview && (
        <div
          data-authenticated-draft-preview
          className="p-4 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-200 text-sm flex items-center justify-between shadow-lg"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider text-xs bg-amber-900 px-2 py-0.5 rounded text-amber-300">
              Preview Mode
            </span>
            <span>
              This episode is currently{' '}
              <strong className="underline">{episode.status || 'draft'}</strong> and hidden from
              anonymous visitors and feeds.
            </span>
          </div>
          <span className="text-xs font-mono text-amber-400">Staff Authenticated</span>
        </div>
      )}

      {/* Breadcrumb back to show */}
      {show && (
        <nav aria-label="Breadcrumb">
          <Link
            href={`/podcasts/${show.slug}`}
            className="text-sm font-semibold text-neutral-400 hover:text-emerald-400 transition inline-flex items-center gap-1.5"
          >
            ← Back to {show.title}
          </Link>
        </nav>
      )}

      {/* Episode Header */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {episode.seasonNumber !== undefined && episode.episodeNumber !== undefined ? (
            <span className="font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/60">
              Season {episode.seasonNumber} · Episode {episode.episodeNumber}
            </span>
          ) : episode.episodeNumber !== undefined ? (
            <span className="font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/60">
              Episode {episode.episodeNumber}
            </span>
          ) : null}

          {dateStr && <span className="text-neutral-400 font-medium">{dateStr}</span>}

          {episode.explicit ? (
            <span className="font-bold uppercase tracking-wider text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
              Explicit
            </span>
          ) : (
            <span className="text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded">Clean</span>
          )}

          {episode.language && (
            <span className="text-neutral-400 uppercase font-mono">{episode.language}</span>
          )}
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          {episode.title}
        </h1>

        {authors.length > 0 && (
          <div className="text-xs text-neutral-400">
            <span className="font-semibold text-neutral-300">By: </span>
            {authors.map((a: any, i: number) => (
              <span key={a.id || i}>
                {a.name || a.title || 'Author'}
                {i < authors.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        {guests.length > 0 && (
          <div className="text-xs text-neutral-400">
            <span className="font-semibold text-neutral-300">Featured Guests: </span>
            {guests.map((g: any, i: number) => (
              <span key={g.id || i}>
                {g.name || g.title || 'Guest'}
                {i < guests.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Episode Artwork */}
      {artworkId && (
        <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-neutral-800 shadow-2xl border border-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/media/${artworkId}`}
            alt={`Artwork for ${episode.title}`}
            className="w-full h-auto object-cover"
          />
        </div>
      )}

      {/* Web Audio Player */}
      {audioUrl ? (
        <PodcastPlayer
          src={audioUrl}
          type={audioMime}
          title={episode.title}
          chapters={chapters}
          transcript={transcriptSegments}
        />
      ) : (
        <div
          role="status"
          className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400"
        >
          Audio asset is currently unavailable for this episode.
        </div>
      )}

      {/* Episode Description & Notes */}
      <section aria-label="Show notes" className="space-y-4 pt-4 border-t border-neutral-800">
        <h2 className="text-xl font-bold text-white">Show Notes</h2>
        {episode.description && (
          <p className="text-neutral-300 text-base leading-relaxed whitespace-pre-line">
            {episode.description}
          </p>
        )}
        {episode.body && (
          <div className="text-neutral-300 text-base leading-relaxed space-y-4 whitespace-pre-line">
            {episode.body}
          </div>
        )}
      </section>

      {/* Supplementary Downloadable Files & Audio Download */}
      <section
        aria-label="Episode downloads"
        className="p-5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-3"
      >
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300">
          Downloads & Formats
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          {audio && (
            <a
              href={`/media/${audio.id}?download=true`}
              download
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 font-medium transition"
            >
              Audio ({audioMime}){' '}
              {audio.sizeBytes
                ? `· ${Math.round((Number(audio.sizeBytes) / 1024 / 1024) * 10) / 10} MB`
                : ''}
            </a>
          )}
          <Link
            href={`/podcasts/episodes/${episode.slug}/transcript`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 font-medium transition"
          >
            HTML Transcript
          </Link>
          {chapters.length > 0 && (
            <Link
              href={`/podcasts/episodes/${episode.slug}/chapters.json`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 font-medium transition"
            >
              JSON Chapters
            </Link>
          )}
          {downloadableFiles.map((file: any) => (
            <a
              key={file.id}
              href={`/media/${file.id}?download=true`}
              download
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 font-medium transition"
            >
              {file.title || 'Supplementary file'}
            </a>
          ))}
        </div>
      </section>

      {/* Credits & Rights */}
      {(episode.credits || episode.rights) && (
        <section
          aria-label="Credits and rights"
          className="text-xs text-neutral-400 space-y-2 border-t border-neutral-800 pt-6"
        >
          {episode.credits && (
            <div>
              <strong className="text-neutral-300">Credits: </strong>
              <span>{episode.credits}</span>
            </div>
          )}
          {episode.rights && (
            <div>
              <strong className="text-neutral-300">Rights & Licensing: </strong>
              <span>
                {typeof episode.rights === 'string'
                  ? episode.rights
                  : episode.rights.license ||
                    episode.rights.copyright ||
                    JSON.stringify(episode.rights)}
              </span>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
