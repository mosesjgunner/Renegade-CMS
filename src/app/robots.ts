import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import { publicSiteForHost } from '@/modules/public/site-scope'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const closed: MetadataRoute.Robots = { rules: [{ userAgent: '*', disallow: '/' }] }
  try {
    const payload = await getPayload({ config })
    const siteId = await publicSiteForHost(payload, (await headers()).get('host'))
    if (!siteId) return closed
    const settings = await resolveSiteSettings(payload)
    if (settings.indexingMode === 'noindex' || settings.launchState !== 'live') return closed
    const base = settings.canonicalOriginsBySite[siteId] || settings.canonicalOrigin
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: [
            '/admin',
            '/api',
            '/preview',
            '/setup',
            '/guided-setup',
            '/builder',
            '/internal',
            '/private',
          ],
        },
      ],
      sitemap: `${base}/sitemap.xml`,
    }
  } catch {
    // Bootstrap or database failure must not advertise an unverified public site.
    return closed
  }
}
