/**
 * Portable page-composition IR. This is deliberately independent of Puck (or any
 * other canvas): an editor is an adapter over this data, never its persistence
 * format. Canonical content continues to live in Payload collections.
 */
import type { ReactNode } from 'react'

import { canRenderPublic, resolveTheme, type ThemeId } from './contracts'

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
export type PageLayout = {
  version: typeof PAGE_LAYOUT_VERSION
  id: string
  siteId: string
  spaceId?: string
  path: string
  status: 'draft' | 'published'
  themeId: ThemeId
  blocks: LayoutBlock[]
  unknownBlocks?: LayoutBlock[]
  revision: number
  publishedRevision?: number
}

export type ComponentDefinition = {
  id: string
  version: number
  label: string
  category: string
  permissions: BuilderPermission[]
  capabilities: string[]
  fields: Record<
    string,
    'text' | 'rich-text' | 'media' | 'reference' | 'boolean' | 'number' | 'select'
  >
  validate: (props: Record<string, unknown>) => string[]
  render: (props: Record<string, unknown>) => ReactNode
  fallback: (block: LayoutBlock) => ReactNode
}

const text = (props: Record<string, unknown>, key: string, fallback: string) =>
  typeof props[key] === 'string' && props[key].trim() ? String(props[key]) : fallback
const simple = (
  label: string,
  category: string,
  fields: ComponentDefinition['fields'],
): ComponentDefinition => ({
  id: `publisher.${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`,
  version: 1,
  label,
  category,
  permissions: ['layout:edit'],
  capabilities: [],
  fields,
  validate: (props) =>
    fields.title && typeof props.title !== 'string' ? ['title must be text'] : [],
  render: (props) => (
    <section data-block={label}>
      <h2>{text(props, 'title', label)}</h2>
      {typeof props.body === 'string' ? <p>{props.body}</p> : null}
    </section>
  ),
  fallback: (block) => (
    <section data-unavailable-component={block.component}>This section is unavailable.</section>
  ),
})

const blockSpecs: Array<[string, string, ComponentDefinition['fields']]> = [
  ['Hero', 'intro', { title: 'text', body: 'rich-text', image: 'media', cta: 'text' }],
  ['Featured article', 'content', { title: 'text', article: 'reference' }],
  ['Article grid', 'content', { title: 'text', query: 'reference' }],
  ['Article list', 'content', { title: 'text', query: 'reference' }],
  ['Profile card', 'people', { title: 'text', profile: 'reference' }],
  ['Profile grid', 'people', { title: 'text', query: 'reference' }],
  ['Profile bio', 'people', { title: 'text', profile: 'reference' }],
  ['Profile status and links', 'people', { title: 'text', profile: 'reference' }],
  ['Friend and buddy list', 'community', { title: 'text', profile: 'reference' }],
  ['Personal-post feed', 'community', { title: 'text', query: 'reference' }],
  ['Album and gallery', 'media', { title: 'text', album: 'reference' }],
  ['Portfolio and project', 'media', { title: 'text', project: 'reference' }],
  ['Author card', 'people', { title: 'text', author: 'reference' }],
  ['Author grid', 'people', { title: 'text', query: 'reference' }],
  ['Pull quote', 'editorial', { title: 'text', body: 'rich-text' }],
  ['Quote card', 'editorial', { title: 'text', body: 'rich-text' }],
  ['Newsletter CTA', 'action', { title: 'text', body: 'rich-text', cta: 'text' }],
  ['CTA', 'action', { title: 'text', body: 'rich-text', cta: 'text' }],
  ['Donation', 'action', { title: 'text', body: 'rich-text', cta: 'text' }],
  ['Image', 'media', { title: 'text', image: 'media' }],
  ['Video', 'media', { title: 'text', video: 'media' }],
  ['Audio', 'media', { title: 'text', audio: 'media' }],
  ['Book card', 'media', { title: 'text', book: 'reference' }],
  ['Podcast card', 'media', { title: 'text', podcast: 'reference' }],
  ['Video card', 'media', { title: 'text', video: 'reference' }],
  ['Forum activity', 'community', { title: 'text', query: 'reference' }],
  ['Featured discussion', 'community', { title: 'text', discussion: 'reference' }],
  ['Unanswered and solved threads', 'community', { title: 'text', query: 'reference' }],
  ['Event card', 'events', { title: 'text', event: 'reference' }],
  ['Event list', 'events', { title: 'text', query: 'reference' }],
  [
    'Timeline',
    'events',
    { title: 'text', timeline: 'reference', events: 'reference', mode: 'select' },
  ],
  ['Chart and stat', 'data', { title: 'text', data: 'reference' }],
  ['Comparison table', 'data', { title: 'text', data: 'reference' }],
  ['FAQ', 'editorial', { title: 'text', body: 'rich-text' }],
  ['Source and evidence box', 'editorial', { title: 'text', source: 'reference' }],
  ['Team', 'people', { title: 'text', query: 'reference' }],
  ['Contact form placeholder', 'action', { title: 'text', body: 'rich-text' }],
  ['Custom embed', 'advanced', { title: 'text', url: 'text' }],
]

export const componentRegistry: Record<string, ComponentDefinition> = Object.fromEntries(
  blockSpecs.map(([label, category, fields]) => {
    const definition = simple(label, category, fields)
    return [definition.id, definition]
  }),
)

// Custom React registrations are trusted, deploy-time code only. A browser/user cannot register one.
export function registerDeveloperComponent(
  definition: ComponentDefinition,
  actor: BuilderPermission[],
) {
  if (!actor.includes('layout:developer-register'))
    throw new Error('Developer registration permission is required.')
  if (!definition.id.includes('.') || definition.version < 1)
    throw new Error('Component requires a stable namespaced id and version.')
  componentRegistry[definition.id] = definition
}

export function validateLayout(input: PageLayout): { layout: PageLayout; errors: string[] } {
  const errors: string[] = []
  if (input.version > PAGE_LAYOUT_VERSION) errors.push('Layout is newer than this renderer.')
  const unknownBlocks: LayoutBlock[] = [...(input.unknownBlocks ?? [])]
  const blocks = input.blocks.flatMap((block) => {
    const definition = componentRegistry[block.component]
    if (!definition || definition.version !== block.componentVersion) {
      unknownBlocks.push(block)
      errors.push(`Unavailable component preserved: ${block.component}@${block.componentVersion}`)
      return []
    }
    errors.push(...definition.validate(block.props).map((error) => `${block.id}: ${error}`))
    return [block]
  })
  return { layout: { ...input, blocks, unknownBlocks }, errors }
}

export function migrateLayout(layout: PageLayout): PageLayout {
  const { layout: migrated } = validateLayout({ ...layout, version: PAGE_LAYOUT_VERSION })
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
      props: { ...blocks[index].props, mediaId: action.mediaId },
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
  const { layout: safe } = validateLayout(layout)
  resolveTheme(safe.themeId)
  return safe.blocks
    .filter((block) => !block.hidden && block.visible?.[viewport] !== false)
    .map((block) => componentRegistry[block.component].render(block.props))
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
