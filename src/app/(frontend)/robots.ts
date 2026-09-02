import type { MetadataRoute } from 'next'
import config from '@payload-config'
import { getPayload } from 'payload'

import { resolveSiteSettings } from '@/modules/core/site-settings'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  let base = process.env.APP_URL ?? 'http://localhost:3000'
  let indexingMode: 'index' | 'noindex' = 'index'

  try {
    const payload = await getPayload({ config })
    const settings = await resolveSiteSettings(payload)
    base = settings.canonicalOrigin
    indexingMode = settings.indexingMode
  } catch {
    // Keep fallback defaults during initial bootstrap
  }

  if (indexingMode === 'noindex') {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: `${base}/sitemap.xml`,
    }
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/preview', '/setup'] }],
    sitemap: `${base}/sitemap.xml`,
  }
}
