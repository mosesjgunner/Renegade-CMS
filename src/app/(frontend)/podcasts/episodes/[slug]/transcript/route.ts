import { createHash } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { canRenderPodcast } from '@/modules/media/publishing'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'

const escape = (value: unknown) =>
  String(value ?? '').replace(/[<>&]/g, (x) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[x]!)

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const origin = loadConfig().appUrl

  const found = await payload.find({
    collection: 'podcast-episodes',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)

  const episode = found.docs[0] as unknown as Record<string, unknown> | undefined
  if (!episode || !canRenderPodcast(episode as never)) {
    // Check for public redirects
    const currentPath = `/podcasts/episodes/${slug}/transcript`
    const redirects = await payload
      .find({
        collection: 'public-redirects',
        where: { fromPath: { in: [currentPath, `/podcasts/episodes/${slug}`] } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [] }))
    const redirectDoc = redirects.docs[0] as unknown as Record<string, unknown> | undefined
    if (redirectDoc && redirectDoc.enabled !== false && typeof redirectDoc.toPath === 'string') {
      const dest = redirectDoc.toPath.endsWith('/transcript')
        ? redirectDoc.toPath
        : `${redirectDoc.toPath}/transcript`
      return Response.redirect(new URL(dest, origin).toString(), 308)
    }
    return new Response('Not found', { status: 404 })
  }

  type TranscriptSegment = { startSeconds?: number; speaker?: string; text?: string }
  const rawTranscript = episode.transcript as
    | { segments?: TranscriptSegment[] }
    | TranscriptSegment[]
    | undefined
  const segments: TranscriptSegment[] = Array.isArray(rawTranscript)
    ? rawTranscript
    : rawTranscript &&
        typeof rawTranscript === 'object' &&
        'segments' in rawTranscript &&
        Array.isArray(rawTranscript.segments)
      ? rawTranscript.segments
      : []

  const rows = segments
    .map(
      (segment: TranscriptSegment) =>
        `<p data-start="${Number(segment.startSeconds || 0)}"><a href="/podcasts/episodes/${encodeURIComponent(slug)}#t=${Math.floor(Number(segment.startSeconds || 0))}">${Math.floor(Number(segment.startSeconds || 0))}s</a> ${escape(segment.speaker ? `${segment.speaker}: ` : '')}${escape(segment.text)}</p>`,
    )
    .join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(episode.title)} — Transcript</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; color: #111; background: #fff; }
    h1 { margin-bottom: 1.5rem; font-size: 1.75rem; }
    p { margin-bottom: 1rem; }
    a { color: #059669; text-decoration: none; font-family: monospace; font-weight: bold; margin-right: 0.5rem; }
    a:hover { text-decoration: underline; }
    .nav { margin-bottom: 2rem; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="nav"><a href="/podcasts/episodes/${encodeURIComponent(slug)}">← Back to Episode</a></div>
  <main>
    <h1>${escape(episode.title)} — Transcript</h1>
    <article aria-label="Transcript content">
      ${rows || '<p>Transcript unavailable.</p>'}
    </article>
  </main>
</body>
</html>`

  const etag = `"${createHash('sha256').update(html).digest('hex')}"`
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=300' },
    })
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ETag: etag,
    },
  })
}
