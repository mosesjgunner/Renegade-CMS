import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  checkOperatorRecordAccess,
  resolveOperatorGrantContext,
} from '@/modules/operations/operator-grants'
import {
  listRedirectRules,
  toRedirectInput,
  validateRedirectRuleInput,
} from '@/modules/public/redirect-manager'
import type { PublicRedirect } from '@/payload-types'
import { resolveRedirectSite } from '@/modules/operations/redirect-site'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const siteId = await resolveRedirectSite(payload, auth.user, request)
    if (!siteId) return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
    const rules = await listRedirectRules(payload, siteId)
    return NextResponse.json({ rules, siteId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list redirect rules.' },
      { status: 400 },
    )
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      id?: string
      siteId?: string
      fromPath: string
      toPath: string
      statusCode?: string
      match?: string
      preserveQuery?: boolean
      enabled?: boolean
    }

    const grant = await resolveOperatorGrantContext(payload, auth.user)
    if (!grant.authorized)
      return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
    let siteId = await resolveRedirectSite(payload, auth.user, request, body.siteId)
    if (body.id) {
      if (!(await checkOperatorRecordAccess(payload, auth.user, 'public-redirects', body.id)))
        return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
      const current = await payload.findByID({
        collection: 'public-redirects',
        id: body.id,
        depth: 0,
        overrideAccess: true,
      })
      const boundSite = typeof current.site === 'object' ? current.site?.id : current.site
      if (body.siteId && body.siteId !== boundSite)
        return NextResponse.json({ error: 'Redirect belongs to another site.' }, { status: 403 })
      siteId = String(boundSite ?? '')
    }
    if (!siteId || (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId)))
      return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })

    const existingRules = await listRedirectRules(payload, siteId)
    const validation = validateRedirectRuleInput(body, existingRules.map(toRedirectInput))
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    if (body.id) {
      const updated = (await payload.update({
        collection: 'public-redirects',
        id: body.id,
        data: {
          fromPath: body.fromPath,
          toPath: body.toPath,
          statusCode: body.statusCode || '301',
          match: body.match || 'exact',
          preserveQuery: body.preserveQuery !== undefined ? body.preserveQuery : true,
          enabled: body.enabled !== undefined ? body.enabled : true,
        } as never,
        overrideAccess: true,
      })) as unknown as PublicRedirect

      return NextResponse.json({ rule: updated, updated: true })
    }

    const created = (await payload.create({
      collection: 'public-redirects',
      data: {
        site: siteId,
        fromPath: body.fromPath,
        toPath: body.toPath,
        statusCode: body.statusCode || '301',
        match: body.match || 'exact',
        preserveQuery: body.preserveQuery !== undefined ? body.preserveQuery : true,
        enabled: body.enabled !== undefined ? body.enabled : true,
        hitCount: 0,
      } as never,
      overrideAccess: true,
    })) as unknown as PublicRedirect

    return NextResponse.json({ rule: created, created: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save redirect rule.' },
      { status: 400 },
    )
  }
}

export async function DELETE(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Redirect rule ID is required.' }, { status: 400 })
  }
  if (!(await checkOperatorRecordAccess(payload, auth.user, 'public-redirects', id)))
    return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })

  try {
    await payload.delete({
      collection: 'public-redirects',
      id,
      overrideAccess: true,
    })
    return NextResponse.json({ success: true, deletedId: id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete redirect rule.' },
      { status: 400 },
    )
  }
}
