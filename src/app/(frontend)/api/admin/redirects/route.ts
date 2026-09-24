import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  listRedirectRules,
  toRedirectInput,
  validateRedirectRuleInput,
} from '@/modules/public/redirect-manager'
import type { PublicRedirect } from '@/payload-types'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') || undefined

  try {
    const rules = await listRedirectRules(payload, siteId)
    return NextResponse.json({ rules })
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

    const sites = await payload.find({
      collection: 'sites',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const siteId = body.siteId || (sites.docs[0]?.id ? String(sites.docs[0].id) : 'default-site')

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
