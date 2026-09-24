import type { PresentationDocument } from './contracts'
import type { LayoutBlock } from '../public/page-builder'
import { resolveTheme } from './registry'
export type PublishedPresentation = {
  version: 1
  path: string
  visibility: string
  revision: number
  document: PresentationDocument
}
export function snapshotLayout(record: Record<string, unknown>): PublishedPresentation {
  if (Number(record.layoutVersion ?? 1) !== 1)
    throw new Error('Migrate the layout version before publishing; draft preserved.')
  const theme = resolveTheme(String(record.themeId ?? ''))
  return {
    version: 1,
    path: String(record.path),
    visibility: String(record.visibility ?? 'public'),
    revision: Number(record.revision ?? 1),
    document: {
      version: 1,
      siteId:
        typeof record.site === 'string'
          ? record.site
          : String((record.site as { id?: string })?.id ?? ''),
      theme: { id: theme.id, version: theme.version },
      template: { id: 'layout', version: '1.0.0' },
      surface: 'layout',
      slots: {
        main: [],
        [['header', 'footer', 'announcement', 'cta'].includes(String(record.slot))
          ? String(record.slot)
          : 'main']: structuredClone([
          ...(Array.isArray(record.blocks) ? record.blocks : []),
          ...(Array.isArray(record.unknownBlocks) ? record.unknownBlocks : []),
        ]) as LayoutBlock[],
      },
    },
  }
}
