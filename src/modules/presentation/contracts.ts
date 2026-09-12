import type { ReactNode } from 'react'
import type { LegacyThemeManifest, ThemeSlot } from '../public/contracts'
import type { ComponentDefinition, LayoutBlock } from '../public/page-builder'

export type { ThemeSlot } from '../public/contracts'

export const RENEGADE_PRESENTATION_VERSION = '1.0.0'
export type Surface = 'page' | 'article' | 'home' | 'archive' | 'search' | '404' | 'layout'
export type Template = {
  id: string
  version: string
  contentTypes: Surface[]
  slots: Partial<Record<ThemeSlot, { required: boolean; allowedComponents: string[] }>>
  render: (slots: Partial<Record<ThemeSlot, ReactNode>>) => ReactNode
}
export type ThemeManifest = Omit<LegacyThemeManifest, 'componentRegistry'> & {
  version: string
  renegade: string
  description: string
  capabilities: string[]
  tokenSchema: Record<string, 'color' | 'font' | 'length' | 'boolean'>
  componentRegistry: Readonly<Record<string, ComponentDefinition>>
  templateRegistry: Readonly<Record<string, Template>>
  fallbacks: Record<Surface, string>
  globalRegions: { header: string; footer: string }
  assets: Array<{ path: string; integrity: string }>
  migrations: Array<{
    from: string
    to: string
    migrate: (document: PresentationDocument) => PresentationDocument
  }>
  integrity: { source: 'bundled'; release: string }
}
export type ThemeReference = { id: string; version: string }
export type ThemeSelection = {
  version: 1
  siteId: string
  revision: number
  active: ThemeReference
  draft?: ThemeReference
  permittedOverrides: ThemeReference[]
  permittedTemplateOverrides?: Partial<Record<Surface, string[]>>
}
/** Only presentation state; content is resolved independently by canonical id/revision. */
export type PresentationDocument = {
  version: 1
  siteId: string
  contentId?: string
  theme: ThemeReference
  template: { id: string; version: string }
  surface: Surface
  slots: Partial<Record<ThemeSlot, LayoutBlock[]>>
}
export interface VisualEditor<EditorData> {
  id: string
  version: string
  toEditor(document: PresentationDocument): EditorData
  fromEditor(original: PresentationDocument, data: EditorData): PresentationDocument
}
/** Storage must compare revision and replace the complete selection in one transaction. */
export interface ThemeSelectionStore {
  compareAndSwap(siteId: string, expectedRevision: number, next: ThemeSelection): Promise<boolean>
}
