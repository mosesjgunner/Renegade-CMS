import type { Metadata } from 'next'

export type SEOFields = {
  seoTitle?: string | null
  seoDescription?: string | null
  seoCanonicalURL?: string | null
  seoNoIndex?: boolean | null
  seoImageAlt?: string | null
}
export type SEOInput = SEOFields & {
  title: string
  description?: string | null
  canonicalPath: string
  siteUrl: string
  locale?: string
  alternates?: Record<string, string>
  socialImage?: string | null
}

export function buildMetadata(input: SEOInput): Metadata {
  const title = input.seoTitle || input.title
  const description = input.seoDescription || input.description || undefined
  const canonical = input.seoCanonicalURL || new URL(input.canonicalPath, input.siteUrl).toString()
  return {
    title,
    description,
    alternates: { canonical, languages: input.alternates },
    robots: input.seoNoIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      locale: input.locale,
      images: input.socialImage
        ? [{ url: input.socialImage, alt: input.seoImageAlt || title }]
        : undefined,
    },
    twitter: {
      card: input.socialImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: input.socialImage ? [input.socialImage] : undefined,
    },
  }
}

export type SchemaEntity = Record<string, unknown>
export type SchemaInput = {
  siteUrl: string
  path: string
  site: { ownerKind: 'organization' | 'person'; name: string; sameAs?: string[] }
  breadcrumb: Array<{ name: string; path: string }>
  entity?: {
    kind: 'article' | 'profile' | 'event' | 'timeline' | 'album' | 'forum' | 'product'
    id: string
    name: string
    description?: string | null
    datePublished?: string | null
    dateModified?: string | null
    image?: string | null
    startsAt?: string | null
    endsAt?: string | null
    author?: string | null
    attendanceMode?: 'in-person' | 'virtual' | 'hybrid' | null
    locationName?: string | null
    locationAddress?: string | null
    onlineUrl?: string | null
    organizerName?: string | null
    organizerUrl?: string | null
    visibleEvents?: Array<{ id: string; name: string; startsAt: string }>
  }
}

const absolute = (url: string, value: string) => new URL(value, url).toString()

/** Deterministic graph: only typed, visible values are emitted. */
export function buildJsonLd(input: SchemaInput): {
  '@context': 'https://schema.org'
  '@graph': SchemaEntity[]
} {
  const pageId = `${absolute(input.siteUrl, input.path)}#webpage`
  const ownerId = `${input.siteUrl.replace(/\/$/, '')}#identity`
  const graph: SchemaEntity[] = [
    {
      '@type': 'WebSite',
      '@id': `${input.siteUrl.replace(/\/$/, '')}#website`,
      url: input.siteUrl,
      name: input.site.name,
    },
    {
      '@type': input.site.ownerKind === 'person' ? 'Person' : 'Organization',
      '@id': ownerId,
      name: input.site.name,
      ...(input.site.sameAs?.length ? { sameAs: input.site.sameAs } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${pageId}#breadcrumb`,
      itemListElement: input.breadcrumb.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: absolute(input.siteUrl, item.path),
      })),
    },
  ]
  const entity = input.entity
  if (entity) {
    const type = (
      {
        article: 'Article',
        profile: 'ProfilePage',
        event: 'Event',
        timeline: 'CollectionPage',
        album: 'CollectionPage',
        forum: 'CollectionPage',
        product: 'Product',
      } as const
    )[entity.kind]
    const node: SchemaEntity = {
      '@type': type,
      '@id': `${absolute(input.siteUrl, input.path)}#${entity.kind}-${entity.id}`,
      url: absolute(input.siteUrl, input.path),
      name: entity.name,
      ...(entity.description ? { description: entity.description } : {}),
      ...(entity.image ? { image: entity.image } : {}),
      ...(entity.datePublished ? { datePublished: entity.datePublished } : {}),
      ...(entity.dateModified ? { dateModified: entity.dateModified } : {}),
    }
    if (entity.kind === 'article' && entity.author)
      node.author = { '@type': 'Person', name: entity.author }
    if (entity.kind === 'event' && entity.startsAt) {
      node.startDate = entity.startsAt
      if (entity.endsAt) node.endDate = entity.endsAt
      if (entity.attendanceMode)
        node.eventAttendanceMode = `https://schema.org/${entity.attendanceMode === 'virtual' ? 'OnlineEventAttendanceMode' : entity.attendanceMode === 'hybrid' ? 'MixedEventAttendanceMode' : 'OfflineEventAttendanceMode'}`
      if (entity.locationName) node.location = { '@type': 'Place', name: entity.locationName, ...(entity.locationAddress ? { address: entity.locationAddress } : {}) }
      if (entity.onlineUrl) node.location = { '@type': 'VirtualLocation', url: entity.onlineUrl }
      if (entity.organizerName) node.organizer = { '@type': 'Organization', name: entity.organizerName, ...(entity.organizerUrl ? { url: entity.organizerUrl } : {}) }
    }
    graph.push(node)
    if (entity.kind === 'timeline')
      for (const event of entity.visibleEvents ?? [])
        graph.push({
          '@type': 'Event',
          '@id': `${absolute(input.siteUrl, input.path)}#event-${event.id}`,
          name: event.name,
          startDate: event.startsAt,
        })
  }
  return { '@context': 'https://schema.org', '@graph': graph }
}
