import type { MetadataRoute } from 'next'
import config from '@payload-config'
import { getPayload } from 'payload'

import {
  getAllIndexableDiscoveryDocuments,
  discoveryToSitemapEntry,
} from '@/modules/public/discovery'
import { resolveSiteSettings } from '@/modules/core/site-settings'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const payload = await getPayload({ config })
    const settings = await resolveSiteSettings(payload)

    // If site is explicitly configured as noindex, omit all URLs from sitemap
    if (settings.indexingMode === 'noindex') {
      return []
    }

    const docs = await getAllIndexableDiscoveryDocuments(payload)
    const entries: MetadataRoute.Sitemap = []
    const seenUrls = new Set<string>()

    for (const doc of docs) {
      const entry = discoveryToSitemapEntry(doc)
      if (entry && !seenUrls.has(entry.url)) {
        seenUrls.add(entry.url)
        entries.push(entry)
      }
    }

    return entries
  } catch {
    const fallbackOrigin = process.env.APP_URL ?? 'http://localhost:3000'
    return [{ url: fallbackOrigin, lastModified: new Date() }]
  }
}
