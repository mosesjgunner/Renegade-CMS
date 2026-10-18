import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SafeRichText } from '@/modules/editorial/RichText'
import {
  extractPlainText,
  estimateReadingTimeMinutes,
  buildTableOfContents,
} from '@/modules/editorial/presentation'
import {
  hashRichTextDocument,
  type RichTextDocument,
} from '@/modules/editorial/contracts'
import { hashPreviewToken } from '@/modules/editorial/persistence'
import { EditorialWorkflow } from '@/modules/editorial/workflow'
import { canRenderPublic, canDiscoverPublic } from '@/modules/public/contracts'
import { discoveryToMetadata, type DiscoveryDocument } from '@/modules/public/discovery'
import { getIsLocked } from '../../node_modules/@payloadcms/next/dist/views/Document/getIsLocked.js'
import { checkDocumentLockStatus } from '../../node_modules/payload/dist/utilities/checkDocumentLockStatus.js'

describe('03B / Lexical Rich-Text & Formatting Invariants', () => {
  it('renders standard headings, lists, quotes, inline formats and links safely', () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: 'Main Editorial Heading' }],
          },
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Standard paragraph with ' },
              { type: 'text', text: 'bold formatting', format: 1 },
              { type: 'text', text: ', ' },
              { type: 'text', text: 'italic emphasis', format: 2 },
              { type: 'text', text: ', ' },
              { type: 'text', text: 'inline code', format: 16 },
              { type: 'text', text: ', and a ' },
              {
                type: 'link',
                url: 'https://example.com/guide',
                children: [{ type: 'text', text: 'safe external reference' }],
              },
              { type: 'text', text: '.' },
            ],
          },
          {
            type: 'quote',
            children: [{ type: 'text', text: 'A verified quote from the author.' }],
          },
          {
            type: 'list',
            listType: 'bullet',
            children: [
              { type: 'listitem', children: [{ type: 'text', text: 'First bullet point' }] },
              { type: 'listitem', children: [{ type: 'text', text: 'Second bullet point' }] },
            ],
          },
          { type: 'horizontalrule' },
        ],
      },
    }

    const html = renderToStaticMarkup(<SafeRichText document={doc} />)
    expect(html).toContain('<h2 tabindex="-1">Main Editorial Heading</h2>')
    expect(html).toContain('<strong>bold formatting</strong>')
    expect(html).toContain('<em>italic emphasis</em>')
    expect(html).toContain('<code>inline code</code>')
    expect(html).toContain('<a href="https://example.com/guide" rel="noreferrer">safe external reference</a>')
    expect(html).toContain('<blockquote>A verified quote from the author.</blockquote>')
    expect(html).toContain('<ul><li>First bullet point</li><li>Second bullet point</li></ul>')
    expect(html).toContain('<hr/>')
  })

  it('renders embedded blocks, upload images, and relationship embeds', () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'upload',
            relationTo: 'media-assets',
            value: {
              id: 'media-uuid-1',
              url: '/media/media-uuid-1',
              altText: 'Hero landscape photography',
            },
            fields: { caption: 'Figure 1: Landscape in spring' },
          },
          {
            type: 'block',
            fields: {
              blockType: 'callout',
              title: 'Important Note',
              text: 'This is an important editorial announcement block.',
            },
          },
          {
            type: 'relationship',
            relationTo: 'media-assets',
            value: {
              id: 'media-uuid-2',
              url: '/media/media-uuid-2',
              altText: 'Related chart diagram',
            },
          },
          {
            type: 'relationship',
            relationTo: 'content',
            value: {
              id: 'content-uuid-9',
              title: 'Sister Investigation Report',
            },
          },
        ],
      },
    }

    const html = renderToStaticMarkup(<SafeRichText document={doc} />)
    // Upload image with caption
    expect(html).toContain('<img src="/media/media-uuid-1" alt="Hero landscape photography"')
    expect(html).toContain('Figure 1: Landscape in spring')
    // Callout block
    expect(html).toContain('data-block-type="callout"')
    expect(html).toContain('Important Note')
    expect(html).toContain('This is an important editorial announcement block.')
    // Relationship media image
    expect(html).toContain('<img src="/media/media-uuid-2" alt="Related chart diagram"')
    // Relationship content link
    expect(html).toContain('content:')
    expect(html).toContain('Sister Investigation Report')
  })

  it('strips dangerous href protocols (javascript:, data:) from rich-text links', () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                url: 'javascript:alert(1)',
                children: [{ type: 'text', text: 'malicious link' }],
              },
              {
                type: 'link',
                url: 'data:text/html,<script>alert(1)</script>',
                children: [{ type: 'text', text: 'data link' }],
              },
            ],
          },
        ],
      },
    }

    const html = renderToStaticMarkup(<SafeRichText document={doc} />)
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:text')
    expect(html).toContain('malicious link')
    expect(html).toContain('data link')
  })
})

describe('03B / Plain-text Extraction & Presentation Projections', () => {
  it('correctly calculates plain text, reading time, and table of contents', () => {
    const rawBody = {
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: 'Introduction to Investigations' }],
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'This is a comprehensive overview of our findings across sixty words of text for testing reading duration calculation accuracy accurately.',
              },
            ],
          },
          {
            type: 'heading',
            tag: 'h3',
            children: [{ type: 'text', text: 'Detailed Analysis' }],
          },
        ],
      },
    }

    const text = extractPlainText(rawBody)
    expect(text).toContain('Introduction to Investigations')
    expect(text).toContain('Detailed Analysis')

    const readingTime = estimateReadingTimeMinutes(text)
    expect(readingTime).toBeGreaterThanOrEqual(1)

    const toc = buildTableOfContents(rawBody)
    expect(toc).toHaveLength(2)
    expect(toc[0]).toEqual({
      id: 'introduction-to-investigations',
      level: 2,
      text: 'Introduction to Investigations',
    })
    expect(toc[1]).toEqual({
      id: 'detailed-analysis',
      level: 3,
      text: 'Detailed Analysis',
    })
  })
})

describe('03B / Workflow Revisions & Restoration Invariants', () => {
  it('preserves immutable revision history and links restoredFromRevision on restore', () => {
    const initialBody = { root: { type: 'root', children: [{ type: 'text', text: 'Initial Draft Body' }] } }
    const doc1: RichTextDocument = {
      format: 'payload-lexical',
      schemaVersion: 1,
      document: initialBody,
      canonicalHash: hashRichTextDocument(initialBody),
      plainTextProjection: 'Initial Draft Body',
      unknownNodePolicy: 'preserve',
    }

    const workflow = new EditorialWorkflow({
      articleId: 'article-alpha-1',
      document: doc1,
      author: { id: 'author-user-1', role: 'author' },
      now: '2026-10-18T00:00:00.000Z',
    })

    expect(workflow.article.revisions).toHaveLength(1)
    expect(workflow.article.revisions[0].sequence).toBe(1)
    expect(workflow.article.status).toBe('draft')

    // Edit 1: Author modifies the article
    const updatedBody = { root: { type: 'root', children: [{ type: 'text', text: 'Revised Article Body with Updates' }] } }
    const doc2: RichTextDocument = {
      format: 'payload-lexical',
      schemaVersion: 1,
      document: updatedBody,
      canonicalHash: hashRichTextDocument(updatedBody),
      plainTextProjection: 'Revised Article Body with Updates',
      unknownNodePolicy: 'preserve',
    }

    workflow.saveDraft({
      actor: { id: 'author-user-1', role: 'author' },
      document: doc2,
      baseRevisionId: workflow.article.currentRevisionId,
      mutationId: 'mut-author-edit-1',
      now: '2026-10-18T00:10:00.000Z',
    })

    expect(workflow.article.revisions).toHaveLength(2)
    expect(workflow.article.revisions[1].sequence).toBe(2)
    expect(workflow.article.revisions[1].parentRevisionId).toBe(workflow.article.revisions[0].id)
    expect(workflow.article.currentRevisionId).toBe(workflow.article.revisions[1].id)

    // Restore: Editor restores revision 1
    const revision1Id = workflow.article.revisions[0].id
    workflow.restore(
      { id: 'editor-user-1', role: 'editor' },
      revision1Id,
      '2026-10-18T00:20:00.000Z'
    )

    expect(workflow.article.revisions).toHaveLength(3)
    const restoredRevision = workflow.article.revisions[2]
    expect(restoredRevision.sequence).toBe(3)
    expect(restoredRevision.restoredFromRevisionId).toBe(revision1Id)
    expect(restoredRevision.document.canonicalHash).toBe(doc1.canonicalHash)
    expect(workflow.article.currentRevisionId).toBe(restoredRevision.id)
    expect(workflow.article.audit.some((a) => a.action === 'revision.restored')).toBe(true)
  })
})

describe('03B / Preview Tokens & Non-Indexing Contracts', () => {
  it('generates reproducible SHA-256 token hashes for secure lookup', () => {
    const rawToken = '7a9c3b8e1f4d2a6c8e0b1d3f5a7c9e1b3d5f7a9c'
    const hash = hashPreviewToken(rawToken)
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(hashPreviewToken(rawToken)).toBe(hash)
  })

  it('guarantees draft content is not indexable and outputs noindex/nofollow robots', () => {
    const draftRecord = {
      status: 'draft',
      visibility: 'public' as const,
      publishedAt: null,
    }

    expect(canRenderPublic(draftRecord)).toBe(false)
    expect(canDiscoverPublic(draftRecord)).toBe(false)

    const mockDiscoveryDoc = {
      publicUrl: 'https://alpha.internal/articles/draft-article',
      canonicalUrl: 'https://alpha.internal/articles/draft-article',
      canonicalPath: '/articles/draft-article',
      alternateLocales: {},
      indexability: {
        indexable: false,
        reason: 'draft',
        robotsDirectives: { index: false, follow: false },
      },
      title: { value: 'Secret Draft Article', source: 'content' },
      description: { value: 'Not published yet', source: 'summary' },
      socialImage: { url: null, alt: null, source: null, variantEligible: false, variantUrl: null },
      contentType: 'article',
      author: null,
      publisher: { name: 'Site Alpha', url: 'https://alpha.internal', logoUrl: null },
      dates: { publishedAt: null, modifiedAt: null },
      taxonomy: { topics: [], categories: [], tags: [] },
      breadcrumbs: [],
      media: {},
      revisions: { entityId: 'content-1', collection: 'content', publishedRevisionId: null, presentationRevisionId: 'content-1' },
      search: { eligible: false, bodyProjection: '', visibility: 'hidden' },
      redirect: { isRedirect: false, targetUrl: null, statusCode: null, isTombstone: false },
      schema: { eligible: false, schemaType: 'article', fallbackType: 'article', eligibilityReason: 'draft', validationIssues: [], inspection: null, jsonLd: {} },
      issues: [],
    } as unknown as DiscoveryDocument

    const metadata = discoveryToMetadata(mockDiscoveryDoc)
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})

describe('03B / Document Locking & Concurrent Collision Projection', () => {
  const collectionConfig = {
    slug: 'content',
    lockDocuments: true,
  } as any

  it('reports document as UNLOCKED for the active lock owner', async () => {
    const ownerUserId = 'owner-uuid-1'
    const req = {
      user: { id: ownerUserId, role: 'owner', collection: 'users' },
      payload: {
        collections: {
          'payload-locked-documents': { config: { slug: 'payload-locked-documents' } },
          users: { config: { slug: 'users' } },
        },
        find: vi.fn(async () => ({
          docs: [
            {
              id: 'lock-1',
              document: { value: 'content-1', relationTo: 'content' },
              user: { value: ownerUserId, relationTo: 'users' },
            },
          ],
        })),
        findByID: vi.fn(async () => ({ id: ownerUserId, email: 'owner@example.test' })),
      },
    } as any

    const lockStatus = await getIsLocked({
      collectionConfig,
      id: 'content-1',
      isEditing: true,
      req,
    })

    expect(lockStatus.isLocked).toBe(false)
  })

  it('reports document as LOCKED for a concurrent editor and identifies current holder', async () => {
    const ownerUserId = 'owner-uuid-1'
    const staffUserId = 'staff-uuid-2'
    const req = {
      user: { id: staffUserId, role: 'staff', collection: 'users' },
      payload: {
        collections: {
          'payload-locked-documents': { config: { slug: 'payload-locked-documents' } },
          users: { config: { slug: 'users' } },
        },
        find: vi.fn(async () => ({
          docs: [
            {
              id: 'lock-1',
              document: { value: 'content-1', relationTo: 'content' },
              user: { value: { id: ownerUserId, email: 'owner@renegadeparty.org' }, relationTo: 'users' },
            },
          ],
        })),
        findByID: vi.fn(async () => ({ id: ownerUserId, email: 'owner@renegadeparty.org' })),
      },
    } as any

    const lockStatus = await getIsLocked({
      collectionConfig,
      id: 'content-1',
      isEditing: true,
      req,
    })

    expect(lockStatus.isLocked).toBe(true)
    expect((lockStatus.currentEditor as any)?.id).toBe(ownerUserId)
  })

  it('rejects concurrent update with checkDocumentLockStatus when overrideLock is false', async () => {
    const ownerUserId = 'owner-uuid-1'
    const staffUserId = 'staff-uuid-2'
    const mockReq = {
      user: { id: staffUserId, role: 'staff', collection: 'users' },
      payload: {
        collections: {
          'payload-locked-documents': { config: { slug: 'payload-locked-documents' } },
          content: { config: { slug: 'content', lockDocuments: true } },
        },
        db: {
          find: vi.fn(async () => ({
            docs: [
              {
                id: 'lock-1',
                document: { value: 'content-1', relationTo: 'content' },
                user: { value: ownerUserId, relationTo: 'users' },
                updatedAt: new Date().toISOString(),
              },
            ],
          })),
        },
      },
    } as any

    let caughtError: Error | null = null
    try {
      await checkDocumentLockStatus({
        id: 'content-1',
        collectionSlug: 'content',
        req: mockReq,
        overrideLock: false,
      })
    } catch (err: any) {
      caughtError = err
    }

    expect(caughtError).not.toBeNull()
    expect(caughtError?.message).toMatch(/locked/i)
  })
})
