import type { MetadataRoute } from 'next'
import config from '@payload-config'
import { getPayload } from 'payload'

import { canDiscoverPublic, type PublicState } from '@/modules/public/contracts'

type SitemapContent = PublicState & {
  canonicalPath?: unknown
  updatedAtEditorial?: unknown
  seoNoIndex?: unknown
}

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  try {
    const payload = await getPayload({ config })
    const records = await Promise.all(
      ['content', 'events', 'timelines', 'albums', 'discussions', 'products', 'page-layouts'].map(
        async (collection) =>
          payload
            .find({ collection, limit: 1000, depth: 0, overrideAccess: true } as never)
            .catch(() => ({ docs: [] })),
      ),
    )
    return records
      .flatMap((content) => content.docs as unknown as SitemapContent[])
      .filter((record) => canDiscoverPublic(record))
      .filter((record) => record.seoNoIndex !== true)
      .flatMap((record) => {
        if (typeof record.canonicalPath !== 'string') return []
        return [
          {
            url: new URL(record.canonicalPath, base).toString(),
            lastModified: record.updatedAtEditorial
              ? new Date(String(record.updatedAtEditorial))
              : undefined,
          },
        ]
      })
  } catch {
    return [{ url: base, lastModified: new Date() }]
  }
}
