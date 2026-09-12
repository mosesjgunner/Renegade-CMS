import type { PublishedPresentation } from '../presentation/snapshots'
import { renderPresentation } from '../presentation/document'
import { resolveTheme } from './contracts'
import { renderLayout, type PageLayout } from './page-builder'

export function PublicLayout({ record, path }: { record: Record<string, unknown>; path: string }) {
  const snapshot = record.publishedPresentation as PublishedPresentation | undefined
  if (snapshot) {
    const site =
      typeof record.site === 'string' ? record.site : (record.site as { id?: string })?.id
    if (snapshot.version !== 1 || snapshot.document.siteId !== site || snapshot.path !== path)
      throw new Error('Published presentation scope mismatch.')
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
        {renderPresentation(snapshot.document, resolveTheme(snapshot.document.theme.id))}
      </main>
    )
  }
  const layout: PageLayout = {
    version: Number(record.layoutVersion ?? 1) as PageLayout['version'],
    id: String(record.id),
    siteId: typeof record.site === 'string' ? record.site : '',
    spaceId: typeof record.space === 'string' ? record.space : undefined,
    path,
    status: 'published',
    themeId: resolveTheme(String(record.themeId ?? '')).id,
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
