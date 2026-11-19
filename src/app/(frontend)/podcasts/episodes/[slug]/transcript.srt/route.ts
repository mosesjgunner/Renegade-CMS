import { createHash } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'

import { podcastTranscriptSrt } from '@/modules/media/publishing'
import { loadEpisodeTranscript } from '@/modules/podcast-studio/episode-transcript'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** SRT (application/x-subrip) transcript for the episode's current transcript revision (POD-REQ-03). */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const origin = loadConfig().appUrl

  const loaded = await loadEpisodeTranscript(
    payload,
    slug,
    `/podcasts/episodes/${slug}/transcript.srt`,
  )
  if (loaded.kind === 'redirect') {
    const dest = loaded.toPath.endsWith('/transcript.srt')
      ? loaded.toPath
      : `${loaded.toPath.replace(/\/$/, '')}/transcript.srt`
    return Response.redirect(new URL(dest, origin).toString(), 308)
  }
  if (loaded.kind === 'missing') return new Response('Not found', { status: 404 })

  const body = podcastTranscriptSrt(loaded.segments)
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=300' },
    })
  }
  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-subrip; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ETag: etag,
    },
  })
}
