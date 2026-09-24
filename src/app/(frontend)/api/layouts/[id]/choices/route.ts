import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

type Args = { params: Promise<{ id: string }> }
const staff = (role?: string) => ['owner', 'administrator', 'staff'].includes(String(role))
const siteId = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | undefined)?.id ?? '')

export async function GET(request: Request, { params }: Args) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user?.role))
    return NextResponse.json({ error: 'Layout choices require staff access.' }, { status: 403 })
  const layout = await payload.findByID({
    collection: 'page-layouts',
    id: (await params).id,
    depth: 0,
    overrideAccess: true,
  })
  const site = siteId(layout.site)
  const kind = new URL(request.url).searchParams.get('kind')
  if (kind === 'media') {
    const result = await payload.find({
      collection: 'media-assets',
      where: { site: { equals: site } },
      depth: 0,
      limit: 100,
      overrideAccess: true,
    } as never)
    return NextResponse.json({
      options: result.docs.map((value) => {
        const row = value as unknown as Record<string, unknown>
        return {
          id: String(row.id),
          siteId: site,
          label: String(row.altText ?? row.filename ?? 'Media'),
          href: String(row.url ?? ''),
        }
      }),
    })
  }
  if (kind === 'link') {
    const result = await payload.find({
      collection: 'content',
      where: { site: { equals: site } },
      depth: 0,
      limit: 100,
      overrideAccess: true,
    } as never)
    return NextResponse.json({
      options: (result.docs as unknown as Array<Record<string, unknown>>)
        .filter((row) => typeof row.canonicalPath === 'string')
        .map((row) => ({
          id: `content:${row.id}`,
          siteId: site,
          label: String(row.title ?? row.canonicalPath),
          href: String(row.canonicalPath),
        })),
    })
  }
  return NextResponse.json({ error: 'Unknown chooser.' }, { status: 400 })
}
