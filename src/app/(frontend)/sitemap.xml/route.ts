import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import { conditionalXml, crawlerEntries, renderSitemapIndex } from '@/modules/public/crawler'
import { getAllIndexableDiscoveryDocuments } from '@/modules/public/discovery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const settings = await resolveSiteSettings(payload)
  const entries = crawlerEntries(await getAllIndexableDiscoveryDocuments(payload))
  return conditionalXml(request, renderSitemapIndex(settings.canonicalOrigin, entries))
}
