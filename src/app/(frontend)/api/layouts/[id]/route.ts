import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { publishLayout, validateLayout, type PageLayout } from '@/modules/public/page-builder'
import { resolveTheme } from '@/modules/presentation/registry'

type Args = { params: Promise<{ id: string }> }
const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'
const relationId = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | undefined)?.id ?? '')

export async function PATCH(request: Request, { params }: Args) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user))
    return NextResponse.json({ error: 'Layout editing requires staff access.' }, { status: 403 })
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 256_000)
    return NextResponse.json({ error: 'Layout exceeds the 256 KB limit.' }, { status: 413 })
  const body = (await request.json()) as {
    layout?: PageLayout
    publish?: boolean
    expectedRevision?: number
  }
  if (!body.layout) return NextResponse.json({ error: 'A layout is required.' }, { status: 400 })
  const req = await createLocalReq({ user: auth.user ?? undefined }, payload)
  const id = (await params).id
  const existing = await payload.findByID({
    collection: 'page-layouts',
    id,
    depth: 0,
    req,
  })
  const stored = existing as unknown as Record<string, unknown>
  const existingSite =
    typeof existing.site === 'string'
      ? existing.site
      : String((existing.site as { id?: unknown } | undefined)?.id ?? '')
  if (body.layout.id !== id || body.layout.siteId !== existingSite)
    return NextResponse.json(
      { error: 'Layout scope does not match the stored document.' },
      { status: 400 },
    )
  if (body.expectedRevision !== Number(existing.revision))
    return NextResponse.json(
      { error: 'Draft revision conflict.', current: existing },
      { status: 409 },
    )
  const existingUnknown = Array.isArray(existing.unknownBlocks) ? existing.unknownBlocks : []
  if (JSON.stringify(body.layout.unknownBlocks ?? []) !== JSON.stringify(existingUnknown))
    return NextResponse.json(
      { error: 'Unavailable component data is server-controlled.' },
      { status: 400 },
    )
  const candidate: PageLayout = {
    ...body.layout,
    id,
    siteId: existingSite,
    path: String(existing.path),
    status: existing.status === 'published' ? 'published' : 'draft',
    surface: stored.surface === 'global' ? 'global' : 'page',
    slot: stored.slot === 'header' || stored.slot === 'footer' ? stored.slot : 'main',
    revision: Number(existing.revision) + 1,
    publishedRevision:
      typeof existing.publishedRevision === 'number' ? existing.publishedRevision : undefined,
    unknownBlocks: existingUnknown as PageLayout['unknownBlocks'],
  }
  const checked = validateLayout(candidate)
  const fatal = checked.errors.filter(
    (error) => !error.startsWith('Unavailable component preserved:'),
  )
  if (fatal.length)
    return NextResponse.json(
      { error: 'Layout validation failed.', details: fatal },
      { status: 422 },
    )
  const priorUnknownIds = new Set(
    [...(Array.isArray(existing.blocks) ? existing.blocks : []), ...existingUnknown].map((block) =>
      String((block as { id?: unknown }).id),
    ),
  )
  if ((checked.layout.unknownBlocks ?? []).some((block) => !priorUnknownIds.has(block.id)))
    return NextResponse.json({ error: 'Unknown components cannot be added.' }, { status: 422 })
  const theme = resolveTheme(checked.layout.themeId)
  for (const block of checked.layout.blocks) {
    const definition = theme.componentRegistry[block.component]
    for (const [name, field] of Object.entries(definition.fields)) {
      const value = block.props[name] as { id?: string; href?: string } | undefined
      if (!value?.id || (field.type !== 'media' && field.type !== 'link')) continue
      const collection = field.type === 'media' ? 'media-assets' : value.id.split(':', 1)[0]
      const reference = field.type === 'media' ? value.id : value.id.slice(collection.length + 1)
      if (collection !== 'media-assets' && collection !== 'content')
        return NextResponse.json(
          { error: `${name} uses an unsupported reference.` },
          { status: 422 },
        )
      const target = await payload
        .findByID({
          collection: collection as never,
          id: reference,
          depth: 0,
          overrideAccess: true,
        } as never)
        .catch(() => null)
      if (!target || relationId((target as { site?: unknown }).site) !== existingSite)
        return NextResponse.json({ error: `${name} must reference this site.` }, { status: 422 })
      const canonical = target as unknown as Record<string, unknown>
      const expectedHref = field.type === 'media' ? canonical.url : canonical.canonicalPath
      if (typeof expectedHref !== 'string' || value.href !== expectedHref)
        return NextResponse.json(
          { error: `${name} does not match its canonical record.` },
          { status: 422 },
        )
    }
  }
  const layout = body.publish
    ? publishLayout(checked.layout, ['layout:edit', 'layout:publish'])
    : checked.layout
  const history = Array.isArray(
    (existing as unknown as { revisionHistory?: unknown[] }).revisionHistory,
  )
    ? (existing as unknown as { revisionHistory: unknown[] }).revisionHistory
    : []
  const updated = await payload.update({
    collection: 'page-layouts',
    id,
    req,
    context: { publishPresentation: body.publish === true },
    data: {
      themeId: layout.themeId,
      surface: layout.surface ?? 'page',
      slot: layout.slot ?? 'main',
      layoutVersion: layout.version,
      status: body.publish ? 'published' : existing.status,
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
