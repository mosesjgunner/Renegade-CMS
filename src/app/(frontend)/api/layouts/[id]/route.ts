import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { publishLayout, validateLayout, type PageLayout } from '@/modules/public/page-builder'

type Args = { params: Promise<{ id: string }> }
const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'staff'

export async function PATCH(request: Request, { params }: Args) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user))
    return NextResponse.json({ error: 'Layout editing requires staff access.' }, { status: 403 })
  const body = (await request.json()) as { layout?: PageLayout; publish?: boolean }
  if (!body.layout) return NextResponse.json({ error: 'A layout is required.' }, { status: 400 })
  const checked = validateLayout(body.layout)
  const layout = body.publish
    ? publishLayout(checked.layout, ['layout:edit', 'layout:publish'])
    : checked.layout
  const req = await createLocalReq({ user: auth.user ?? undefined }, payload)
  const id = (await params).id
  const existing = await payload.findByID({
    collection: 'page-layouts',
    id,
    depth: 0,
    req,
  } as never)
  const history = Array.isArray(
    (existing as unknown as { revisionHistory?: unknown[] }).revisionHistory,
  )
    ? (existing as unknown as { revisionHistory: unknown[] }).revisionHistory
    : []
  const updated = await payload.update({
    collection: 'page-layouts',
    id,
    req,
    data: {
      themeId: layout.themeId,
      layoutVersion: layout.version,
      status: layout.status,
      blocks: layout.blocks,
      unknownBlocks: layout.unknownBlocks ?? [],
      revision: layout.revision,
      publishedRevision: layout.publishedRevision,
      revisionHistory: [
        ...history,
        { revision: layout.revision, blocks: layout.blocks, savedAt: new Date().toISOString() },
      ],
    },
  } as never)
  return NextResponse.json({ layout: updated, warnings: checked.errors })
}
