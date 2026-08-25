/** Public rendering contracts. Canonical records live in Payload collections; themes only consume these views. */

export const THEME_CONTRACT_VERSION = 1 as const

export type ThemeId = 'neutral-starter' | 'renegade-party'
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

export type ThemeManifest = {
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

const baseTokens: ThemeTokens = {
  color: {
    canvas: '#f8fafc',
    surface: '#ffffff',
    ink: '#172033',
    muted: '#5d6879',
    accent: '#155eef',
    focus: '#f79009',
  },
  typography: {
    display: 'ui-serif, Georgia, serif',
    body: 'ui-sans-serif, system-ui, sans-serif',
    scale: { sm: '0.875rem', base: '1rem', lg: '1.25rem', xl: '2.5rem' },
  },
  spacing: { compact: '0.75rem', normal: '1.5rem', relaxed: '3rem' },
  direction: { rtlSupported: true },
}

export const themes: Record<ThemeId, ThemeManifest> = {
  'neutral-starter': {
    id: 'neutral-starter',
    contractVersion: 1,
    label: 'Neutral starter',
    compatibility: { min: 1, max: 1 },
    tokens: baseTokens,
    variants: {
      header: ['simple'],
      footer: ['simple'],
      layout: ['reading', 'listing', 'gallery', 'forum'],
    },
    templates: {
      article: 'reading',
      page: 'reading',
      archive: 'listing',
      album: 'gallery',
      forum: 'forum',
    },
    componentRegistry: {
      masthead: { slot: 'header', variant: 'simple' },
      related: { slot: 'related-content', variant: 'cards' },
    },
    defaults: { header: 'simple', footer: 'simple', layout: 'reading' },
    extensionPoints: {
      childThemes: true,
      tokenOverrides: true,
      customComponents: ['main', 'aside', 'footer'],
    },
  },
  'renegade-party': {
    id: 'renegade-party',
    contractVersion: 1,
    label: 'Renegade Party',
    compatibility: { min: 1, max: 1 },
    tokens: {
      ...baseTokens,
      color: {
        canvas: '#f3efe6',
        surface: '#fffdf8',
        ink: '#171719',
        muted: '#5f5b55',
        accent: '#aa1d2f',
        focus: '#005ea8',
      },
      typography: { ...baseTokens.typography, display: 'ui-serif, Georgia, serif' },
    },
    variants: {
      header: ['masthead'],
      footer: ['document'],
      layout: ['argument', 'evidence', 'forum', 'gallery'],
    },
    templates: {
      article: 'argument',
      page: 'evidence',
      archive: 'evidence',
      album: 'gallery',
      forum: 'forum',
    },
    componentRegistry: {
      masthead: { slot: 'header', variant: 'masthead' },
      evidenceCard: { slot: 'aside', variant: 'evidence' },
      sourceRail: { slot: 'related-content', variant: 'sources' },
    },
    defaults: { header: 'masthead', footer: 'document', layout: 'argument' },
    extensionPoints: {
      childThemes: true,
      tokenOverrides: true,
      customComponents: ['main', 'aside', 'related-content', 'footer'],
    },
  },
}

export function resolveTheme(id: string | null | undefined): ThemeManifest {
  const theme = id === 'renegade-party' ? themes['renegade-party'] : themes['neutral-starter']
  if (
    theme.compatibility.min > THEME_CONTRACT_VERSION ||
    theme.compatibility.max < THEME_CONTRACT_VERSION
  ) {
    throw new Error(`Theme ${theme.id} is incompatible with contract v${THEME_CONTRACT_VERSION}.`)
  }
  return theme
}

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
}

export function canRenderPublic(record: PublicState, now = new Date()): boolean {
  if (record.visibility && record.visibility !== 'public') return false
  if (
    record.status &&
    !['published', 'updated', 'active', 'open', 'scheduled'].includes(record.status)
  )
    return false
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
