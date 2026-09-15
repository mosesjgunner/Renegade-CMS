import config from '@payload-config'
import { getPayload } from 'payload'
import { createHash } from 'node:crypto'
import { getAllIndexableDiscoveryDocuments } from '@/modules/public/discovery'
import { resolveSiteSettings } from '@/modules/core/site-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const plain = (value: string | null | undefined) =>
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const settings = await resolveSiteSettings(payload)
  if (settings.indexingMode === 'noindex') return new Response('Not found', { status: 404 })
  const docs = (await getAllIndexableDiscoveryDocuments(payload))
    .filter((doc) => doc.contentType === 'article')
    .sort(
      (a, b) =>
        String(b.dates.publishedAt || b.dates.modifiedAt).localeCompare(
          String(a.dates.publishedAt || a.dates.modifiedAt),
        ) || a.canonicalUrl.localeCompare(b.canonicalUrl),
    )
  const body = JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: settings.siteName,
    home_page_url: settings.canonicalOrigin,
    feed_url: `${settings.canonicalOrigin}/feed.json`,
    items: docs.map((doc) => ({
      id: `urn:renegade:content:${doc.revisions.entityId || doc.canonicalUrl}`,
      url: doc.canonicalUrl,
      title: doc.title.value,
      summary: plain(doc.description.value),
      date_published: doc.dates.publishedAt,
      date_modified: doc.dates.modifiedAt,
      authors: doc.author ? [{ name: doc.author.name, url: doc.author.url }] : undefined,
      image:
        doc.media.heroImage?.url ||
        (doc.socialImage.variantEligible ? doc.socialImage.variantUrl || undefined : undefined),
    })),
  })
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`
  const headers = {
    'Content-Type': 'application/feed+json; charset=utf-8',
    ETag: etag,
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
  }
  return request.headers.get('if-none-match') === etag
    ? new Response(null, { status: 304, headers })
    : new Response(body, { headers })
}
