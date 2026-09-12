import type { ComponentDefinition, PresentationField } from '../../public/page-builder'

const text = (props: Record<string, unknown>, key: string, fallback: string) =>
  typeof props[key] === 'string' && props[key].trim() ? String(props[key]) : fallback

const common = {
  title: { type: 'text', label: 'Heading', maxLength: 160 },
  alignment: { type: 'alignment', label: 'Alignment', options: ['left', 'center', 'right'] },
  spacing: { type: 'token', label: 'Theme spacing', options: ['compact', 'normal', 'relaxed'] },
  width: { type: 'select', label: 'Section width', options: ['standard', 'wide', 'full'] },
  background: {
    type: 'token',
    label: 'Background token',
    options: ['canvas', 'surface', 'muted', 'brand', 'accent'],
  },
  emphasis: { type: 'select', label: 'Visual emphasis', options: ['subtle', 'normal', 'bold'] },
} satisfies Record<string, PresentationField>

const simple = (
  id: string,
  label: string,
  category: string,
  fields: Record<string, PresentationField>,
): ComponentDefinition => ({
  id,
  version: 1,
  label,
  category,
  permissions: ['layout:edit'],
  capabilities: [],
  fields,
  validate: () => [],
  render: (props) => (
    <section
      data-block={label}
      data-align={text(props, 'alignment', 'left')}
      data-spacing={text(props, 'spacing', 'normal')}
      data-width={text(props, 'width', 'standard')}
      data-bg={text(props, 'background', 'canvas')}
      data-emphasis={text(props, 'emphasis', 'normal')}
    >
      <h2>{text(props, 'title', label)}</h2>
      {typeof props.body === 'string' ? <p>{props.body}</p> : null}
      {props.link && typeof props.link === 'object' ? (
        <a href={String((props.link as { href?: string }).href ?? '/')}>
          {String((props.link as { label?: string }).label ?? 'Learn more')}
        </a>
      ) : null}
      {props.media && typeof props.media === 'object' ? (
        // Canonical media URLs are chosen by the server-backed picker, never typed as identifiers.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={String((props.media as { href?: string }).href ?? '')}
          alt={String((props.media as { label?: string }).label ?? '')}
        />
      ) : null}
    </section>
  ),
  fallback: (block) => (
    <section data-unavailable-component={block.component}>This section is unavailable.</section>
  ),
})

const media: PresentationField = { type: 'media', label: 'Media library selection' }
const link: PresentationField = { type: 'link', label: 'Internal destination' }
const body: PresentationField = { type: 'long-text', label: 'Text', maxLength: 4000 }
const query: PresentationField = { type: 'content-query', label: 'Content query' }
const variant: PresentationField = {
  type: 'select',
  label: 'Layout variant',
  options: ['default', 'split', 'contained'],
}

const featured: Array<[string, string, string, Record<string, PresentationField>]> = [
  ['publisher.hero', 'Hero', 'Introduction', { ...common, body, media, link, variant }],
  ['publisher.rich-content', 'Rich content', 'Content', { ...common, body, variant }],
  ['publisher.image', 'Image', 'Media', { ...common, media, variant }],
  ['publisher.feature-grid', 'Feature grid', 'Content', { ...common, body, query, variant }],
  ['publisher.cta', 'Call to action', 'Actions', { ...common, body, link, variant }],
  ['publisher.article-list', 'Article list', 'Queries', { ...common, query, variant }],
]

const legacy: Array<[string, string, string]> = [
  ['publisher.featured-article', 'Featured article', 'Content'],
  ['publisher.article-grid', 'Article grid', 'Queries'],
  ['publisher.profile-card', 'Profile card', 'People'],
  ['publisher.profile-grid', 'Profile grid', 'People'],
  ['publisher.profile-bio', 'Profile bio', 'People'],
  ['publisher.profile-status-and-links', 'Profile status and links', 'People'],
  ['publisher.friend-and-buddy-list', 'Friend and buddy list', 'Community'],
  ['publisher.personal-post-feed', 'Personal-post feed', 'Community'],
  ['publisher.album-and-gallery', 'Album and gallery', 'Media'],
  ['publisher.portfolio-and-project', 'Portfolio and project', 'Media'],
  ['publisher.author-card', 'Author card', 'People'],
  ['publisher.author-grid', 'Author grid', 'People'],
  ['publisher.pull-quote', 'Pull quote', 'Content'],
  ['publisher.quote-card', 'Quote card', 'Content'],
  ['publisher.newsletter-cta', 'Newsletter CTA', 'Actions'],
  ['publisher.donation', 'Donation', 'Actions'],
  ['publisher.video', 'Video', 'Media'],
  ['publisher.audio', 'Audio', 'Media'],
  ['publisher.book-card', 'Book card', 'Media'],
  ['publisher.podcast-card', 'Podcast card', 'Media'],
  ['publisher.video-card', 'Video card', 'Media'],
  ['publisher.forum-activity', 'Forum activity', 'Community'],
  ['publisher.featured-discussion', 'Featured discussion', 'Community'],
  ['publisher.unanswered-and-solved-threads', 'Unanswered and solved threads', 'Community'],
  ['publisher.event-card', 'Event card', 'Events'],
  ['publisher.event-list', 'Event list', 'Events'],
  ['publisher.timeline', 'Timeline', 'Events'],
  ['publisher.chart-and-stat', 'Chart and stat', 'Data'],
  ['publisher.comparison-table', 'Comparison table', 'Data'],
  ['publisher.faq', 'FAQ', 'Content'],
  ['publisher.source-and-evidence-box', 'Source and evidence box', 'Content'],
  ['publisher.team', 'Team', 'People'],
  ['publisher.contact-form-placeholder', 'Contact form placeholder', 'Actions'],
  ['publisher.custom-embed', 'Custom embed', 'Advanced'],
]

export const starterComponents: Record<string, ComponentDefinition> = Object.fromEntries([
  ...featured.map(([id, label, category, fields]) => [id, simple(id, label, category, fields)]),
  ...legacy.map(([id, label, category]) => [
    id,
    simple(id, label, category, { ...common, body, query, variant }),
  ]),
])

// Embeds are destinations selected from the canonical internal-link chooser; arbitrary URLs/HTML are not accepted.
starterComponents['publisher.custom-embed'] = simple(
  'publisher.custom-embed',
  'Custom embed',
  'Advanced',
  { ...common, link, variant },
)

starterComponents['publisher.pattern'] = {
  id: 'publisher.pattern',
  version: 1,
  label: 'Reusable pattern',
  category: 'Patterns',
  permissions: ['layout:edit'],
  capabilities: [],
  fields: {
    patternId: { type: 'text', label: 'Pattern reference' },
    patternName: { type: 'text', label: 'Pattern name' },
    patternVersion: { type: 'number', label: 'Pattern version' },
    mode: { type: 'select', label: 'Pattern mode', options: ['linked', 'snapshot'] },
  },
  validate: (props) => {
    if (!props.patternId) return ['Pattern reference is required']
    return []
  },
  render: (props) => (
    <div
      data-pattern-instance={String(props.patternId ?? '')}
      data-pattern-name={String(props.patternName ?? '')}
      data-pattern-mode={String(props.mode ?? 'linked')}
      className="pattern-instance border border-dashed border-stone-300 dark:border-stone-700 p-4 rounded-xl my-2"
    >
      <div className="flex items-center gap-2 mb-2 text-xs font-mono text-stone-500">
        <span className="badge badge-brand">
          Pattern: {String(props.patternName || props.patternId)}
        </span>
        <span>v{String(props.patternVersion ?? 1)}</span>
        <span className="capitalize">({String(props.mode ?? 'linked')})</span>
      </div>
    </div>
  ),
  fallback: () => (
    <div data-unavailable-component="publisher.pattern">Linked pattern unavailable</div>
  ),
}
