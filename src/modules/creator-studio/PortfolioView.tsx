import type { Payload } from 'payload'
import type { Metadata } from 'next'
import type { MediaAsset } from '@/payload-types'
import { resolveSiteSettings } from '../core/site-settings'
import { canRenderPublic } from '../public/contracts'
import { serializeJsonLd } from '../public/discovery'
import { SubmissionTargetLink } from './SubmissionTargetLink'
import { portfolioEmbed, portfolioMediaIds, type PortfolioBlock } from './portfolio-contract'
import {
  discoverPortfolio,
  portfolioMediaUrl,
  resolvePortfolioAsset,
  type PortfolioPage,
} from './portfolio-public'
import { portfolioAccess, portfolioMediaKind } from './portfolio-service'
import { relationId } from './submission-targets'
import styles from './PortfolioView.module.css'

async function portfolioOrigin(payload: Payload, siteId: string) {
  const settings = await resolveSiteSettings(payload)
  return {
    origin: settings.canonicalOriginsBySite[siteId] || settings.canonicalOrigin,
    indexable: settings.indexingMode !== 'noindex' && settings.launchState === 'live',
  }
}

export async function portfolioMetadata(
  payload: Payload,
  page: PortfolioPage,
  siteIsPublic: boolean,
): Promise<Metadata> {
  if (!siteIsPublic || !discoverPortfolio(page)) return { robots: { index: false, follow: false } }
  const { origin, indexable } = await portfolioOrigin(payload, relationId(page.doc.site))
  const canonical = new URL(page.doc.canonicalPath, origin).toString()
  const { title, summary } = page.draft
  return {
    title,
    description: summary || undefined,
    alternates: { canonical },
    openGraph: { title, description: summary || undefined, url: canonical, type: 'website' },
    robots: { index: indexable, follow: true },
  }
}

type Art = { asset: MediaAsset; inlineWidth?: number }

async function getArtwork(payload: Payload, page: PortfolioPage) {
  const ids = portfolioMediaIds(page.draft)
  if (!ids.length) return new Map<string, Art>()
  const { docs } = await payload.find({
    collection: 'media-assets',
    ...portfolioAccess,
    limit: ids.length,
    where: { and: [{ id: { in: ids } }, { site: { equals: relationId(page.doc.site) } }] },
  })
  const permitted = new Map<string, Art>()
  await Promise.all(
    docs.map(async (asset) => {
      const resolved = await resolvePortfolioAsset(payload, page, asset)
      if (resolved) permitted.set(asset.id, { asset: resolved })
    }),
  )
  const imageIds = [
    ...new Set(
      [...permitted.values()]
        .filter(({ asset }) => portfolioMediaKind(asset) === 'image')
        .map(({ asset }) => asset.id),
    ),
  ]
  if (imageIds.length) {
    const { docs: variants } = await payload.find({
      collection: 'media-variants',
      ...portfolioAccess,
      limit: imageIds.length,
      where: {
        and: [
          { asset: { in: imageIds } },
          { recipeKey: { equals: 'inline' } },
          { format: { equals: 'webp' } },
          { processingState: { equals: 'ready' } },
        ],
      },
    })
    const widths = new Map(variants.map((variant) => [relationId(variant.asset), variant.width]))
    for (const art of permitted.values()) art.inlineWidth = widths.get(art.asset.id) ?? undefined
  }
  return permitted
}

function PortfolioImage({
  page,
  id,
  art,
  alt,
  priority = false,
}: {
  page: PortfolioPage
  id: string
  art: Art
  alt?: string
  priority?: boolean
}) {
  const src = portfolioMediaUrl(page, id)
  const { asset, inlineWidth } = art
  const inline = inlineWidth && portfolioMediaUrl(page, id, { variant: 'inline', format: 'webp' })
  const srcSet =
    inline && inlineWidth && asset.width && asset.width > inlineWidth
      ? `${inline} ${inlineWidth}w, ${src} ${asset.width}w`
      : undefined
  // The media handler rechecks collection access for every variant and preview URL.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={inline || src}
      srcSet={srcSet}
      sizes={
        priority || !['grid', 'masonry', 'exhibition'].includes(page.draft.layout)
          ? '(max-width: 768px) 100vw, 72rem'
          : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
      }
      width={asset.width || undefined}
      height={asset.height || undefined}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      alt={alt || asset.altText || ''}
    />
  )
}

function Work({ page, block, art }: { page: PortfolioPage; block: PortfolioBlock; art?: Art }) {
  const kind = (art && portfolioMediaKind(art.asset)) || block.kind
  const src = art && portfolioMediaUrl(page, block.media)
  const embed = block.kind === 'embed' ? portfolioEmbed(block.url) : null
  const caption = block.caption || art?.asset.caption
  const credit = block.credit || art?.asset.creatorCredit
  const rights = block.rights || art?.asset.license
  return (
    <figure className={styles.work} data-kind={kind}>
      {block.title && <h3>{block.title}</h3>}
      {block.kind === 'text' && <p className={styles.copy}>{block.text}</p>}
      {art && kind === 'image' && (
        <PortfolioImage page={page} id={block.media} art={art} alt={block.alt} />
      )}
      {src && kind === 'audio' && (
        <audio controls preload="none" src={src} aria-label={block.title || art?.asset.title} />
      )}
      {src && kind === 'video' && (
        <video
          controls
          playsInline
          preload="metadata"
          src={src}
          aria-label={block.title || art?.asset.title}
        />
      )}
      {embed && (
        <>
          <iframe
            src={embed.frame}
            title={block.title || 'External video'}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p>
            <a href={embed.link}>Watch on the video provider</a>
          </p>
        </>
      )}
      {(caption || credit || rights) && (
        <figcaption>
          {caption && <p className={styles.copy}>{caption}</p>}
          {credit && <small>{credit}</small>}
          {rights && <small>{rights}</small>}
        </figcaption>
      )}
    </figure>
  )
}

async function getRelated(payload: Payload, page: PortfolioPage) {
  const { canonicalContent, relatedContent, relatedProducts } = page.draft
  const siteId = relationId(page.doc.site)
  const ids = [...new Set([canonicalContent, ...relatedContent].filter(Boolean))]
  const articleQuery = ids.length
    ? payload.find({
        collection: 'content',
        ...portfolioAccess,
        limit: ids.length,
        where: { and: [{ id: { in: ids } }, { site: { equals: siteId } }] },
      })
    : null
  const productQuery =
    relatedProducts.length && payload.collections.products
      ? payload.find({
          collection: 'products',
          ...portfolioAccess,
          limit: relatedProducts.length,
          where: {
            and: [
              { id: { in: relatedProducts } },
              { site: { equals: siteId } },
              { state: { equals: 'published' } },
            ],
          },
        })
      : null
  const [articles, products] = await Promise.all([articleQuery, productQuery])
  const publicArticles = new Map(
    (articles?.docs ?? [])
      .filter(
        (doc) =>
          canRenderPublic({ ...doc, removeFromDiscovery: doc.removeFromDiscovery ?? undefined }) &&
          !doc.requiredEntitlement &&
          !doc.removeFromDiscovery,
      )
      .map((doc) => [doc.id, doc]),
  )
  const publicProducts = new Map(
    (products?.docs ?? [])
      .filter(
        (doc) =>
          canRenderPublic({ ...doc, removeFromDiscovery: doc.removeFromDiscovery ?? undefined }) &&
          !doc.removeFromDiscovery,
      )
      .map((doc) => [doc.id, doc]),
  )
  return {
    canonical: publicArticles.get(canonicalContent),
    articles: relatedContent.flatMap((id) =>
      id !== canonicalContent && publicArticles.has(id) ? [publicArticles.get(id)!] : [],
    ),
    products: relatedProducts.flatMap((id) =>
      publicProducts.has(id) ? [publicProducts.get(id)!] : [],
    ),
  }
}

export async function PortfolioView({
  payload,
  page,
  siteIsPublic = false,
  embedded = false,
}: {
  payload: Payload
  page: PortfolioPage
  siteIsPublic?: boolean
  embedded?: boolean
}) {
  const { draft, doc } = page
  const [art, related, metadata] = await Promise.all([
    getArtwork(payload, page),
    getRelated(payload, page),
    portfolioMetadata(payload, page, siteIsPublic),
  ])
  const cover = art.get(draft.cover)
  const canonical = metadata.alternates?.canonical?.toString()
  const schema = canonical
    ? {
        '@context': 'https://schema.org',
        '@type': page.collection === 'albums' ? 'CollectionPage' : 'CreativeWork',
        name: draft.title,
        description: draft.summary || undefined,
        url: canonical,
        image: cover
          ? new URL(portfolioMediaUrl(page, draft.cover), canonical).toString()
          : undefined,
        creditText: draft.credits || undefined,
        keywords: draft.tags.length ? draft.tags.join(', ') : undefined,
        isBasedOn: related.canonical?.canonicalPath
          ? new URL(related.canonical.canonicalPath, canonical).toString()
          : undefined,
      }
    : null

  const Frame = embedded ? 'section' : 'main'
  return (
    <Frame
      className={embedded ? styles.embedded : styles.portfolio}
      data-layout={draft.layout}
      aria-labelledby="portfolio-title"
    >
      {schema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
        />
      )}
      {page.preview && <p className="surface-card p-3">Private draft preview</p>}
      <header className={styles.header}>
        {embedded ? (
          <h2 id="portfolio-title" className="font-display">
            Gallery
          </h2>
        ) : (
          <h1 id="portfolio-title" className="font-display">
            {draft.title}
          </h1>
        )}
        {draft.summary && <p className={styles.copy}>{draft.summary}</p>}
        {draft.credits && <p className={styles.copy}>{draft.credits}</p>}
        {(draft.startsOn || draft.endsOn) && (
          <p>
            {draft.startsOn && <time dateTime={draft.startsOn}>{draft.startsOn}</time>}
            {draft.startsOn && draft.endsOn && ' – '}
            {draft.endsOn && <time dateTime={draft.endsOn}>{draft.endsOn}</time>}
          </p>
        )}
        {draft.tags.length > 0 && (
          <ul className={styles.tags} aria-label="Tags">
            {draft.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </header>
      {cover && (
        <figure className={styles.cover} data-component="publisher.hero">
          <PortfolioImage page={page} id={draft.cover} art={cover} priority />
          {cover.asset.caption && <figcaption>{cover.asset.caption}</figcaption>}
        </figure>
      )}
      {draft.sections.map((section) => (
        <section
          key={section.id}
          className={styles.section}
          data-component="publisher.album-and-gallery"
          aria-label={section.title || undefined}
        >
          {section.title && <h2 className="font-display">{section.title}</h2>}
          <div className={styles.works}>
            {section.blocks.map((block) => {
              const media = art.get(block.media)
              if (block.kind !== 'text' && block.kind !== 'embed' && !media) return null
              return <Work key={block.id} page={page} block={block} art={media} />
            })}
          </div>
        </section>
      ))}
      {draft.sourceRights && <p className={styles.copy}>{draft.sourceRights}</p>}
      {(related.canonical || related.articles.length > 0 || related.products.length > 0) && (
        <nav aria-label="Related work">
          <h2>Related work</h2>
          <ul>
            {[related.canonical, ...related.articles, ...related.products].map(
              (item) =>
                item?.canonicalPath && (
                  <li key={item.id}>
                    <a href={item.canonicalPath}>{'title' in item ? item.title : item.name}</a>
                  </li>
                ),
            )}
          </ul>
        </nav>
      )}
      {!page.preview && page.collection === 'albums' && draft.visibility === 'public' && (
        <SubmissionTargetLink
          payload={payload}
          siteId={relationId(doc.site)}
          target={`gallery:${doc.id}`}
        />
      )}
    </Frame>
  )
}
