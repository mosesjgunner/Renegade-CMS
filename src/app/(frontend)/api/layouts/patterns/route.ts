import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { createPattern, instantiatePattern, listPatterns } from '@/modules/presentation/composition'
import type { LayoutBlock, PageLayout } from '@/modules/public/page-builder'
import { resolveRedirectSite } from '@/modules/operations/redirect-site'
import { samePublicOrigin } from '@/modules/public/site-scope'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Pattern access requires staff access.' }, { status: 403 })
  }
  const url = new URL(request.url)
  const siteId = await resolveRedirectSite(payload, auth.user, request)
  const themeId = url.searchParams.get('themeId') ?? undefined
  if (!siteId) {
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
  }
  const patterns = await listPatterns(payload, siteId, themeId)
  return NextResponse.json({ patterns })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  if (!(await samePublicOrigin(payload, request, true)))
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json(
      { error: 'Pattern management requires staff access.' },
      { status: 403 },
    )
  }

  const body = (await request.json()) as {
    action: 'save' | 'instantiate'
    siteId: string
    name?: string
    themeId?: string
    category?: string
    blocks?: LayoutBlock[]
    patternId?: string
    mode?: 'snapshot' | 'linked'
  }

  try {
    const siteId = await resolveRedirectSite(payload, auth.user, request, body.siteId)
    if (!siteId || !body.siteId)
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
    if (body.patternId) {
      const pattern = await payload.findByID({
        collection: 'page-layouts',
        id: body.patternId,
        depth: 0,
        overrideAccess: false,
        user: auth.user,
      })
      if (pattern.site !== siteId || pattern.surface !== 'pattern')
        return NextResponse.json({ error: 'Pattern scope mismatch.' }, { status: 403 })
    }
    if (body.action === 'save') {
      if (!body.siteId || !body.name || !body.themeId || !Array.isArray(body.blocks)) {
        return NextResponse.json(
          { error: 'siteId, name, themeId, and blocks array are required to save a pattern.' },
          { status: 400 },
        )
      }
      const pattern = await createPattern(payload, {
        siteId: body.siteId,
        name: body.name,
        themeId: body.themeId,
        category: body.category,
        blocks: body.blocks,
      })
      return NextResponse.json({ pattern }, { status: 201 })
    }

    if (body.action === 'instantiate') {
      if (!body.patternId || !body.mode) {
        return NextResponse.json(
          { error: 'patternId and mode (snapshot or linked) are required to instantiate.' },
          { status: 400 },
        )
      }
      const patternDoc = await payload.findByID({
        collection: 'page-layouts',
        id: body.patternId,
        overrideAccess: true,
      })
      const blocks = instantiatePattern(patternDoc as unknown as PageLayout, body.mode)
      return NextResponse.json({ blocks, mode: body.mode })
    }

    return NextResponse.json({ error: 'Unknown pattern action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
