import { describe, expect, it } from 'vitest'

import {
  ARTICLE_FAMILY_PERSISTENCE_BOUNDARY,
  MARKDOWN_FIDELITY_BOUNDARY,
  analyzeMarkdownFidelity,
  assertArticleFamilyContent,
  assertArticleFamilyPersistenceBoundary,
  assertMarkdownImportReport,
  assertRichTextDocument,
  createMarkdownImportReport,
  hashMarkdownSource,
  hashRichTextDocument,
  type ArticleFamilyContent,
  type RichTextDocument,
} from '../../src/modules/editorial/contracts'

const documentPayload = {
  root: { children: [{ text: 'A sourced editorial draft.', type: 'paragraph' }], type: 'root' },
}
const richTextDocument: RichTextDocument = {
  format: 'payload-lexical',
  schemaVersion: 1,
  document: documentPayload,
  canonicalHash: hashRichTextDocument(documentPayload),
  plainTextProjection: 'A sourced editorial draft.',
  unknownNodePolicy: 'preserve',
}

const article: ArticleFamilyContent = {
  id: '550e8400-e29b-41d4-a716-446655440101' as ArticleFamilyContent['id'],
  contentId: '550e8400-e29b-41d4-a716-446655440102' as ArticleFamilyContent['contentId'],
  tenantId: '550e8400-e29b-41d4-a716-446655440103' as ArticleFamilyContent['tenantId'],
  siteId: '550e8400-e29b-41d4-a716-446655440104' as ArticleFamilyContent['siteId'],
  brandId: null,
  publicationId: '550e8400-e29b-41d4-a716-446655440105' as ArticleFamilyContent['publicationId'],
  spaceId: null,
  ownerMemberId: null,
  lifecycle: 'draft',
  document: richTextDocument,
  retentionPolicy: null,
  seo: {
    title: null,
    description: null,
    canonicalURL: null,
    imageAlt: null,
    keywords: [],
    focusKeyphrase: null,
    noIndex: true,
  },
  structuredDataSource: {
    mode: 'none',
    primaryType: null,
    sourceCollection: 'content',
    sourceIdentifier: null,
    manualPayload: null,
    version: 1,
  },
  importExportHooks: {
    importSourceSystem: null,
    importSourceIdentifier: null,
    importSourceChecksum: null,
    exportFormatVersion: 1,
    exportOwnership: { module: 'editorial.m04' },
  },
  ownership: {
    moduleKey: 'editorial.m04',
    migrationOwner: 'editorial.m04',
    rollbackPolicy: 'review-required',
    exportFormatVersion: 1,
    exportOwnership: 'editorial.m04',
  },
  createdAt: '2026-08-17T00:00:00.000Z',
  createdBy: null,
  updatedAt: '2026-08-17T00:00:00.000Z',
  updatedBy: null,
  correlationId: 'm04-a-contract-test',
  deletedAt: null,
  deletedBy: null,
}

describe('M04-A editorial contracts', () => {
  it('uses deterministic structured-document hashes independent of object key order', () => {
    expect(hashRichTextDocument({ root: { type: 'root', children: [] } })).toBe(
      hashRichTextDocument({ root: { children: [], type: 'root' } }),
    )
  })

  it('rejects rendered HTML and tampered structured documents as the canonical source', () => {
    expect(() =>
      assertRichTextDocument({ ...richTextDocument, document: { html: '<p>not canonical</p>' } }),
    ).toThrow('Rendered HTML')
    expect(() =>
      assertRichTextDocument({ ...richTextDocument, canonicalHash: 'sha256:tampered' }),
    ).toThrow('canonicalHash')
  })

  it('requires preserved scope, retention/SEO hooks, and editorial migration/export ownership', () => {
    expect(() => assertArticleFamilyContent(article)).not.toThrow()
    expect(() =>
      assertArticleFamilyContent({
        ...article,
        ownership: { ...article.ownership, migrationOwner: 'other.module' as 'editorial.m04' },
      }),
    ).toThrow('migration ownership')
    expect(() =>
      assertArticleFamilyContent({
        ...article,
        importExportHooks: {
          ...article.importExportHooks,
          exportOwnership: { module: 'other.module' },
        },
      }),
    ).toThrow('export ownership')
  })
})
describe('M04-B Markdown fidelity and article-family persistence boundary', () => {
  it('accepts supported Markdown without warning and records the exact source checksum', () => {
    const markdown =
      '# Heading\n\nA paragraph with **strong** text and [a link](https://example.test).'
    const analysis = analyzeMarkdownFidelity(markdown)

    expect(analysis.status).toBe('accepted')
    expect(analysis.sourceChecksum).toBe(hashMarkdownSource(markdown))
    expect(analysis.warnings).toEqual([])
    expect(analysis.boundary).toBe(MARKDOWN_FIDELITY_BOUNDARY)
  })

  it('preserves unsupported Markdown constructs with explicit warnings instead of silent loss', () => {
    const markdown = [
      '# Source draft',
      '',
      '<aside>HTML callout</aside>',
      '',
      '| claim | source |',
      '| --- | --- |',
      '| one | two |',
      '',
      'A footnote reference[^1].',
      '',
      '[^1]: Footnote text.',
    ].join('\n')

    const report = createMarkdownImportReport({
      id: '550e8400-e29b-41d4-a716-446655440201' as ReturnType<
        typeof createMarkdownImportReport
      >['id'],
      articleId: null,
      sourceMarkdown: markdown,
      targetDocument: richTextDocument,
      createdBy: null,
      createdAt: '2026-08-18T00:00:00.000Z',
    })

    expect(report.status).toBe('accepted-with-warnings')
    expect(report.targetDocumentHash).toBe(richTextDocument.canonicalHash)
    expect(report.warnings.map((warning) => warning.code)).toEqual([
      'markdown.raw_html_preserved',
      'markdown.table_preserved',
      'markdown.footnote_preserved',
    ])
    expect(report.unsupportedConstructs.map((construct) => construct.kind)).toEqual([
      'raw-html',
      'table',
      'footnote',
    ])
    expect(
      report.unsupportedConstructs.every((construct) => construct.preservation === 'source-slice'),
    ).toBe(true)
    expect(() => assertMarkdownImportReport(report)).not.toThrow()
  })

  it('keeps M04-B persistence additive and defers revision/workflow collections', () => {
    expect(() =>
      assertArticleFamilyPersistenceBoundary(ARTICLE_FAMILY_PERSISTENCE_BOUNDARY),
    ).not.toThrow()
    expect(ARTICLE_FAMILY_PERSISTENCE_BOUNDARY.existingCollection).toBe('content')
    expect(ARTICLE_FAMILY_PERSISTENCE_BOUNDARY.plannedCollections).toEqual([
      'article-family-content',
      'markdown-conversion-reports',
    ])
    expect(ARTICLE_FAMILY_PERSISTENCE_BOUNDARY.deferredCollections).toContain('revision-records')
    expect(ARTICLE_FAMILY_PERSISTENCE_BOUNDARY.deferredCollections).toContain(
      'scheduled-publish-jobs',
    )
  })
})
