import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { createPattern, instantiatePattern, listPatterns } from '@/modules/presentation/composition'
import type { LayoutBlock, PageLayout } from '@/modules/public/page-builder'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Pattern access requires staff access.' }, { status: 403 })
  }
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  const themeId = url.searchParams.get('themeId') ?? undefined
  if (!siteId) {
    return NextResponse.json({ error: 'siteId query parameter is required.' }, { status: 400 })
  }
  const patterns = await listPatterns(payload, siteId, themeId)
  return NextResponse.json({ patterns })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
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
