import { describe, expect, it } from 'vitest'

import {
  auditDiscoveryDocument,
  deriveBodyDescription,
  discoveryToMetadata,
  DESCRIPTION_BODY_SNIPPET_TARGET,
  type DiscoveryDocument,
} from '../../src/modules/public/discovery'

/**
 * SEO 1.0 final-pass contracts:
 * - F2: deterministic body-derived description fallback (deriveBodyDescription)
 * - F4: DISC-RULE-10-CANONICAL-ORIGIN audit rule (loopback canonical hosts)
 * - F3: site verification tokens projected into Next metadata (homepage doc)
 *
 * The siteVerification token sanitization in resolveSiteSettings is a
 * non-exported closure over a DB-backed resolver, so it is not unit-tested
 * here; it is covered by live proof instead.
 */

const baseDoc: DiscoveryDocument = {
  publicUrl: 'https://example.test/articles/renegade-guide',
  canonicalUrl: 'https://example.test/articles/renegade-guide',
  canonicalPath: '/articles/renegade-guide',
  alternateLocales: {},
  indexability: {
    indexable: true,
    reason: 'canonical',
    robotsDirectives: { index: true, follow: true },
  },
  title: { value: 'The Renegade Guide', source: 'explicit_override' },
  description: { value: 'A comprehensive handbook.', source: 'content_derived' },
  socialImage: { url: null, alt: null, source: null, variantEligible: false, variantUrl: null },
  contentType: 'article',
  author: { name: 'Elena Rostova', url: 'https://example.test/authors/elena' },
  publisher: { name: 'Renegade Media', url: 'https://example.test', logoUrl: null },
  dates: { publishedAt: '2026-09-01T12:00:00.000Z', modifiedAt: '2026-09-10T14:30:00.000Z' },
  taxonomy: { topics: [], categories: [], tags: [] },
  breadcrumbs: [{ name: 'Home', path: '/', url: 'https://example.test/' }],
  media: {},
  revisions: {
    entityId: 'content-101',
    collection: 'content',
    publishedRevisionId: 'rev-202',
    presentationRevisionId: 'content-101',
  },
  search: { eligible: true, bodyProjection: 'Body projection.', visibility: 'public' },
  redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
  schema: {
    eligible: true,
    schemaType: 'Article',
    jsonLd: { '@context': 'https://schema.org', '@graph': [{ '@type': 'Article' }] },
  },
  issues: [],
}

describe('SEO10 F2 — deriveBodyDescription', () => {
  it('returns null for missing, non-string, empty, and whitespace-only input', () => {
    expect(deriveBodyDescription(null)).toBeNull()
    expect(deriveBodyDescription(undefined)).toBeNull()
    expect(deriveBodyDescription(42)).toBeNull()
    expect(deriveBodyDescription({ text: 'nope' })).toBeNull()
    expect(deriveBodyDescription('')).toBeNull()
    expect(deriveBodyDescription('   \n\t  ')).toBeNull()
  })

  it('strips residual HTML markup', () => {
    expect(deriveBodyDescription('<p>Hello <strong>world</strong> again</p>')).toBe(
      'Hello world again',
    )
  })

  it('collapses runs of whitespace into single spaces', () => {
    expect(deriveBodyDescription('Alpha  beta\n\n gamma\t\tdelta')).toBe('Alpha beta gamma delta')
  })

  it('returns short text whole, without an ellipsis', () => {
    const short = 'A short body that needs no derivation tricks.'
    expect(deriveBodyDescription(short)).toBe(short)
  })

  it('cuts long text at a word boundary with an ellipsis inside the bound', () => {
    const long = 'abcdefghij '.repeat(30).trim()
    const derived = deriveBodyDescription(long)
    expect(derived).not.toBeNull()
    expect(derived!.endsWith('…')).toBe(true)
    // The character before the ellipsis completes a whole word — no mid-word cut.
    expect(derived!.endsWith('abcdefghij…')).toBe(true)
    expect(derived!.length).toBeLessThanOrEqual(171)
    expect(derived!.length).toBeLessThanOrEqual(DESCRIPTION_BODY_SNIPPET_TARGET + 1)
  })

  it('is deterministic — same input, same output', () => {
    const input = '<p>Deterministic   fallback text</p> that repeats and repeats and repeats.'
    expect(deriveBodyDescription(input)).toBe(deriveBodyDescription(input))
  })
})

describe('SEO10 F4 — DISC-RULE-10-CANONICAL-ORIGIN', () => {
  const rule10 = (doc: DiscoveryDocument) =>
    auditDiscoveryDocument(doc).find((i) => i.ruleId === 'DISC-RULE-10-CANONICAL-ORIGIN')

  it('flags an indexable document canonicalizing to localhost', () => {
    const doc: DiscoveryDocument = {
      ...baseDoc,
      publicUrl: 'https://localhost/articles/renegade-guide',
      canonicalUrl: 'https://localhost/articles/renegade-guide',
    }
    const issue = rule10(doc)
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
  })

  it('flags an indexable document canonicalizing to 127.0.0.1', () => {
    const doc: DiscoveryDocument = {
      ...baseDoc,
      publicUrl: 'http://127.0.0.1:3000/articles/renegade-guide',
      canonicalUrl: 'http://127.0.0.1:3000/articles/renegade-guide',
    }
    expect(rule10(doc)).toBeDefined()
  })

  it('does not flag an indexable document on a public host', () => {
    expect(rule10(baseDoc)).toBeUndefined()
  })

  it('does not flag a non-indexable document even with a loopback canonical', () => {
    const doc: DiscoveryDocument = {
      ...baseDoc,
      publicUrl: 'https://localhost/articles/renegade-guide',
      canonicalUrl: 'https://localhost/articles/renegade-guide',
      indexability: {
        indexable: false,
        reason: 'explicit_noindex',
        robotsDirectives: { index: false, follow: false },
      },
    }
    expect(rule10(doc)).toBeUndefined()
  })
})

describe('SEO10 F3 — verification tokens in metadata', () => {
  it('emits google and bing (msvalidate.01) verification from the document', () => {
    const doc: DiscoveryDocument = {
      ...baseDoc,
      verification: { google: 'google-token-123', bing: 'BINGTOKEN456' },
    }
    const metadata = discoveryToMetadata(doc)
    expect(metadata.verification?.google).toBe('google-token-123')
    expect(metadata.verification?.other?.['msvalidate.01']).toBe('BINGTOKEN456')
  })

  it('emits no verification block when the document carries no tokens', () => {
    const metadata = discoveryToMetadata(baseDoc)
    expect(metadata.verification).toBeUndefined()
  })

  it('never leaks verification into robots-only metadata for non-public documents', () => {
    const doc: DiscoveryDocument = {
      ...baseDoc,
      verification: { google: 'google-token-123', bing: 'BINGTOKEN456' },
      indexability: {
        indexable: false,
        reason: 'draft',
        robotsDirectives: { index: false, follow: false },
      },
    }
    const metadata = discoveryToMetadata(doc)
    expect(metadata).toEqual({ robots: { index: false, follow: false } })
    expect(metadata.verification).toBeUndefined()
  })
})
