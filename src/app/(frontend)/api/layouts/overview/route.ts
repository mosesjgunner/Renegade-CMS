import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { resolveTheme } from '@/modules/presentation/registry'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Studio overview requires staff access.' }, { status: 403 })
  }
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  if (!siteId) {
    return NextResponse.json({ error: 'siteId query parameter is required.' }, { status: 400 })
  }

  const result = await payload.find({
    collection: 'page-layouts',
    where: { site: { equals: siteId } },
    limit: 500,
    overrideAccess: true,
  } as never)

  const rawDocs = result.docs as unknown as Array<Record<string, unknown>>
  const pages = rawDocs
    .filter((d) => d.surface === 'page' || !d.surface)
    .map((d) => ({
      id: String(d.id),
      name: typeof d.name === 'string' ? d.name : undefined,
      path: String(d.path),
      status: d.status,
      revision: Number(d.revision ?? 1),
      publishedRevision: d.publishedRevision,
      themeId: String(d.themeId),
      templateId: typeof d.templateId === 'string' ? d.templateId : undefined,
      templateMode: d.templateMode,
      templateVersion: d.templateVersion,
    }))

  const templateDocs = rawDocs.filter((d) => d.surface === 'template')
  const templates = templateDocs.map((d) => {
    const templateId = String(d.id)
    const usageCount = pages.filter((p) => p.templateId === templateId).length
    return {
      id: templateId,
      name: typeof d.name === 'string' ? d.name : 'Untitled template',
      path: String(d.path),
      status: d.status,
      revision: Number(d.revision ?? 1),
      isRetired: d.isRetired === true,
      category: typeof d.category === 'string' ? d.category : 'General',
      usageCount,
    }
  })

  const globals = rawDocs
    .filter((d) => d.surface === 'global')
    .map((d) => ({
      id: String(d.id),
      name: typeof d.name === 'string' ? d.name : `Global ${d.slot}`,
      slot: d.slot ?? 'header',
      status: d.status,
      revision: Number(d.revision ?? 1),
      publishedRevision: d.publishedRevision,
    }))

  const patterns = rawDocs
    .filter((d) => d.surface === 'pattern')
    .map((d) => ({
      id: String(d.id),
      name: typeof d.name === 'string' ? d.name : 'Pattern',
      category: typeof d.category === 'string' ? d.category : 'Sections',
      revision: Number(d.revision ?? 1),
    }))

  const siteSettings = (await payload
    .findGlobal({
      slug: 'site-settings',
      overrideAccess: true,
    } as never)
    .catch(() => null)) as unknown as Record<string, unknown> | null

  const themeId = String(siteSettings?.themeId ?? 'neutral-starter')
  const theme = resolveTheme(themeId)

  return NextResponse.json({
    pages,
    templates,
    globals,
    patterns,
    activeTheme: {
      id: theme.id,
      label: theme.label,
      version: theme.version,
    },
    previewPresets: [
      { id: 'desktop', label: 'Desktop', width: 1280 },
      { id: 'tablet', label: 'Tablet', width: 768 },
      { id: 'mobile', label: 'Mobile', width: 375 },
    ],
  })
}
