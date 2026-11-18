import type { ReactNode } from 'react'
import type { LegacyThemeManifest, ThemeSlot } from '../public/contracts'
import type { ComponentDefinition, LayoutBlock } from '../public/page-builder'

/**
 * Registered responsive policy ids (S2-09). `core-responsive-v1` is the
 * policy implemented by responsive.tsx: mobile < 768, tablet 768–1279,
 * desktop ≥ 1280, expressed publicly as the rg-hide-* classes. Theme
 * packages may only declare a registered policy id — never raw CSS or
 * breakpoints of their own.
 */
export const RESPONSIVE_POLICIES = ['core-responsive-v1'] as const
export type ResponsivePolicyId = (typeof RESPONSIVE_POLICIES)[number]
import type { ResponsiveMediaInput } from '../media/responsive'
import type { FormField } from '../audience/contracts'

/**
 * Server-hydrated composition props (S2-06). Renderers stay synchronous and
 * pure: the public render pipeline resolves canonical records (albums,
 * published form schemas, approved video embeds) into these bounded
 * projections before rendering. A block whose dependency cannot be resolved
 * receives an `*Unavailable` reason instead — never invented content.
 */
export type HydratedGalleryItem = {
  media: ResponsiveMediaInput
  caption?: string
  credits?: string
}

export type HydratedFormDefinition = {
  id: string
  title: string
  fields: readonly FormField[]
  consentText?: string
  endpoint: string
}

export type HydratedEmbed = {
  url: string
  title: string
}

/**
 * Resolved linked pattern (S2-07). Link policy: a linked instance follows
 * the pattern's latest PUBLISHED revision — draft edits stay private
 * until the pattern itself is published. `version` is the published
 * revision that actually resolved, so output can show operators exactly
 * which revision rendered. Snapshot-mode instances are detached copies
 * and never carry a resolution.
 */
export type HydratedPattern = {
  name: string
  version: number
  blocks: LayoutBlock[]
}

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
