import { publicSiteForHost } from '@/modules/public/site-scope'
import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import { conditionalXml, renderSitemapIndexSummary } from '@/modules/public/crawler'
import { getSitemapIndexSummary } from '@/modules/public/sitemap-projection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const siteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!siteId) return new Response('Not found', { status: 404 })
  const settings = await resolveSiteSettings(payload)
  const origin = settings.canonicalOriginsBySite[siteId] || settings.canonicalOrigin
  const summary = await getSitemapIndexSummary(payload, siteId)
  return conditionalXml(request, renderSitemapIndexSummary(origin, summary.pageLastmods))
}
