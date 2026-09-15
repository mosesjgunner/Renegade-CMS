import config from '@payload-config'
import { getPayload } from 'payload'
import { createHash } from 'node:crypto'

import { getAllIndexableDiscoveryDocuments } from '@/modules/public/discovery'
import { resolveSiteSettings } from '@/modules/core/site-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const escapeXml = (unsafe: string) =>
  unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const cdata = (value?: string | null) => {
  if (!value) return ''
  const sanitized = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/]]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${sanitized}]]>`
}

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    const settings = await resolveSiteSettings(payload)
    const base = settings.canonicalOrigin

    if (settings.indexingMode === 'noindex') {
      return new Response('Feed unavailable when site indexing is disabled.', { status: 404 })
    }

    const docs = await getAllIndexableDiscoveryDocuments(payload)
    const articleDocs = docs
      .filter((d) => d.contentType === 'article' && d.indexability.indexable)
      .sort((a, b) => {
        const timeA = a.dates.publishedAt ? new Date(a.dates.publishedAt).getTime() : 0
        const timeB = b.dates.publishedAt ? new Date(b.dates.publishedAt).getTime() : 0
        return timeB - timeA
      })

    const feedUrl = `${base}/feed.xml`
    const latestDate = articleDocs[0]?.dates.publishedAt || articleDocs[0]?.dates.modifiedAt
    const lastBuildDate = latestDate
      ? new Date(latestDate).toUTCString()
      : 'Thu, 01 Jan 1970 00:00:00 GMT'

    const itemsXml = articleDocs
      .map((doc) => {
        const title = escapeXml(doc.title.value)
        const link = escapeXml(doc.canonicalUrl)
        const guid = escapeXml(`urn:renegade:content:${doc.revisions.entityId || doc.canonicalUrl}`)
        const itemDate = doc.dates.publishedAt || doc.dates.modifiedAt
        const pubDate = itemDate
          ? new Date(itemDate).toUTCString()
          : 'Thu, 01 Jan 1970 00:00:00 GMT'
        const creator = doc.author?.name
          ? `<dc:creator>${escapeXml(doc.author.name)}</dc:creator>`
          : ''
        const description = cdata(doc.description.value || '')

        return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${guid}</guid>
      <pubDate>${pubDate}</pubDate>
      ${creator}
      <description>${description}</description>
    </item>`
      })
      .join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(settings.siteName)}</title>
    <link>${escapeXml(base)}</link>
    <description>${escapeXml(settings.siteDescription || settings.siteName)}</description>
    <language>${escapeXml(settings.locale || 'en')}</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`

    const etag = `"${createHash('sha256').update(xml).digest('hex')}"`
    const ifNoneMatch = request.headers.get('if-none-match')

    if (ifNoneMatch && ifNoneMatch.trim() === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
        },
      })
    }

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        ETag: etag,
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    console.error('Failed to generate site RSS feed:', error)
    return new Response('Failed to generate feed.', { status: 500 })
  }
}
