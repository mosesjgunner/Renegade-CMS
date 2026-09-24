import config from '@payload-config'
import { getPayload } from 'payload'
import { getAllIndexableDiscoveryDocuments } from '@/modules/public/discovery'
import {
  conditionalXml,
  crawlerEntries,
  renderSitemap,
  sitemapPage,
  sitemapPageCount,
} from '@/modules/public/crawler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ page: string }> }) {
  const raw = (await context.params).page.replace(/\.xml$/, '')
  const page = Number(raw) - 1
  if (!Number.isInteger(page) || page < 0) return new Response('Not found', { status: 404 })
  const payload = await getPayload({ config })
  const entries = crawlerEntries(await getAllIndexableDiscoveryDocuments(payload))
  if (!entries.length || page >= sitemapPageCount(entries.length))
    return new Response('Not found', { status: 404 })
  return conditionalXml(request, renderSitemap(sitemapPage(entries, page)))
}
