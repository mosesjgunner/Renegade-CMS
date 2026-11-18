import type { PresentationDocument, Surface } from './contracts'
import type { LayoutBlock } from '../public/page-builder'
import { resolveTheme } from './registry'
export type PublishedPresentation = {
  version: 1
  path: string
  visibility: string
  revision: number
  document: PresentationDocument
}

const SNAPSHOT_SURFACES: ReadonlySet<string> = new Set([
  'page',
  'article',
  'home',
  'archive',
  'search',
  '404',
  'layout',
])

/**
 * The explicit compatibility reader for persisted published snapshots.
 * Snapshots written before the version fields existed are accepted when
 * the document is otherwise well-formed and are normalized to version 1;
 * anything malformed or from a newer version returns null so callers can
 * fall back to the record's own blocks instead of rendering garbage.
 * Valid snapshots keep their pinned theme/template exactly as published.
 */
export function readPublishedPresentation(value: unknown): PublishedPresentation | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.version !== undefined && raw.version !== 1) return null
  if (typeof raw.path !== 'string') return null
  const document = raw.document
  if (!document || typeof document !== 'object') return null
  const doc = document as Record<string, unknown>
  if (doc.version !== undefined && doc.version !== 1) return null
  if (typeof doc.siteId !== 'string' || !doc.siteId) return null
  const theme = doc.theme as { id?: unknown; version?: unknown } | undefined
  if (!theme || typeof theme.id !== 'string' || !theme.id) return null
  const template = doc.template as { id?: unknown; version?: unknown } | undefined
  if (!template || typeof template.id !== 'string' || !template.id) return null
  if (typeof doc.surface !== 'string' || !SNAPSHOT_SURFACES.has(doc.surface)) return null
  if (!doc.slots || typeof doc.slots !== 'object') return null
  const normalizedDocument: PresentationDocument = {
    ...(structuredClone(doc) as unknown as PresentationDocument),
    version: 1,
    surface: doc.surface as Surface,
    theme: {
      id: theme.id,
      version: typeof theme.version === 'string' ? theme.version : '1.0.0',
    },
    template: {
      id: template.id,
      version: typeof template.version === 'string' ? template.version : '1.0.0',
    },
  }
  return {
    version: 1,
    path: raw.path,
    visibility: typeof raw.visibility === 'string' ? raw.visibility : 'public',
    revision: typeof raw.revision === 'number' ? raw.revision : 1,
    document: normalizedDocument,
  }
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
