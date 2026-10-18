import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  createPageFromTemplate,
  createTemplate,
  duplicateTemplate,
  getPagesUsingTemplate,
  reactivateTemplate,
  retireTemplate,
  syncPageWithTemplate,
} from '@/modules/presentation/composition'
import type { LayoutBlock, TemplateInheritanceMode } from '@/modules/public/page-builder'
import { resolveRedirectSite } from '@/modules/operations/redirect-site'
import { samePublicOrigin } from '@/modules/public/site-scope'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json(
      { error: 'Template inspection requires staff access.' },
      { status: 403 },
    )
  }
  const url = new URL(request.url)
  const siteId = await resolveRedirectSite(payload, auth.user, request)
  const templateId = url.searchParams.get('templateId')

  if (!siteId) {
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
  }

  if (templateId) {
    try {
      const row = await payload.findByID({
        collection: 'page-layouts',
        id: templateId,
        depth: 0,
        overrideAccess: false,
        user: auth.user,
      })
      if (row.site !== siteId || row.surface !== 'template')
        return NextResponse.json({ error: 'Template scope mismatch.' }, { status: 403 })
      const details = await getPagesUsingTemplate(payload, templateId, siteId)
      return NextResponse.json(details)
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 404 })
    }
  }

  const result = await payload.find({
    collection: 'page-layouts',
    where: { and: [{ site: { equals: siteId } }, { surface: { equals: 'template' } }] },
    limit: 100,
    overrideAccess: false,
    user: auth.user,
  } as never)

  return NextResponse.json({ templates: result.docs })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  if (!(await samePublicOrigin(payload, request, true)))
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json(
      { error: 'Template management requires staff access.' },
      { status: 403 },
    )
  }

  const body = (await request.json()) as {
    action: 'create' | 'duplicate' | 'retire' | 'reactivate' | 'create-page' | 'sync-page'
    siteId: string
    templateId?: string
    name?: string
    path?: string
    themeId?: string
    blocks?: LayoutBlock[]
    category?: string
    templateMode?: TemplateInheritanceMode
    pageId?: string
  }

  try {
    const siteId = await resolveRedirectSite(payload, auth.user, request, body.siteId)
    if (!siteId || !body.siteId)
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
    for (const id of [body.templateId, body.pageId].filter(Boolean)) {
      const row = await payload.findByID({
        collection: 'page-layouts',
        id: id!,
        depth: 0,
        overrideAccess: false,
        user: auth.user,
      })
      if (row.site !== siteId || (id === body.templateId && row.surface !== 'template'))
        return NextResponse.json({ error: 'Template scope mismatch.' }, { status: 403 })
    }
    switch (body.action) {
      case 'create': {
        if (!body.siteId || !body.name || !body.themeId || !Array.isArray(body.blocks)) {
          return NextResponse.json(
            { error: 'siteId, name, themeId, and blocks array are required to create a template.' },
            { status: 400 },
          )
        }
        const created = await createTemplate(payload, {
          siteId: body.siteId,
          name: body.name,
          themeId: body.themeId,
          blocks: body.blocks,
          category: body.category,
        })
        return NextResponse.json({ template: created }, { status: 201 })
      }
      case 'duplicate': {
        if (!body.templateId) {
          return NextResponse.json(
            { error: 'templateId is required to duplicate.' },
            { status: 400 },
          )
        }
        const duplicated = await duplicateTemplate(payload, body.templateId)
        return NextResponse.json({ template: duplicated }, { status: 201 })
      }
      case 'retire': {
        if (!body.templateId) {
          return NextResponse.json({ error: 'templateId is required to retire.' }, { status: 400 })
        }
        const retired = await retireTemplate(payload, body.templateId)
        return NextResponse.json({ template: retired })
      }
      case 'reactivate': {
        if (!body.templateId) {
          return NextResponse.json(
            { error: 'templateId is required to reactivate.' },
            { status: 400 },
          )
        }
        const reactivated = await reactivateTemplate(payload, body.templateId)
        return NextResponse.json({ template: reactivated })
      }
      case 'create-page': {
        if (!body.siteId || !body.path || !body.name || !body.templateId) {
          return NextResponse.json(
            {
              error:
                'siteId, path, name, and templateId are required to create a page from template.',
            },
            { status: 400 },
          )
        }
        const page = await createPageFromTemplate(payload, {
          siteId: body.siteId,
          path: body.path,
          name: body.name,
          templateId: body.templateId,
          templateMode: body.templateMode,
        })
        return NextResponse.json({ page }, { status: 201 })
      }
      case 'sync-page': {
        if (!body.pageId) {
          return NextResponse.json(
            { error: 'pageId is required to sync with template.' },
            { status: 400 },
          )
        }
        const syncResult = await syncPageWithTemplate(payload, body.pageId)
        return NextResponse.json(syncResult)
      }
      default:
        return NextResponse.json(
          { error: `Unknown template action: ${(body as { action: string }).action}` },
          { status: 400 },
        )
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
