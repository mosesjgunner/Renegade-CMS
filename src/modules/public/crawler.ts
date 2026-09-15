import { createHash } from 'node:crypto'

import type { DiscoveryDocument } from './discovery'

export const SITEMAP_PAGE_SIZE = 1_000
export const SITEMAP_ASYNC_TRIGGER_URLS = 25_000

export type CrawlerEntry = {
  url: string
  lastmod?: string
  kind: DiscoveryDocument['contentType']
  image?: string
  video?: {
    thumbnailLoc: string
    title: string
    description: string
    contentLoc: string
  }
}

export function crawlerEntries(documents: DiscoveryDocument[]): CrawlerEntry[] {
  const byUrl = new Map<string, CrawlerEntry>()
  for (const doc of documents) {
    if (!doc.indexability.indexable) continue
    const modified = doc.dates.modifiedAt || doc.dates.publishedAt
    const entry: CrawlerEntry = {
      url: doc.canonicalUrl,
      kind: doc.contentType,
    }
    if (modified) {
      const modifiedTime = Date.parse(modified)
      if (Number.isFinite(modifiedTime)) entry.lastmod = new Date(modifiedTime).toISOString()
    }
    let canonical: URL
    try {
      canonical = new URL(doc.canonicalUrl)
    } catch {
      continue
    }
    if (!['http:', 'https:'].includes(canonical.protocol)) continue
    const image =
      doc.media?.heroImage?.url ||
      (doc.socialImage.variantEligible ? doc.socialImage.variantUrl : null)
    if (image) {
      try {
        const publicImage = new URL(image)
        if (publicImage.origin === canonical.origin) entry.image = publicImage.toString()
      } catch {
        // An image extension is optional; never invent or emit an invalid image fact.
      }
    }
    const vid = doc.media?.video
    if (vid?.url && vid?.posterUrl && doc.title.value) {
      try {
        const contentLoc = new URL(vid.url)
        const thumbnailLoc = new URL(vid.posterUrl)
        if (contentLoc.origin === canonical.origin && thumbnailLoc.origin === canonical.origin) {
          entry.video = {
            contentLoc: contentLoc.toString(),
            thumbnailLoc: thumbnailLoc.toString(),
            title: doc.title.value,
            description: doc.description.value || doc.title.value,
          }
        }
      } catch {
        // A video extension is optional; never invent or emit an invalid video fact.
      }
    }
    byUrl.set(entry.url, entry)
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url))
}

export const sitemapPageCount = (count: number, size = SITEMAP_PAGE_SIZE) =>
  Math.max(1, Math.ceil(count / size))

export const sitemapPage = (entries: CrawlerEntry[], page: number, size = SITEMAP_PAGE_SIZE) =>
  entries.slice(page * size, page * size + size)

const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function renderSitemap(entries: CrawlerEntry[]) {
  const body = entries
    .map((entry) => {
      const image = entry.image
        ? `<image:image><image:loc>${xml(entry.image)}</image:loc></image:image>`
        : ''
      const video = entry.video
        ? `<video:video><video:thumbnail_loc>${xml(entry.video.thumbnailLoc)}</video:thumbnail_loc><video:title>${xml(entry.video.title)}</video:title><video:description>${xml(entry.video.description)}</video:description><video:content_loc>${xml(entry.video.contentLoc)}</video:content_loc></video:video>`
        : ''
      return `<url><loc>${xml(entry.url)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}${image}${video}</url>`
    })
    .join('')
  const imageNamespace = entries.some(({ image }) => image)
    ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    : ''
  const videoNamespace = entries.some(({ video }) => video)
    ? ' xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"'
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${imageNamespace}${videoNamespace}>${body}</urlset>`
}

export function renderSitemapIndex(
  origin: string,
  entries: CrawlerEntry[],
  size = SITEMAP_PAGE_SIZE,
) {
  const pages = entries.length ? sitemapPageCount(entries.length, size) : 0
  const body = Array.from({ length: pages }, (_, page) => {
    const subset = sitemapPage(entries, page, size)
    const lastmod = subset.reduce(
      (latest, item) => (item.lastmod && item.lastmod > latest ? item.lastmod : latest),
      '',
    )
    return `<sitemap><loc>${xml(`${origin}/sitemaps/${page + 1}.xml`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</sitemap>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`
}

export function conditionalXml(
  request: Request,
  body: string,
  cache = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
) {
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`
  const headers = {
    'Cache-Control': cache,
    ETag: etag,
    'Content-Type': 'application/xml; charset=utf-8',
  }
  return request.headers.get('if-none-match') === etag
    ? new Response(null, { status: 304, headers })
    : new Response(body, { status: 200, headers })
}

export const crawlerScale = (count: number) => ({
  eligibleUrls: count,
  pageSize: SITEMAP_PAGE_SIZE,
  partitions: sitemapPageCount(count),
  generation: count >= SITEMAP_ASYNC_TRIGGER_URLS ? 'asynchronous-recommended' : 'request-streamed',
  asyncTriggerUrls: SITEMAP_ASYNC_TRIGGER_URLS,
})
