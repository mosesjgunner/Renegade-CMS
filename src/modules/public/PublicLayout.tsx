import { renderLayout, type PageLayout } from './page-builder'

export function PublicLayout({ record, path }: { record: Record<string, unknown>; path: string }) {
  const layout: PageLayout = {
    version: 1,
    id: String(record.id),
    siteId: typeof record.site === 'string' ? record.site : '',
    spaceId: typeof record.space === 'string' ? record.space : undefined,
    path,
    status: 'published',
    themeId: record.themeId === 'renegade-party' ? 'renegade-party' : 'neutral-starter',
    blocks: Array.isArray(record.blocks) ? (record.blocks as PageLayout['blocks']) : [],
    unknownBlocks: Array.isArray(record.unknownBlocks)
      ? (record.unknownBlocks as PageLayout['blocks'])
      : [],
    revision: Number(record.revision ?? 1),
    publishedRevision:
      typeof record.publishedRevision === 'number' ? record.publishedRevision : undefined,
  }
  return <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">{renderLayout(layout)}</main>
}
