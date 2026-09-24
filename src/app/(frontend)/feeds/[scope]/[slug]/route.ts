import config from '@payload-config'
import { getPayload } from 'payload'
import { createHash } from 'node:crypto'
import { conditionalXml } from '@/modules/public/crawler'
import {
  getAllIndexableDiscoveryDocuments,
  type DiscoveryDocument,
} from '@/modules/public/discovery'
import { resolveSiteSettings } from '@/modules/core/site-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const xml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const plain = (value: string | null | undefined) =>
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function matches(doc: DiscoveryDocument, scope: string, stableId: string) {
  if (scope === 'author') {
    return doc.author?.id === stableId || doc.author?.ids?.includes(stableId) === true
  }
  if (scope === 'taxonomy') {
    return doc.taxonomy.entities?.some(({ id }) => id === stableId) === true
  }
  if (scope === 'content') {
    return doc.revisions.entityId === stableId
  }
  return false
}

export async function GET(
  request: Request,
  context: { params: Promise<{ scope: string; slug: string }> },
) {
  const { scope, slug: rawSlug } = await context.params
  if (!['author', 'taxonomy', 'content'].includes(scope)) {
    return new Response('Not found', { status: 404 })
  }

  const isJsonRequest =
    rawSlug.endsWith('.json') ||
    request.headers.get('accept')?.includes('application/feed+json') ||
    request.headers.get('accept')?.includes('application/json')

  const stableId = rawSlug.replace(/\.(xml|json)$/, '')
  const payload = await getPayload({ config })
  const settings = await resolveSiteSettings(payload)

  if (settings.indexingMode === 'noindex') {
    return new Response('Not found', { status: 404 })
  }

  const docs = (await getAllIndexableDiscoveryDocuments(payload))
    .filter((doc) => matches(doc, scope, stableId))
    .sort(
      (a, b) =>
        String(b.dates.publishedAt || b.dates.modifiedAt).localeCompare(
          String(a.dates.publishedAt || a.dates.modifiedAt),
        ) || a.canonicalUrl.localeCompare(b.canonicalUrl),
    )

  if (!docs.length) return new Response('Not found', { status: 404 })

  const selfXml = `${settings.canonicalOrigin}/feeds/${scope}/${stableId}`

  if (isJsonRequest) {
    const jsonBody = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: `${settings.siteName} — ${scope} stream`,
      home_page_url: settings.canonicalOrigin,
      feed_url: `${settings.canonicalOrigin}/feeds/${scope}/${stableId}.json`,
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
    const etag = `"${createHash('sha256').update(jsonBody).digest('hex')}"`
    const headers = {
      'Content-Type': 'application/feed+json; charset=utf-8',
      ETag: etag,
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
    }
    return request.headers.get('if-none-match') === etag
      ? new Response(null, { status: 304, headers })
      : new Response(jsonBody, { headers })
  }

  const items = docs
    .map((doc) => {
      const pubDate = new Date(doc.dates.publishedAt || doc.dates.modifiedAt!).toUTCString()
      const enclosure = doc.media.heroImage?.url
        ? `<enclosure url="${xml(doc.media.heroImage.url)}" type="image/jpeg" length="0"/>`
        : ''
      const author = doc.author?.name ? `<dc:creator>${xml(doc.author.name)}</dc:creator>` : ''
      return `<item><title>${xml(doc.title.value)}</title><link>${xml(doc.canonicalUrl)}</link><guid isPermaLink="false">urn:renegade:content:${xml(doc.revisions.entityId || doc.canonicalUrl)}</guid><pubDate>${pubDate}</pubDate>${author}<description>${xml(plain(doc.description.value))}</description>${enclosure}</item>`
    })
    .join('')

  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${xml(settings.siteName)} — ${xml(scope)} stream</title><link>${xml(selfXml)}</link><atom:link href="${xml(selfXml)}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`

  return conditionalXml(request, xmlBody)
}
