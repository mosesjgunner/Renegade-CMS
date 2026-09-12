/** Public rendering contracts. Canonical records live in Payload collections; themes only consume these views. */

export const THEME_CONTRACT_VERSION = 1 as const

export type ThemeId = string
export type ThemeSlot =
  | 'announcement'
  | 'header'
  | 'navigation'
  | 'main'
  | 'aside'
  | 'related-content'
  | 'footer'

export type ThemeTokens = {
  color: Record<'canvas' | 'surface' | 'ink' | 'muted' | 'accent' | 'focus', string>
  typography: { display: string; body: string; scale: Record<'sm' | 'base' | 'lg' | 'xl', string> }
  spacing: Record<'compact' | 'normal' | 'relaxed', string>
  direction: { rtlSupported: boolean }
}

export type LegacyThemeManifest = {
  id: ThemeId
  contractVersion: typeof THEME_CONTRACT_VERSION
  label: string
  compatibility: { min: number; max: number }
  tokens: ThemeTokens
  variants: { header: string[]; footer: string[]; layout: string[] }
  templates: Record<string, string>
  componentRegistry: Record<string, { slot: ThemeSlot; variant: string }>
  defaults: { header: string; footer: string; layout: string }
  extensionPoints: { childThemes: boolean; tokenOverrides: boolean; customComponents: ThemeSlot[] }
}

export { themes, resolveTheme } from '../presentation/registry'
import { resolveTheme } from '../presentation/registry'

/** Migrations transform presentation configuration only. They never transform canonical content. */
export function migrateThemeConfig(input: {
  version: number
  themeId?: string
  tokens?: Record<string, string>
}) {
  if (input.version > THEME_CONTRACT_VERSION)
    throw new Error('Theme configuration is newer than this renderer.')
  return {
    version: THEME_CONTRACT_VERSION,
    themeId: resolveTheme(input.themeId).id,
    tokens: input.tokens ?? {},
  }
}

export type PublicVisibility = 'public' | 'unlisted' | 'members' | 'friends' | 'private'
export type PublicState = {
  visibility?: PublicVisibility
  status?: string
  moderationState?: string
  retentionMode?: string
  removeFromDiscovery?: boolean
  retentionExpiresAt?: string | null
  suspendedAt?: string | null
  /** A scheduled record is not public until this instant. */
  publishedAt?: string | null
}

export function canRenderPublic(record: PublicState, now = new Date()): boolean {
  if (record.visibility && record.visibility !== 'public') return false
  if (
    record.status &&
    !['published', 'updated', 'active', 'open', 'scheduled'].includes(record.status)
  )
    return false
  // "scheduled" is a workflow state, not a public visibility state.  A future
  // publishedAt also keeps an accidentally pre-dated published record private.
  if (record.status === 'scheduled' && !record.publishedAt) return false
  if (record.publishedAt && new Date(record.publishedAt).getTime() > now.getTime()) return false
  if (record.moderationState && record.moderationState !== 'clear') return false
  if (
    record.suspendedAt ||
    record.retentionMode === 'manual-burn' ||
    record.retentionMode === 'tombstone'
  )
    return false
  if (
    record.retentionMode === 'expire-at' &&
    (!record.retentionExpiresAt || new Date(record.retentionExpiresAt) <= now)
  )
    return false
  return true
}

export function canDiscoverPublic(record: PublicState, now = new Date()): boolean {
  return (
    canRenderPublic(record, now) &&
    record.visibility !== 'unlisted' &&
    record.removeFromDiscovery !== true
  )
}

export type { ThemeManifest } from '../presentation/contracts'
