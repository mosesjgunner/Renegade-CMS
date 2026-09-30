import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { canDiscoverPublic } from '@/modules/public/contracts'
import {
  readRouteTemplates,
  readRouteTemplatesBySite,
  resolvePublicUrl,
  routeTemplatesForSite,
  type SemanticKind,
} from '@/modules/public/semantic-url'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  try {
    const body = (await request.json()) as {
      slug?: unknown
      contentType?: unknown
      id?: unknown
      siteId?: unknown
    }
    const slug = typeof body.slug === 'string' ? body.slug.slice(0, 300) : ''
    const kind: SemanticKind = body.contentType === 'page' ? 'page' : 'article'
    if (!slug.trim()) return NextResponse.json({ path: null, willRedirect: false })
    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as Record<string, unknown>
    let siteId = typeof body.siteId === 'string' ? body.siteId : ''
    let existing: Record<string, unknown> | null = null
    if (typeof body.id === 'string' && body.id) {
      try {
        existing = (await payload.findByID({
          collection: 'content',
          id: body.id,
          depth: 0,
          overrideAccess: true,
        } as never)) as unknown as Record<string, unknown>
        if (!siteId) siteId = typeof existing.site === 'string' ? existing.site : ''
      } catch {
        existing = null
      }
    }
    const templates = routeTemplatesForSite(
      siteId,
      readRouteTemplates(settings.semanticRouteTemplates),
      readRouteTemplatesBySite(
        settings.semanticRouteTemplatesBySite,
        readRouteTemplates(settings.semanticRouteTemplates),
      ),
    )
    const path = resolvePublicUrl({ kind, slug }, templates)
    const willRedirect = Boolean(
      existing && canDiscoverPublic(existing) && existing.canonicalPath !== path,
    )
    return NextResponse.json({ path, willRedirect })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not resolve the public URL.' },
      { status: 400 },
    )
  }
}
