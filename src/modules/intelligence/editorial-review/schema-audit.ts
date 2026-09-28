/**
 * Renegade CMoS Content Intelligence - JSON-LD Schema Audit & Anti-Fabrication Engine
 *
 * Audits existing structured data against canonical page facts, identifies missing
 * or inconsistent schema, strictly prevents fabrication of authors, ratings, dates,
 * or organizations, and generates safe schema correction proposals.
 */

import { randomUUID } from 'node:crypto'
import type {
  AntiFabricationCheck,
  SchemaAuditIssue,
  SchemaAuditResult,
  SchemaProposal,
} from './contracts'

export interface CanonicalDocFacts {
  id: string
  revision: string
  title: string
  canonicalUrl: string
  publishedAt?: string | null
  updatedAt?: string | null
  summary?: string | null
  authors?: Array<{ name: string; url?: string | null }>
  heroImageUrl?: string | null
  section?: string | null
  topics?: string[]
  pageType?: string
  hasVerifiedReviews?: boolean
}

export interface SiteIdentityFacts {
  name: string
  url: string
  legalName?: string | null
  logoUrl?: string | null
  sameAs?: string[]
}

/**
 * Audits current JSON-LD against page type and canonical verified document facts.
 */
export function auditJsonLdSchema(params: {
  pageType: string
  currentJsonLd: Record<string, unknown>
  docFacts: CanonicalDocFacts
  siteFacts: SiteIdentityFacts
}): SchemaAuditResult {
  const { pageType, currentJsonLd, docFacts, siteFacts } = params
  const issues: SchemaAuditIssue[] = []
  const missingFields: string[] = []
  const inconsistentFields: string[] = []

  // Extract graph nodes if @graph format is used, else treat as single object
  const graphNodes = Array.isArray(currentJsonLd?.['@graph'])
    ? (currentJsonLd['@graph'] as Array<Record<string, unknown>>)
    : [currentJsonLd]

  // Find primary node matching target pageType (or first Article/WebPage)
  const primaryNode =
    graphNodes.find(
      (n) =>
        String(n?.['@type']).toLowerCase() === pageType.toLowerCase() ||
        (pageType === 'Article' && String(n?.['@type']).toLowerCase().includes('article')),
    ) ||
    graphNodes[0] ||
    {}

  // 1. Check Missing Required Fields for Article/BlogPosting
  if (['Article', 'BlogPosting', 'NewsArticle'].includes(pageType)) {
    if (!primaryNode.headline) {
      missingFields.push('headline')
      issues.push({
        field: 'headline',
        severity: 'critical',
        code: 'missing_required_field',
        message: 'Schema Article is missing required headline property.',
        suggestedValue: docFacts.title,
      })
    }
    if (!primaryNode.author) {
      missingFields.push('author')
      issues.push({
        field: 'author',
        severity: 'critical',
        code: 'missing_required_field',
        message: 'Schema Article is missing author property.',
        suggestedValue: docFacts.authors?.[0]?.name
          ? { '@type': 'Person', name: docFacts.authors[0].name }
          : undefined,
      })
    }
    if (!primaryNode.datePublished) {
      missingFields.push('datePublished')
      issues.push({
        field: 'datePublished',
        severity: 'warning',
        code: 'missing_recommended_field',
        message: 'Missing datePublished for article temporal indexing.',
        suggestedValue: docFacts.publishedAt || undefined,
      })
    }
    if (!primaryNode.image && docFacts.heroImageUrl) {
      missingFields.push('image')
      issues.push({
        field: 'image',
        severity: 'warning',
        code: 'missing_recommended_field',
        message: 'Missing image object for Google Discover / rich snippet eligibility.',
        suggestedValue: docFacts.heroImageUrl,
      })
    }
    if (!primaryNode.publisher) {
      missingFields.push('publisher')
      issues.push({
        field: 'publisher',
        severity: 'critical',
        code: 'missing_required_field',
        message: 'Schema Article is missing publisher Organization property.',
        suggestedValue: { '@type': 'Organization', name: siteFacts.name, url: siteFacts.url },
      })
    }
  }

  // 2. Check Inconsistencies against canonical facts
  if (primaryNode.headline && primaryNode.headline !== docFacts.title) {
    inconsistentFields.push('headline')
    issues.push({
      field: 'headline',
      severity: 'warning',
      code: 'inconsistent_value',
      message: `Schema headline ('${primaryNode.headline}') does not match canonical document title ('${docFacts.title}').`,
      currentValue: primaryNode.headline,
      suggestedValue: docFacts.title,
    })
  }

  if (primaryNode.url && docFacts.canonicalUrl && primaryNode.url !== docFacts.canonicalUrl) {
    inconsistentFields.push('url')
    issues.push({
      field: 'url',
      severity: 'warning',
      code: 'inconsistent_value',
      message: `Schema url ('${primaryNode.url}') differs from canonical path ('${docFacts.canonicalUrl}').`,
      currentValue: primaryNode.url,
      suggestedValue: docFacts.canonicalUrl,
    })
  }

  // 3. Strict Anti-Fabrication Auditing
  const antiFabrication = checkAntiFabrication(primaryNode, docFacts, siteFacts)
  for (const unsupported of antiFabrication.unsupportedFields) {
    issues.push({
      field: unsupported.field,
      severity: 'critical',
      code: 'fabricated_field_detected',
      message: unsupported.reason,
      currentValue: unsupported.attemptedValue,
    })
  }

  const isEligibleForRichSnippet =
    issues.filter((i) => i.severity === 'critical').length === 0 && antiFabrication.passed

  return {
    contentId: docFacts.id,
    contentRevision: docFacts.revision,
    pageType,
    canonicalUrl: docFacts.canonicalUrl,
    currentJsonLd,
    eligibleSchemaTypes: ['Article', 'BreadcrumbList', 'WebPage', 'Organization'],
    missingFields,
    inconsistentFields,
    issues,
    antiFabrication,
    isEligibleForRichSnippet,
    auditedAt: new Date().toISOString(),
  }
}

/**
 * Checks for fabricated or hallucinated schema elements (e.g. unverified aggregate ratings,
 * invented author names, hallucinated dates, ungrounded organization credentials).
 */
export function checkAntiFabrication(
  schemaNode: Record<string, unknown>,
  docFacts: CanonicalDocFacts,
  siteFacts: SiteIdentityFacts,
): AntiFabricationCheck {
  const unsupportedFields: AntiFabricationCheck['unsupportedFields'] = []

  // Check 1: Fabricated AggregateRating / Review
  if (schemaNode.aggregateRating || schemaNode.review) {
    if (!docFacts.hasVerifiedReviews) {
      unsupportedFields.push({
        field: 'aggregateRating',
        reason:
          'Fabricated rating detected: Page has no verified customer reviews or commerce rating backing. Emitting aggregateRating violates Google Webmaster guidelines.',
        attemptedValue: schemaNode.aggregateRating || schemaNode.review,
      })
    }
  }

  // Check 2: Fabricated Author
  let authorVerified = true
  if (schemaNode.author) {
    const authorName =
      typeof schemaNode.author === 'string'
        ? schemaNode.author
        : typeof (schemaNode.author as Record<string, unknown>)?.name === 'string'
          ? ((schemaNode.author as Record<string, unknown>).name as string)
          : null

    const validAuthorNames = (docFacts.authors || []).map((a) => a.name.toLowerCase().trim())
    if (authorName) {
      const match = validAuthorNames.some(
        (vn) => vn === authorName.toLowerCase().trim() || vn.includes(authorName.toLowerCase()),
      )
      if (!match && validAuthorNames.length > 0) {
        authorVerified = false
        unsupportedFields.push({
          field: 'author',
          reason: `Fabricated author detected: '${authorName}' does not match any verified author associated with this document.`,
          attemptedValue: schemaNode.author,
        })
      }
    }
  }

  // Check 3: Fabricated Dates
  let datesVerified = true
  if (schemaNode.datePublished && docFacts.publishedAt) {
    const nodeDate = new Date(String(schemaNode.datePublished)).toISOString().split('T')[0]
    const docDate = new Date(docFacts.publishedAt).toISOString().split('T')[0]
    if (nodeDate !== docDate) {
      datesVerified = false
      unsupportedFields.push({
        field: 'datePublished',
        reason: `Fabricated publication date: Schema date '${nodeDate}' does not match canonical publishing record '${docDate}'.`,
        attemptedValue: schemaNode.datePublished,
      })
    }
  }

  // Check 4: Fabricated Publisher
  let publisherVerified = true
  if (schemaNode.publisher) {
    const pubName =
      typeof schemaNode.publisher === 'string'
        ? schemaNode.publisher
        : typeof (schemaNode.publisher as Record<string, unknown>)?.name === 'string'
          ? ((schemaNode.publisher as Record<string, unknown>).name as string)
          : null

    if (pubName && pubName.toLowerCase() !== siteFacts.name.toLowerCase()) {
      publisherVerified = false
      unsupportedFields.push({
        field: 'publisher',
        reason: `Publisher '${pubName}' is unverified; does not match site identity '${siteFacts.name}'.`,
        attemptedValue: schemaNode.publisher,
      })
    }
  }

  return {
    passed: unsupportedFields.length === 0,
    unsupportedFields,
    verifiedGrounding: {
      authorVerified,
      publisherVerified,
      datesVerified,
      ratingsVerified: !schemaNode.aggregateRating || Boolean(docFacts.hasVerifiedReviews),
      organizationVerified: publisherVerified,
    },
  }
}

/**
 * Generates a clean, validated schema proposal repairing missing and inconsistent fields
 * using ONLY verified canonical document facts without fabrication.
 */
export function generateSchemaProposal(params: {
  audit: SchemaAuditResult
  docFacts: CanonicalDocFacts
  siteFacts: SiteIdentityFacts
  proposedBy?: string
}): SchemaProposal {
  const { audit, docFacts, siteFacts, proposedBy } = params
  const additions: Record<string, unknown> = {}
  const corrections: Record<string, { from: unknown; to: unknown }> = {}
  const removals: string[] = []

  // Clone base or build coherent schema graph
  const verifiedHeadline = docFacts.title
  const verifiedUrl = docFacts.canonicalUrl
  const verifiedAuthor =
    docFacts.authors && docFacts.authors.length > 0
      ? {
          '@type': 'Person',
          name: docFacts.authors[0].name,
          ...(docFacts.authors[0].url ? { url: docFacts.authors[0].url } : {}),
        }
      : undefined

  const verifiedPublisher = {
    '@type': 'Organization',
    name: siteFacts.name,
    url: siteFacts.url,
    ...(siteFacts.logoUrl ? { logo: siteFacts.logoUrl } : {}),
  }

  // Handle removals of any fabricated fields
  for (const issue of audit.issues) {
    if (issue.code === 'fabricated_field_detected') {
      removals.push(issue.field)
    }
  }

  // Construct proposed Article node with strict grounding
  const proposedNode: Record<string, unknown> = {
    '@type': audit.pageType || 'Article',
    '@id': `${verifiedUrl}#${audit.pageType.toLowerCase()}`,
    url: verifiedUrl,
    headline: verifiedHeadline,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${verifiedUrl}#webpage`,
    },
    publisher: verifiedPublisher,
    inLanguage: 'en-US',
  }

  if (docFacts.summary) proposedNode.description = docFacts.summary
  if (docFacts.publishedAt) proposedNode.datePublished = docFacts.publishedAt
  if (docFacts.updatedAt) proposedNode.dateModified = docFacts.updatedAt
  if (verifiedAuthor) proposedNode.author = verifiedAuthor
  if (docFacts.heroImageUrl) {
    proposedNode.image = {
      '@type': 'ImageObject',
      '@id': `${verifiedUrl}#primaryimage`,
      url: docFacts.heroImageUrl,
    }
  }
  if (docFacts.section) proposedNode.articleSection = docFacts.section
  if (docFacts.topics && docFacts.topics.length > 0)
    proposedNode.keywords = docFacts.topics.join(', ')

  // Identify additions & corrections compared to current JSON-LD
  const current = audit.currentJsonLd
  for (const [k, v] of Object.entries(proposedNode)) {
    if (current[k] === undefined) {
      additions[k] = v
    } else if (JSON.stringify(current[k]) !== JSON.stringify(v)) {
      corrections[k] = { from: current[k], to: v }
    }
  }

  const proposedJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    ...proposedNode,
  }

  // Remove any flagged fabricated fields
  for (const rem of removals) {
    delete proposedJsonLd[rem]
  }

  const antiFabCheck = checkAntiFabrication(proposedJsonLd, docFacts, siteFacts)

  return {
    id: `proposal-${randomUUID().slice(0, 8)}`,
    contentId: docFacts.id,
    contentRevision: docFacts.revision,
    pageType: audit.pageType,
    proposedJsonLd,
    additions,
    corrections,
    removals,
    validationStatus: antiFabCheck.passed ? 'valid' : 'invalid',
    issues: antiFabCheck.passed ? [] : audit.issues,
    antiFabricationPassed: antiFabCheck.passed,
    status: 'pending_review',
    proposedBy: proposedBy || 'schema-audit-engine',
    proposedAt: new Date().toISOString(),
  }
}
