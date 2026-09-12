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
} from './contracts'

const surfaces: Surface[] = ['page', 'article', 'home', 'archive', 'search', '404', 'layout']
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
const makeTheme = (legacy: (typeof legacyThemes)[string]): ThemeManifest => ({
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
  templateRegistry: Object.fromEntries(
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
          ...(surface === 'layout'
            ? {
                header: {
                  required: false,
                  allowedComponents: ['publisher.cta', 'publisher.rich-content'],
                },
                footer: {
                  required: false,
                  allowedComponents: [
                    'publisher.rich-content',
                    'publisher.cta',
                    'publisher.newsletter-cta',
                  ],
                },
              }
            : {}),
        },
        render: (slots) => <Fragment>{slots.main}</Fragment>,
      },
    ]),
  ),
  fallbacks: Object.fromEntries(surfaces.map((surface) => [surface, surface])) as Record<
    Surface,
    string
  >,
  globalRegions: { header: 'starter.shell', footer: 'starter.shell' },
  assets: [],
  migrations: [],
  integrity: { source: 'bundled', release: `renegade-presentation/${legacy.id}@1.0.0` },
})

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
export function resolveTemplate(
  theme: ThemeManifest,
  surface: Surface,
  requested?: string,
): Template {
  const candidate =
    requested && Object.hasOwn(theme.templateRegistry, requested)
      ? theme.templateRegistry[requested]
      : undefined
  return candidate?.contentTypes.includes(surface)
    ? candidate
    : theme.templateRegistry[theme.fallbacks[surface]]
}
