/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents and candidate collections are runtime-shaped. */
import type { Metadata, MetadataRoute } from 'next'
import type { Payload } from 'payload'

import { canDiscoverPublic, canRenderPublic, type PublicState } from './contracts'
import { resolveSiteSettings, type ResolvedSiteSettings } from '../core/site-settings'
import { mediaVariantUrl } from '../media/variant-contracts'
import { registeredOnly } from './registered-collections'
import { resolvePublicUrl, routeTemplatesForSite, type SemanticKind } from './semantic-url'
import {
  composeSchemaGraph,
  globalSchemaRegistry,
  type SchemaInspection,
  type SchemaNode,
  type SchemaSiteIdentityInput,
  type SchemaValidationIssue,
} from './schema'
import {
  affiliateFreshness,
  catalogProductFromDocument,
  minorMoneyDecimal,
} from '../commerce/catalog'

if (!globalSchemaRegistry.getExtension('products')) {
  globalSchemaRegistry.register({
    id: 'core:commerce-product-v1',
    targetContentType: 'products',
    primarySchemaType: 'Product',
    requiredFields: ['name'],
    buildNodes: ({ canonicalUrl, record }) => {
      const product = catalogProductFromDocument(record)
      const variants = product.variants.filter((variant) => variant.status !== 'archived')
      const affiliate = product.affiliate ? affiliateFreshness(product.affiliate) : null
      const offers = affiliate
        ? affiliate.price
          ? [
              {
                '@type': 'Offer',
                price: minorMoneyDecimal(affiliate.price.amountMinor, affiliate.price.currency),
                priceCurrency: affiliate.price.currency,
                ...(affiliate.availability === 'unknown'
                  ? {}
                  : {
                      availability: `https://schema.org/${affiliate.availability === 'in-stock' ? 'InStock' : 'OutOfStock'}`,
                    }),
                url: canonicalUrl,
              },
            ]
          : []
        : product.offers
            .filter(
              (offer) =>
                offer.status === 'active' &&
                (!offer.startsAt || Date.parse(offer.startsAt) <= Date.now()) &&
                (!offer.endsAt || Date.parse(offer.endsAt) > Date.now()),
            )
            .map((offer) => {
              const variant = offer.variantSku
                ? variants.find((item) => item.sku === offer.variantSku)
                : variants[0]
              const available =
                variant?.status !== 'unavailable' &&
                !(variant?.inventory?.policy === 'tracked' && variant.inventory.quantity === 0)
              return {
                '@type': 'Offer',
                price: minorMoneyDecimal(offer.amountMinor, offer.currency),
                priceCurrency: offer.currency,
                availability: `https://schema.org/${available ? 'InStock' : 'OutOfStock'}`,
                url: canonicalUrl,
                ...(offer.endsAt ? { priceValidUntil: offer.endsAt.slice(0, 10) } : {}),
              }
            })
      return [
        {
          '@type': 'Product',
          '@id': `${canonicalUrl}#product`,
          name: product.name,
          description: typeof record.description === 'string' ? record.description : undefined,
          sku: variants.length === 1 ? variants[0]?.sku : undefined,
          offers,
        },
      ]
    },
  })
}

export * from './schema'

export type DiscoverySourceProvenance =
  | 'explicit_override'
  | 'content_derived'
  | 'template_default'
  | 'site_default'

export type DiscoveryIndexabilityReason =
  | 'canonical'
  | 'site_noindex'
  | 'explicit_noindex'
  | 'draft'
  | 'archived'
  | 'scheduled'
  | 'redirect'
  | 'tombstone'
  | 'unlisted'
  | 'private'
  | 'not_found'
  | 'prelaunch'
  | 'maintenance'

export type DiscoveryIssue = {
  ruleId: string
  ruleVersion: string
  severity: 'informational' | 'warning' | 'publication_blocking'
  evidence: string
  affectedEntity: { collection: string; id: string }
  affectedUrl: string
  repairTarget: string
}

export type DiscoveryDocument = {
  // URLs & Indexability
  publicUrl: string
  canonicalUrl: string
  canonicalPath: string
  alternateLocales: Record<string, string>
  indexability: {
    indexable: boolean
    reason: DiscoveryIndexabilityReason
    robotsDirectives: {
      index: boolean
      follow: boolean
    }
  }

  // Resolved Title & Description with Source Provenance
  title: {
    value: string
    source: DiscoverySourceProvenance
  }
  description: {
    value: string | null
    source: DiscoverySourceProvenance
  }

  // Social Image & Public Variant Eligibility
  socialImage: {
    url: string | null
    alt: string | null
    source: DiscoverySourceProvenance | null
    variantEligible: boolean
    variantUrl: string | null
  }

  // Core Presentation & Attribution
  contentType: string
  author: {
    id?: string | null
    ids?: string[]
    name: string
    url?: string | null
  } | null
  publisher: {
    name: string
    url: string
    logoUrl?: string | null
  }
  dates: {
    publishedAt: string | null
    modifiedAt: string | null
  }
  taxonomy: {
    topics: string[]
    categories: string[]
    tags: string[]
    entities?: Array<{ id: string; name: string; kind: 'topic' | 'category' | 'tag' }>
  }
  breadcrumbs: Array<{
    name: string
    path: string
    url: string
  }>
  media: {
    heroImage?: {
      id: string
      url: string
      alt: string
      width?: number
      height?: number
    } | null
    audio?: {
      id: string
      url: string
      mimeType?: string
      durationSeconds?: number
      sizeBytes?: number
    } | null
    video?: {
      id: string
      url: string
      posterUrl?: string
      durationSeconds?: number
    } | null
  }

  // Exact Immutable Published Revisions
  revisions: {
    entityId: string | null
    collection: string | null
    publishedRevisionId: string | null
    presentationRevisionId: string | null
  }

  // Schema.org Structured Data
  schema: {
    eligible: boolean
    schemaType: string
    fallbackType?: string
    eligibilityReason?: string
    validationIssues?: SchemaValidationIssue[]
    inspection?: SchemaInspection
    jsonLd: Record<string, unknown>
  }

  // Search Projection & Visibility
  search: {
    eligible: boolean
    bodyProjection: string
    visibility: 'public' | 'hidden'
  }

  // Redirect / Tombstone Relationship
  redirect: {
    isRedirect: boolean
    targetUrl: string | null
    statusCode: 301 | 302 | 307 | 308 | null
    isTombstone: boolean
    ruleIds?: string[]
  }

  // Issues & Quality Audit
  issues: DiscoveryIssue[]
  resolved?: Record<
    string,
    {
      value: string | boolean | null
      source: DiscoverySourceProvenance
      fallbackChain: string[]
      warning: string | null
      repairField: string
    }
  >
  social?: { title: string; description: string | null; locale: string }
}

export function normalizeDiscoveryPath(value: string): string {
  const raw = value.trim().split('#', 1)[0]!.split('?', 1)[0] || '/'
  const withSlash = raw.startsWith('/') && !raw.startsWith('//') ? raw : `/${raw}`
  const collapsed = withSlash.replace(/\/{2,}/g, '/')
  const decoded = collapsed
    .split('/')
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part))
      } catch {
        return encodeURIComponent(part)
      }
    })
    .join('/')
  return decoded !== '/' ? decoded.replace(/\/+$/, '') : '/'
}

export function safeCanonicalUrl(candidate: unknown, publicUrl: string, origin: string): string {
  if (typeof candidate !== 'string' || !candidate.trim()) return publicUrl
  try {
    const value = new URL(candidate.trim(), origin)
    const allowed = new URL(origin)
    if (value.protocol !== allowed.protocol || value.host !== allowed.host) return publicUrl
    value.username = ''
    value.password = ''
    value.hash = ''
    value.search = ''
    value.pathname = normalizeDiscoveryPath(value.pathname)
    return value.toString()
  } catch {
    return publicUrl
  }
}

const warningFor = (field: string, value: string | null): string | null => {
  const length = value?.length ?? 0
  if (field.includes('title') && length > 60)
    return `May truncate in search (${length}/60 characters).`
  if (field.includes('description') && length > 160)
    return `May truncate in search (${length}/160 characters).`
  if ((field === 'canonical' || field === 'locale') && !value)
    return `A valid ${field} is required.`
  return null
}

const nonIndexReason = (
  settings: ResolvedSiteSettings,
  fallback: DiscoveryIndexabilityReason,
): DiscoveryIndexabilityReason =>
  settings.launchState === 'maintenance'
    ? 'maintenance'
    : settings.launchState === 'prelaunch'
      ? 'prelaunch'
      : settings.indexingMode === 'noindex'
        ? 'site_noindex'
        : fallback

export function toSchemaSiteIdentity(
  settings: ResolvedSiteSettings,
  base: string,
): SchemaSiteIdentityInput {
  return {
    base,
    siteName: settings.siteName,
    siteDescription: settings.siteDescription,
    ownerKind: settings.ownerKind,
    organizationName: settings.organizationName,
    personName: settings.personName,
    legalName: settings.legalName,
    logoUrl: settings.logoUrl
      ? settings.logoUrl.startsWith('http')
        ? settings.logoUrl
        : `${base}${settings.logoUrl}`
      : null,
    sameAs: Array.isArray(settings.sameAs) ? settings.sameAs : undefined,
    locale: settings.locale,
    searchEnabled: settings.searchAction?.enabled ?? true,
  }
}

export function discoveryPreview(doc: DiscoveryDocument) {
  const socialTitle = doc.social?.title || doc.title.value
  const socialDescription = doc.social?.description ?? doc.description.value
  const image = doc.socialImage.variantEligible ? doc.socialImage.variantUrl : doc.socialImage.url
  return {
    search: {
      siteName: doc.publisher.name,
      url: doc.canonicalUrl,
      title: doc.title.value.slice(0, 60),
      description: doc.description.value?.slice(0, 160) ?? '',
      titleTruncated: doc.title.value.length > 60,
      descriptionTruncated: (doc.description.value?.length ?? 0) > 160,
    },
    openGraph: { title: socialTitle, description: socialDescription, image },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: socialTitle, image },
    warnings: doc.issues
      .filter((issue) => issue.ruleId.includes('MEDIA') || issue.ruleId.includes('RIGHTS'))
      .map((issue) => issue.evidence),
    schema: doc.schema.inspection || {
      eligible: doc.schema.eligible,
      primaryType: doc.schema.schemaType,
      fallbackType: doc.schema.fallbackType,
      eligibilityReason:
        doc.schema.eligibilityReason || (doc.schema.eligible ? 'eligible' : 'ineligible'),
      nodes: [],
      validationIssues: doc.schema.validationIssues || [],
    },
  }
}

export type SearchDocument = PublicState & {
  id: string
  siteId: string
  path: string
  title: string
  summary?: string | null
  excerpt?: string | null
  body?: string | null
  taxonomy?: string | null
  updatedAt?: string | null
}

export type SearchHit = Pick<SearchDocument, 'id' | 'path' | 'title'> & {
  excerpt: string
  score: number
}

const words = (value: string) => value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
const plain = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()

export function highlightExcerpt(
  document: Pick<SearchDocument, 'summary' | 'excerpt' | 'body'> | string | null | undefined,
  query: string,
  limit = 220,
): string {
  let text = ''
  const q = query.trim().toLocaleLowerCase()
  const term = words(query)[0]

  if (typeof document === 'string' || !document) {
    text = plain(typeof document === 'string' ? document : '')
  } else {
    // Pick whichever field contains the search query or term first
    const fields = [document.body, document.excerpt, document.summary].filter(Boolean) as string[]
    const matchingField = fields.find((f) => {
      const lower = f.toLocaleLowerCase()
      return (q && lower.includes(q)) || (term && lower.includes(term))
    })
    text = plain(matchingField ?? document.excerpt ?? document.summary ?? document.body ?? '')
  }

  if (!term || !text) return text.slice(0, limit)

  const matchTerm = q && text.toLocaleLowerCase().includes(q) ? query.trim() : term
  const index = text.toLocaleLowerCase().indexOf(matchTerm.toLocaleLowerCase())
  const start = index >= 0 ? Math.max(0, index - Math.floor(limit / 3)) : 0
  const excerpt = text.slice(start, start + limit)

  const escaped = excerpt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const regexTerm = matchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const highlighted = escaped.replace(new RegExp(`(${regexTerm})`, 'ig'), '<mark>$1</mark>')
  return `${start ? '…' : ''}${highlighted}${start + limit < text.length ? '…' : ''}`
}

/** Local, deterministic search. PostgreSQL/Payload remains the source of truth; no queue or service is required. */
export function queryLocalSearch(input: {
  documents: readonly SearchDocument[]
  query: string
  siteId?: string
  page?: number
  pageSize?: number
  now?: Date
}): { hits: SearchHit[]; total: number; page: number; pageCount: number } {
  const query = input.query.trim()
  const terms = words(query)
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 10, 50))
  const page = Math.max(1, input.page ?? 1)
  if (!terms.length) return { hits: [], total: 0, page, pageCount: 0 }

  const phrase = query.toLocaleLowerCase()

  const scored = input.documents
    .filter(
      (document) =>
        (!input.siteId || document.siteId === input.siteId) &&
        canDiscoverPublic(document, input.now),
    )
    .map((document) => {
      const title = document.title.toLocaleLowerCase()
      const bodyText = plain(document.body).toLocaleLowerCase()
      const summaryText = plain(document.summary).toLocaleLowerCase()
      const excerptText = plain(document.excerpt).toLocaleLowerCase()
      const taxText = plain(document.taxonomy).toLocaleLowerCase()
      const allText = `${summaryText} ${excerptText} ${bodyText} ${taxText}`

      let score = 0
      // Full phrase bonus
      if (title === phrase) score += 200
      else if (title.includes(phrase)) score += 50
      if (allText.includes(phrase)) score += 25

      // Per-term scoring
      for (const term of terms) {
        if (title === term) score += 100
        else if (title.startsWith(term)) score += 30
        else if (title.includes(term)) score += 15

        if (taxText.includes(term)) score += 10
        if (summaryText.includes(term) || excerptText.includes(term)) score += 5
        if (bodyText.includes(term)) score += 3
      }

      return { document, score }
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        String(right.document.updatedAt ?? '').localeCompare(
          String(left.document.updatedAt ?? ''),
        ) ||
        left.document.title.localeCompare(right.document.title),
    )
  const total = scored.length
  return {
    hits: scored.slice((page - 1) * pageSize, page * pageSize).map(({ document, score }) => ({
      id: document.id,
      path: document.path,
      title: document.title,
      score,
      excerpt: highlightExcerpt(document, query),
    })),
    total,
    page,
    pageCount: Math.ceil(total / pageSize),
  }
}

export type RedirectRule = {
  id: string
  siteId: string
  fromPath: string
  toPath: string
  match: 'exact' | 'prefix' | 'regex'
  statusCode?: 301 | 302 | 307 | 308
  preserveQuery?: boolean
  enabled?: boolean
}
export type RedirectResolution =
  | { target: string; statusCode: 301 | 302 | 307 | 308; ruleIds: string[] }
  | { error: 'loop' | 'hop-limit' | 'missing-target' }
const normalPath = (value: string) => {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return ''
  try {
    const segments = value.split('/')
    for (const segment of segments) {
      const decoded = decodeURIComponent(segment)
      if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\'))
        return ''
    }
    return value
  } catch {
    return ''
  }
}

export function validateRedirectRule(rule: RedirectRule): string | true {
  if (!normalPath(rule.fromPath) || !normalPath(rule.toPath))
    return 'Paths must be same-site absolute paths.'
  if (rule.fromPath === rule.toPath) return 'A redirect cannot target itself.'
  if (rule.match === 'regex')
    try {
      new RegExp(rule.fromPath)
    } catch {
      return 'Regex pattern is invalid.'
    }
  return true
}

export function resolveRedirect(
  rules: readonly RedirectRule[],
  siteId: string,
  pathname: string,
  query = '',
  maxHops = 8,
): RedirectResolution | null {
  let path = pathname
  const visited = new Set<string>()
  const ruleIds: string[] = []
  for (let hop = 0; hop < maxHops; hop++) {
    const rule = rules.find(
      (candidate) =>
        candidate.siteId === siteId &&
        candidate.enabled !== false &&
        ((candidate.match === 'exact' && candidate.fromPath === path) ||
          (candidate.match === 'prefix' &&
            (path === candidate.fromPath || path.startsWith(`${candidate.fromPath}/`))) ||
          (candidate.match === 'regex' && new RegExp(candidate.fromPath).test(path))),
    )
    if (!rule)
      return ruleIds.length
        ? { target: `${path}${query && query !== '?' ? query : ''}`, statusCode: 308, ruleIds }
        : null
    if (!normalPath(rule.toPath)) return { error: 'missing-target' }
    if (visited.has(rule.id) || visited.has(rule.toPath)) return { error: 'loop' }
    visited.add(rule.id)
    visited.add(path)
    ruleIds.push(rule.id)
    path =
      rule.match === 'prefix'
        ? `${rule.toPath}${path.slice(rule.fromPath.length)}`
        : rule.match === 'regex'
          ? path.replace(new RegExp(rule.fromPath), rule.toPath)
          : rule.toPath
    if (!path) return { error: 'missing-target' }
    if (
      !rules.some(
        (candidate) =>
          candidate.siteId === siteId &&
          candidate.enabled !== false &&
          (candidate.match === 'exact'
            ? candidate.fromPath === path
            : candidate.match === 'prefix'
              ? path === candidate.fromPath || path.startsWith(`${candidate.fromPath}/`)
              : new RegExp(candidate.fromPath).test(path)),
      )
    )
      return {
        target: `${path}${rule.preserveQuery === false ? '' : query}`,
        statusCode: rule.statusCode ?? 308,
        ruleIds,
      }
  }
  return { error: 'hop-limit' }
}

/** Introduce a dedicated service only after 10k public documents or p95 local search >250ms for seven days. */
export const SEARCH_SERVICE_TRIGGER = {
  publicDocuments: 10_000,
  p95Milliseconds: 250,
  sustainedDays: 7,
} as const

// -------------------------------------------------------------------------------------------------
// DETERMINISTIC DISCOVERY ISSUE AUDITING
// -------------------------------------------------------------------------------------------------

export function auditDiscoveryDocument(doc: DiscoveryDocument): DiscoveryIssue[] {
  const issues: DiscoveryIssue[] = []
  const entity = {
    collection: doc.revisions.collection || 'unknown',
    id: doc.revisions.entityId || doc.canonicalPath,
  }

  // DISC-01-TITLE: Non-empty, meaningful title
  if (!doc.title.value || doc.title.value.trim().length === 0) {
    issues.push({
      ruleId: 'DISC-RULE-01-TITLE',
      ruleVersion: '1.0.0',
      severity: 'publication_blocking',
      evidence: 'Title is empty or missing.',
      affectedEntity: entity,
      affectedUrl: doc.publicUrl,
      repairTarget: 'Add an explicit seoTitle or provide a non-empty content title/headline.',
    })
  }

  // DISC-02-DESC: Meaningful description
  if (!doc.description.value || doc.description.value.trim().length === 0) {
    issues.push({
      ruleId: 'DISC-RULE-02-DESC',
      ruleVersion: '1.0.0',
      severity: 'warning',
      evidence: 'Public meta description is missing.',
      affectedEntity: entity,
      affectedUrl: doc.publicUrl,
      repairTarget: 'Provide a summary, excerpt, or explicit seoDescription.',
    })
  }

  // DISC-03-CANONICAL: Valid absolute URL matching configured canonical origin
  if (!doc.canonicalUrl || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(doc.canonicalUrl)) {
    issues.push({
      ruleId: 'DISC-RULE-03-CANONICAL',
      ruleVersion: '1.0.0',
      severity: 'publication_blocking',
      evidence: `Canonical URL "${doc.canonicalUrl}" is malformed or not an absolute HTTP(S) URL.`,
      affectedEntity: entity,
      affectedUrl: doc.publicUrl,
      repairTarget: 'Ensure canonical origin and canonical path produce a valid absolute URL.',
    })
  }

  // DISC-04-INDEXABILITY: Conflict detection
  if (doc.indexability.indexable && doc.indexability.reason !== 'canonical') {
    issues.push({
      ruleId: 'DISC-RULE-04-INDEXABILITY',
      ruleVersion: '1.0.0',
      severity: 'warning',
      evidence: `Indexability marked true while reason is "${doc.indexability.reason}".`,
      affectedEntity: entity,
      affectedUrl: doc.publicUrl,
      repairTarget: 'Reconcile indexing mode, publish state, and seoNoIndex directive.',
    })
  }

  // DISC-05-MEDIA-ALT: Social or hero image missing alt text
  if (doc.socialImage.url && !doc.socialImage.alt?.trim()) {
    issues.push({
      ruleId: 'DISC-RULE-05-MEDIA-ALT',
      ruleVersion: '1.0.0',
      severity: 'publication_blocking',
      evidence: `Social/Hero image (${doc.socialImage.url}) is missing alt text.`,
      affectedEntity: entity,
      affectedUrl: doc.publicUrl,
      repairTarget: 'Add meaningful alt text to the media asset or specify seoImageAlt.',
    })
  }

  // DISC-06-REDIRECT-LOOP: Redirect targeting itself
  if (doc.redirect.isRedirect && doc.redirect.targetUrl === doc.publicUrl) {
    issues.push({
      ruleId: 'DISC-RULE-06-REDIRECT-LOOP',
      ruleVersion: '1.0.0',
      severity: 'publication_blocking',
      evidence: 'Redirect target is identical to source URL.',
      affectedEntity: entity,
      affectedUrl: doc.publicUrl,
      repairTarget: 'Change redirect toPath to a distinct destination or remove circular rule.',
    })
  }

  // DISC-07-SCHEMA-VALID: Schema eligibility requires name and URL
  if (doc.schema.eligible && (!doc.canonicalUrl || !doc.title.value)) {
    issues.push({
      ruleId: 'DISC-RULE-07-SCHEMA-VALID',
      ruleVersion: '1.0.0',
      severity: 'warning',
      evidence: 'Schema graph emitted without required name or canonical URL.',
      affectedEntity: entity,
      affectedUrl: doc.publicUrl,
      repairTarget: 'Ensure document has a valid name and canonical URL before emitting schema.',
    })
  }

  return issues
}

// -------------------------------------------------------------------------------------------------
// UNIFIED DISCOVERY RESOLVER CONTRACT
// -------------------------------------------------------------------------------------------------

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object' && 'id' in value) {
    const raw = (value as { id: unknown }).id
    return typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim()
  }
  return ''
}

export type DiscoveryResolveInput = {
  path?: string
  slug?: string
  collection?: string
  id?: string
  record?: Record<string, unknown>
  siteId?: string
  query?: string
  now?: Date
}

export async function resolveDiscoveryDocument(
  payload: Payload,
  input: DiscoveryResolveInput,
): Promise<DiscoveryDocument> {
  const now = input.now ?? new Date()
  const settings = await resolveSiteSettings(payload)

  // 1. Resolve publication and site ID
  let siteId = input.siteId
  if (!siteId) {
    const publications = await payload.find({
      collection: 'publications',
      where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const pub = publications.docs[0] as unknown as Record<string, unknown> | undefined
    siteId = idOf(pub?.site)
  }
  const base = (siteId && settings.canonicalOriginsBySite[siteId]) || settings.canonicalOrigin

  const rawPath =
    input.path ||
    (typeof input.record?.canonicalPath === 'string' && input.record.canonicalPath
      ? input.record.canonicalPath
      : typeof input.record?.path === 'string' && input.record.path
        ? input.record.path
        : undefined)

  const rawSlug =
    input.slug || (typeof input.record?.slug === 'string' ? input.record.slug : undefined)

  let unresolvedPath = '/'
  if (rawPath) unresolvedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  else if (rawSlug) {
    const contentType = String(input.record?.contentType ?? 'article')
    const kind =
      input.collection === 'podcast-shows'
        ? 'podcast'
        : input.collection === 'podcast-episodes'
          ? 'podcast-episode'
          : input.collection === 'videos'
            ? 'video'
            : input.collection === 'events'
              ? 'event'
              : input.collection === 'timelines'
                ? 'timeline'
                : input.collection === 'albums'
                  ? 'album'
                  : input.collection === 'books'
                    ? 'book'
                    : input.collection === 'products'
                      ? 'product'
                      : input.collection === 'discussions'
                        ? 'discussion'
                        : contentType === 'page'
                          ? 'page'
                          : 'article'
    const recordValues: Record<string, string> = { slug: rawSlug }
    if (kind === 'timeline' && typeof input.record?.eventSlug === 'string')
      recordValues.eventSlug = input.record.eventSlug
    if (kind === 'discussion' && typeof input.record?.forumSlug === 'string')
      recordValues.forumSlug = input.record.forumSlug
    try {
      unresolvedPath = resolvePublicUrl(
        { kind, ...recordValues } as never,
        routeTemplatesForSite(
          siteId,
          settings.semanticRouteTemplates,
          settings.semanticRouteTemplatesBySite,
        ),
      )
    } catch {
      // A timeline route needs its related event slug; collection lookup below can resolve by slug.
      unresolvedPath = '/'
    }
  }
  const normalizedPath = normalizeDiscoveryPath(unresolvedPath)

  const publicUrl = new URL(normalizedPath, base).toString()

  // 2. Check Redirect Rules across public-redirects (only when resolving by path without a known record)
  if (siteId && !input.record) {
    const redirects = await payload
      .find({
        collection: 'public-redirects',
        where: { site: { equals: siteId } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [] }))

    const resolution = resolveRedirect(
      (redirects.docs as unknown as Array<Record<string, unknown>>).map((item) => ({
        id: String(item.id),
        siteId: siteId!,
        fromPath: String(item.fromPath),
        toPath: String(item.toPath),
        match: item.match as RedirectRule['match'],
        statusCode: Number(item.statusCode) as RedirectRule['statusCode'],
        preserveQuery: item.preserveQuery !== false,
        enabled: item.enabled !== false,
      })),
      siteId,
      normalizedPath,
      input.query ? `?${input.query}` : '',
    )

    if (resolution && 'target' in resolution) {
      const redirectDoc: DiscoveryDocument = {
        publicUrl,
        canonicalUrl: resolution.target.startsWith('http')
          ? resolution.target
          : new URL(resolution.target, base).toString(),
        canonicalPath: normalizedPath,
        alternateLocales: {},
        indexability: {
          indexable: false,
          reason: 'redirect',
          robotsDirectives: { index: false, follow: false },
        },
        title: {
          value: `Redirecting to ${resolution.target}`,
          source: 'template_default',
        },
        description: {
          value: `Permanent redirect to ${resolution.target}`,
          source: 'template_default',
        },
        socialImage: {
          url: settings.defaultSocialImageUrl ? `${base}${settings.defaultSocialImageUrl}` : null,
          alt: settings.siteName,
          source: settings.defaultSocialImageUrl ? 'site_default' : null,
          variantEligible: false,
          variantUrl: null,
        },
        contentType: 'redirect',
        author: null,
        publisher: {
          name: settings.siteName,
          url: base,
          logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
        },
        dates: { publishedAt: null, modifiedAt: null },
        taxonomy: { topics: [], categories: [], tags: [] },
        breadcrumbs: [{ name: 'Home', path: '/', url: `${base}/` }],
        media: {},
        revisions: {
          entityId: null,
          collection: 'public-redirects',
          publishedRevisionId: null,
          presentationRevisionId: null,
        },
        search: { eligible: false, bodyProjection: '', visibility: 'hidden' },
        redirect: {
          isRedirect: true,
          targetUrl: resolution.target,
          statusCode: resolution.statusCode,
          isTombstone: false,
          ruleIds: resolution.ruleIds,
        },
        schema: {
          eligible: false,
          schemaType: 'None',
          eligibilityReason: 'redirect',
          validationIssues: [],
          jsonLd: { '@context': 'https://schema.org', '@graph': [] },
        },
        issues: [],
      }
      redirectDoc.issues = auditDiscoveryDocument(redirectDoc)
      return redirectDoc
    }
  }

  // 3. Resolve by Surface/Content Type
  // CASE A: Home Page ('/')
  if (normalizedPath === '/' && !input.id && input.collection !== 'content') {
    const isSiteIndexable = settings.indexingMode !== 'noindex' && settings.launchState === 'live'
    const docTitle = settings.siteName
    const docDesc = settings.siteDescription || null
    const socialImg = settings.defaultSocialImageUrl
      ? `${base}${settings.defaultSocialImageUrl}`
      : null

    const siteIdentity = toSchemaSiteIdentity(settings, base)
    const {
      graph: homeSchema,
      validation,
      inspection,
    } = composeSchemaGraph({
      canonicalUrl: `${base}/`,
      canonicalPath: '/',
      base,
      contentType: 'home',
      title: docTitle,
      description: docDesc,
      site: siteIdentity,
      breadcrumbs: [{ name: 'Home', url: `${base}/` }],
      indexable: isSiteIndexable,
      image: socialImg ? { url: socialImg, alt: settings.siteName } : null,
    })

    const homeDoc: DiscoveryDocument = {
      publicUrl: `${base}/`,
      canonicalUrl: `${base}/`,
      canonicalPath: '/',
      alternateLocales: {},
      indexability: {
        indexable: isSiteIndexable,
        reason: isSiteIndexable ? 'canonical' : nonIndexReason(settings, 'site_noindex'),
        robotsDirectives: {
          index: isSiteIndexable,
          follow: isSiteIndexable,
        },
      },
      title: { value: docTitle, source: 'site_default' },
      description: { value: docDesc, source: 'site_default' },
      socialImage: {
        url: socialImg,
        alt: settings.siteName,
        source: socialImg ? 'site_default' : null,
        variantEligible: false,
        variantUrl: null,
      },
      contentType: 'home',
      author: null,
      publisher: {
        name: settings.siteName,
        url: base,
        logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
      },
      dates: { publishedAt: null, modifiedAt: null },
      taxonomy: { topics: [], categories: [], tags: [] },
      breadcrumbs: [{ name: 'Home', path: '/', url: `${base}/` }],
      media: {},
      revisions: {
        entityId: null,
        collection: 'core',
        publishedRevisionId: null,
        presentationRevisionId: null,
      },
      search: {
        eligible: isSiteIndexable,
        bodyProjection: `${settings.siteName} ${settings.siteDescription}`,
        visibility: 'public',
      },
      redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
      schema: {
        eligible: validation.eligible,
        schemaType: validation.primaryType,
        fallbackType: validation.fallbackType,
        eligibilityReason: validation.eligibilityReason,
        validationIssues: validation.validationIssues,
        inspection,
        jsonLd: homeSchema,
      },
      issues: [],
    }
    homeDoc.issues = auditDiscoveryDocument(homeDoc)
    return homeDoc
  }

  // CASE B: Articles Archive ('/articles')
  if (normalizedPath === '/articles') {
    const isIndexable = settings.indexingMode !== 'noindex' && settings.launchState === 'live'
    const docTitle = `Articles — ${settings.siteName}`
    const docDesc = `Archive of published articles from ${settings.siteName}.`

    const siteIdentity = toSchemaSiteIdentity(settings, base)
    const {
      graph: archiveSchema,
      validation,
      inspection,
    } = composeSchemaGraph({
      canonicalUrl: `${base}/articles`,
      canonicalPath: '/articles',
      base,
      contentType: 'archive',
      title: docTitle,
      description: docDesc,
      site: siteIdentity,
      breadcrumbs: [
        { name: 'Home', url: `${base}/` },
        { name: 'Articles', url: `${base}/articles` },
      ],
      indexable: isIndexable,
    })

    const archiveDoc: DiscoveryDocument = {
      publicUrl: `${base}/articles`,
      canonicalUrl: `${base}/articles`,
      canonicalPath: '/articles',
      alternateLocales: {},
      indexability: {
        indexable: isIndexable,
        reason: isIndexable ? 'canonical' : nonIndexReason(settings, 'site_noindex'),
        robotsDirectives: { index: isIndexable, follow: isIndexable },
      },
      title: { value: docTitle, source: 'template_default' },
      description: { value: docDesc, source: 'template_default' },
      socialImage: {
        url: settings.defaultSocialImageUrl ? `${base}${settings.defaultSocialImageUrl}` : null,
        alt: settings.siteName,
        source: settings.defaultSocialImageUrl ? 'site_default' : null,
        variantEligible: false,
        variantUrl: null,
      },
      contentType: 'archive',
      author: null,
      publisher: {
        name: settings.siteName,
        url: base,
        logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
      },
      dates: { publishedAt: null, modifiedAt: null },
      taxonomy: { topics: [], categories: [], tags: [] },
      breadcrumbs: [
        { name: 'Home', path: '/', url: `${base}/` },
        { name: 'Articles', path: '/articles', url: `${base}/articles` },
      ],
      media: {},
      revisions: {
        entityId: null,
        collection: 'content',
        publishedRevisionId: null,
        presentationRevisionId: null,
      },
      search: { eligible: false, bodyProjection: docDesc, visibility: 'public' },
      redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
      schema: {
        eligible: validation.eligible,
        schemaType: validation.primaryType,
        fallbackType: validation.fallbackType,
        eligibilityReason: validation.eligibilityReason,
        validationIssues: validation.validationIssues,
        inspection,
        jsonLd: archiveSchema,
      },
      issues: [],
    }
    archiveDoc.issues = auditDiscoveryDocument(archiveDoc)
    return archiveDoc
  }

  // CASE C: Search Page ('/search')
  if (normalizedPath === '/search') {
    const siteIdentity = toSchemaSiteIdentity(settings, base)
    const {
      graph: searchSchema,
      validation,
      inspection,
    } = composeSchemaGraph({
      canonicalUrl: `${base}/search`,
      canonicalPath: '/search',
      base,
      contentType: 'search',
      title: `Search — ${settings.siteName}`,
      description: `Search published articles, pages, and dispatches across ${settings.siteName}.`,
      site: siteIdentity,
      breadcrumbs: [
        { name: 'Home', url: `${base}/` },
        { name: 'Search', url: `${base}/search` },
      ],
      indexable: false,
    })

    const searchDoc: DiscoveryDocument = {
      publicUrl: `${base}/search`,
      canonicalUrl: `${base}/search`,
      canonicalPath: '/search',
      alternateLocales: {},
      indexability: {
        indexable: false,
        reason: 'unlisted', // Search results pages fail indexability to preserve crawl budget
        robotsDirectives: { index: false, follow: true },
      },
      title: { value: `Search — ${settings.siteName}`, source: 'template_default' },
      description: {
        value: `Search published articles, pages, and dispatches across ${settings.siteName}.`,
        source: 'template_default',
      },
      socialImage: {
        url: settings.defaultSocialImageUrl ? `${base}${settings.defaultSocialImageUrl}` : null,
        alt: settings.siteName,
        source: settings.defaultSocialImageUrl ? 'site_default' : null,
        variantEligible: false,
        variantUrl: null,
      },
      contentType: 'search',
      author: null,
      publisher: {
        name: settings.siteName,
        url: base,
        logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
      },
      dates: { publishedAt: null, modifiedAt: null },
      taxonomy: { topics: [], categories: [], tags: [] },
      breadcrumbs: [
        { name: 'Home', path: '/', url: `${base}/` },
        { name: 'Search', path: '/search', url: `${base}/search` },
      ],
      media: {},
      revisions: {
        entityId: null,
        collection: 'search',
        publishedRevisionId: null,
        presentationRevisionId: null,
      },
      search: { eligible: false, bodyProjection: '', visibility: 'hidden' },
      redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
      schema: {
        eligible: validation.eligible,
        schemaType: validation.primaryType,
        fallbackType: validation.fallbackType,
        eligibilityReason: validation.eligibilityReason,
        validationIssues: validation.validationIssues,
        inspection,
        jsonLd: searchSchema,
      },
      issues: [],
    }
    searchDoc.issues = auditDiscoveryDocument(searchDoc)
    return searchDoc
  }

  // CASE D: Canonical Content (article / page)
  if (!input.collection || input.collection === 'content') {
    let contentDoc: Record<string, any> | undefined =
      input.collection === 'content'
        ? input.record
        : input.record && ('contentType' in input.record || 'canonicalPath' in input.record)
          ? input.record
          : undefined

    if (!contentDoc && !input.record) {
      if (input.id) {
        try {
          contentDoc = (await payload.findByID({
            collection: 'content',
            id: input.id,
            depth: 1,
            overrideAccess: true,
          } as never)) as Record<string, any>
        } catch {
          contentDoc = undefined
        }
      }
      const slugMatch =
        input.slug ||
        (normalizedPath.startsWith('/articles/')
          ? normalizedPath.replace('/articles/', '')
          : undefined)
      const conditions: Array<Record<string, unknown>> = []
      if (siteId) conditions.push({ site: { equals: siteId } })

      if (!contentDoc && slugMatch) {
        const found = await payload.find({
          collection: 'content',
          where: {
            and: [...conditions, { slug: { equals: slugMatch } }],
          } as never,
          limit: 1,
          depth: 1,
          overrideAccess: true,
        })
        contentDoc = found.docs[0] as Record<string, any> | undefined
      }

      if (!contentDoc) {
        const found = await payload.find({
          collection: 'content',
          where: {
            and: [...conditions, { canonicalPath: { equals: normalizedPath } }],
          } as never,
          limit: 1,
          depth: 1,
          overrideAccess: true,
        })
        contentDoc = found.docs[0] as Record<string, any> | undefined
      }
    }

    if (
      contentDoc &&
      (input.collection === 'content' ||
        !input.collection ||
        contentDoc.canonicalPath === normalizedPath ||
        (contentDoc.slug &&
          normalizedPath ===
            resolvePublicUrl(
              {
                kind: contentDoc.contentType === 'page' ? 'page' : 'article',
                slug: String(contentDoc.slug),
                canonicalPath:
                  typeof contentDoc.canonicalPath === 'string' ? contentDoc.canonicalPath : null,
              },
              routeTemplatesForSite(
                siteId,
                settings.semanticRouteTemplates,
                settings.semanticRouteTemplatesBySite,
              ),
            )))
    ) {
      return buildContentDiscoveryDocument({
        content: contentDoc,
        payload,
        settings,
        base,
        now,
        siteId,
      })
    }
  }

  // CASE E: Page Layouts ('page-layouts')
  let layoutDoc: Record<string, any> | undefined =
    input.collection === 'page-layouts'
      ? input.record
      : input.record && ('blocks' in input.record || 'regions' in input.record)
        ? input.record
        : undefined

  if (!layoutDoc && (!input.collection || input.collection === 'page-layouts')) {
    const layoutFound = await payload.find({
      collection: 'page-layouts',
      where: {
        and: [
          ...(siteId ? [{ site: { equals: siteId } }] : []),
          { path: { equals: normalizedPath } },
        ],
      } as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    layoutDoc = layoutFound.docs[0] as Record<string, any> | undefined
  }
  if (layoutDoc) {
    return buildLayoutDiscoveryDocument({
      layout: layoutDoc,
      settings,
      base,
      now,
    })
  }

  // Topics reuse the existing editorial taxonomy. A taxonomy record becomes a
  // public archive only while it has at least one published public article.
  if (
    (!input.collection || input.collection === 'topics') &&
    registeredOnly(payload, ['topics'] as const).length > 0
  ) {
    const topicFound = await payload.find({
      collection: 'topics',
      where: {
        and: [
          ...(siteId ? [{ site: { equals: siteId } }] : []),
          input.record && idOf(input.record.id)
            ? { id: { equals: idOf(input.record.id) } }
            : { canonicalPath: { equals: normalizedPath } },
        ],
      } as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const topic = (topicFound.docs[0] as Record<string, any> | undefined) ?? input.record
    if (topic && (input.collection === 'topics' || topic.canonicalPath === normalizedPath)) {
      const related = await payload.find({
        collection: 'content',
        where: {
          and: [
            ...(siteId ? [{ site: { equals: siteId } }] : []),
            { topics: { contains: String(topic.id) } },
            { status: { in: ['published', 'updated'] } },
            { visibility: { equals: 'public' } },
            { moderationState: { equals: 'clear' } },
            { removeFromDiscovery: { not_equals: true } },
          ],
        } as never,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      if (
        (related.docs as unknown as PublicState[]).some((record) => canDiscoverPublic(record, now))
      ) {
        return buildGenericRecordDiscoveryDocument({
          record: { ...topic, status: 'published', visibility: 'public' },
          collection: 'topics',
          settings,
          base,
          now,
        })
      }
    }
  }

  // CASE E.2: Registered Candidate Collections (books, events, timelines, albums, discussions, products)
  const candidateCollections = registeredOnly(payload, [
    'books',
    'events',
    'timelines',
    'albums',
    'discussions',
    'products',
  ] as const)

  if (input.record && input.collection && candidateCollections.includes(input.collection as any)) {
    return buildGenericRecordDiscoveryDocument({
      record: input.record,
      collection: input.collection,
      settings,
      base,
      now,
    })
  }

  for (const collection of candidateCollections) {
    if (input.collection && input.collection !== collection) continue
    const conditions: Array<Record<string, unknown>> = [
      input.collection && input.slug
        ? { slug: { equals: input.slug } }
        : { canonicalPath: { equals: normalizedPath } },
    ]
    if (siteId) conditions.push({ site: { equals: siteId } })

    const found = await payload
      .find({
        collection,
        where: { and: conditions } as never,
        limit: 1,
        depth: 1,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] }))

    const rec = found.docs[0] as Record<string, any> | undefined
    if (rec) {
      return buildGenericRecordDiscoveryDocument({
        record: rec,
        collection,
        settings,
        base,
        now,
      })
    }
  }

  // CASE F: Podcast Shows ('podcast-shows')
  if (!input.collection || input.collection === 'podcast-shows') {
    const showFound = await payload.find({
      collection: 'podcast-shows',
      where: {
        and: [
          ...(siteId ? [{ site: { equals: siteId } }] : []),
          input.collection === 'podcast-shows' && input.slug
            ? { slug: { equals: input.slug } }
            : { canonicalPath: { equals: normalizedPath } },
        ],
      },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    } as never)
    const showDoc = showFound.docs[0] as Record<string, any> | undefined
    if (showDoc) {
      return buildPodcastShowDiscoveryDocument({
        show: showDoc,
        settings,
        base,
        now,
      })
    }
  }

  // CASE G: Podcast Episodes ('podcast-episodes')
  if (!input.collection || input.collection === 'podcast-episodes') {
    const epFound = await payload.find({
      collection: 'podcast-episodes',
      where: {
        and: [
          ...(siteId ? [{ site: { equals: siteId } }] : []),
          input.collection === 'podcast-episodes' && input.slug
            ? { slug: { equals: input.slug } }
            : { canonicalPath: { equals: normalizedPath } },
        ],
      },
      limit: 1,
      depth: 2,
      overrideAccess: true,
    } as never)
    const epDoc = epFound.docs[0] as Record<string, any> | undefined
    if (epDoc) {
      return buildPodcastEpisodeDiscoveryDocument({
        episode: epDoc,
        settings,
        base,
        now,
      })
    }
  }

  // CASE H: Videos ('videos')
  if (!input.collection || input.collection === 'videos') {
    const vidFound = await payload.find({
      collection: 'videos',
      where: {
        and: [
          ...(siteId ? [{ site: { equals: siteId } }] : []),
          input.collection === 'videos' && input.slug
            ? { slug: { equals: input.slug } }
            : { canonicalPath: { equals: normalizedPath } },
        ],
      },
      limit: 1,
      depth: 2,
      overrideAccess: true,
    } as never)
    const vidDoc = vidFound.docs[0] as Record<string, any> | undefined
    if (vidDoc) {
      return buildVideoDiscoveryDocument({
        video: vidDoc,
        settings,
        base,
        now,
      })
    }
  }

  // CASE I: 404 Not Found
  const notFoundDoc: DiscoveryDocument = {
    publicUrl,
    canonicalUrl: publicUrl,
    canonicalPath: normalizedPath,
    alternateLocales: {},
    indexability: {
      indexable: false,
      reason: 'not_found',
      robotsDirectives: { index: false, follow: false },
    },
    title: { value: `Page Not Found — ${settings.siteName}`, source: 'template_default' },
    description: {
      value: 'This published page was not found.',
      source: 'template_default',
    },
    socialImage: {
      url: settings.defaultSocialImageUrl ? `${base}${settings.defaultSocialImageUrl}` : null,
      alt: settings.siteName,
      source: settings.defaultSocialImageUrl ? 'site_default' : null,
      variantEligible: false,
      variantUrl: null,
    },
    contentType: '404',
    author: null,
    publisher: {
      name: settings.siteName,
      url: base,
      logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
    },
    dates: { publishedAt: null, modifiedAt: null },
    taxonomy: { topics: [], categories: [], tags: [] },
    breadcrumbs: [
      { name: 'Home', path: '/', url: `${base}/` },
      { name: '404', path: normalizedPath, url: publicUrl },
    ],
    media: {},
    revisions: {
      entityId: null,
      collection: null,
      publishedRevisionId: null,
      presentationRevisionId: null,
    },
    search: { eligible: false, bodyProjection: '', visibility: 'hidden' },
    redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
    schema: {
      eligible: false,
      schemaType: 'None',
      eligibilityReason: 'not_found',
      validationIssues: [],
      jsonLd: { '@context': 'https://schema.org', '@graph': [] },
    },
    issues: [],
  }
  notFoundDoc.issues = auditDiscoveryDocument(notFoundDoc)
  return notFoundDoc
}

// -------------------------------------------------------------------------------------------------
// INDIVIDUAL ENTITY BUILDERS
// -------------------------------------------------------------------------------------------------

async function buildContentDiscoveryDocument(input: {
  content: Record<string, any>
  payload: Payload
  settings: ResolvedSiteSettings
  base: string
  now: Date
  siteId?: string
}): Promise<DiscoveryDocument> {
  const { content, payload, settings, base: initialBase, now } = input
  const contentSiteId = idOf(content.site) || input.siteId
  const base = (contentSiteId && settings.canonicalOriginsBySite[contentSiteId]) || initialBase
  const contentType = String(content.contentType || 'article')
  const typeDefaults = {
    ...(settings.discoveryDefaults.default ?? {}),
    ...(settings.discoveryDefaults[contentType] ?? {}),
  } as Record<string, any>
  const overrides =
    content.discoveryOverrides && typeof content.discoveryOverrides === 'object'
      ? (content.discoveryOverrides as Record<string, any>)
      : {}
  const canonicalPath = normalizeDiscoveryPath(
    resolvePublicUrl(
      {
        kind: 'article',
        slug: String(content.slug || ''),
        canonicalPath: typeof content.canonicalPath === 'string' ? content.canonicalPath : null,
      },
      routeTemplatesForSite(
        contentSiteId,
        settings.semanticRouteTemplates,
        settings.semanticRouteTemplatesBySite,
      ),
    ),
  )
  const publicUrl = new URL(canonicalPath, base).toString()

  // 1. Determine Indexability Reason
  let indexable = true
  let reason: DiscoveryIndexabilityReason = 'canonical'

  if (content.retentionMode === 'tombstone') {
    indexable = false
    reason = 'tombstone'
  } else if (content.status !== 'published' && content.status !== 'updated') {
    indexable = false
    reason = 'draft'
  } else if (content.publishedAt && new Date(content.publishedAt).getTime() > now.getTime()) {
    indexable = false
    reason = 'scheduled'
  } else if (content.visibility && content.visibility === 'unlisted') {
    indexable = false
    reason = 'unlisted'
  } else if (content.visibility && content.visibility !== 'public') {
    indexable = false
    reason = 'private'
  } else if (content.seoNoIndex === true) {
    indexable = false
    reason = 'explicit_noindex'
  } else if (settings.launchState !== 'live') {
    indexable = false
    reason = settings.launchState
  } else if (settings.indexingMode === 'noindex' || typeDefaults.index === false) {
    indexable = false
    reason = 'site_noindex'
  } else if (!canDiscoverPublic(content, now)) {
    indexable = false
    reason = 'draft'
  }

  // 2. Resolve Exact Immutable Published Revision from article-family-content
  let publishedRevision: Record<string, any> | undefined
  let publishedRevisionId: string | null = null
  let plainTextBody = typeof content.bodyText === 'string' ? content.bodyText : ''

  try {
    const articleFamily = await payload.find({
      collection: 'article-family-content',
      where: { content: { equals: String(content.id) } },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    } as never)
    const fam = articleFamily.docs[0] as Record<string, any> | undefined
    if (fam) {
      if (typeof fam.plainTextProjection === 'string' && fam.plainTextProjection) {
        plainTextBody = fam.plainTextProjection
      }
      publishedRevisionId = idOf(fam.latestPublishedRevision) || null
      if (publishedRevisionId) {
        const rev = await payload.findByID({
          collection: 'article-family-revisions',
          id: publishedRevisionId,
          depth: 0,
          overrideAccess: true,
        } as never)
        publishedRevision = rev as Record<string, any> | undefined
      }
    }
  } catch {
    // Non-editorial content or pre-editorial content
  }

  // 3. Resolve Title and Description Provenance
  let titleValue = String(content.title || '')
  let titleSource: DiscoverySourceProvenance = 'content_derived'
  if (typeof content.seoTitle === 'string' && content.seoTitle.trim()) {
    titleValue = content.seoTitle.trim()
    titleSource = 'explicit_override'
  } else if (publishedRevision?.title) {
    titleValue = String(publishedRevision.title)
    titleSource = 'content_derived'
  } else if (!titleValue) {
    titleValue = settings.siteName
    titleSource = 'site_default'
  }
  if (titleSource !== 'explicit_override' && typeof typeDefaults.titleTemplate === 'string') {
    titleValue = typeDefaults.titleTemplate
      .replace(/\{title\}/g, titleValue)
      .replace(/\{site\}/g, settings.siteName)
    titleSource = 'template_default'
  }

  let descValue: string | null = null
  let descSource: DiscoverySourceProvenance = 'content_derived'
  if (typeof content.seoDescription === 'string' && content.seoDescription.trim()) {
    descValue = content.seoDescription.trim()
    descSource = 'explicit_override'
  } else if (publishedRevision?.summary || publishedRevision?.subtitle) {
    descValue = String(publishedRevision.summary || publishedRevision.subtitle)
    descSource = 'content_derived'
  } else if (typeof content.summary === 'string' && content.summary.trim()) {
    descValue = content.summary.trim()
    descSource = 'content_derived'
  } else if (typeof content.excerpt === 'string' && content.excerpt.trim()) {
    descValue = content.excerpt.trim()
    descSource = 'content_derived'
  } else if (settings.siteDescription) {
    descValue = settings.siteDescription
    descSource = 'site_default'
  }
  if (!descValue && typeof typeDefaults.description === 'string') {
    descValue = typeDefaults.description
    descSource = 'template_default'
  }

  // 4. Resolve Canonical URL
  const canonicalCandidate = content.seoCanonicalURL || overrides.canonical
  let canonicalUrl = safeCanonicalUrl(canonicalCandidate, publicUrl, base)
  let canonicalTargetWarning: string | null = null
  if (canonicalCandidate && canonicalUrl !== publicUrl) {
    const targetPath = new URL(canonicalUrl).pathname
    const [redirects, targets] = await Promise.all([
      payload.find({
        collection: 'public-redirects',
        where: {
          and: [
            { site: { equals: contentSiteId } },
            { fromPath: { equals: targetPath } },
            { enabled: { equals: true } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never),
      payload.find({
        collection: 'content',
        where: {
          and: [{ site: { equals: contentSiteId } }, { canonicalPath: { equals: targetPath } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never),
    ])
    const target = targets.docs[0] as Record<string, any> | undefined
    if (
      redirects.docs.length ||
      !target ||
      target.seoNoIndex === true ||
      !canDiscoverPublic(target, now)
    ) {
      canonicalTargetWarning = redirects.docs.length
        ? 'Canonical target redirects.'
        : !target
          ? 'Canonical target was not found on this site.'
          : 'Canonical target is private, unpublished, scheduled, or noindex.'
      canonicalUrl = publicUrl
    }
  }

  // 5. Social Image & Hero Media
  const imageId =
    idOf(overrides.socialImage) ||
    idOf(content.socialImage) ||
    idOf(content.heroMedia) ||
    idOf(publishedRevision?.heroMedia) ||
    null
  let socialImageUrl: string | null = null
  let socialVariantUrl: string | null = null
  let socialAlt: string | null =
    typeof content.seoImageAlt === 'string' && content.seoImageAlt.trim()
      ? content.seoImageAlt.trim()
      : null
  let socialSource: DiscoverySourceProvenance | null = null
  let variantEligible = false
  let imageRightsWarning: string | null = null

  if (imageId) {
    let image: Record<string, any> | null = null
    try {
      image = (await payload.findByID({
        collection: 'media-assets',
        id: imageId,
        depth: 0,
        overrideAccess: true,
      } as never)) as Record<string, any>
    } catch {
      image = null
    }
    const expired = Boolean(
      image?.rightsExpiresAt && new Date(String(image.rightsExpiresAt)).getTime() <= now.getTime(),
    )
    const publicReady =
      Boolean(image) &&
      !expired &&
      !['failed', 'quarantined', 'archived'].includes(image!.processingState)
    socialImageUrl = `${base}/media/${imageId}`
    socialVariantUrl = publicReady ? `${base}${mediaVariantUrl(imageId, 'og', 'jpeg')}` : null
    socialSource =
      typeof content.seoImageAlt === 'string' && content.seoImageAlt.trim()
        ? 'explicit_override'
        : 'content_derived'
    variantEligible = publicReady
    imageRightsWarning = expired
      ? 'Selected social image rights have expired; public metadata will not use its variant.'
      : !publicReady
        ? 'Selected social image is not eligible for public delivery.'
        : null
    if (!publicReady) socialImageUrl = null
    if (!socialAlt) {
      socialAlt = titleValue
    }
  } else if (settings.defaultSocialImageUrl) {
    socialImageUrl = `${base}${settings.defaultSocialImageUrl}`
    socialSource = 'site_default'
    socialAlt = settings.siteName
    variantEligible = false
  }

  // 6. Authors, Dates, Taxonomy
  const authors: Array<{ id: string | null; name: string }> = []
  if (Array.isArray(content.authors)) {
    for (const a of content.authors) {
      const value = typeof a === 'object' && a?.author ? a.author : a
      const name =
        typeof value === 'string' ? value : value?.name || value?.displayName || value?.title
      const authorId = typeof value === 'string' ? value : idOf(value)
      if (name) authors.push({ id: authorId || null, name: String(name) })
    }
  }
  const author = authors.length
    ? {
        id: authors[0]?.id || null,
        ids: authors.map(({ id }) => id).filter((id): id is string => Boolean(id)),
        name: authors.map(({ name }) => name).join(', '),
        url: null,
      }
    : null

  const publishedAt = content.publishedAt || publishedRevision?.createdAt || null
  const modifiedAt = content.updatedAtEditorial || content.updatedAt || null

  const categories: string[] = Array.isArray(content.categories)
    ? content.categories.map((c: any) => String(c?.name || c?.title || c)).filter(Boolean)
    : []
  const tags: string[] = Array.isArray(content.tags)
    ? content.tags.map((t: any) => String(t?.name || t?.title || t)).filter(Boolean)
    : []
  const topics: string[] = Array.isArray(content.topics)
    ? content.topics.map((t: any) => String(t?.name || t?.title || t)).filter(Boolean)
    : []
  const taxonomyEntities = (
    [
      ['category', content.categories],
      ['topic', content.topics],
      ['tag', content.tags],
    ] as const
  ).flatMap(([kind, values]) =>
    Array.isArray(values)
      ? values.flatMap((value: any) => {
          const entityId = idOf(value)
          const name = typeof value === 'string' ? value : value?.name || value?.title
          return entityId && name ? [{ id: entityId, name: String(name), kind }] : []
        })
      : [],
  )

  // 7. Breadcrumbs
  const breadcrumbs: Array<{ name: string; path: string; url: string }> = [
    { name: 'Home', path: '/', url: `${base}/` },
  ]
  if (contentType === 'article') {
    breadcrumbs.push({ name: 'Articles', path: '/articles', url: `${base}/articles` })
    breadcrumbs.push({ name: titleValue, path: canonicalPath, url: canonicalUrl })
  } else if (contentType === 'page') {
    if (
      content.parentPage &&
      typeof content.parentPage === 'object' &&
      content.parentPage.title &&
      content.parentPage.canonicalPath
    ) {
      breadcrumbs.push({
        name: String(content.parentPage.title),
        path: String(content.parentPage.canonicalPath),
        url: `${base}${content.parentPage.canonicalPath}`,
      })
    }
    breadcrumbs.push({ name: titleValue, path: canonicalPath, url: canonicalUrl })
  } else {
    breadcrumbs.push({ name: titleValue, path: canonicalPath, url: canonicalUrl })
  }

  // 8. Schema Graph
  const siteIdentity = toSchemaSiteIdentity(settings, base)
  const {
    graph: schemaGraph,
    validation,
    inspection,
  } = composeSchemaGraph({
    canonicalUrl,
    canonicalPath,
    base,
    contentType,
    title: titleValue,
    description: descValue,
    site: siteIdentity,
    breadcrumbs: breadcrumbs.map((b) => ({ name: b.name, url: b.url })),
    author: author ? { name: author.name, url: author.url } : null,
    image: socialImageUrl ? { url: socialImageUrl, alt: socialAlt || titleValue } : null,
    dates: { publishedAt, modifiedAt },
    taxonomy: { topics, categories, tags },
    indexable,
  })

  const doc: DiscoveryDocument = {
    publicUrl,
    canonicalUrl,
    canonicalPath,
    alternateLocales:
      overrides.alternates && typeof overrides.alternates === 'object'
        ? Object.fromEntries(
            Object.entries(overrides.alternates).flatMap(([locale, url]) =>
              typeof url === 'string' ? [[locale, safeCanonicalUrl(url, publicUrl, base)]] : [],
            ),
          )
        : {},
    indexability: {
      indexable,
      reason,
      robotsDirectives: {
        index: indexable,
        follow:
          overrides.follow === false || typeDefaults.follow === false
            ? false
            : indexable || reason === 'explicit_noindex' || reason === 'site_noindex',
      },
    },
    title: { value: titleValue, source: titleSource },
    description: { value: descValue, source: descSource },
    socialImage: {
      url: socialImageUrl,
      alt: socialAlt,
      source: socialSource,
      variantEligible,
      variantUrl: socialVariantUrl,
    },
    contentType,
    author: author
      ? {
          id: author.id,
          ids: author.ids,
          name: author.name,
          url: author.url,
        }
      : null,
    publisher: {
      name: settings.siteName,
      url: base,
      logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
    },
    dates: { publishedAt, modifiedAt },
    taxonomy: { topics, categories, tags, entities: taxonomyEntities },
    breadcrumbs,
    media: {
      heroImage: imageId
        ? { id: imageId, url: socialImageUrl!, alt: socialAlt || titleValue }
        : null,
    },
    revisions: {
      entityId: String(content.id),
      collection: 'content',
      publishedRevisionId,
      presentationRevisionId: null,
    },
    search: {
      eligible: indexable,
      bodyProjection: plainTextBody || descValue || titleValue,
      visibility: indexable ? 'public' : 'hidden',
    },
    redirect: {
      isRedirect: false,
      targetUrl: null,
      statusCode: null,
      isTombstone: content.retentionMode === 'tombstone',
    },
    schema: {
      eligible: validation.eligible,
      schemaType: validation.primaryType,
      fallbackType: validation.fallbackType,
      eligibilityReason: validation.eligibilityReason,
      validationIssues: validation.validationIssues,
      inspection,
      jsonLd: schemaGraph,
    },
    issues: [],
    social: {
      title: String(overrides.socialTitle || typeDefaults.socialTitle || titleValue),
      description:
        String(overrides.socialDescription || typeDefaults.socialDescription || descValue || '') ||
        null,
      locale: String(overrides.locale || typeDefaults.locale || settings.locale),
    },
    resolved: {
      title: {
        value: titleValue,
        source: titleSource,
        fallbackChain: [
          'seoTitle',
          'published title',
          'content title',
          'type title template',
          'site name',
        ],
        warning: warningFor('title', titleValue),
        repairField: 'seoTitle',
      },
      description: {
        value: descValue,
        source: descSource,
        fallbackChain: [
          'seoDescription',
          'published summary',
          'content summary/excerpt',
          'type default',
          'site description',
        ],
        warning: warningFor('description', descValue),
        repairField: 'seoDescription',
      },
      canonical: {
        value: canonicalUrl,
        source: canonicalCandidate ? 'explicit_override' : 'content_derived',
        fallbackChain: ['seoCanonicalURL', 'canonical path', 'site origin'],
        warning:
          canonicalTargetWarning ||
          (canonicalCandidate && canonicalUrl === publicUrl && canonicalCandidate !== publicUrl
            ? 'Unsafe, malformed, cross-site, query-bearing, or fragment canonical was replaced with the public URL.'
            : null),
        repairField: 'seoCanonicalURL',
      },
      index: {
        value: indexable,
        source:
          content.seoNoIndex === true
            ? 'explicit_override'
            : typeDefaults.index === false
              ? 'template_default'
              : 'site_default',
        fallbackChain: [
          'seoNoIndex',
          'content status/visibility',
          'content-type default',
          'site launch/indexing mode',
        ],
        warning:
          settings.launchState !== 'live' ? `Site is in ${settings.launchState} mode.` : null,
        repairField: 'seoNoIndex',
      },
      socialImage: {
        value: socialVariantUrl || socialImageUrl,
        source: socialSource || 'site_default',
        fallbackChain: [
          'discoveryOverrides.socialImage',
          'hero media',
          'published hero',
          'site default',
        ],
        warning: imageRightsWarning,
        repairField: 'heroMedia',
      },
      locale: {
        value: String(overrides.locale || typeDefaults.locale || settings.locale),
        source: overrides.locale
          ? 'explicit_override'
          : typeDefaults.locale
            ? 'template_default'
            : 'site_default',
        fallbackChain: ['content locale', 'content-type locale', 'site locale'],
        warning: warningFor(
          'locale',
          String(overrides.locale || typeDefaults.locale || settings.locale),
        ),
        repairField: 'discoveryOverrides',
      },
    },
  }

  doc.issues = auditDiscoveryDocument(doc)
  if (imageRightsWarning) {
    doc.issues.push({
      ruleId: 'DISC-RULE-08-MEDIA-RIGHTS',
      ruleVersion: '1.0.0',
      severity: 'publication_blocking',
      evidence: imageRightsWarning,
      affectedEntity: { collection: 'content', id: String(content.id) },
      affectedUrl: publicUrl,
      repairTarget: 'heroMedia',
    })
  }
  if (
    canonicalCandidate &&
    canonicalUrl === publicUrl &&
    String(canonicalCandidate) !== publicUrl
  ) {
    doc.issues.push({
      ruleId: 'DISC-RULE-09-CANONICAL-BOUNDARY',
      ruleVersion: '1.0.0',
      severity: 'publication_blocking',
      evidence:
        canonicalTargetWarning ||
        'Canonical override crossed the site boundary or contained an unsafe query, fragment, or malformed path.',
      affectedEntity: { collection: 'content', id: String(content.id) },
      affectedUrl: publicUrl,
      repairTarget: 'seoCanonicalURL',
    })
  }
  return doc
}

function buildLayoutDiscoveryDocument(input: {
  layout: Record<string, any>
  settings: ResolvedSiteSettings
  base: string
  now: Date
}): DiscoveryDocument {
  const { layout, settings, base, now } = input
  const canonicalPath = String(layout.path || '/')
  const publicUrl = new URL(canonicalPath, base).toString()
  const isPublic = canRenderPublic(layout, now)
  const isIndexable =
    isPublic &&
    settings.indexingMode !== 'noindex' &&
    settings.launchState === 'live' &&
    layout.seoNoIndex !== true

  const titleValue = layout.seoTitle || layout.name || layout.title || 'Page'
  const titleSource: DiscoverySourceProvenance = layout.seoTitle
    ? 'explicit_override'
    : 'content_derived'
  const descValue = layout.seoDescription || null
  const descSource: DiscoverySourceProvenance = layout.seoDescription
    ? 'explicit_override'
    : 'site_default'

  const siteIdentity = toSchemaSiteIdentity(settings, base)
  const breadcrumbs = [
    { name: 'Home', path: '/', url: `${base}/` },
    ...(canonicalPath !== '/' ? [{ name: titleValue, path: canonicalPath, url: publicUrl }] : []),
  ]

  const {
    graph: schemaGraph,
    validation,
    inspection,
  } = composeSchemaGraph({
    canonicalUrl: publicUrl,
    canonicalPath,
    base,
    contentType: canonicalPath === '/' ? 'home' : 'page',
    title: titleValue,
    description: descValue,
    site: siteIdentity,
    breadcrumbs: breadcrumbs.map((b) => ({ name: b.name, url: b.url })),
    dates: { publishedAt: layout.createdAt || null, modifiedAt: layout.updatedAt || null },
    indexable: isIndexable,
  })

  const doc: DiscoveryDocument = {
    publicUrl,
    canonicalUrl: publicUrl,
    canonicalPath,
    alternateLocales: {},
    indexability: {
      indexable: isIndexable,
      reason: isIndexable
        ? 'canonical'
        : !isPublic
          ? 'draft'
          : nonIndexReason(settings, 'explicit_noindex'),
      robotsDirectives: { index: isIndexable, follow: isIndexable },
    },
    title: { value: titleValue, source: titleSource },
    description: { value: descValue, source: descSource },
    socialImage: {
      url: settings.defaultSocialImageUrl ? `${base}${settings.defaultSocialImageUrl}` : null,
      alt: settings.siteName,
      source: settings.defaultSocialImageUrl ? 'site_default' : null,
      variantEligible: false,
      variantUrl: null,
    },
    contentType: 'page',
    author: null,
    publisher: {
      name: settings.siteName,
      url: base,
      logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
    },
    dates: { publishedAt: layout.createdAt || null, modifiedAt: layout.updatedAt || null },
    taxonomy: { topics: [], categories: [], tags: [] },
    breadcrumbs,
    media: {},
    revisions: {
      entityId: String(layout.id),
      collection: 'page-layouts',
      publishedRevisionId: layout.revisionId ? String(layout.revisionId) : null,
      presentationRevisionId: String(layout.id),
    },
    search: {
      eligible: isIndexable,
      bodyProjection: titleValue,
      visibility: isIndexable ? 'public' : 'hidden',
    },
    redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
    schema: {
      eligible: validation.eligible,
      schemaType: validation.primaryType,
      fallbackType: validation.fallbackType,
      eligibilityReason: validation.eligibilityReason,
      validationIssues: validation.validationIssues,
      inspection,
      jsonLd: schemaGraph,
    },
    issues: [],
  }
  doc.issues = auditDiscoveryDocument(doc)
  return doc
}

function buildPodcastShowDiscoveryDocument(input: {
  show: Record<string, any>
  settings: ResolvedSiteSettings
  base: string
  now: Date
}): DiscoveryDocument {
  const { show, settings, base, now } = input
  const canonicalPath = resolvePublicUrl(
    { kind: 'podcast', slug: String(show.slug) },
    routeTemplatesForSite(
      idOf(show.site),
      settings.semanticRouteTemplates,
      settings.semanticRouteTemplatesBySite,
    ),
  )
  const publicUrl = new URL(canonicalPath, base).toString()
  const isPublic = canRenderPublic(show, now)
  const isIndexable =
    isPublic &&
    settings.indexingMode !== 'noindex' &&
    settings.launchState === 'live' &&
    show.seoNoIndex !== true

  const titleValue = show.seoTitle || show.title
  const titleSource: DiscoverySourceProvenance = show.seoTitle
    ? 'explicit_override'
    : 'content_derived'
  const descValue = show.seoDescription || show.description || null
  const descSource: DiscoverySourceProvenance = show.seoDescription
    ? 'explicit_override'
    : 'content_derived'

  const artworkId = idOf(show.artwork)
  const artworkUrl = artworkId ? `${base}/media/${artworkId}` : null

  const feedUrl = show.rssEnabled ? `${base}${canonicalPath}/feed.xml` : null

  const siteIdentity = toSchemaSiteIdentity(settings, base)
  const breadcrumbs = [
    { name: 'Home', path: '/', url: `${base}/` },
    { name: 'Podcasts', path: '/podcasts', url: `${base}/podcasts` },
    { name: titleValue, path: canonicalPath, url: publicUrl },
  ]

  const {
    graph: schemaGraph,
    validation,
    inspection,
  } = composeSchemaGraph({
    canonicalUrl: publicUrl,
    canonicalPath,
    base,
    contentType: 'podcast-show',
    title: titleValue,
    description: descValue,
    site: siteIdentity,
    breadcrumbs: breadcrumbs.map((b) => ({ name: b.name, url: b.url })),
    image: artworkUrl ? { url: artworkUrl, alt: titleValue } : null,
    dates: {
      publishedAt: show.publishedAt || show.createdAt || null,
      modifiedAt: show.updatedAt || null,
    },
    taxonomy: {
      topics: [],
      categories: Array.isArray(show.categories) ? show.categories : [],
      tags: [],
    },
    indexable: isIndexable,
    podcastShow: {
      feedUrl: feedUrl ?? undefined,
      language: show.language || settings.locale,
    },
  })

  const doc: DiscoveryDocument = {
    publicUrl,
    canonicalUrl: publicUrl,
    canonicalPath,
    alternateLocales: {},
    indexability: {
      indexable: isIndexable,
      reason: isIndexable
        ? 'canonical'
        : !isPublic
          ? 'draft'
          : nonIndexReason(settings, 'explicit_noindex'),
      robotsDirectives: { index: isIndexable, follow: isIndexable },
    },
    title: { value: titleValue, source: titleSource },
    description: { value: descValue, source: descSource },
    socialImage: {
      url: artworkUrl,
      alt: titleValue,
      source: artworkUrl ? 'content_derived' : null,
      variantEligible: Boolean(artworkId),
      variantUrl: artworkId ? `${base}${mediaVariantUrl(artworkId, 'og', 'jpeg')}` : null,
    },
    contentType: 'podcast-show',
    author: null,
    publisher: {
      name: settings.siteName,
      url: base,
      logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
    },
    dates: {
      publishedAt: show.publishedAt || show.createdAt || null,
      modifiedAt: show.updatedAt || null,
    },
    taxonomy: {
      topics: [],
      categories: Array.isArray(show.categories) ? show.categories : [],
      tags: [],
    },
    breadcrumbs,
    media: {
      heroImage: artworkId ? { id: artworkId, url: artworkUrl!, alt: titleValue } : null,
    },
    revisions: {
      entityId: String(show.id),
      collection: 'podcast-shows',
      publishedRevisionId: null,
      presentationRevisionId: null,
    },
    search: {
      eligible: isIndexable,
      bodyProjection: `${titleValue} ${descValue ?? ''}`,
      visibility: isIndexable ? 'public' : 'hidden',
    },
    redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
    schema: {
      eligible: validation.eligible,
      schemaType: validation.primaryType,
      fallbackType: validation.fallbackType,
      eligibilityReason: validation.eligibilityReason,
      validationIssues: validation.validationIssues,
      inspection,
      jsonLd: schemaGraph,
    },
    issues: [],
  }
  doc.issues = auditDiscoveryDocument(doc)
  return doc
}

function buildPodcastEpisodeDiscoveryDocument(input: {
  episode: Record<string, any>
  settings: ResolvedSiteSettings
  base: string
  now: Date
}): DiscoveryDocument {
  const { episode, settings, base, now } = input
  const canonicalPath = resolvePublicUrl(
    { kind: 'podcast-episode', slug: String(episode.slug) },
    routeTemplatesForSite(
      idOf(episode.site),
      settings.semanticRouteTemplates,
      settings.semanticRouteTemplatesBySite,
    ),
  )
  const publicUrl = new URL(canonicalPath, base).toString()
  const isPublic = canRenderPublic(episode, now)
  const isIndexable =
    isPublic &&
    settings.indexingMode !== 'noindex' &&
    settings.launchState === 'live' &&
    episode.seoNoIndex !== true

  const titleValue = episode.seoTitle || episode.title
  const titleSource: DiscoverySourceProvenance = episode.seoTitle
    ? 'explicit_override'
    : 'content_derived'
  const descValue = episode.seoDescription || episode.description || null
  const descSource: DiscoverySourceProvenance = episode.seoDescription
    ? 'explicit_override'
    : 'content_derived'

  const artworkId = idOf(episode.artwork)
  const artworkUrl = artworkId ? `${base}/media/${artworkId}` : null

  const audioId = idOf(episode.audio)
  const audioUrl = audioId ? `${base}/media/${audioId}` : undefined

  const showObj = episode.show && typeof episode.show === 'object' ? episode.show : null
  const showSlug =
    showObj?.slug || (typeof episode.showSlug === 'string' ? episode.showSlug : undefined)
  const showTitle = showObj?.title || showObj?.name || 'Podcasts'
  const showPath = showSlug
    ? resolvePublicUrl(
        { kind: 'podcast', slug: String(showSlug) },
        routeTemplatesForSite(
          idOf(episode.site),
          settings.semanticRouteTemplates,
          settings.semanticRouteTemplatesBySite,
        ),
      )
    : null

  const siteIdentity = toSchemaSiteIdentity(settings, base)
  const breadcrumbs = [
    { name: 'Home', path: '/', url: `${base}/` },
    ...(showSlug
      ? [{ name: showTitle, path: showPath!, url: new URL(showPath!, base).toString() }]
      : [{ name: 'Podcasts', path: '/podcasts', url: `${base}/podcasts` }]),
    { name: titleValue, path: canonicalPath, url: publicUrl },
  ]

  const {
    graph: schemaGraph,
    validation,
    inspection,
  } = composeSchemaGraph({
    canonicalUrl: publicUrl,
    canonicalPath,
    base,
    contentType: 'podcast-episode',
    title: titleValue,
    description: descValue,
    site: siteIdentity,
    breadcrumbs: breadcrumbs.map((b) => ({ name: b.name, url: b.url })),
    image: artworkUrl ? { url: artworkUrl, alt: titleValue } : null,
    audio: audioUrl ? { url: audioUrl, mimeType: 'audio/mpeg' } : null,
    dates: {
      publishedAt: episode.publishedAt || episode.createdAt || null,
      modifiedAt: episode.updatedAt || null,
    },
    indexable: isIndexable,
    podcastEpisode: {
      episodeNumber: typeof episode.episodeNumber === 'number' ? episode.episodeNumber : undefined,
      seasonNumber: typeof episode.seasonNumber === 'number' ? episode.seasonNumber : undefined,
      showSlug,
      showUrl: showPath ? new URL(showPath, base).toString() : undefined,
      showTitle,
      transcriptText:
        typeof episode.transcript === 'string' && episode.transcript.trim().length > 0
          ? episode.transcript.trim()
          : undefined,
    },
  })

  const doc: DiscoveryDocument = {
    publicUrl,
    canonicalUrl: publicUrl,
    canonicalPath,
    alternateLocales: {},
    indexability: {
      indexable: isIndexable,
      reason: isIndexable
        ? 'canonical'
        : !isPublic
          ? 'draft'
          : nonIndexReason(settings, 'explicit_noindex'),
      robotsDirectives: { index: isIndexable, follow: isIndexable },
    },
    title: { value: titleValue, source: titleSource },
    description: { value: descValue, source: descSource },
    socialImage: {
      url: artworkUrl,
      alt: titleValue,
      source: artworkUrl ? 'content_derived' : null,
      variantEligible: Boolean(artworkId),
      variantUrl: artworkId ? `${base}${mediaVariantUrl(artworkId, 'og', 'jpeg')}` : null,
    },
    contentType: 'podcast-episode',
    author: null,
    publisher: {
      name: settings.siteName,
      url: base,
      logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
    },
    dates: {
      publishedAt: episode.publishedAt || episode.createdAt || null,
      modifiedAt: episode.updatedAt || null,
    },
    taxonomy: { topics: [], categories: [], tags: [] },
    breadcrumbs,
    media: {
      heroImage: artworkId ? { id: artworkId, url: artworkUrl!, alt: titleValue } : null,
      audio: audioId ? { id: audioId, url: audioUrl!, mimeType: 'audio/mpeg' } : null,
    },
    revisions: {
      entityId: String(episode.id),
      collection: 'podcast-episodes',
      publishedRevisionId: null,
      presentationRevisionId: null,
    },
    search: {
      eligible: isIndexable,
      bodyProjection: `${titleValue} ${descValue ?? ''}`,
      visibility: isIndexable ? 'public' : 'hidden',
    },
    redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
    schema: {
      eligible: validation.eligible,
      schemaType: validation.primaryType,
      fallbackType: validation.fallbackType,
      eligibilityReason: validation.eligibilityReason,
      validationIssues: validation.validationIssues,
      inspection,
      jsonLd: schemaGraph,
    },
    issues: [],
  }
  doc.issues = auditDiscoveryDocument(doc)
  return doc
}

function buildVideoDiscoveryDocument(input: {
  video: Record<string, any>
  settings: ResolvedSiteSettings
  base: string
  now: Date
}): DiscoveryDocument {
  const { video, settings, base, now } = input
  const canonicalPath = resolvePublicUrl(
    { kind: 'video', slug: String(video.slug) },
    routeTemplatesForSite(
      idOf(video.site),
      settings.semanticRouteTemplates,
      settings.semanticRouteTemplatesBySite,
    ),
  )
  const publicUrl = new URL(canonicalPath, base).toString()
  const isPublic = canRenderPublic(video, now)
  const isIndexable =
    isPublic &&
    settings.indexingMode !== 'noindex' &&
    settings.launchState === 'live' &&
    video.seoNoIndex !== true

  const titleValue = video.seoTitle || video.title
  const titleSource: DiscoverySourceProvenance = video.seoTitle
    ? 'explicit_override'
    : 'content_derived'
  const descValue = video.seoDescription || video.description || null
  const descSource: DiscoverySourceProvenance = video.seoDescription
    ? 'explicit_override'
    : 'content_derived'

  const assetId = idOf(video.videoAsset)
  const contentUrl = assetId ? `${base}/video-media/${assetId}/baseline.mp4` : undefined
  const posterUrl = assetId ? `${base}/video-media/${assetId}/poster.jpg` : undefined

  const siteIdentity = toSchemaSiteIdentity(settings, base)
  const breadcrumbs = [
    { name: 'Home', path: '/', url: `${base}/` },
    { name: 'Videos', path: '/videos', url: `${base}/videos` },
    { name: titleValue, path: canonicalPath, url: publicUrl },
  ]

  const {
    graph: schemaGraph,
    validation,
    inspection,
  } = composeSchemaGraph({
    canonicalUrl: publicUrl,
    canonicalPath,
    base,
    contentType: 'video',
    title: titleValue,
    description: descValue,
    site: siteIdentity,
    breadcrumbs: breadcrumbs.map((b) => ({ name: b.name, url: b.url })),
    image: posterUrl ? { url: posterUrl, alt: titleValue } : null,
    video: {
      contentUrl,
      posterUrl,
      duration: typeof video.duration === 'string' ? video.duration : undefined,
    },
    videoDetails: {
      uploadDate: video.publishedAt || video.createdAt || null,
      duration: typeof video.duration === 'string' ? video.duration : null,
    },
    dates: {
      publishedAt: video.publishedAt || video.createdAt || null,
      modifiedAt: video.updatedAt || null,
    },
    indexable: isIndexable,
  })

  const doc: DiscoveryDocument = {
    publicUrl,
    canonicalUrl: publicUrl,
    canonicalPath,
    alternateLocales: {},
    indexability: {
      indexable: isIndexable,
      reason: isIndexable
        ? 'canonical'
        : !isPublic
          ? 'draft'
          : nonIndexReason(settings, 'explicit_noindex'),
      robotsDirectives: { index: isIndexable, follow: isIndexable },
    },
    title: { value: titleValue, source: titleSource },
    description: { value: descValue, source: descSource },
    socialImage: {
      url:
        posterUrl ??
        (settings.defaultSocialImageUrl ? `${base}${settings.defaultSocialImageUrl}` : null),
      alt: titleValue,
      source: posterUrl
        ? 'content_derived'
        : settings.defaultSocialImageUrl
          ? 'site_default'
          : null,
      variantEligible: false,
      variantUrl: null,
    },
    contentType: 'video',
    author: null,
    publisher: {
      name: settings.siteName,
      url: base,
      logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
    },
    dates: {
      publishedAt: video.publishedAt || video.createdAt || null,
      modifiedAt: video.updatedAt || null,
    },
    taxonomy: { topics: [], categories: [], tags: [] },
    breadcrumbs,
    media: {
      video: assetId ? { id: assetId, url: contentUrl!, posterUrl } : null,
    },
    revisions: {
      entityId: String(video.id),
      collection: 'videos',
      publishedRevisionId: null,
      presentationRevisionId: null,
    },
    search: {
      eligible: isIndexable,
      bodyProjection: `${titleValue} ${descValue ?? ''} ${video.body ? String(video.body) : ''}`,
      visibility: isIndexable ? 'public' : 'hidden',
    },
    redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
    schema: {
      eligible: validation.eligible,
      schemaType: validation.primaryType,
      fallbackType: validation.fallbackType,
      eligibilityReason: validation.eligibilityReason,
      validationIssues: validation.validationIssues,
      inspection,
      jsonLd: schemaGraph,
    },
    issues: [],
  }
  doc.issues = auditDiscoveryDocument(doc)
  return doc
}

function buildGenericRecordDiscoveryDocument(input: {
  record: Record<string, any>
  collection: string
  settings: ResolvedSiteSettings
  base: string
  now: Date
}): DiscoveryDocument {
  const { record, collection, settings, base, now } = input
  const slug = typeof record.slug === 'string' ? record.slug : ''
  const semanticKind =
    (
      {
        events: 'event',
        timelines: 'timeline',
        albums: 'album',
        books: 'book',
        products: 'product',
        discussions: 'discussion',
        topics: 'topic',
      } as Record<string, SemanticKind>
    )[collection] ?? 'collection'
  let canonicalPath = '/'
  try {
    canonicalPath = resolvePublicUrl(
      {
        kind: semanticKind,
        slug,
        canonicalPath: typeof record.canonicalPath === 'string' ? record.canonicalPath : null,
        ...(collection === 'discussions' ? { forumSlug: String(record.forum?.slug ?? '') } : {}),
        ...(collection === 'timelines'
          ? { eventSlug: String(record.eventSlug ?? record.event?.slug ?? '') }
          : {}),
      } as never,
      routeTemplatesForSite(
        idOf(record.site),
        settings.semanticRouteTemplates,
        settings.semanticRouteTemplatesBySite,
      ),
    )
  } catch {
    canonicalPath = '/'
  }
  const publicUrl = new URL(canonicalPath, base).toString()
  const isPublic =
    canonicalPath !== '/' &&
    Boolean(slug || record.canonicalPath) &&
    canRenderPublic(record, now) &&
    (collection !== 'products' || record.state === 'published')
  const isIndexable =
    isPublic &&
    settings.indexingMode !== 'noindex' &&
    settings.launchState === 'live' &&
    record.seoNoIndex !== true

  const name = String(record.title ?? record.name ?? record.displayName ?? 'Publication')
  const titleValue = record.seoTitle || name
  const titleSource: DiscoverySourceProvenance = record.seoTitle
    ? 'explicit_override'
    : 'content_derived'

  const rawDesc =
    typeof record.summary === 'string'
      ? record.summary
      : typeof record.description === 'string'
        ? record.description
        : null
  const descValue = record.seoDescription || rawDesc
  const descSource: DiscoverySourceProvenance = record.seoDescription
    ? 'explicit_override'
    : rawDesc
      ? 'content_derived'
      : 'site_default'

  const kind =
    collection === 'events'
      ? 'event'
      : collection === 'timelines'
        ? 'timeline'
        : collection === 'albums'
          ? 'album'
          : collection === 'discussions'
            ? 'forum'
            : collection === 'products'
              ? 'product'
              : collection === 'topics'
                ? 'topic'
                : 'article'

  const siteIdentity = toSchemaSiteIdentity(settings, base)
  const breadcrumbs = [
    { name: 'Home', path: '/', url: `${base}/` },
    { name, path: canonicalPath, url: publicUrl },
  ]

  let customNodes: SchemaNode[] = []
  const ext = globalSchemaRegistry.getExtension(collection)
  if (ext) {
    const extResult = globalSchemaRegistry.buildExtensionNodes(collection, {
      canonicalUrl: record.seoCanonicalURL || publicUrl,
      canonicalPath,
      base,
      record,
      site: siteIdentity,
      author: record.author ? { name: String(record.author), url: null } : null,
    })
    customNodes = extResult.nodes
  }

  const {
    graph: schemaGraph,
    validation,
    inspection,
  } = composeSchemaGraph({
    canonicalUrl: record.seoCanonicalURL || publicUrl,
    canonicalPath,
    base,
    contentType: ext ? 'page' : kind === 'event' || kind === 'product' ? 'page' : 'article',
    title: titleValue,
    description: descValue,
    site: siteIdentity,
    breadcrumbs: breadcrumbs.map((b) => ({ name: b.name, url: b.url })),
    author: record.author ? { name: String(record.author), url: null } : null,
    dates: {
      publishedAt: record.publishedAt || record.createdAt || null,
      modifiedAt: record.updatedAt || null,
    },
    indexable: isIndexable,
    customNodes,
  })

  const doc: DiscoveryDocument = {
    publicUrl,
    canonicalUrl: record.seoCanonicalURL || publicUrl,
    canonicalPath,
    alternateLocales: {},
    indexability: {
      indexable: isIndexable,
      reason: isIndexable
        ? 'canonical'
        : !isPublic
          ? 'draft'
          : nonIndexReason(settings, 'explicit_noindex'),
      robotsDirectives: { index: isIndexable, follow: isIndexable },
    },
    title: { value: titleValue, source: titleSource },
    description: { value: descValue, source: descSource },
    socialImage: {
      url: settings.defaultSocialImageUrl ? `${base}${settings.defaultSocialImageUrl}` : null,
      alt: settings.siteName,
      source: settings.defaultSocialImageUrl ? 'site_default' : null,
      variantEligible: false,
      variantUrl: null,
    },
    contentType: kind,
    author: record.author ? { name: String(record.author), url: null } : null,
    publisher: {
      name: settings.siteName,
      url: base,
      logoUrl: settings.logoUrl ? `${base}${settings.logoUrl}` : null,
    },
    dates: {
      publishedAt: record.publishedAt || record.createdAt || null,
      modifiedAt: record.updatedAt || null,
    },
    taxonomy: { topics: [], categories: [], tags: [] },
    breadcrumbs,
    media: {},
    revisions: {
      entityId: String(record.id),
      collection,
      publishedRevisionId: null,
      presentationRevisionId: String(record.id),
    },
    search: {
      eligible: isIndexable,
      bodyProjection: `${name} ${descValue ?? ''}`,
      visibility: isIndexable ? 'public' : 'hidden',
    },
    redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
    schema: {
      eligible: validation.eligible,
      schemaType: validation.primaryType,
      fallbackType: validation.fallbackType,
      eligibilityReason: validation.eligibilityReason,
      validationIssues: validation.validationIssues,
      inspection,
      jsonLd: schemaGraph,
    },
    issues: [],
  }
  doc.issues = auditDiscoveryDocument(doc)
  return doc
}

// -------------------------------------------------------------------------------------------------
// OUTPUT CONVERTERS & PROJECTIONS
// -------------------------------------------------------------------------------------------------

export function discoveryToMetadata(doc: DiscoveryDocument): Metadata {
  const title = doc.title.value
  const description = doc.description.value ?? undefined
  const socialTitle = doc.social?.title || title
  const socialDescription = doc.social?.description ?? description
  const imageUrl = doc.socialImage.variantUrl
    ? doc.socialImage.variantUrl.startsWith('http')
      ? doc.socialImage.variantUrl
      : new URL(doc.socialImage.variantUrl, doc.canonicalUrl).toString()
    : (doc.socialImage.url ?? undefined)

  return {
    title,
    description,
    alternates: {
      canonical: doc.canonicalUrl,
      languages: Object.keys(doc.alternateLocales).length ? doc.alternateLocales : undefined,
    },
    robots: {
      index: doc.indexability.robotsDirectives.index,
      follow: doc.indexability.robotsDirectives.follow,
    },
    openGraph: {
      title: socialTitle,
      description: socialDescription,
      url: doc.canonicalUrl,
      siteName: doc.publisher.name,
      locale: doc.social?.locale,
      images: imageUrl
        ? [
            {
              url: imageUrl,
              alt: doc.socialImage.alt || title,
              width: 1200,
              height: 630,
            },
          ]
        : undefined,
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title: socialTitle,
      description: socialDescription,
      images: imageUrl ? [imageUrl] : undefined,
    },
  }
}

export function discoveryToJsonLd(doc: DiscoveryDocument): Record<string, unknown> {
  return doc.schema.jsonLd
}

export function discoveryToSearchDocument(doc: DiscoveryDocument): SearchDocument {
  return {
    id: doc.revisions.entityId || doc.canonicalPath,
    siteId: doc.publisher.url,
    path: doc.canonicalPath,
    title: doc.title.value,
    summary: doc.description.value,
    excerpt: doc.description.value,
    body: doc.search.bodyProjection,
    taxonomy: [...doc.taxonomy.topics, ...doc.taxonomy.categories, ...doc.taxonomy.tags].join(' '),
    status: doc.indexability.indexable ? 'published' : 'draft',
    visibility: doc.search.visibility === 'public' ? 'public' : 'private',
    updatedAt: doc.dates.modifiedAt,
  }
}

export function discoveryToSitemapEntry(
  doc: DiscoveryDocument,
): MetadataRoute.Sitemap[number] | null {
  if (!doc.indexability.indexable) return null
  return {
    url: doc.canonicalUrl,
    lastModified: doc.dates.modifiedAt ? new Date(doc.dates.modifiedAt) : new Date(),
  }
}

/** Queries all indexable discovery documents across the site for sitemap.xml and feeds. */
export async function getAllIndexableDiscoveryDocuments(
  payload: Payload,
  siteId?: string,
): Promise<DiscoveryDocument[]> {
  const settings = await resolveSiteSettings(payload)
  if (settings.indexingMode === 'noindex' || settings.launchState !== 'live') return []

  let resolvedSiteId = siteId
  if (!resolvedSiteId) {
    const publications = await payload.find({
      collection: 'publications',
      where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const pub = publications.docs[0] as unknown as Record<string, unknown> | undefined
    resolvedSiteId = idOf(pub?.site)
  }

  const documents: DiscoveryDocument[] = []

  // 1. Home
  const homeDoc = await resolveDiscoveryDocument(payload, { path: '/', siteId: resolvedSiteId })
  if (homeDoc.indexability.indexable) documents.push(homeDoc)

  // 2. Articles Archive
  const archiveDoc = await resolveDiscoveryDocument(payload, {
    path: '/articles',
    siteId: resolvedSiteId,
  })
  if (archiveDoc.indexability.indexable) documents.push(archiveDoc)

  // 3. Content (articles & pages)
  const findAll = async (collection: string, where: Record<string, unknown>, limit = 250) => {
    const docs: unknown[] = []
    let page = 1
    for (;;) {
      const result = await payload.find({
        collection,
        where,
        limit,
        page,
        depth: 1,
        overrideAccess: true,
      } as never)
      docs.push(...result.docs)
      if (!result.hasNextPage) break
      page += 1
    }
    return { docs }
  }

  const content = await findAll('content', {
    and: [
      ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
      { status: { in: ['published', 'updated'] } },
    ],
  })
    /* tolerate optional modules during bootstrap */
    .catch(() => ({ docs: [] }))

  const resolvedContentDocs = await Promise.all(
    content.docs.map((doc) =>
      resolveDiscoveryDocument(payload, {
        collection: 'content',
        record: doc as unknown as Record<string, unknown>,
        path: (doc as any).canonicalPath,
        slug: (doc as any).slug,
        siteId: resolvedSiteId,
      }),
    ),
  )

  for (const d of resolvedContentDocs) {
    if (d.indexability.indexable && d.canonicalPath !== '/' && d.canonicalPath !== '/articles') {
      documents.push(d)
    }
  }

  // 4. Page Layouts
  const layouts = await findAll('page-layouts', {
    and: [
      ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
      { status: { equals: 'published' } },
      { visibility: { equals: 'public' } },
    ],
  }).catch(() => {
    return { docs: [] }
  })

  const resolvedLayouts = await Promise.all(
    layouts.docs.map(async (layout) => {
      const layoutPath = String((layout as any).path || '')
      if (
        layoutPath &&
        layoutPath !== '/' &&
        !documents.some((d) => d.canonicalPath === layoutPath)
      ) {
        return resolveDiscoveryDocument(payload, {
          collection: 'page-layouts',
          path: layoutPath,
          record: layout as unknown as Record<string, unknown>,
          siteId: resolvedSiteId,
        })
      }
      return null
    }),
  )

  for (const d of resolvedLayouts) {
    if (d && d.indexability.indexable) documents.push(d)
  }

  // 5. Podcast Shows
  const shows = await findAll('podcast-shows', {
    and: [
      ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
      { status: { in: ['published', 'updated'] } },
    ],
  }).catch(() => ({ docs: [] }))

  const resolvedShows = await Promise.all(
    shows.docs.map((show) =>
      resolveDiscoveryDocument(payload, {
        collection: 'podcast-shows',
        slug: String((show as any).slug),
        siteId: resolvedSiteId,
      }),
    ),
  )

  for (const d of resolvedShows) {
    if (d.indexability.indexable) documents.push(d)
  }

  // 6. Podcast Episodes
  const episodes = await findAll('podcast-episodes', {
    and: [
      ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
      { status: { in: ['published', 'updated'] } },
    ],
  }).catch(() => ({ docs: [] }))

  const resolvedEpisodes = await Promise.all(
    episodes.docs.map((ep) =>
      resolveDiscoveryDocument(payload, {
        collection: 'podcast-episodes',
        slug: String((ep as any).slug),
        siteId: resolvedSiteId,
      }),
    ),
  )

  for (const d of resolvedEpisodes) {
    if (d.indexability.indexable) documents.push(d)
  }

  // 7. Videos
  const videos = await findAll('videos', {
    and: [
      ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
      { status: { equals: 'published' } },
      { visibility: { equals: 'public' } },
    ],
  }).catch(() => ({ docs: [] }))

  const resolvedVideos = await Promise.all(
    videos.docs.map((vid) =>
      resolveDiscoveryDocument(payload, {
        collection: 'videos',
        slug: String((vid as any).slug),
        siteId: resolvedSiteId,
      }),
    ),
  )

  for (const d of resolvedVideos) {
    if (d.indexability.indexable) documents.push(d)
  }

  // Resolve existing domain collections directly with the already-loaded site
  // settings. This keeps sitemap generation from reloading settings per record.
  const base =
    (resolvedSiteId && settings.canonicalOriginsBySite[resolvedSiteId]) || settings.canonicalOrigin
  const genericCollections = [
    'books',
    'events',
    'timelines',
    'albums',
    'discussions',
    'products',
    'topics',
  ]
  const availableGenericCollections = registeredOnly(payload, genericCollections)
  const genericResults = await Promise.all(
    availableGenericCollections.map(async (collection) => {
      const where: Record<string, unknown> = {
        ...(resolvedSiteId ? { site: { equals: resolvedSiteId } } : {}),
      }
      return [collection, await findAll(collection, where)] as const
    }),
  )
  const usedTopicIds = new Set(
    content.docs.flatMap((doc, index) => {
      if (!resolvedContentDocs[index]?.indexability.indexable) return []
      const topics = (doc as Record<string, unknown>).topics
      return Array.isArray(topics) ? topics.map((topic) => idOf(topic)) : []
    }),
  )
  for (const [collection, result] of genericResults) {
    for (const record of result.docs as Array<Record<string, any>>) {
      if (collection === 'topics' && !usedTopicIds.has(String(record.id))) continue
      const document = buildGenericRecordDiscoveryDocument({
        record:
          collection === 'topics'
            ? { ...record, status: 'published', visibility: 'public' }
            : record,
        collection,
        settings,
        base,
        now: new Date(),
      })
      if (document.indexability.indexable) documents.push(document)
    }
  }

  const pathCounts = new Map<string, number>()
  for (const document of documents)
    pathCounts.set(document.canonicalPath, (pathCounts.get(document.canonicalPath) ?? 0) + 1)
  return documents
    .filter((document) => pathCounts.get(document.canonicalPath) === 1)
    .sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl))
}

/** Queries all search documents projected from canonical discovery documents. */
export async function getAllSearchDocuments(
  payload: Payload,
  siteId?: string,
): Promise<SearchDocument[]> {
  const docs = await getAllIndexableDiscoveryDocuments(payload, siteId)
  return docs.filter((d) => d.search.eligible).map((d) => discoveryToSearchDocument(d))
}
