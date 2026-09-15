/**
 * Portable page-composition IR. This is deliberately independent of Puck (or any
 * other canvas): an editor is an adapter over this data, never its persistence
 * format. Canonical content continues to live in Payload collections.
 */
import type { ReactNode } from 'react'
import { renderPresentation } from '../presentation/document'

import { canRenderPublic, resolveTheme, themes, type ThemeId } from './contracts'

export const PAGE_LAYOUT_VERSION = 1 as const
export const BUILDER_COMPATIBILITY_VERSION = 1 as const

export type BuilderPermission =
  | 'layout:edit'
  | 'layout:publish'
  | 'layout:global-blocks'
  | 'layout:advanced-css'
  | 'layout:developer-register'

export type ResponsiveVisibility = { desktop?: boolean; tablet?: boolean; mobile?: boolean }
export type GraphicPlaceholder = {
  purpose: string
  aspectRatio: string
  recommendedDimensions: string
  subject: string
  style: string
  composition: string
  placement: string
  textSafeArea: string
  accessibilityReminder: string
  actions: Array<
    'upload' | 'media-browse' | 'idea-generation' | 'prompt-generation' | 'replace-later'
  >
}
export type LayoutBlock = {
  id: string
  component: string
  componentVersion: number
  props: Record<string, unknown>
  visible?: ResponsiveVisibility
  hidden?: boolean
  placeholder?: GraphicPlaceholder
}
export type LayoutSurface = 'page' | 'global' | 'template' | 'pattern'
export type LayoutSlot = 'main' | 'header' | 'footer' | 'announcement' | 'cta'
export type TemplateInheritanceMode = 'inherited' | 'explicit' | 'detached'

export type PageLayout = {
  version: typeof PAGE_LAYOUT_VERSION
  id: string
  siteId: string
  spaceId?: string
  name?: string
  path: string
  status: 'draft' | 'published'
  themeId: ThemeId
  /** Page layouts edit main; global documents edit one approved shell region; templates edit main; patterns may target any slot. */
  surface?: LayoutSurface
  slot?: LayoutSlot
  templateId?: string
  templateVersion?: number
  templateMode?: TemplateInheritanceMode
  isRetired?: boolean
  category?: string
  blocks: LayoutBlock[]
  unknownBlocks?: LayoutBlock[]
  revision: number
  publishedRevision?: number
}

export type ReferenceValue = { id: string; siteId: string; label: string; href?: string }
export type ContentQueryValue = {
  collection: 'content' | 'events' | 'albums' | 'discussions'
  limit: number
  sort: 'newest' | 'oldest' | 'title'
  tag?: string
}
export type PresentationField =
  | { type: 'text' | 'long-text'; label: string; maxLength?: number }
  | { type: 'link'; label: string }
  | { type: 'media'; label: string }
  | { type: 'content-query'; label: string }
  | { type: 'boolean' | 'number'; label: string; min?: number; max?: number }
  | { type: 'select' | 'alignment' | 'token'; label: string; options: string[] }

export type ComponentDefinition = {
  id: string
  version: number
  label: string
  category: string
  permissions: BuilderPermission[]
  capabilities: string[]
  fields: Record<string, PresentationField>
  validate: (props: Record<string, unknown>) => string[]
  render: (props: Record<string, unknown>) => ReactNode
  fallback: (block: LayoutBlock) => ReactNode
}

export { starterComponents as componentRegistry } from '../presentation/themes/components'
import { starterComponents as componentRegistry } from '../presentation/themes/components'

// Custom React registrations are trusted, deploy-time code only. A browser/user cannot register one.
export function registerDeveloperComponent(
  definition: ComponentDefinition,
  actor: BuilderPermission[],
) {
  if (!actor.includes('layout:developer-register'))
    throw new Error('Developer registration permission is required.')
  if (!definition.id.includes('.') || definition.version < 1)
    throw new Error('Component requires a stable namespaced id and version.')
  return Object.freeze({ ...componentRegistry, [definition.id]: definition })
}

export function validateLayout(input: PageLayout): { layout: PageLayout; errors: string[] } {
  const errors: string[] = []
  if (JSON.stringify(input).length > 256_000) errors.push('Layout exceeds the 256 KB limit.')
  if (!Number.isInteger(input.revision) || input.revision < 1) errors.push('Invalid revision.')
  if (input.blocks.length > 100) errors.push('Layouts may contain at most 100 components.')
  if (input.version !== PAGE_LAYOUT_VERSION) errors.push('Unsupported layout schema version.')
  if (!Object.hasOwn(themes, input.themeId)) errors.push('Unknown theme id.')
  const theme = resolveTheme(input.themeId)
  const slot = input.slot ?? 'main'
  const surface = input.surface ?? 'page'
  if (
    surface === 'global' &&
    slot !== 'header' &&
    slot !== 'footer' &&
    slot !== 'announcement' &&
    slot !== 'cta'
  )
    errors.push('Global layouts must target header, footer, announcement, or cta.')
  if ((surface === 'page' || surface === 'template') && slot !== 'main')
    errors.push('Pages and templates may only edit the main template slot.')
  if (input.templateMode && !['inherited', 'explicit', 'detached'].includes(input.templateMode))
    errors.push('Invalid template inheritance mode.')
  const template = theme.templateRegistry.layout
  const allowed = new Set(
    surface === 'pattern'
      ? Object.keys(theme.componentRegistry)
      : (template.slots[slot]?.allowedComponents ?? []),
  )
  const unknownBlocks: LayoutBlock[] = [...(input.unknownBlocks ?? [])]
  const ids = new Set<string>()
  const blocks = input.blocks.flatMap((block) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(block.id) || ids.has(block.id)) {
      errors.push(`Invalid or duplicate component id: ${block.id}`)
      return []
    }
    ids.add(block.id)
    if (block.visible !== undefined) {
      if (
        typeof block.visible !== 'object' ||
        block.visible === null ||
        Array.isArray(block.visible)
      ) {
        errors.push(`${block.id}: visible must be an object`)
      } else {
        const { desktop, tablet, mobile, ...rest } = block.visible as Record<string, unknown>
        if (Object.keys(rest).length > 0) errors.push(`${block.id}: unknown visibility rule`)
        if (desktop !== undefined && typeof desktop !== 'boolean')
          errors.push(`${block.id}: desktop visibility must be boolean`)
        if (tablet !== undefined && typeof tablet !== 'boolean')
          errors.push(`${block.id}: tablet visibility must be boolean`)
        if (mobile !== undefined && typeof mobile !== 'boolean')
          errors.push(`${block.id}: mobile visibility must be boolean`)
      }
    }
    const definition = theme.componentRegistry[block.component]
    if (!definition || definition.version !== block.componentVersion) {
      unknownBlocks.push(block)
      errors.push(`Unavailable component preserved: ${block.component}@${block.componentVersion}`)
      return []
    }
    if (!allowed.has(block.component)) {
      errors.push(`${block.id}: ${block.component} is not allowed in ${slot}.`)
      return []
    }
    const propErrors = validateComponentProps(definition, block.props, input.siteId)
    errors.push(...propErrors.map((error) => `${block.id}: ${error}`))
    errors.push(...definition.validate(block.props).map((error) => `${block.id}: ${error}`))
    return [block]
  })
  return { layout: { ...input, blocks, unknownBlocks }, errors }
}

const unsafeKey = /^(?:__proto__|prototype|constructor)$/
const unsafeMarkup = /<\/?(?:script|style|iframe|object|embed|link|meta)\b|\son\w+\s*=|javascript:/i

function unsafeJson(value: unknown, depth = 0): boolean {
  if (depth > 8) return true
  if (typeof value === 'string') return value.length > 10_000 || unsafeMarkup.test(value)
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value))
    return value.length > 100 || value.some((item) => unsafeJson(item, depth + 1))
  return Object.entries(value).some(
    ([key, child]) => unsafeKey.test(key) || unsafeJson(child, depth + 1),
  )
}

function validateComponentProps(
  definition: ComponentDefinition,
  props: Record<string, unknown>,
  siteId: string,
): string[] {
  const errors: string[] = []
  if (!props || typeof props !== 'object' || Array.isArray(props))
    return ['props must be an object']
  if (unsafeJson(props)) errors.push('props contain unsafe markup or invalid nesting')
  for (const [name, value] of Object.entries(props)) {
    if (unsafeKey.test(name) || !Object.hasOwn(definition.fields, name)) {
      errors.push(`unknown property ${name}`)
      continue
    }
    const field = definition.fields[name]
    const maxLength = 'maxLength' in field ? (field.maxLength ?? 4000) : 4000
    if (typeof value === 'string' && (value.length > maxLength || unsafeMarkup.test(value)))
      errors.push(`${name} contains unsafe or oversized text`)
    if (field.type === 'text' || field.type === 'long-text') {
      if (typeof value !== 'string') errors.push(`${name} must be text`)
    } else if (field.type === 'boolean') {
      if (typeof value !== 'boolean') errors.push(`${name} must be true or false`)
    } else if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value))
        errors.push(`${name} must be a number`)
      if (typeof value === 'number' && field.min !== undefined && value < field.min)
        errors.push(`${name} is too small`)
      if (typeof value === 'number' && field.max !== undefined && value > field.max)
        errors.push(`${name} is too large`)
    } else if (field.type === 'select' || field.type === 'alignment' || field.type === 'token') {
      if (typeof value !== 'string' || !field.options.includes(value))
        errors.push(`${name} is not theme-approved`)
    } else if (field.type === 'media' || field.type === 'link') {
      const reference = value as Partial<ReferenceValue> | null
      if (
        !reference ||
        typeof reference !== 'object' ||
        reference.siteId !== siteId ||
        !reference.id ||
        !reference.label
      )
        errors.push(`${name} must be selected from this site's ${field.type} chooser`)
      if (field.type === 'link' && reference?.href && !/^\/(?!\/)/.test(reference.href))
        errors.push(`${name} must use an internal path`)
      if (field.type === 'media' && reference?.href && !/^\/(?!\/)/.test(reference.href))
        errors.push(`${name} must use a canonical media path`)
    } else if (field.type === 'content-query') {
      const query = value as Partial<ContentQueryValue> | null
      if (
        !query ||
        typeof query !== 'object' ||
        !['content', 'events', 'albums', 'discussions'].includes(String(query.collection)) ||
        !Number.isInteger(query.limit) ||
        Number(query.limit) < 1 ||
        Number(query.limit) > 24 ||
        !['newest', 'oldest', 'title'].includes(String(query.sort))
      )
        errors.push(`${name} must be a bounded content query`)
    }
  }
  return errors
}

export function migrateLayout(layout: PageLayout): PageLayout {
  if (layout.version !== PAGE_LAYOUT_VERSION)
    throw new Error('Unsupported layout version; original preserved.')
  const { layout: migrated } = validateLayout(layout)
  return migrated
}
export function applyLayoutAction(
  layout: PageLayout,
  action:
    | { type: 'select'; id: string }
    | { type: 'edit'; id: string; props: Record<string, unknown> }
    | { type: 'move'; id: string; to: number }
    | { type: 'duplicate'; id: string; newId: string }
    | { type: 'toggle-hidden'; id: string }
    | { type: 'delete'; id: string }
    | { type: 'undo-delete'; block: LayoutBlock; at: number }
    | { type: 'replace-placeholder'; id: string; mediaId: string },
): PageLayout {
  const blocks = [...layout.blocks]
  const index = 'id' in action ? blocks.findIndex((block) => block.id === action.id) : -1
  if (action.type === 'edit' && index >= 0)
    blocks[index] = { ...blocks[index], props: { ...blocks[index].props, ...action.props } }
  if (action.type === 'move' && index >= 0) {
    const [block] = blocks.splice(index, 1)
    blocks.splice(Math.max(0, Math.min(action.to, blocks.length)), 0, block)
  }
  if (action.type === 'duplicate' && index >= 0)
    blocks.splice(index + 1, 0, {
      ...blocks[index],
      id: action.newId,
      props: { ...blocks[index].props },
    })
  if (action.type === 'toggle-hidden' && index >= 0)
    blocks[index] = { ...blocks[index], hidden: !blocks[index].hidden }
  if (action.type === 'delete' && index >= 0) blocks.splice(index, 1)
  if (action.type === 'undo-delete') blocks.splice(action.at, 0, action.block)
  if (action.type === 'replace-placeholder' && index >= 0)
    blocks[index] = {
      ...blocks[index],
      props: {
        ...blocks[index].props,
        media: {
          id: action.mediaId,
          siteId: layout.siteId,
          label: 'Selected media',
          href: `/api/media-assets/file/${encodeURIComponent(action.mediaId)}`,
        },
      },
      placeholder: undefined,
    }
  return { ...layout, blocks, revision: layout.revision + 1 }
}

export function publishLayout(layout: PageLayout, permissions: BuilderPermission[]): PageLayout {
  if (!permissions.includes('layout:publish')) throw new Error('Publish permission is required.')
  const { layout: safe, errors } = validateLayout(layout)
  if (errors.some((error) => !error.startsWith('Unavailable component preserved:')))
    throw new Error(errors.join(' '))
  return { ...safe, status: 'published', publishedRevision: safe.revision }
}

export function renderLayout(
  layout: PageLayout,
  viewport: keyof Required<ResponsiveVisibility> = 'desktop',
): ReactNode {
  if (layout.version !== PAGE_LAYOUT_VERSION)
    throw new Error('Unsupported layout version; original preserved.')
  const theme = resolveTheme(layout.themeId)
  return renderPresentation(
    {
      version: 1,
      siteId: layout.siteId,
      theme: { id: theme.id, version: theme.version },
      template: { id: 'layout', version: '1.0.0' },
      surface: 'layout',
      slots: {
        main: [],
        [layout.slot ?? 'main']: [...layout.blocks, ...(layout.unknownBlocks ?? [])].filter(
          (block) => block.visible?.[viewport] !== false,
        ),
      },
    },
    theme,
  )
}

export function canRenderLayout(layout: PageLayout, state: Parameters<typeof canRenderPublic>[0]) {
  return layout.status === 'published' && canRenderPublic(state)
}

export type StarterRecipe = {
  id: string
  label: string
  themeId: ThemeId
  capabilities: string[]
  nextActions: string[]
  blocks: string[]
}
export const starterRecipes: StarterRecipe[] = [
  {
    id: 'member-profile',
    label: 'Simple member profile',
    themeId: 'neutral-starter',
    capabilities: ['profile'],
    nextActions: ['Add your bio', 'Choose a cover', 'Publish profile'],
    blocks: ['publisher.profile-bio', 'publisher.profile-status-and-links'],
  },
  {
    id: 'writer-blogger',
    label: 'Writer and blogger',
    themeId: 'neutral-starter',
    capabilities: ['profile', 'publication'],
    nextActions: ['Name your publication', 'Write an introduction', 'Publish your first post'],
    blocks: ['publisher.hero', 'publisher.article-list', 'publisher.newsletter-cta'],
  },
  {
    id: 'photographer-portfolio',
    label: 'Photographer portfolio',
    themeId: 'neutral-starter',
    capabilities: ['profile', 'albums'],
    nextActions: ['Add a gallery', 'Replace image guide', 'Publish portfolio'],
    blocks: ['publisher.hero', 'publisher.album-and-gallery'],
  },
  {
    id: 'community-forum',
    label: 'Discussion forum and community',
    themeId: 'neutral-starter',
    capabilities: ['forum'],
    nextActions: ['Name your forum', 'Set discussion rules', 'Invite members'],
    blocks: [
      'publisher.hero',
      'publisher.forum-activity',
      'publisher.unanswered-and-solved-threads',
    ],
  },
  {
    id: 'creator-support',
    label: 'Creator support page',
    themeId: 'neutral-starter',
    capabilities: ['profile', 'donations'],
    nextActions: ['Tell your story', 'Choose a support message', 'Preview page'],
    blocks: ['publisher.hero', 'publisher.donation'],
  },
  {
    id: 'organization',
    label: 'Organization',
    themeId: 'renegade-party',
    capabilities: ['publication', 'events'],
    nextActions: ['Add your mission', 'Set an upcoming event', 'Publish home page'],
    blocks: ['publisher.hero', 'publisher.team', 'publisher.event-list'],
  },
  {
    id: 'maximalist-social-space',
    label: 'Maximalist social Space',
    themeId: 'renegade-party',
    capabilities: ['profile', 'publication', 'albums', 'forum'],
    nextActions: ['Set your style', 'Add an activity feed', 'Preview your Space'],
    blocks: [
      'publisher.profile-status-and-links',
      'publisher.personal-post-feed',
      'publisher.album-and-gallery',
      'publisher.forum-activity',
    ],
  },
]
export const guidedRecipes = [
  ['independent-publication', 'writer-blogger'],
  ['community-forum', 'community-forum'],
  ['creator-portfolio', 'photographer-portfolio'],
  ['podcast-media-outlet', 'writer-blogger'],
  ['nonprofit-campaign', 'organization'],
  ['local-business', 'organization'],
  ['research-civic-project', 'organization'],
  ['store-supporter-site', 'creator-support'],
] as const
export function previewRecipe(id: string, siteId: string): PageLayout {
  const recipe = starterRecipes.find((item) => item.id === id)
  if (!recipe) throw new Error('Unknown starter recipe.')
  return {
    version: 1,
    id: `starter:${id}`,
    siteId,
    path: '/',
    status: 'draft',
    themeId: recipe.themeId,
    revision: 1,
    blocks: recipe.blocks.map((component, index) => ({
      id: `${id}-${index + 1}`,
      component,
      componentVersion: 1,
      props: { title: index === 0 ? 'Make this space yours' : componentRegistry[component].label },
      placeholder:
        index === 0
          ? {
              purpose: 'Welcome image',
              aspectRatio: '16:9',
              recommendedDimensions: '1600 � 900 px',
              subject: 'Your work or community',
              style: 'Authentic and accessible',
              composition: 'Clear focal point',
              placement: 'Hero',
              textSafeArea: 'Keep the lower-left area clear',
              accessibilityReminder: 'Add meaningful alt text before publishing.',
              actions: [
                'upload',
                'media-browse',
                'idea-generation',
                'prompt-generation',
                'replace-later',
              ],
            }
          : undefined,
    })),
  }
}
export function installRecipe(
  existing: PageLayout | undefined,
  recipeId: string,
  siteId: string,
): PageLayout {
  // Deliberately one-time: applying a recipe to an existing page does not merge or duplicate canonical content.
  if (existing)
    throw new Error(
      'A starter layout already exists; preview a different recipe or create a new page.',
    )
  return previewRecipe(recipeId, siteId)
}
