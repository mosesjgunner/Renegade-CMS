import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { installRecipe } from '@/modules/public/page-builder'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'staff'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user))
    return NextResponse.json(
      { error: 'Starter installation requires staff access.' },
      { status: 403 },
    )
  const body = (await request.json()) as { recipeId?: string; siteId?: string; path?: string }
  if (!body.recipeId || !body.siteId || !body.path?.startsWith('/'))
    return NextResponse.json(
      { error: 'Recipe, site, and an absolute path are required.' },
      { status: 400 },
    )
  const req = await createLocalReq({ user: auth.user ?? undefined }, payload)
  const existing = await payload.find({
    collection: 'page-layouts',
    where: { site: { equals: body.siteId }, path: { equals: body.path } },
    limit: 1,
    req,
  } as never)
  if (existing.docs.length)
    return NextResponse.json({ error: 'A layout already exists at this path.' }, { status: 409 })
  const layout = installRecipe(undefined, body.recipeId, body.siteId)
  const created = await payload.create({
    collection: 'page-layouts',
    req,
    data: {
      site: body.siteId,
      path: body.path,
      themeId: layout.themeId,
      layoutVersion: layout.version,
      status: 'draft',
      visibility: 'public',
      blocks: layout.blocks,
      unknownBlocks: [],
      revision: layout.revision,
      revisionHistory: [
        { revision: layout.revision, blocks: layout.blocks, installedRecipe: body.recipeId },
      ],
    },
  } as never)
  return NextResponse.json({ layout: created }, { status: 201 })
}
