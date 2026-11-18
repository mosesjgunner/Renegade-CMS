import type { ReactNode } from 'react'
import Link from 'next/link'
import { LiveProductShowcase } from '../../commerce/LiveProductShowcase'
import type { ComponentDefinition, PresentationField } from '../../public/page-builder'
import { ResponsiveMedia } from '../../media/responsive'
import type { FormField } from '../../audience/contracts'
import type { HydratedEmbed, HydratedFormDefinition, HydratedGalleryItem } from '../contracts'

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
]

export const starterComponents: Record<string, ComponentDefinition> = Object.fromEntries([
  ...featured.map(([id, label, category, fields]) => [id, simple(id, label, category, fields)]),
  ...legacy.map(([id, label, category]) => [
    id,
    simple(id, label, category, { ...common, body, query, variant }),
  ]),
])

const referenceLabel = (value: unknown): string =>
  value && typeof value === 'object' && typeof (value as { label?: unknown }).label === 'string'
    ? String((value as { label: string }).label)
    : ''

const compositionShell = (
  id: string,
  props: Record<string, unknown>,
  children: ReactNode,
): ReactNode => (
  <section data-component={id} data-align={text(props, 'alignment', 'left')}>
    {typeof props.title === 'string' && props.title.trim() ? <h2>{props.title}</h2> : null}
    {children}
  </section>
)

/**
 * Real gallery (S2-06): renders the media of a canonical album record,
 * resolved server-side into `galleryItems` with the assets' own alt text
 * and variants. Without hydration the block shows its configuration state;
 * a missing, foreign or empty album shows the resolver's reason.
 */
starterComponents['publisher.album-and-gallery'] = {
  id: 'publisher.album-and-gallery',
  version: 1,
  label: 'Album and gallery',
  category: 'Media',
  permissions: ['layout:edit'],
  capabilities: [],
  fields: {
    ...common,
    album: { type: 'link', label: 'Album' },
    galleryLayout: {
      type: 'select',
      label: 'Gallery layout',
      options: ['grid', 'featured'],
    },
  },
  validate: () => [],
  fallback: (block) => (
    <section data-unavailable-component={block.component}>This section is unavailable.</section>
  ),
  render: (props) => {
    const items = Array.isArray(props.galleryItems)
      ? (props.galleryItems as HydratedGalleryItem[])
      : []
    if (typeof props.galleryUnavailable === 'string')
      return compositionShell(
        'publisher.album-and-gallery',
        props,
        <p data-gallery-unavailable>{props.galleryUnavailable}</p>,
      )
    if (items.length)
      return compositionShell(
        'publisher.album-and-gallery',
        props,
        <div className="rg-gallery" data-variant={text(props, 'galleryLayout', 'grid')}>
          {items.map((item) => (
            <figure key={item.media.id}>
              <ResponsiveMedia
                media={item.media}
                variant="inline"
                className="max-w-full h-auto rounded-lg"
              />
              {item.caption || item.credits ? (
                <figcaption>
                  {item.caption}
                  {item.credits ? <span className="rg-gallery-credits">{item.credits}</span> : null}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>,
      )
    const label = referenceLabel(props.album)
    return compositionShell(
      'publisher.album-and-gallery',
      props,
      <p data-gallery-configuration>
        {label
          ? `Gallery: ${label} — its media load with the published page.`
          : 'Select an album to build this gallery.'}
      </p>,
    )
  },
}

function formFieldControl(field: FormField): ReactNode {
  const options = Array.isArray(field.validation?.options)
    ? field.validation.options.map(String)
    : []
  const shared = { name: field.key, required: Boolean(field.required) }
  switch (field.type) {
    case 'textarea':
      return <textarea {...shared} rows={4} />
    case 'select':
      return (
        <select {...shared} defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    case 'radio':
      return (
        <span className="rg-form-options">
          {options.map((option) => (
            <label key={option}>
              <input type="radio" name={field.key} value={option} required={field.required} />{' '}
              {option}
            </label>
          ))}
        </span>
      )
    case 'checkbox':
      return <input type="checkbox" name={field.key} value="true" />
    case 'hidden':
      return <input type="hidden" name={field.key} />
    default:
      return (
        <input
          {...shared}
          type={['email', 'number', 'date'].includes(field.type) ? field.type : 'text'}
        />
      )
  }
}

/**
 * Real form block (S2-06): renders the published schema of a canonical
 * form definition, resolved server-side by the audience form runtime
 * (site-scoped; draft or foreign forms never resolve). The form posts to
 * the form's normal public endpoint; consent wording ships with the
 * schema snapshot and the endpoint's honeypot contract is rendered.
 */
starterComponents['publisher.form'] = {
  id: 'publisher.form',
  version: 1,
  label: 'Form',
  category: 'Actions',
  permissions: ['layout:edit'],
  capabilities: [],
  fields: { ...common, form: { type: 'link', label: 'Form' } },
  validate: () => [],
  fallback: (block) => (
    <section data-unavailable-component={block.component}>This section is unavailable.</section>
  ),
  render: (props) => {
    if (typeof props.formUnavailable === 'string')
      return compositionShell(
        'publisher.form',
        props,
        <p data-form-unavailable>{props.formUnavailable}</p>,
      )
    const definition =
      props.formDefinition && typeof props.formDefinition === 'object'
        ? (props.formDefinition as HydratedFormDefinition)
        : null
    if (!definition) {
      const label = referenceLabel(props.form)
      return compositionShell(
        'publisher.form',
        props,
        <p data-form-configuration>
          {label
            ? `Form: ${label} — its published fields load with the published page.`
            : 'Select a form to embed it here.'}
        </p>,
      )
    }
    return compositionShell(
      'publisher.form',
      props,
      <form method="post" action={definition.endpoint} data-form-id={definition.id}>
        {definition.fields.map((field) => (
          <div className="rg-form-field" key={field.key}>
            <label>
              {field.label}
              {field.required ? <span aria-hidden="true"> *</span> : null}
              {formFieldControl(field)}
            </label>
            {field.helpText ? <p className="rg-form-help">{field.helpText}</p> : null}
          </div>
        ))}
        <input
          type="text"
          name="honeypot"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="rg-honeypot"
        />
        {definition.consentText ? (
          <p className="rg-form-consent">{definition.consentText}</p>
        ) : null}
        <button type="submit">Submit</button>
      </form>,
    )
  },
}

/**
 * Bounded embed (S2-06): the block references a canonical video record;
 * the server resolves it through the media publishing policy, which only
 * ever yields an approved provider embed URL (or an honest unavailable
 * message). Arbitrary URLs and HTML are never accepted from props.
 */
starterComponents['publisher.custom-embed'] = {
  id: 'publisher.custom-embed',
  version: 1,
  label: 'Custom embed',
  category: 'Advanced',
  permissions: ['layout:edit'],
  capabilities: [],
  fields: { ...common, link, variant },
  validate: () => [],
  fallback: (block) => (
    <section data-unavailable-component={block.component}>This section is unavailable.</section>
  ),
  render: (props) => {
    if (typeof props.embedUnavailable === 'string')
      return compositionShell(
        'publisher.custom-embed',
        props,
        <p data-embed-unavailable>{props.embedUnavailable}</p>,
      )
    const embed =
      props.embed && typeof props.embed === 'object' ? (props.embed as HydratedEmbed) : null
    if (!embed) {
      const label = referenceLabel(props.link)
      return compositionShell(
        'publisher.custom-embed',
        props,
        <p data-embed-configuration>
          {label
            ? `Embed: ${label} — approved embeds load with the published page.`
            : 'Select a video to embed it here.'}
        </p>,
      )
    }
    return compositionShell(
      'publisher.custom-embed',
      props,
      <div className="rg-embed">
        <iframe
          src={embed.url}
          title={embed.title}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>,
    )
  },
}

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
      data-pattern-policy={
        String(props.mode ?? 'linked') === 'linked' ? 'latest-published' : 'detached-copy'
      }
      className="pattern-instance border border-dashed border-stone-300 dark:border-stone-700 p-4 rounded-xl my-2"
    >
      <div className="flex items-center gap-2 mb-2 text-xs font-mono text-stone-500">
        <span className="badge badge-brand">
          Pattern: {String(props.patternName || props.patternId)}
        </span>
        <span>v{String(props.patternVersion ?? 1)}</span>
        <span className="capitalize">({String(props.mode ?? 'linked')})</span>
      </div>
      <p className="text-xs text-stone-500">
        {String(props.mode ?? 'linked') === 'linked'
          ? 'Linked: renders the pattern’s latest published revision. Draft pattern edits stay private until the pattern is published.'
          : 'Snapshot: a detached copy frozen at insert time.'}
      </p>
    </div>
  ),
  fallback: () => (
    <div data-unavailable-component="publisher.pattern">Linked pattern unavailable</div>
  ),
}

/**
 * Two-column container (S2-05). Children live in the slot-typed props
 * `column0`/`column1`. The two render contexts supply those props
 * differently: the public renderer injects already-rendered child nodes,
 * while Puck injects SlotComponents (functions returning the zone's
 * nodes). The render normalizes both. Nesting containers inside containers
 * is rejected by the layout validator.
 */
starterComponents['publisher.columns'] = {
  id: 'publisher.columns',
  version: 1,
  label: 'Columns',
  category: 'Layout',
  permissions: ['layout:edit'],
  capabilities: [],
  fields: {
    ...common,
    column0: { type: 'slot', label: 'First column' },
    column1: { type: 'slot', label: 'Second column' },
    balance: {
      type: 'select',
      label: 'Column balance',
      options: ['equal', 'wide-left', 'wide-right'],
    },
  },
  validate: () => [],
  render: (props) => {
    const renderSlot = (value: unknown) =>
      typeof value === 'function' ? (value as () => ReactNode)() : (value as ReactNode)
    const title = typeof props.title === 'string' && props.title.trim() ? props.title : undefined
    return (
      <section
        data-block="Columns"
        data-variant={text(props, 'balance', 'equal')}
        data-align={text(props, 'alignment', 'left')}
        data-spacing={text(props, 'spacing', 'normal')}
        data-width={text(props, 'width', 'standard')}
        data-bg={text(props, 'background', 'canvas')}
        data-emphasis={text(props, 'emphasis', 'normal')}
      >
        {title ? <h2>{title}</h2> : null}
        <div className="rg-columns" data-variant={text(props, 'balance', 'equal')}>
          <div className="rg-column">{renderSlot(props.column0)}</div>
          <div className="rg-column">{renderSlot(props.column1)}</div>
        </div>
      </section>
    )
  },
  fallback: (block) => (
    <section data-unavailable-component={block.component}>This section is unavailable.</section>
  ),
}
