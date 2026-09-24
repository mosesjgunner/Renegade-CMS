/**
 * Renegade CMoS Typed Schema Graph Registry & Serializer (DISC-02)
 *
 * Implements a schema-first, coherent JSON-LD graph engine driven by canonical
 * content facts, stable @id references, strict validation rules, deterministic
 * fallbacks, and secure script serialization.
 */

// -------------------------------------------------------------------------------------------------
// TYPES & GRAPH VOCABULARY
// -------------------------------------------------------------------------------------------------

export interface SchemaNode {
  '@type': string | string[]
  '@id': string
  [key: string]: unknown
}

export interface ListItemNode {
  '@type': 'ListItem'
  position: number
  name: string
  item: string
}

export interface BreadcrumbListNode extends SchemaNode {
  '@type': 'BreadcrumbList'
  '@id': string
  itemListElement: ListItemNode[]
}

export interface OrganizationOrPersonNode extends SchemaNode {
  '@type': 'Organization' | 'Person'
  '@id': string
  name: string
  url: string
  logo?: string | { '@id': string }
  sameAs?: string[]
  legalName?: string
}

export interface WebSiteNode extends SchemaNode {
  '@type': 'WebSite'
  '@id': string
  url: string
  name: string
  description?: string
  publisher: { '@id': string }
  inLanguage?: string
  potentialAction?: {
    '@type': 'SearchAction'
    target: string
    'query-input': string
  }
}

export interface WebPageNode extends SchemaNode {
  '@type': string | string[]
  '@id': string
  url: string
  name: string
  description?: string
  isPartOf: { '@id': string }
  breadcrumb: { '@id': string }
  inLanguage?: string
  datePublished?: string
  dateModified?: string
  primaryImageOfPage?: { '@id': string }
  mainEntity?: { '@id': string }
}

export interface ImageObjectNode extends SchemaNode {
  '@type': 'ImageObject'
  '@id': string
  url: string
  contentUrl?: string
  caption?: string
  width?: number
  height?: number
}

export interface PersonNode extends SchemaNode {
  '@type': 'Person'
  '@id': string
  name: string
  url?: string
}

export interface ArticleNode extends SchemaNode {
  '@type': 'Article' | 'BlogPosting'
  '@id': string
  headline: string
  description?: string
  url: string
  mainEntityOfPage: { '@id': string }
  datePublished?: string
  dateModified?: string
  author?: { '@id': string } | Array<{ '@id': string }>
  publisher: { '@id': string }
  image?: { '@id': string }
  inLanguage?: string
  articleSection?: string | string[]
  keywords?: string | string[]
}

export interface PodcastSeriesNode extends SchemaNode {
  '@type': 'PodcastSeries'
  '@id': string
  name: string
  description?: string
  url: string
  inLanguage?: string
  publisher?: { '@id': string }
  image?: { '@id': string } | string
  webFeed?: string
}

export interface PodcastEpisodeNode extends SchemaNode {
  '@type': 'PodcastEpisode'
  '@id': string
  name: string
  description?: string
  url: string
  datePublished?: string
  episodeNumber?: number
  seasonNumber?: number
  partOfSeries?: { '@id': string }
  associatedMedia?: {
    '@type': 'AudioObject'
    '@id': string
    contentUrl: string
    encodingFormat?: string
  }
  image?: { '@id': string } | string
  transcript?: string
}

export interface VideoObjectNode extends SchemaNode {
  '@type': 'VideoObject'
  '@id': string
  name: string
  description?: string
  uploadDate: string
  contentUrl?: string
  thumbnailUrl?: string
  thumbnail?: { '@id': string }
  duration?: string
  caption?: string
}

export interface SchemaGraph {
  '@context': 'https://schema.org'
  '@type'?: string
  '@graph': SchemaNode[]
  [key: string]: unknown
}

export interface SchemaValidationIssue {
  nodeType: string
  field: string
  severity: 'error' | 'warning'
  message: string
  repairField?: string
}

export interface SchemaValidationResult {
  eligible: boolean
  primaryType: string
  fallbackType?: string
  eligibilityReason: string
  validationIssues: SchemaValidationIssue[]
}

export interface SchemaInspectionField {
  field: string
  value: string | number | boolean | null
  sourceField?: string
}

export interface SchemaInspectionNode {
  type: string
  id: string
  role:
    | 'primary'
    | 'identity'
    | 'website'
    | 'webpage'
    | 'breadcrumb'
    | 'author'
    | 'media'
    | 'extension'
  fields: SchemaInspectionField[]
}

export interface SchemaInspection {
  eligible: boolean
  primaryType: string
  fallbackType?: string
  eligibilityReason: string
  nodes: SchemaInspectionNode[]
  validationIssues: SchemaValidationIssue[]
}

// -------------------------------------------------------------------------------------------------
// STABLE IDENTIFIER CONVENTIONS
// -------------------------------------------------------------------------------------------------

export function schemaIdentityId(base: string): string {
  return `${base.replace(/\/$/, '')}/#identity`
}

export function schemaWebSiteId(base: string): string {
  return `${base.replace(/\/$/, '')}/#website`
}

export function schemaWebPageId(canonicalUrl: string): string {
  return `${canonicalUrl.replace(/\/$/, '')}#webpage`
}

export function schemaBreadcrumbId(canonicalUrl: string): string {
  return `${canonicalUrl.replace(/\/$/, '')}#breadcrumb`
}

export function schemaPrimaryImageId(canonicalUrl: string): string {
  return `${canonicalUrl.replace(/\/$/, '')}#primaryimage`
}

export function schemaEntityId(canonicalUrl: string, entityType: string): string {
  return `${canonicalUrl.replace(/\/$/, '')}#${entityType.toLowerCase()}`
}

export function schemaPersonId(
  authorUrl: string | null | undefined,
  name: string,
  base: string,
): string {
  if (authorUrl && authorUrl.startsWith('http')) {
    return `${authorUrl.replace(/\/$/, '')}#person`
  }
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base.replace(/\/$/, '')}/authors/${slug || 'author'}#person`
}

// -------------------------------------------------------------------------------------------------
// SAFE SERIALIZATION & SANITIZATION
// -------------------------------------------------------------------------------------------------

/**
 * Escapes unsafe HTML/script characters to prevent script injection / termination
 * while preserving valid JSON-LD parsing.
 */
export function serializeJsonLd(schema: Record<string, unknown>): string {
  const json = JSON.stringify(schema, null, 2)
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function isAbsoluteHttpsOrHttp(url: unknown): boolean {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function isValidIsoDate(date: unknown): boolean {
  if (typeof date !== 'string') return false
  const parsed = Date.parse(date)
  return !Number.isNaN(parsed) && date.includes('T')
}

// -------------------------------------------------------------------------------------------------
// SCHEMA BUILD CONTEXT & INPUTS
// -------------------------------------------------------------------------------------------------

export interface SchemaSiteIdentityInput {
  base: string
  siteName: string
  siteDescription?: string | null
  ownerKind?: 'organization' | 'person'
  organizationName?: string | null
  personName?: string | null
  legalName?: string | null
  logoUrl?: string | null
  sameAs?: string[]
  locale?: string
  searchEnabled?: boolean
}

export interface SchemaBreadcrumbInput {
  name: string
  url: string
}

export interface SchemaAuthorInput {
  name: string
  url?: string | null
}

export interface SchemaImageInput {
  url: string
  alt?: string | null
  width?: number
  height?: number
}

export interface SchemaAudioInput {
  url: string
  mimeType?: string
}

export interface SchemaVideoInput {
  contentUrl?: string
  posterUrl?: string
  duration?: string
  captionUrl?: string
}

export interface SchemaBuildInput {
  canonicalUrl: string
  canonicalPath: string
  base: string
  contentType: string
  title: string
  description?: string | null
  site: SchemaSiteIdentityInput
  breadcrumbs: SchemaBreadcrumbInput[]
  author?: SchemaAuthorInput | null
  image?: SchemaImageInput | null
  audio?: SchemaAudioInput | null
  video?: SchemaVideoInput | null
  dates?: {
    publishedAt?: string | null
    modifiedAt?: string | null
  }
  taxonomy?: {
    topics?: string[]
    categories?: string[]
    tags?: string[]
  }
  indexable: boolean
  isRedirect?: boolean
  isNotFound?: boolean
  // Content-type specific payloads
  podcastEpisode?: {
    episodeNumber?: number
    seasonNumber?: number
    showSlug?: string
    showTitle?: string
    transcriptText?: string
  }
  podcastShow?: {
    feedUrl?: string
    language?: string
  }
  videoDetails?: {
    uploadDate?: string | null
    duration?: string | null
    captionUrl?: string | null
  }
  customNodes?: SchemaNode[]
}

// -------------------------------------------------------------------------------------------------
// NODE BUILDERS (Strict visible-facts mapping only)
// -------------------------------------------------------------------------------------------------

export function buildIdentityNode(site: SchemaSiteIdentityInput): OrganizationOrPersonNode {
  const isPerson = site.ownerKind === 'person'
  const identityName = isPerson
    ? site.personName || site.siteName
    : site.organizationName || site.siteName
  const id = schemaIdentityId(site.base)
  const node: OrganizationOrPersonNode = {
    '@type': isPerson ? 'Person' : 'Organization',
    '@id': id,
    name: identityName,
    url: `${site.base.replace(/\/$/, '')}/`,
  }

  if (site.legalName && !isPerson) {
    node.legalName = site.legalName
  }

  if (site.logoUrl && isAbsoluteHttpsOrHttp(site.logoUrl)) {
    node.logo = site.logoUrl
  }

  if (Array.isArray(site.sameAs) && site.sameAs.length > 0) {
    const validUrls = site.sameAs.filter((u) => typeof u === 'string' && isAbsoluteHttpsOrHttp(u))
    if (validUrls.length > 0) {
      node.sameAs = validUrls
    }
  }

  return node
}

export function buildWebSiteNode(site: SchemaSiteIdentityInput): WebSiteNode {
  const node: WebSiteNode = {
    '@type': 'WebSite',
    '@id': schemaWebSiteId(site.base),
    url: `${site.base.replace(/\/$/, '')}/`,
    name: site.siteName,
    publisher: { '@id': schemaIdentityId(site.base) },
  }

  if (site.siteDescription) {
    node.description = site.siteDescription
  }

  if (site.locale) {
    node.inLanguage = site.locale
  }

  if (site.searchEnabled !== false) {
    node.potentialAction = {
      '@type': 'SearchAction',
      target: `${site.base.replace(/\/$/, '')}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    }
  }

  return node
}

export function buildWebPageNode(params: {
  canonicalUrl: string
  base: string
  title: string
  description?: string | null
  pageType?: string
  locale?: string
  publishedAt?: string | null
  modifiedAt?: string | null
  hasPrimaryImage?: boolean
  primaryEntityId?: string
}): WebPageNode {
  const {
    canonicalUrl,
    base,
    title,
    description,
    pageType = 'WebPage',
    locale,
    publishedAt,
    modifiedAt,
    hasPrimaryImage,
    primaryEntityId,
  } = params

  const node: WebPageNode = {
    '@type': pageType,
    '@id': schemaWebPageId(canonicalUrl),
    url: canonicalUrl,
    name: title,
    isPartOf: { '@id': schemaWebSiteId(base) },
    breadcrumb: { '@id': schemaBreadcrumbId(canonicalUrl) },
  }

  if (description) {
    node.description = description
  }

  if (locale) {
    node.inLanguage = locale
  }

  if (publishedAt && isValidIsoDate(publishedAt)) {
    node.datePublished = publishedAt
  }

  if (modifiedAt && isValidIsoDate(modifiedAt)) {
    node.dateModified = modifiedAt
  }

  if (hasPrimaryImage) {
    node.primaryImageOfPage = { '@id': schemaPrimaryImageId(canonicalUrl) }
  }

  if (primaryEntityId) {
    node.mainEntity = { '@id': primaryEntityId }
  }

  return node
}

export function buildBreadcrumbListNode(
  canonicalUrl: string,
  breadcrumbs: SchemaBreadcrumbInput[],
): BreadcrumbListNode {
  return {
    '@type': 'BreadcrumbList',
    '@id': schemaBreadcrumbId(canonicalUrl),
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  }
}

export function buildImageObjectNode(
  canonicalUrl: string,
  image: SchemaImageInput,
): ImageObjectNode {
  const node: ImageObjectNode = {
    '@type': 'ImageObject',
    '@id': schemaPrimaryImageId(canonicalUrl),
    url: image.url,
    contentUrl: image.url,
  }

  if (image.alt && image.alt.trim().length > 0) {
    node.caption = image.alt.trim()
  }

  if (typeof image.width === 'number' && image.width > 0) {
    node.width = image.width
  }

  if (typeof image.height === 'number' && image.height > 0) {
    node.height = image.height
  }

  return node
}

export function buildPersonNode(author: SchemaAuthorInput, base: string): PersonNode {
  const id = schemaPersonId(author.url, author.name, base)
  const node: PersonNode = {
    '@type': 'Person',
    '@id': id,
    name: author.name,
  }

  if (author.url && isAbsoluteHttpsOrHttp(author.url)) {
    node.url = author.url
  }

  return node
}

export function buildArticleNode(params: {
  canonicalUrl: string
  base: string
  headline: string
  description?: string | null
  publishedAt?: string | null
  modifiedAt?: string | null
  authorPersonId?: string | null
  hasPrimaryImage?: boolean
  locale?: string
  categories?: string[]
  tags?: string[]
}): ArticleNode {
  const {
    canonicalUrl,
    base,
    headline,
    description,
    publishedAt,
    modifiedAt,
    authorPersonId,
    hasPrimaryImage,
    locale,
    categories,
    tags,
  } = params

  const node: ArticleNode = {
    '@type': 'Article',
    '@id': schemaEntityId(canonicalUrl, 'article'),
    headline,
    url: canonicalUrl,
    mainEntityOfPage: { '@id': schemaWebPageId(canonicalUrl) },
    publisher: { '@id': schemaIdentityId(base) },
  }

  if (description) {
    node.description = description
  }

  if (publishedAt && isValidIsoDate(publishedAt)) {
    node.datePublished = publishedAt
  }

  if (modifiedAt && isValidIsoDate(modifiedAt)) {
    node.dateModified = modifiedAt
  }

  if (authorPersonId) {
    node.author = { '@id': authorPersonId }
  }

  if (hasPrimaryImage) {
    node.image = { '@id': schemaPrimaryImageId(canonicalUrl) }
  }

  if (locale) {
    node.inLanguage = locale
  }

  if (categories && categories.length > 0) {
    node.articleSection = categories.length === 1 ? categories[0] : categories
  }

  if (tags && tags.length > 0) {
    node.keywords = tags.join(', ')
  }

  return node
}

export function buildPodcastSeriesNode(params: {
  canonicalUrl: string
  base: string
  name: string
  description?: string | null
  language?: string
  hasArtwork?: boolean
  webFeedUrl?: string | null
}): PodcastSeriesNode {
  const { canonicalUrl, base, name, description, language, hasArtwork, webFeedUrl } = params

  const node: PodcastSeriesNode = {
    '@type': 'PodcastSeries',
    '@id': schemaEntityId(canonicalUrl, 'podcast-series'),
    name,
    url: canonicalUrl,
    publisher: { '@id': schemaIdentityId(base) },
  }

  if (description) {
    node.description = description
  }

  if (language) {
    node.inLanguage = language
  }

  if (hasArtwork) {
    node.image = { '@id': schemaPrimaryImageId(canonicalUrl) }
  }

  if (webFeedUrl && isAbsoluteHttpsOrHttp(webFeedUrl)) {
    node.webFeed = webFeedUrl
  }

  return node
}

export function buildPodcastEpisodeNode(params: {
  canonicalUrl: string
  name: string
  description?: string | null
  publishedAt?: string | null
  episodeNumber?: number
  seasonNumber?: number
  showUrl?: string | null
  hasAudio?: boolean
  audioUrl?: string | null
  audioMimeType?: string | null
  hasArtwork?: boolean
  transcript?: string | null
}): PodcastEpisodeNode {
  const {
    canonicalUrl,
    name,
    description,
    publishedAt,
    episodeNumber,
    seasonNumber,
    showUrl,
    hasAudio,
    audioUrl,
    audioMimeType,
    hasArtwork,
    transcript,
  } = params

  const node: PodcastEpisodeNode = {
    '@type': 'PodcastEpisode',
    '@id': schemaEntityId(canonicalUrl, 'podcast-episode'),
    name,
    url: canonicalUrl,
  }

  if (description) {
    node.description = description
  }

  if (publishedAt && isValidIsoDate(publishedAt)) {
    node.datePublished = publishedAt
  }

  if (typeof episodeNumber === 'number') {
    node.episodeNumber = episodeNumber
  }

  if (typeof seasonNumber === 'number') {
    node.seasonNumber = seasonNumber
  }

  if (showUrl && isAbsoluteHttpsOrHttp(showUrl)) {
    node.partOfSeries = { '@id': schemaEntityId(showUrl, 'podcast-series') }
  }

  if (hasAudio && audioUrl && isAbsoluteHttpsOrHttp(audioUrl)) {
    node.associatedMedia = {
      '@type': 'AudioObject',
      '@id': `${canonicalUrl}#audio`,
      contentUrl: audioUrl,
      encodingFormat: audioMimeType || 'audio/mpeg',
    }
  }

  if (hasArtwork) {
    node.image = { '@id': schemaPrimaryImageId(canonicalUrl) }
  }

  if (transcript && transcript.trim().length > 0) {
    node.transcript = transcript.trim()
  }

  return node
}

export function buildVideoObjectNode(params: {
  canonicalUrl: string
  name: string
  description?: string | null
  uploadDate: string
  contentUrl?: string | null
  thumbnailUrl?: string | null
  hasThumbnail?: boolean
  duration?: string | null
  captionUrl?: string | null
}): VideoObjectNode {
  const {
    canonicalUrl,
    name,
    description,
    uploadDate,
    contentUrl,
    thumbnailUrl,
    hasThumbnail,
    duration,
    captionUrl,
  } = params

  const node: VideoObjectNode = {
    '@type': 'VideoObject',
    '@id': schemaEntityId(canonicalUrl, 'video'),
    name,
    uploadDate,
  }

  if (description) {
    node.description = description
  }

  if (contentUrl && isAbsoluteHttpsOrHttp(contentUrl)) {
    node.contentUrl = contentUrl
  }

  if (thumbnailUrl && isAbsoluteHttpsOrHttp(thumbnailUrl)) {
    node.thumbnailUrl = thumbnailUrl
  }

  if (hasThumbnail) {
    node.thumbnail = { '@id': schemaPrimaryImageId(canonicalUrl) }
  }

  if (duration) {
    node.duration = duration
  }

  if (captionUrl && isAbsoluteHttpsOrHttp(captionUrl)) {
    node.caption = captionUrl
  }

  return node
}

// -------------------------------------------------------------------------------------------------
// PAGE-TYPE COMPOSITION & GRAPH RESOLUTION
// -------------------------------------------------------------------------------------------------

/**
 * Validates and composes a complete Schema-First Graph from input facts.
 * Excludes claims not present or legitimately configured.
 * Implements deterministic fallbacks when specialized types fail validation.
 */
export function composeSchemaGraph(input: SchemaBuildInput): {
  graph: SchemaGraph
  validation: SchemaValidationResult
  inspection: SchemaInspection
} {
  const {
    canonicalUrl,
    base,
    contentType,
    title,
    description,
    site,
    breadcrumbs,
    author,
    image,
    audio,
    dates,
    taxonomy,
    indexable,
    isRedirect,
    isNotFound,
    podcastEpisode,
    podcastShow,
    videoDetails,
    customNodes = [],
  } = input

  // 1. Handle non-indexable edge cases (redirect, 404)
  if (isRedirect) {
    const emptyGraph: SchemaGraph = { '@context': 'https://schema.org', '@graph': [] }
    const validation: SchemaValidationResult = {
      eligible: false,
      primaryType: 'None',
      eligibilityReason: 'redirect',
      validationIssues: [],
    }
    return {
      graph: emptyGraph,
      validation,
      inspection: {
        eligible: false,
        primaryType: 'None',
        eligibilityReason: 'redirect',
        nodes: [],
        validationIssues: [],
      },
    }
  }

  if (isNotFound) {
    const emptyGraph: SchemaGraph = { '@context': 'https://schema.org', '@graph': [] }
    const validation: SchemaValidationResult = {
      eligible: false,
      primaryType: 'None',
      eligibilityReason: 'not_found',
      validationIssues: [],
    }
    return {
      graph: emptyGraph,
      validation,
      inspection: {
        eligible: false,
        primaryType: 'None',
        eligibilityReason: 'not_found',
        nodes: [],
        validationIssues: [],
      },
    }
  }

  const issues: SchemaValidationIssue[] = []
  const nodes: SchemaNode[] = []

  let cleanEntityTitle = title
  if (cleanEntityTitle && site.siteName) {
    const suffixes = [` — ${site.siteName}`, ` - ${site.siteName}`, ` | ${site.siteName}`]
    for (const suffix of suffixes) {
      if (cleanEntityTitle.endsWith(suffix)) {
        cleanEntityTitle = cleanEntityTitle.slice(0, -suffix.length).trim()
        break
      }
    }
  }

  // 2. Build core foundation nodes
  const identityNode = buildIdentityNode(site)
  const websiteNode = buildWebSiteNode(site)
  const breadcrumbNode = buildBreadcrumbListNode(canonicalUrl, breadcrumbs)

  // 3. Optional auxiliary nodes
  let imageNode: ImageObjectNode | null = null
  if (image && image.url && isAbsoluteHttpsOrHttp(image.url)) {
    imageNode = buildImageObjectNode(canonicalUrl, image)
  }

  let personNode: PersonNode | null = null
  if (author && author.name && author.name.trim().length > 0) {
    personNode = buildPersonNode(author, base)
  }

  // 4. Primary entity composition & validation based on content type
  let primaryType = 'WebPage'
  let fallbackType: string | undefined
  let primaryEntityId: string | undefined
  let isEligible = indexable

  switch (contentType) {
    case 'home': {
      primaryType = 'WebSite'
      const webPageNode = buildWebPageNode({
        canonicalUrl,
        base,
        title: site.siteName,
        description: site.siteDescription,
        pageType: 'WebPage',
        locale: site.locale,
        hasPrimaryImage: Boolean(imageNode),
      })
      nodes.push(websiteNode, identityNode, webPageNode, breadcrumbNode)
      if (imageNode) nodes.push(imageNode)
      break
    }

    case 'article':
    case 'post': {
      primaryType = 'Article'
      // Validation: headline required
      if (!title || title.trim().length === 0) {
        issues.push({
          nodeType: 'Article',
          field: 'headline',
          severity: 'error',
          message: 'Article requires a non-empty headline for schema eligibility.',
          repairField: 'title',
        })
        fallbackType = 'WebPage'
        isEligible = false
      }

      // Recommended fields
      if (!dates?.publishedAt) {
        issues.push({
          nodeType: 'Article',
          field: 'datePublished',
          severity: 'warning',
          message: 'datePublished is recommended for Article rich results.',
          repairField: 'publishedAt',
        })
      }
      if (!imageNode) {
        issues.push({
          nodeType: 'Article',
          field: 'image',
          severity: 'warning',
          message: 'A hero image is recommended for Article rich results.',
          repairField: 'heroMedia',
        })
      }
      if (!personNode) {
        issues.push({
          nodeType: 'Article',
          field: 'author',
          severity: 'warning',
          message: 'An author is recommended for Article rich results.',
          repairField: 'authors',
        })
      }

      if (fallbackType === 'WebPage') {
        // Fallback to clean WebPage
        const webPageNode = buildWebPageNode({
          canonicalUrl,
          base,
          title: title || site.siteName,
          description,
          locale: site.locale,
          publishedAt: dates?.publishedAt,
          modifiedAt: dates?.modifiedAt,
          hasPrimaryImage: Boolean(imageNode),
        })
        nodes.push(webPageNode, breadcrumbNode, websiteNode, identityNode)
        if (imageNode) nodes.push(imageNode)
      } else {
        primaryEntityId = schemaEntityId(canonicalUrl, 'article')
        const articleNode = buildArticleNode({
          canonicalUrl,
          base,
          headline: cleanEntityTitle || title,
          description,
          publishedAt: dates?.publishedAt,
          modifiedAt: dates?.modifiedAt,
          authorPersonId: personNode ? personNode['@id'] : null,
          hasPrimaryImage: Boolean(imageNode),
          locale: site.locale,
          categories: taxonomy?.categories,
          tags: taxonomy?.tags,
        })

        const webPageNode = buildWebPageNode({
          canonicalUrl,
          base,
          title,
          description,
          pageType: 'WebPage',
          locale: site.locale,
          publishedAt: dates?.publishedAt,
          modifiedAt: dates?.modifiedAt,
          hasPrimaryImage: Boolean(imageNode),
          primaryEntityId,
        })

        // Add primary article first for exact test contracts
        nodes.push(articleNode, webPageNode, breadcrumbNode, websiteNode, identityNode)
        if (personNode) nodes.push(personNode)
        if (imageNode) nodes.push(imageNode)
      }
      break
    }

    case 'podcast-show': {
      primaryType = 'PodcastSeries'
      if (!title || title.trim().length === 0) {
        issues.push({
          nodeType: 'PodcastSeries',
          field: 'name',
          severity: 'error',
          message: 'PodcastSeries requires a title.',
          repairField: 'title',
        })
        fallbackType = 'WebPage'
        isEligible = false
      }

      if (fallbackType === 'WebPage') {
        const webPageNode = buildWebPageNode({
          canonicalUrl,
          base,
          title: title || site.siteName,
          description,
          locale: site.locale,
          hasPrimaryImage: Boolean(imageNode),
        })
        nodes.push(webPageNode, breadcrumbNode, websiteNode, identityNode)
        if (imageNode) nodes.push(imageNode)
      } else {
        primaryEntityId = schemaEntityId(canonicalUrl, 'podcast-series')
        const seriesNode = buildPodcastSeriesNode({
          canonicalUrl,
          base,
          name: title,
          description,
          language: podcastShow?.language || site.locale,
          hasArtwork: Boolean(imageNode),
          webFeedUrl: podcastShow?.feedUrl,
        })

        const webPageNode = buildWebPageNode({
          canonicalUrl,
          base,
          title,
          description,
          locale: site.locale,
          hasPrimaryImage: Boolean(imageNode),
          primaryEntityId,
        })

        nodes.push(seriesNode, webPageNode, breadcrumbNode, websiteNode, identityNode)
        if (imageNode) nodes.push(imageNode)
      }
      break
    }

    case 'podcast-episode': {
      primaryType = 'PodcastEpisode'
      if (!title || title.trim().length === 0) {
        issues.push({
          nodeType: 'PodcastEpisode',
          field: 'name',
          severity: 'error',
          message: 'PodcastEpisode requires a title.',
          repairField: 'title',
        })
        fallbackType = 'WebPage'
        isEligible = false
      }

      const showUrl = podcastEpisode?.showSlug
        ? `${base.replace(/\/$/, '')}/podcasts/${podcastEpisode.showSlug}`
        : null

      if (!audio?.url) {
        issues.push({
          nodeType: 'PodcastEpisode',
          field: 'associatedMedia',
          severity: 'warning',
          message: 'Audio enclosure is recommended for PodcastEpisode playback metadata.',
          repairField: 'audio',
        })
      }

      if (fallbackType === 'WebPage') {
        const webPageNode = buildWebPageNode({
          canonicalUrl,
          base,
          title: title || site.siteName,
          description,
          locale: site.locale,
          publishedAt: dates?.publishedAt,
          modifiedAt: dates?.modifiedAt,
          hasPrimaryImage: Boolean(imageNode),
        })
        nodes.push(webPageNode, breadcrumbNode, websiteNode, identityNode)
        if (imageNode) nodes.push(imageNode)
      } else {
        primaryEntityId = schemaEntityId(canonicalUrl, 'podcast-episode')
        const episodeNode = buildPodcastEpisodeNode({
          canonicalUrl,
          name: title,
          description,
          publishedAt: dates?.publishedAt,
          episodeNumber: podcastEpisode?.episodeNumber,
          seasonNumber: podcastEpisode?.seasonNumber,
          showUrl,
          hasAudio: Boolean(audio?.url),
          audioUrl: audio?.url,
          audioMimeType: audio?.mimeType,
          hasArtwork: Boolean(imageNode),
          transcript: podcastEpisode?.transcriptText,
        })

        const webPageNode = buildWebPageNode({
          canonicalUrl,
          base,
          title,
          description,
          locale: site.locale,
          publishedAt: dates?.publishedAt,
          modifiedAt: dates?.modifiedAt,
          hasPrimaryImage: Boolean(imageNode),
          primaryEntityId,
        })

        nodes.push(episodeNode, webPageNode, breadcrumbNode, websiteNode, identityNode)
        if (imageNode) nodes.push(imageNode)
      }
      break
    }

    case 'video': {
      primaryType = 'VideoObject'
      const uploadDate = videoDetails?.uploadDate || dates?.publishedAt

      if (!title || title.trim().length === 0) {
        issues.push({
          nodeType: 'VideoObject',
          field: 'name',
          severity: 'error',
          message: 'VideoObject requires a title.',
          repairField: 'title',
        })
        fallbackType = 'WebPage'
        isEligible = false
      }

      if (!uploadDate) {
        issues.push({
          nodeType: 'VideoObject',
          field: 'uploadDate',
          severity: 'error',
          message: 'VideoObject requires a valid uploadDate for schema eligibility.',
          repairField: 'publishedAt',
        })
        fallbackType = 'WebPage'
        isEligible = false
      }

      if (!videoDetails?.duration) {
        issues.push({
          nodeType: 'VideoObject',
          field: 'duration',
          severity: 'warning',
          message: 'Video duration is recommended for video rich results.',
        })
      }

      if (fallbackType === 'WebPage') {
        const webPageNode = buildWebPageNode({
          canonicalUrl,
          base,
          title: title || site.siteName,
          description,
          locale: site.locale,
          publishedAt: dates?.publishedAt,
          modifiedAt: dates?.modifiedAt,
          hasPrimaryImage: Boolean(imageNode),
        })
        nodes.push(webPageNode, breadcrumbNode, websiteNode, identityNode)
        if (imageNode) nodes.push(imageNode)
      } else {
        primaryEntityId = schemaEntityId(canonicalUrl, 'video')
        const videoNode = buildVideoObjectNode({
          canonicalUrl,
          name: title,
          description,
          uploadDate: uploadDate!,
          contentUrl: input.video?.contentUrl,
          thumbnailUrl: input.video?.posterUrl,
          hasThumbnail: Boolean(imageNode),
          duration: videoDetails?.duration,
          captionUrl: videoDetails?.captionUrl,
        })

        const webPageNode = buildWebPageNode({
          canonicalUrl,
          base,
          title,
          description,
          locale: site.locale,
          publishedAt: dates?.publishedAt,
          modifiedAt: dates?.modifiedAt,
          hasPrimaryImage: Boolean(imageNode),
          primaryEntityId,
        })

        nodes.push(videoNode, webPageNode, breadcrumbNode, websiteNode, identityNode)
        if (imageNode) nodes.push(imageNode)
      }
      break
    }

    case 'archive':
    case 'collection': {
      primaryType = 'CollectionPage'
      const webPageNode = buildWebPageNode({
        canonicalUrl,
        base,
        title,
        description,
        pageType: 'CollectionPage',
        locale: site.locale,
      })
      nodes.push(webPageNode, breadcrumbNode, websiteNode, identityNode)
      break
    }

    case 'search': {
      primaryType = 'SearchResultsPage'
      const webPageNode = buildWebPageNode({
        canonicalUrl,
        base,
        title,
        description,
        pageType: 'SearchResultsPage',
        locale: site.locale,
      })
      nodes.push(webPageNode, breadcrumbNode, websiteNode, identityNode)
      break
    }

    case 'page':
    default: {
      primaryType = 'WebPage'
      const webPageNode = buildWebPageNode({
        canonicalUrl,
        base,
        title: title || site.siteName,
        description,
        pageType: 'WebPage',
        locale: site.locale,
        publishedAt: dates?.publishedAt,
        modifiedAt: dates?.modifiedAt,
        hasPrimaryImage: Boolean(imageNode),
      })
      nodes.push(webPageNode, breadcrumbNode, websiteNode, identityNode)
      if (imageNode) nodes.push(imageNode)
      break
    }
  }

  // 5. Append validated extension nodes
  if (customNodes.length > 0) {
    nodes.push(...customNodes)
  }

  // 6. Eligibility Reason calculation
  let eligibilityReason = 'eligible'
  if (!indexable) {
    isEligible = false
    eligibilityReason = 'noindex_directive'
  } else if (fallbackType) {
    eligibilityReason = `fallback_to_${fallbackType.toLowerCase()}`
  }

  const validation: SchemaValidationResult = {
    eligible: isEligible,
    primaryType,
    fallbackType,
    eligibilityReason,
    validationIssues: issues,
  }

  // Top-level object structure with @graph
  const entityName = primaryType === 'WebSite' ? site.siteName : cleanEntityTitle || title
  const graph: SchemaGraph = {
    '@context': 'https://schema.org',
    '@type': fallbackType || primaryType,
    ...(entityName ? { name: entityName } : {}),
    ...(primaryType === 'WebSite'
      ? {
          name: site.siteName,
          description: site.siteDescription,
          url: `${site.base.replace(/\/$/, '')}/`,
        }
      : {}),
    '@graph': nodes,
  }

  // 7. Human-readable Admin Inspection Model
  const inspectionNodes: SchemaInspectionNode[] = nodes.map((node) => {
    const rawType = Array.isArray(node['@type']) ? node['@type'][0] : String(node['@type'])
    let role: SchemaInspectionNode['role'] = 'media'
    if (node['@id'] === primaryEntityId) role = 'primary'
    else if (node['@id'] === identityNode['@id']) role = 'identity'
    else if (node['@id'] === websiteNode['@id']) role = 'website'
    else if (node['@id'] === breadcrumbNode['@id']) role = 'breadcrumb'
    else if (rawType === 'Person') role = 'author'
    else if (rawType.endsWith('Page')) role = 'webpage'
    else if (rawType === 'ImageObject' || rawType === 'AudioObject' || rawType === 'VideoObject')
      role = 'media'
    else role = 'extension'

    const fields: SchemaInspectionField[] = Object.entries(node)
      .filter(([k]) => k !== '@context' && k !== '@graph')
      .map(([field, val]) => {
        let sourceField: string | undefined
        if (field === 'headline' || (field === 'name' && role === 'primary')) sourceField = 'title'
        else if (field === 'description') sourceField = 'summary / description'
        else if (field === 'datePublished') sourceField = 'publishedAt'
        else if (field === 'dateModified') sourceField = 'updatedAt'
        else if (field === 'author') sourceField = 'authors'
        else if (field === 'image' || field === 'thumbnail') sourceField = 'heroMedia / socialImage'
        else if (field === 'associatedMedia') sourceField = 'audio'

        const cleanVal =
          typeof val === 'object' && val !== null && '@id' in val
            ? String((val as { '@id': string })['@id'])
            : typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean'
              ? val
              : null

        return { field, value: cleanVal, sourceField }
      })

    return {
      type: rawType,
      id: node['@id'],
      role,
      fields,
    }
  })

  const inspection: SchemaInspection = {
    eligible: isEligible,
    primaryType,
    fallbackType,
    eligibilityReason,
    nodes: inspectionNodes,
    validationIssues: issues,
  }

  return { graph, validation, inspection }
}

// -------------------------------------------------------------------------------------------------
// EXTENSION API FOR LATER REGISTERED CONTENT TYPES & PLUGINS
// -------------------------------------------------------------------------------------------------

export interface SchemaExtensionContext {
  canonicalUrl: string
  canonicalPath: string
  base: string
  record: Record<string, unknown>
  site: SchemaSiteIdentityInput
  image?: SchemaImageInput | null
  author?: SchemaAuthorInput | null
}

export interface SchemaTypeExtension {
  id: string
  targetContentType: string
  primarySchemaType: string
  requiredFields: string[]
  recommendedFields?: string[]
  buildNodes: (context: SchemaExtensionContext) => SchemaNode[]
  validate?: (node: SchemaNode) => SchemaValidationIssue[]
}

export class SchemaRegistry {
  private static instance: SchemaRegistry
  private extensions = new Map<string, SchemaTypeExtension>()

  public static getInstance(): SchemaRegistry {
    if (!SchemaRegistry.instance) {
      SchemaRegistry.instance = new SchemaRegistry()
    }
    return SchemaRegistry.instance
  }

  /**
   * Registers an extension for a content type.
   * Enforces ownership, valid types, and prohibits overriding reserved core types.
   */
  public register(extension: SchemaTypeExtension): void {
    if (!extension.id || typeof extension.id !== 'string') {
      throw new Error('Schema extension requires a non-empty string id.')
    }
    if (!extension.targetContentType || typeof extension.targetContentType !== 'string') {
      throw new Error('Schema extension requires a non-empty targetContentType.')
    }
    if (!extension.primarySchemaType || typeof extension.primarySchemaType !== 'string') {
      throw new Error('Schema extension requires a non-empty primarySchemaType.')
    }

    const reserved = ['home', 'page', 'article', 'podcast-show', 'podcast-episode', 'video']
    if (reserved.includes(extension.targetContentType) && !extension.id.startsWith('core:')) {
      throw new Error(
        `Cannot override reserved core content type "${extension.targetContentType}" without core credentials.`,
      )
    }

    if (this.extensions.has(extension.targetContentType)) {
      const existing = this.extensions.get(extension.targetContentType)!
      if (existing.id !== extension.id) {
        throw new Error(
          `Conflicting schema extension for content type "${extension.targetContentType}" already registered by "${existing.id}".`,
        )
      }
    }

    this.extensions.set(extension.targetContentType, extension)
  }

  public unregister(targetContentType: string): void {
    this.extensions.delete(targetContentType)
  }

  public getExtension(targetContentType: string): SchemaTypeExtension | undefined {
    return this.extensions.get(targetContentType)
  }

  public listExtensions(): SchemaTypeExtension[] {
    return Array.from(this.extensions.values())
  }

  /**
   * Safely builds and sanitizes nodes from a registered extension.
   * Strips malicious script tags, validates @id URLs against the canonical base,
   * rejects prototype pollution, and validates references.
   */
  public buildExtensionNodes(
    targetContentType: string,
    context: SchemaExtensionContext,
  ): {
    nodes: SchemaNode[]
    issues: SchemaValidationIssue[]
  } {
    const ext = this.extensions.get(targetContentType)
    if (!ext) return { nodes: [], issues: [] }

    const rawNodes = ext.buildNodes(context)
    const sanitizedNodes: SchemaNode[] = []
    const issues: SchemaValidationIssue[] = []

    const baseOrigin = new URL(context.base).origin

    for (const rawNode of rawNodes) {
      // 1. Validate @type
      if (!rawNode['@type'] || typeof rawNode['@type'] !== 'string') {
        issues.push({
          nodeType: 'Unknown',
          field: '@type',
          severity: 'error',
          message: 'Extension node must have a valid string @type.',
        })
        continue
      }

      // 2. Validate @id starts with canonical origin
      if (!rawNode['@id'] || typeof rawNode['@id'] !== 'string') {
        issues.push({
          nodeType: rawNode['@type'],
          field: '@id',
          severity: 'error',
          message: 'Extension node must have a valid string @id.',
        })
        continue
      }

      try {
        const idUrl = new URL(rawNode['@id'])
        if (idUrl.origin !== baseOrigin) {
          issues.push({
            nodeType: rawNode['@type'],
            field: '@id',
            severity: 'error',
            message: `Extension node @id "${rawNode['@id']}" must belong to canonical origin "${baseOrigin}".`,
          })
          continue
        }
      } catch {
        issues.push({
          nodeType: rawNode['@type'],
          field: '@id',
          severity: 'error',
          message: `Extension node @id "${rawNode['@id']}" is not a valid absolute URL.`,
        })
        continue
      }

      // 3. Prevent overwriting core identity/website nodes
      const reservedIds = [
        schemaIdentityId(context.base),
        schemaWebSiteId(context.base),
        schemaWebPageId(context.canonicalUrl),
        schemaBreadcrumbId(context.canonicalUrl),
      ]
      if (reservedIds.includes(rawNode['@id'])) {
        issues.push({
          nodeType: rawNode['@type'],
          field: '@id',
          severity: 'error',
          message: `Extension cannot override reserved core @id "${rawNode['@id']}".`,
        })
        continue
      }

      // 4. Sanitize properties against prototype pollution and script injection
      const sanitized: SchemaNode = {
        '@type': rawNode['@type'],
        '@id': rawNode['@id'],
      }

      for (const [key, val] of Object.entries(rawNode)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue
        }
        if (typeof val === 'string') {
          // Reject dangerous protocol URLs
          if (/^(javascript|data|vbscript):/i.test(val.trim())) {
            continue
          }
          // Strip script tags and content
          sanitized[key] = val
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<\/?script[^>]*>/gi, '')
        } else {
          sanitized[key] = val
        }
      }

      // 5. Run extension-specific validator
      if (ext.validate) {
        const extIssues = ext.validate(sanitized)
        if (extIssues && extIssues.length > 0) {
          issues.push(...extIssues)
        }
      }

      sanitizedNodes.push(sanitized)
    }

    return { nodes: sanitizedNodes, issues }
  }
}

export const globalSchemaRegistry = SchemaRegistry.getInstance()
