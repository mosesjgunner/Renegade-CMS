import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { renderLayout, type PageLayout } from '@/modules/public/page-builder'
import { resolveTheme } from '@/modules/presentation/registry'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function DraftLayoutPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ viewport?: string }>
}) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!['owner', 'administrator', 'staff'].includes(String(auth.user?.role))) notFound()
  const { id } = await params
  const { viewport = 'desktop' } = (await searchParams) ?? {}
  const targetViewport = (viewport === 'mobile' || viewport === 'tablet' ? viewport : 'desktop') as
    | 'desktop'
    | 'tablet'
    | 'mobile'

  const row = await payload.findByID({
    collection: 'page-layouts',
    id,
    depth: 0,
    overrideAccess: true,
  })
  const stored = row as unknown as Record<string, unknown>
  const layout: PageLayout = {
    version: Number(row.layoutVersion ?? 1) as 1,
    id: String(row.id),
    siteId: typeof row.site === 'string' ? row.site : String(row.site?.id ?? ''),
    name: typeof stored.name === 'string' ? stored.name : undefined,
    path: String(row.path),
    status: row.status === 'published' ? 'published' : 'draft',
    themeId: resolveTheme(String(row.themeId)).id,
    surface: (stored.surface as PageLayout['surface']) ?? 'page',
    slot:
      stored.slot === 'header' ||
      stored.slot === 'footer' ||
      stored.slot === 'announcement' ||
      stored.slot === 'cta'
        ? stored.slot
        : 'main',
    templateId: typeof stored.templateId === 'string' ? stored.templateId : undefined,
    templateVersion:
      typeof stored.templateVersion === 'number' ? stored.templateVersion : undefined,
    templateMode: stored.templateMode as PageLayout['templateMode'],
    isRetired: stored.isRetired === true,
    category: typeof stored.category === 'string' ? stored.category : undefined,
    blocks: (Array.isArray(row.blocks) ? row.blocks : []) as PageLayout['blocks'],
    unknownBlocks: (Array.isArray(row.unknownBlocks)
      ? row.unknownBlocks
      : []) as PageLayout['blocks'],
    revision: Number(row.revision),
    publishedRevision:
      typeof row.publishedRevision === 'number' ? row.publishedRevision : undefined,
  }

  const containerClasses =
    targetViewport === 'mobile'
      ? 'max-w-[375px] mx-auto border-x border-stone-300 dark:border-stone-700 shadow-2xl my-6 rounded-2xl overflow-hidden'
      : targetViewport === 'tablet'
        ? 'max-w-[768px] mx-auto border-x border-stone-300 dark:border-stone-700 shadow-xl my-6 rounded-xl overflow-hidden'
        : 'max-w-6xl mx-auto px-6 py-12'

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 py-6">
      <div className="max-w-4xl mx-auto px-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono text-stone-600 dark:text-stone-400">
          <span className="font-bold">Draft Preview:</span>
          <span>{layout.path || layout.name || layout.id}</span>
          <span className="badge badge-neutral capitalize">{targetViewport}</span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={`/builder/${id}/preview?viewport=desktop`}
            className={`btn btn-xs ${targetViewport === 'desktop' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Desktop
          </a>
          <a
            href={`/builder/${id}/preview?viewport=tablet`}
            className={`btn btn-xs ${targetViewport === 'tablet' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Tablet
          </a>
          <a
            href={`/builder/${id}/preview?viewport=mobile`}
            className={`btn btn-xs ${targetViewport === 'mobile' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Mobile
          </a>
        </div>
      </div>
      <main
        data-authenticated-draft-preview
        data-viewport={targetViewport}
        className={`${containerClasses} bg-white dark:bg-stone-900`}
      >
        {renderLayout(layout, targetViewport)}
      </main>
    </div>
  )
}
