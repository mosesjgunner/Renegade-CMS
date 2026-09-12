import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { renderLayout, type PageLayout } from '@/modules/public/page-builder'
import { resolveTheme } from '@/modules/presentation/registry'

export const dynamic = 'force-dynamic'

export default async function DraftLayoutPreview({ params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!['owner', 'administrator', 'staff'].includes(String(auth.user?.role))) notFound()
  const row = await payload.findByID({
    collection: 'page-layouts',
    id: (await params).id,
    depth: 0,
    overrideAccess: true,
  })
  const stored = row as unknown as Record<string, unknown>
  const layout: PageLayout = {
    version: Number(row.layoutVersion ?? 1) as 1,
    id: String(row.id),
    siteId: typeof row.site === 'string' ? row.site : String(row.site?.id ?? ''),
    path: String(row.path),
    status: row.status === 'published' ? 'published' : 'draft',
    themeId: resolveTheme(String(row.themeId)).id,
    surface: stored.surface === 'global' ? 'global' : 'page',
    slot: stored.slot === 'header' || stored.slot === 'footer' ? stored.slot : 'main',
    blocks: (Array.isArray(row.blocks) ? row.blocks : []) as PageLayout['blocks'],
    unknownBlocks: (Array.isArray(row.unknownBlocks)
      ? row.unknownBlocks
      : []) as PageLayout['blocks'],
    revision: Number(row.revision),
    publishedRevision:
      typeof row.publishedRevision === 'number' ? row.publishedRevision : undefined,
  }
  return (
    <main data-authenticated-draft-preview className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      {renderLayout(layout)}
    </main>
  )
}
