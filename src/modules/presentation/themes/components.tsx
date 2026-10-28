import Link from 'next/link'
import { LiveProductShowcase } from '../../commerce/LiveProductShowcase'
import type { ComponentDefinition, PresentationField } from '../../public/page-builder'
import { ResponsiveMedia } from '../../media/responsive'

const text = (props: Record<string, unknown>, key: string, fallback: string) =>
  typeof props[key] === 'string' && props[key].trim() ? String(props[key]) : fallback

const common = {
  title: { type: 'text', label: 'Heading', maxLength: 160 },
  headingLevel: { type: 'select', label: 'Heading level', options: ['h1', 'h2', 'h3', 'h4'] },
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
  render: (props) => {
    const level = text(props, 'headingLevel', id === 'publisher.hero' ? 'h1' : 'h2')
    const Heading = (['h1', 'h2', 'h3', 'h4'].includes(level) ? level : 'h2') as
      | 'h1'
      | 'h2'
      | 'h3'
      | 'h4'
    return (
      <section
        data-block={label}
        data-align={text(props, 'alignment', 'left')}
        data-spacing={text(props, 'spacing', 'normal')}
        data-width={text(props, 'width', 'standard')}
        data-bg={text(props, 'background', 'canvas')}
        data-emphasis={text(props, 'emphasis', 'normal')}
        data-variant={text(props, 'variant', 'default')}
      >
        <Heading>{text(props, 'title', label)}</Heading>
        {Array.isArray(props.queryResults) ? (
          <ul>
            {(props.queryResults as Array<{ id: string; title: string; href: string }>).map(
              (item) => (
                <li key={item.id}>
                  <a href={item.href}>{item.title}</a>
                </li>
              ),
            )}
          </ul>
        ) : null}
        {typeof props.body === 'string' ? <p>{props.body}</p> : null}
        {id === 'publisher.navigation' ? (
          <nav aria-label={text(props, 'title', 'Page navigation')}>
            {['link', 'secondaryLink', 'tertiaryLink'].map((name) => {
              const target = props[name] as { href?: string; label?: string } | undefined
              return target ? (
                <a key={name} href={target.href}>
                  {target.label}
                </a>
              ) : null
            })}
          </nav>
        ) : props.link && typeof props.link === 'object' ? (
          <Link
            className={
              id === 'publisher.cta' || id === 'publisher.hero'
                ? 'btn btn-primary inline-block mt-4'
                : 'btn btn-secondary inline-block mt-4'
            }
            href={String((props.link as { href?: string }).href ?? '/')}
          >
            {String((props.link as { label?: string }).label ?? 'Learn more')}
          </Link>
        ) : null}
        {props.media && typeof props.media === 'object'
          ? (() => {
              const href = String((props.media as { href?: string }).href ?? '')
              const label = String((props.media as { label?: string }).label ?? '')
              const mediaMatch = href.match(/\/media\/([a-f0-9-]+)/i)
              const mediaId = mediaMatch ? mediaMatch[1] : null
              const namedVariant = id === 'publisher.hero' ? 'hero' : 'inline'
              const isPriority = id === 'publisher.hero'

              if (mediaId) {
                return (
                  <ResponsiveMedia
                    media={{ id: mediaId, altText: label }}
                    variant={namedVariant}
                    priority={isPriority}
                    className="max-w-full h-auto rounded-lg"
                  />
                )
              }

              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={href}
                  alt={label}
                  className="max-w-full h-auto rounded-lg"
                  loading={isPriority ? 'eager' : 'lazy'}
                />
              )
            })()
          : null}
      </section>
    )
  },
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
  [
    'publisher.navigation',
    'Navigation',
    'Navigation',
    {
      ...common,
      link,
      secondaryLink: { ...link, label: 'Second destination' },
      tertiaryLink: { ...link, label: 'Third destination' },
    },
  ],
  ['publisher.cta', 'Call to action', 'Actions', { ...common, body, link, variant }],
  ['publisher.article-list', 'Article list', 'Queries', { ...common, query, variant }],
]

const legacy: Array<[string, string, string]> = [
  ['publisher.editorial', 'Editorial article body', 'Content'],
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

starterComponents['publisher.newsletter-cta'] = {
  id: 'publisher.newsletter-cta',
  version: 1,
  label: 'Newsletter CTA',
  category: 'Actions',
  permissions: ['layout:edit'],
  capabilities: [],
  fields: { ...common, body, link, query, variant },
  validate: () => [],
  render: (props) => {
    const title = text(props, 'title', 'Join our newsletter')
    const description = typeof props.body === 'string' ? props.body : 'Stay informed with updates.'
    const linkTarget =
      props.link && typeof props.link === 'object'
        ? (props.link as { href?: string; label?: string })
        : null
    const ctaHref = String(linkTarget?.href ?? '/subscribe')
    const ctaLabel = String(linkTarget?.label ?? 'Subscribe to Updates')
    return (
      <section
        id="publisher-newsletter-cta"
        className="starter-component newsletter-widget surface-card p-6 md:p-8 rounded-2xl border border-stone-200 dark:border-stone-800 my-4 text-center"
        data-component="publisher.newsletter-cta"
        data-align={text(props, 'alignment', 'center')}
        data-spacing={text(props, 'spacing', 'normal')}
        data-width={text(props, 'width', 'standard')}
        data-background={text(props, 'background', 'surface')}
        data-emphasis={text(props, 'emphasis', 'bold')}
        data-variant={text(props, 'variant', 'contained')}
      >
        <h3 className="text-2xl md:text-3xl font-black mb-2 text-stone-900 dark:text-stone-100">
          {title}
        </h3>
        <p className="text-stone-600 dark:text-stone-300 text-sm md:text-base mb-6 max-w-xl mx-auto">
          {description}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={ctaHref}
            className="inline-block px-6 py-3 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 font-bold rounded-xl text-sm transition-colors shadow-sm"
          >
            {ctaLabel} →
          </Link>
        </div>
      </section>
    )
  },
  fallback: (block) => (
    <div data-unavailable-component={block.component}>Newsletter CTA unavailable</div>
  ),
}

starterComponents['publisher.donation'] = {
  id: 'publisher.donation',
  version: 1,
  label: 'Donation',
  category: 'Actions',
  permissions: ['layout:edit'],
  capabilities: [],
  fields: { ...common, body, query, variant },
  validate: () => [],
  render: (props) => {
    const title = text(props, 'title', 'Support Our Movement')
    const description =
      typeof props.body === 'string'
        ? props.body
        : '100% grassroots funded by everyday working people.'
    return (
      <section
        id="publisher-donation"
        className="starter-component donation-widget surface-card p-6 md:p-8 rounded-2xl border border-stone-200 dark:border-stone-800 my-4 text-center"
        data-component="publisher.donation"
        data-align={text(props, 'alignment', 'center')}
        data-spacing={text(props, 'spacing', 'normal')}
        data-width={text(props, 'width', 'standard')}
        data-background={text(props, 'background', 'canvas')}
        data-emphasis={text(props, 'emphasis', 'bold')}
        data-variant={text(props, 'variant', 'default')}
      >
        <h3 className="text-2xl md:text-3xl font-black mb-2 text-stone-900 dark:text-stone-100">
          {title}
        </h3>
        <p className="text-stone-600 dark:text-stone-300 text-sm md:text-base mb-6 max-w-xl mx-auto">
          {description}
        </p>
        <div
          className="flex flex-wrap justify-center gap-2 mb-6"
          role="group"
          aria-label="Suggested donation amounts"
        >
          {['10', '25', '50', '100', '250'].map((amt) => (
            <Link
              key={amt}
              href={`/donate?amount=${amt}`}
              className="px-4 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 font-bold rounded-lg text-sm transition-colors text-stone-900 dark:text-stone-100 text-center"
            >
              ${amt}
            </Link>
          ))}
          <Link
            href="/donate"
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 font-bold rounded-lg text-sm transition-colors text-stone-900 dark:text-stone-100 text-center"
          >
            Custom
          </Link>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/donate"
            className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm"
          >
            Donate Online Now →
          </Link>
          <span className="text-xs text-stone-500 font-medium">
            FEC Compliant • Grassroots Action
          </span>
        </div>
        <div
          data-provider-state="safe-unconfigured"
          className="mt-4 pt-4 border-t border-stone-200/60 dark:border-stone-800 text-xs text-stone-400 text-center"
        >
          Contributions processed via secure PCI-compliant processor or local test checkout when
          configured. No unverified live charges accepted.
        </div>
      </section>
    )
  },
  fallback: (block) => (
    <div data-unavailable-component={block.component}>Donation widget unavailable</div>
  ),
}

starterComponents['publisher.product-showcase'] = {
  id: 'publisher.product-showcase',
  version: 1,
  label: 'Product showcase',
  category: 'Commerce',
  permissions: ['layout:edit'],
  capabilities: [],
  fields: { ...common, body, query, variant, link },
  validate: () => [],
  render: (props) => {
    const title = text(props, 'title', 'Products')
    const description =
      typeof props.body === 'string'
        ? props.body
        : 'Browse published products and current availability.'
    return (
      <section
        id="publisher-product-showcase"
        className="starter-component product-showcase-widget surface-card p-6 md:p-8 rounded-2xl border border-stone-200 dark:border-stone-800 my-4"
        data-component="publisher.product-showcase"
        data-align={text(props, 'alignment', 'left')}
        data-spacing={text(props, 'spacing', 'normal')}
        data-width={text(props, 'width', 'wide')}
        data-background={text(props, 'background', 'canvas')}
        data-emphasis={text(props, 'emphasis', 'normal')}
        data-variant={text(props, 'variant', 'default')}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
          <div>
            <h3 className="text-2xl font-black text-stone-900 dark:text-stone-100">{title}</h3>
            <p className="text-stone-600 dark:text-stone-300 text-sm mt-1">{description}</p>
          </div>
          <Link
            href="/store"
            className="text-sm font-bold text-red-600 hover:text-red-700 underline shrink-0"
          >
            View All Products →
          </Link>
        </div>
        <LiveProductShowcase />
      </section>
    )
  },
  fallback: (block) => (
    <div data-unavailable-component={block.component}>Product showcase unavailable</div>
  ),
}

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
