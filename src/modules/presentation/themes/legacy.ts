import type { ThemeId, ThemeTokens, LegacyThemeManifest } from '../../public/contracts'

const baseTokens: ThemeTokens = {
  color: {
    canvas: '#f8f6f0',
    surface: '#ffffff',
    ink: '#191614',
    muted: '#857d74',
    accent: '#b91c1c',
    focus: '#0284c7',
  },
  typography: {
    display: 'var(--font-serif), Georgia, serif',
    body: 'var(--font-sans), system-ui, sans-serif',
    scale: { sm: '0.875rem', base: '1rem', lg: '1.25rem', xl: '2.5rem' },
  },
  spacing: { compact: '0.75rem', normal: '1.5rem', relaxed: '3rem' },
  direction: { rtlSupported: true },
}

export const legacyThemes: Record<ThemeId, LegacyThemeManifest> = {
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
      typography: { ...baseTokens.typography, display: 'var(--font-serif), Georgia, serif' },
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
