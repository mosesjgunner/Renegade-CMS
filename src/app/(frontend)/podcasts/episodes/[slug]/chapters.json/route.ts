import { createHash } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { canRenderPodcast } from '@/modules/media/publishing'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const origin = loadConfig().appUrl

  const found = await payload.find({
    collection: 'podcast-episodes',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  } as never)

  const episode = found.docs[0] as unknown as Record<string, unknown> | undefined
  if (!episode || !canRenderPodcast(episode)) {
    // Check for public redirects
    const currentPath = `/podcasts/episodes/${slug}/chapters.json`
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
      const dest = redirectDoc.toPath.endsWith('/chapters.json')
        ? redirectDoc.toPath
        : `${redirectDoc.toPath}/chapters.json`
      return Response.redirect(new URL(dest, origin).toString(), 308)
    }
    return new Response('Not found', { status: 404 })
  }

  const rawChapters = Array.isArray(episode.chapters) ? episode.chapters : []
  const chaptersData = {
    version: '1.2.0',
    chapters: rawChapters.map(
      (chapter: {
        title?: string
        startTime?: number
        startSeconds?: number
        url?: string
        image?: string | { id?: string }
        img?: string
      }) => ({
        title: String(chapter.title || ''),
        startTime: Number(chapter.startTime ?? chapter.startSeconds ?? 0),
        url: chapter.url || undefined,
        img:
          chapter.img ||
          (chapter.image
            ? new URL(
                `/media/${typeof chapter.image === 'string' ? chapter.image : chapter.image.id}`,
                origin,
              ).toString()
            : undefined),
      }),
    ),
  }

  const body = JSON.stringify(chaptersData, null, 2)
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=300' },
    })
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json+chapters; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ETag: etag,
    },
  })
}
