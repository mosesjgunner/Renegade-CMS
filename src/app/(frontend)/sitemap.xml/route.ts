import { publicSiteForHost } from '@/modules/public/site-scope'
import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import { conditionalXml, crawlerEntries, renderSitemapIndex } from '@/modules/public/crawler'
import { getAllIndexableDiscoveryDocuments } from '@/modules/public/discovery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const siteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!siteId) return new Response('Not found', { status: 404 })
  const settings = await resolveSiteSettings(payload)
  const origin = settings.canonicalOriginsBySite[siteId] || settings.canonicalOrigin
  const entries = crawlerEntries(await getAllIndexableDiscoveryDocuments(payload, siteId))
  return conditionalXml(request, renderSitemapIndex(origin, entries))
}
