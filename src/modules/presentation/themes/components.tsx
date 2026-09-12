import type { ComponentDefinition } from '../../public/page-builder'

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

export const starterComponents: Record<string, ComponentDefinition> = Object.fromEntries(
  blockSpecs.map(([label, category, fields]) => {
    const definition = simple(label, category, fields)
    return [definition.id, definition]
  }),
)
