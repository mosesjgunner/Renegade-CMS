import config from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { canRenderPublic, type PublicState } from '@/modules/public/contracts'
import { PublicLayout } from '@/modules/public/PublicLayout'

export const dynamic = 'force-dynamic'

/** The homepage is a canonical layout route, not a separate marketing surface. */
export default async function HomePage() {
  const payload = await getPayload({ config })
  const publications = await payload.find({
    collection: 'publications',
    where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const publication = publications.docs[0] as unknown as Record<string, unknown> | undefined
  if (!publication) notFound()
  const siteId =
    typeof publication.site === 'string'
      ? publication.site
      : String((publication.site as { id?: unknown } | undefined)?.id ?? '')
  const layouts = await payload.find({
    collection: 'page-layouts',
    where: { and: [{ site: { equals: siteId } }, { path: { equals: '/' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const layout = layouts.docs[0] as unknown as (PublicState & Record<string, unknown>) | undefined
  if (!layout || !canRenderPublic(layout)) notFound()
  return <PublicLayout record={layout} path="/" />
}
