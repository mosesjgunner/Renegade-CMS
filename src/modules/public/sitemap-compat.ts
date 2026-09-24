import type { MetadataRoute } from 'next'
import config from '@payload-config'
import { getPayload } from 'payload'
import { crawlerEntries } from './crawler'
import { getAllIndexableDiscoveryDocuments } from './discovery'

/** Local-API projection retained for integration tests; HTTP serves a sitemap index. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const payload = await getPayload({ config })
    return crawlerEntries(await getAllIndexableDiscoveryDocuments(payload)).map((entry) => ({
      url: entry.url,
      ...(entry.lastmod ? { lastModified: new Date(entry.lastmod) } : {}),
    }))
  } catch {
    return []
  }
}
