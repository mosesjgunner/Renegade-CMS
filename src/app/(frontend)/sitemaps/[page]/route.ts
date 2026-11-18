import { publicSiteForHost } from '@/modules/public/site-scope'
import config from '@payload-config'
import { getPayload } from 'payload'
import {
  conditionalXml,
  renderSitemap,
  sitemapPage,
  sitemapPageCount,
} from '@/modules/public/crawler'
import { getSitemapEntries } from '@/modules/public/sitemap-projection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ page: string }> }) {
  const raw = (await context.params).page.replace(/\.xml$/, '')
  if (!/^[1-9]\d*$/.test(raw)) return new Response('Not found', { status: 404 })
  const page = Number(raw) - 1
  if (!Number.isSafeInteger(page) || page < 0) return new Response('Not found', { status: 404 })
  const payload = await getPayload({ config })
  const siteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!siteId) return new Response('Not found', { status: 404 })
  const entries = await getSitemapEntries(payload, siteId)
  if (!entries.length || page >= sitemapPageCount(entries.length))
    return new Response('Not found', { status: 404 })
  return conditionalXml(request, renderSitemap(sitemapPage(entries, page)))
}
