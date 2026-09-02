import type { MetadataRoute } from 'next'
import config from '@payload-config'
import { getPayload } from 'payload'

import { canDiscoverPublic, type PublicState } from '@/modules/public/contracts'
import { resolveSiteSettings } from '@/modules/core/site-settings'

type SitemapContent = PublicState & {
  canonicalPath?: unknown
  updatedAtEditorial?: unknown
  updatedAt?: unknown
  seoNoIndex?: unknown
}

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let base = process.env.APP_URL ?? 'http://localhost:3000'
  try {
    const payload = await getPayload({ config })
    const settings = await resolveSiteSettings(payload)
    base = settings.canonicalOrigin

    // If site is explicitly configured as noindex, omit URLs from sitemap
    if (settings.indexingMode === 'noindex') {
      return []
    }

    const records = await Promise.all(
      ['content', 'events', 'timelines', 'albums', 'discussions', 'products', 'page-layouts'].map(
        async (collection) =>
          payload
            .find({ collection, limit: 1000, depth: 0, overrideAccess: true } as never)
            .catch(() => ({ docs: [] })),
      ),
    )

    const entries: MetadataRoute.Sitemap = [
      {
        url: `${base}/`,
        lastModified: new Date(),
      },
      {
        url: `${base}/articles`,
        lastModified: new Date(),
      },
    ]

    const recordEntries = records
      .flatMap((content) => content.docs as unknown as SitemapContent[])
      .filter((record) => canDiscoverPublic(record))
      .filter((record) => record.seoNoIndex !== true)
      .flatMap((record) => {
        if (typeof record.canonicalPath !== 'string') return []
        if (record.canonicalPath === '/') return []
        const lastMod = record.updatedAtEditorial || record.updatedAt
        return [
          {
            url: new URL(record.canonicalPath, base).toString(),
            lastModified: lastMod ? new Date(String(lastMod)) : undefined,
          },
        ]
      })

    return [...entries, ...recordEntries]
  } catch {
    return [{ url: base, lastModified: new Date() }]
  }
}
