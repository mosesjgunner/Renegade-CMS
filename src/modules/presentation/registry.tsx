import { satisfies, valid, validRange } from 'semver'
import { Fragment } from 'react'
import { legacyThemes } from './themes/legacy'
import { StarterArticleView } from './themes/StarterArticleView'
import type { EditorialPresentation } from '../editorial/persistence'
import { starterComponents } from './themes/components'
import {
  RENEGADE_PRESENTATION_VERSION,
  type ThemeManifest,
  type Surface,
  type Template,
  type PrecedenceLevel,
  type PrecedenceResolutionStep,
  type TemplateResolution,
} from './contracts'

export const supportedSurfaces: readonly Surface[] = Object.freeze([
  'page',
  'article',
  'home',
  'archive',
  'search',
  '404',
  'layout',
  'profile',
  'book',
  'podcast',
  'podcast-episode',
  'video',
  'product',
  'event',
  'forum',
  'custom-page',
])

const surfaces: Surface[] = [...supportedSurfaces]

export function isSupportedSurface(surface: string): surface is Surface {
  return (supportedSurfaces as readonly string[]).includes(surface)
}
const presentationComponents = {
  ...starterComponents,
  'publisher.editorial': {
    id: 'publisher.editorial',
    version: 1,
    label: 'Canonical editorial content',
    category: 'content',
    permissions: [],
    capabilities: [],
    fields: {},
    validate: () => [],
    render: (props: Record<string, unknown>) => (
      <StarterArticleView article={props.article as EditorialPresentation} />
    ),
    fallback: () => null,
  },
}
const makeTheme = (legacy: (typeof legacyThemes)[string]): ThemeManifest => {
  const surfaceTemplates: Record<string, Template> = Object.fromEntries(
    surfaces.map((surface): [string, Template] => [
      surface,
      {
        id: surface,
        version: '1.0.0',
        contentTypes: [surface],
        slots: {
          main: {
            required: true,
            allowedComponents:
              surface === 'page' || surface === 'article'
                ? ['publisher.editorial']
                : Object.keys(starterComponents),
          },
          ...(surface === 'layout' || surface === 'custom-page'
            ? {
                header: {
                  required: false,
                  allowedComponents: [
                    'publisher.cta',
                    'publisher.rich-content',
                    'publisher.pattern',
                  ],
                },
                footer: {
                  required: false,
                  allowedComponents: [
                    'publisher.rich-content',
                    'publisher.cta',
                    'publisher.newsletter-cta',
                    'publisher.pattern',
                  ],
                },
                announcement: {
                  required: false,
                  allowedComponents: [
                    'publisher.cta',
                    'publisher.rich-content',
                    'publisher.pattern',
                  ],
                },
                cta: {
                  required: false,
                  allowedComponents: [
                    'publisher.cta',
                    'publisher.rich-content',
                    'publisher.newsletter-cta',
                    'publisher.pattern',
                  ],
                },
              }
            : {}),
        },
        render: (slots) => <Fragment>{slots.main}</Fragment>,
      },
    ]),
  )

  const variantTemplates: Record<string, Template> = {
    'video-featured': {
      id: 'video-featured',
      version: '1.0.0',
      contentTypes: ['video'],
      slots: {
        main: {
          required: true,
          allowedComponents: Object.keys(starterComponents),
        },
      },
      render: (slots) => <Fragment>{slots.main}</Fragment>,
    },
    'podcast-compact': {
      id: 'podcast-compact',
      version: '1.0.0',
      contentTypes: ['podcast', 'podcast-episode'],
      slots: {
        main: {
          required: true,
          allowedComponents: Object.keys(starterComponents),
        },
      },
      render: (slots) => <Fragment>{slots.main}</Fragment>,
    },
    'article-editorial': {
      id: 'article-editorial',
      version: '1.0.0',
      contentTypes: ['article', 'page'],
      slots: {
        main: {
          required: true,
          allowedComponents: ['publisher.editorial', ...Object.keys(starterComponents)],
        },
      },
      render: (slots) => <Fragment>{slots.main}</Fragment>,
    },
    'event-compact': {
      id: 'event-compact',
      version: '1.0.0',
      contentTypes: ['event'],
      slots: {
        main: {
          required: true,
          allowedComponents: Object.keys(starterComponents),
        },
      },
      render: (slots) => <Fragment>{slots.main}</Fragment>,
    },
    'product-grid': {
      id: 'product-grid',
      version: '1.0.0',
      contentTypes: ['product'],
      slots: {
        main: {
          required: true,
          allowedComponents: Object.keys(starterComponents),
        },
      },
      render: (slots) => <Fragment>{slots.main}</Fragment>,
    },
    'forum-threaded': {
      id: 'forum-threaded',
      version: '1.0.0',
      contentTypes: ['forum'],
      slots: {
        main: {
          required: true,
          allowedComponents: Object.keys(starterComponents),
        },
      },
      render: (slots) => <Fragment>{slots.main}</Fragment>,
    },
    'archive-grid': {
      id: 'archive-grid',
      version: '1.0.0',
      contentTypes: ['archive'],
      slots: {
        main: {
          required: true,
          allowedComponents: Object.keys(starterComponents),
        },
      },
      render: (slots) => <Fragment>{slots.main}</Fragment>,
    },
    'custom-page-landing': {
      id: 'custom-page-landing',
      version: '1.0.0',
      contentTypes: ['custom-page', 'layout'],
      slots: {
        main: {
          required: true,
          allowedComponents: Object.keys(starterComponents),
        },
      },
      render: (slots) => <Fragment>{slots.main}</Fragment>,
    },
  }

  return {
    ...structuredClone(legacy),
    version: '1.0.0',
    renegade: '^1.0.0',
    description: `${legacy.label} bundled presentation`,
    capabilities: ['public-rendering', 'layout'],
    tokenSchema: {
      'color.*': 'color',
      'typography.display': 'font',
      'typography.body': 'font',
      'typography.scale.*': 'length',
      'spacing.*': 'length',
      'direction.rtlSupported': 'boolean',
    },
    componentRegistry: { ...presentationComponents },
    templateRegistry: { ...surfaceTemplates, ...variantTemplates },
    fallbacks: Object.fromEntries(surfaces.map((surface) => [surface, surface])) as Record<
      Surface,
      string
    >,
    globalRegions: { header: 'starter.shell', footer: 'starter.shell' },
    assets: [],
    migrations: [],
    integrity: { source: 'bundled', release: `renegade-presentation/${legacy.id}@1.0.0` },
  }
}

export function validateManifest(theme: ThemeManifest): void {
  if (
    !/^[a-z][a-z0-9-]*$/.test(theme.id) ||
    !theme.label ||
    !theme.description ||
    !valid(theme.version)
  )
    throw new Error('Invalid theme manifest identity.')
  if (
    !validRange(theme.renegade) ||
    !satisfies(RENEGADE_PRESENTATION_VERSION, theme.renegade) ||
    theme.contractVersion !== 1 ||
    theme.compatibility.min > 1 ||
    theme.compatibility.max < 1
  )
    throw new Error('Theme compatibility mismatch.')
  if (theme.integrity.source !== 'bundled' || !theme.integrity.release)
    throw new Error('Missing bundled integrity metadata.')
  if (
    theme.globalRegions.header !== 'starter.shell' ||
    theme.globalRegions.footer !== 'starter.shell'
  )
    throw new Error('Unknown global region.')
  for (const migration of theme.migrations) {
    if (
      !valid(migration.from) ||
      migration.to !== theme.version ||
      migration.from === migration.to ||
      typeof migration.migrate !== 'function'
    )
      throw new Error('Invalid theme migration.')
  }
  const lengths = [
    ...Object.values(theme.tokens.spacing),
    ...Object.values(theme.tokens.typography.scale),
  ]
  if (lengths.some((value) => !/^\d+(\.\d+)?(rem|em|px)$/.test(value)))
    throw new Error('Invalid length token.')
  if (
    theme.tokenSchema['color.*'] !== 'color' ||
    theme.tokenSchema['spacing.*'] !== 'length' ||
    (theme.tokens.direction.rtlSupported !== true && theme.tokens.direction.rtlSupported !== false)
  )
    throw new Error('Invalid token schema.')
  for (const font of [theme.tokens.typography.display, theme.tokens.typography.body])
    if (/[;{}<>]/.test(font)) throw new Error('Invalid font token.')
  for (const value of Object.values(theme.tokens.color))
    if (!/^#[\da-f]{6}$/i.test(value)) throw new Error('Invalid color token.')
  for (const asset of theme.assets)
    if (
      !asset.path.startsWith('/') ||
      asset.path.startsWith('//') ||
      !/^sha256-[A-Za-z0-9+/]+=*$/.test(asset.integrity)
    )
      throw new Error('Invalid theme asset.')
  for (const [id, component] of Object.entries(theme.componentRegistry))
    if (id !== component.id || component.version < 1 || typeof component.render !== 'function')
      throw new Error('Invalid component registration.')
  for (const [id, template] of Object.entries(theme.templateRegistry)) {
    if (id !== template.id || !valid(template.version) || typeof template.render !== 'function')
      throw new Error('Invalid template.')
    for (const slot of Object.values(template.slots))
      for (const component of slot.allowedComponents)
        if (!Object.hasOwn(theme.componentRegistry, component))
          throw new Error(`Unknown component: ${component}`)
  }
  for (const surface of surfaces)
    if (!theme.templateRegistry[theme.fallbacks[surface]]?.contentTypes.includes(surface))
      throw new Error(`Missing compatible fallback: ${surface}`)
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
export const themes: Readonly<Record<string, ThemeManifest>> = Object.freeze(
  Object.fromEntries(
    Object.entries(legacyThemes).map(([id, theme]) => [id, freeze(makeTheme(theme))]),
  ),
)
for (const theme of Object.values(themes)) validateManifest(theme)

/** Unknown legacy identifiers fall back; known incompatible packages are never loaded. */
export function resolveTheme(id?: string | null): ThemeManifest {
  const theme = id && Object.hasOwn(themes, id) ? themes[id] : themes['neutral-starter']
  validateManifest(theme)
  return theme
}
export class UnsupportedSurfaceGapError extends Error {
  readonly code = 'UNSUPPORTED_SURFACE'
  readonly surface: string
  readonly themeId: string

  constructor(surface: string, themeId: string) {
    super(
      `Explicit domain gap: surface '${surface}' is an unsupported domain in theme '${themeId}'. Renegade CMS does not permit fake templates for unsupported domains.`,
    )
    this.name = 'UnsupportedSurfaceGapError'
    this.surface = surface
    this.themeId = themeId
  }
}

export function resolveSurfaceTemplate({
  theme,
  surface,
  entryOverride,
  conditionalVariant,
  siteDefault,
}: {
  theme: ThemeManifest
  surface: Surface
  entryOverride?: string | null
  conditionalVariant?: string | null
  siteDefault?: string | null
}): TemplateResolution {
  if (!isSupportedSurface(surface) || !theme.fallbacks[surface]) {
    throw new UnsupportedSurfaceGapError(surface, theme.id)
  }

  const resolutionPath: PrecedenceResolutionStep[] = []
  const siteDefaultId =
    siteDefault && Object.hasOwn(theme.templateRegistry, siteDefault)
      ? siteDefault
      : theme.fallbacks[surface]
  const typeTemplateId = surface

  // 1. Entry override (highest priority)
  if (entryOverride) {
    const candidate = Object.hasOwn(theme.templateRegistry, entryOverride)
      ? theme.templateRegistry[entryOverride]
      : undefined
    if (candidate && candidate.contentTypes.includes(surface)) {
      resolutionPath.push({
        level: 'entry_override',
        candidateId: entryOverride,
        status: 'selected',
        reason: 'Valid compatible entry override specified on record',
      })
      return {
        template: candidate,
        theme,
        surface,
        selectedLevel: 'entry_override',
        level: 'entry_override',
        selectedTemplateId: candidate.id,
        entryOverride,
        conditionalVariant,
        typeTemplateId,
        siteDefaultId,
        resolutionPath,
        precedenceChain: resolutionPath,
      }
    } else {
      resolutionPath.push({
        level: 'entry_override',
        candidateId: entryOverride,
        status: candidate ? 'incompatible' : 'miss',
        reason: candidate
          ? `Template '${entryOverride}' does not support surface '${surface}'`
          : `Template '${entryOverride}' not found in theme '${theme.id}'`,
      })
    }
  } else {
    resolutionPath.push({
      level: 'entry_override',
      status: 'skipped',
      reason: 'No entry override specified',
    })
  }

  // 2. Conditional variant
  if (conditionalVariant) {
    const candidate = Object.hasOwn(theme.templateRegistry, conditionalVariant)
      ? theme.templateRegistry[conditionalVariant]
      : undefined
    if (candidate && candidate.contentTypes.includes(surface)) {
      resolutionPath.push({
        level: 'conditional_variant',
        candidateId: conditionalVariant,
        status: 'selected',
        reason: 'Valid compatible conditional variant matched',
      })
      return {
        template: candidate,
        theme,
        surface,
        selectedLevel: 'conditional_variant',
        level: 'conditional_variant',
        selectedTemplateId: candidate.id,
        entryOverride,
        conditionalVariant,
        typeTemplateId,
        siteDefaultId,
        resolutionPath,
        precedenceChain: resolutionPath,
      }
    } else {
      resolutionPath.push({
        level: 'conditional_variant',
        candidateId: conditionalVariant,
        status: candidate ? 'incompatible' : 'miss',
        reason: candidate
          ? `Variant '${conditionalVariant}' does not support surface '${surface}'`
          : `Variant '${conditionalVariant}' not found in theme '${theme.id}'`,
      })
    }
  } else {
    resolutionPath.push({
      level: 'conditional_variant',
      status: 'skipped',
      reason: 'No conditional variant matched',
    })
  }

  // 3. Type template
  const typeCandidate = Object.hasOwn(theme.templateRegistry, typeTemplateId)
    ? theme.templateRegistry[typeTemplateId]
    : undefined
  if (typeCandidate && typeCandidate.contentTypes.includes(surface)) {
    resolutionPath.push({
      level: 'type_template',
      candidateId: typeTemplateId,
      status: 'selected',
      reason: `Default type template for surface '${surface}' matched`,
    })
    return {
      template: typeCandidate,
      theme,
      surface,
      selectedLevel: 'type_template',
      level: 'type_template',
      selectedTemplateId: typeCandidate.id,
      entryOverride,
      conditionalVariant,
      typeTemplateId,
      siteDefaultId,
      resolutionPath,
      precedenceChain: resolutionPath,
    }
  } else {
    resolutionPath.push({
      level: 'type_template',
      candidateId: typeTemplateId,
      status: typeCandidate ? 'incompatible' : 'miss',
      reason: typeCandidate
        ? `Type template '${typeTemplateId}' does not support surface '${surface}'`
        : `Type template '${typeTemplateId}' not found in theme '${theme.id}'`,
    })
  }

  // 4. Site default
  const defaultCandidate = Object.hasOwn(theme.templateRegistry, siteDefaultId)
    ? theme.templateRegistry[siteDefaultId]
    : undefined
  if (
    defaultCandidate &&
    (defaultCandidate.contentTypes.includes(surface) ||
      siteDefaultId === theme.fallbacks[surface] ||
      (siteDefault && siteDefaultId === siteDefault))
  ) {
    resolutionPath.push({
      level: 'site_default',
      candidateId: siteDefaultId,
      status: 'selected',
      reason: `Site default fallback template '${siteDefaultId}' selected`,
    })
    return {
      template: defaultCandidate,
      theme,
      surface,
      selectedLevel: 'site_default',
      level: 'site_default',
      selectedTemplateId: defaultCandidate.id,
      entryOverride,
      conditionalVariant,
      typeTemplateId,
      siteDefaultId,
      resolutionPath,
      precedenceChain: resolutionPath,
    }
  }

  resolutionPath.push({
    level: 'site_default',
    candidateId: siteDefaultId,
    status: 'incompatible',
    reason: `Site default fallback '${siteDefaultId}' does not support surface '${surface}'`,
  })

  throw new UnsupportedSurfaceGapError(surface, theme.id)
}

export function resolveTemplate(
  theme: ThemeManifest,
  surface: Surface,
  requested?: string,
): Template {
  return resolveSurfaceTemplate({
    theme,
    surface,
    entryOverride: requested,
  }).template
}
