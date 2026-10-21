import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SafeRichText } from '../../src/modules/editorial/RichText'
import {
  canonicalLexicalDocument,
  extractPlainText,
} from '../../src/modules/editorial/presentation'
import { hashRichTextDocument } from '../../src/modules/editorial/contracts'
import { ensureEditorialCompanion } from '../../src/modules/editorial/persistence'
const render = (children: unknown[]) =>
  renderToStaticMarkup(<SafeRichText document={{ root: { children } }} />)
describe('03B persisted Lexical rendering', () => {
  it('snapshots reference IDs without related private records or response-depth drift', () => {
    const hydrated = {
      root: {
        children: [
          {
            type: 'relationship',
            relationTo: 'media-assets',
            value: { id: 'media-id', owner: { email: 'private@example.test' } },
          },
          { type: 'upload', value: { id: 'upload-id', storageKey: 'private-location' } },
          {
            type: 'link',
            fields: {
              doc: { relationTo: 'content', value: { id: 'post-id', body: 'private draft' } },
            },
          },
          { type: 'block', fields: { blockType: 'custom', preserved: { unknown: true } } },
        ],
      },
    }
    const original = JSON.stringify(hydrated)
    const normalized = canonicalLexicalDocument(hydrated)
    expect(JSON.stringify(normalized)).not.toContain('private')
    expect(normalized).toEqual({
      root: {
        children: [
          { type: 'relationship', relationTo: 'media-assets', value: 'media-id' },
          { type: 'upload', value: 'upload-id' },
          { type: 'link', fields: { doc: { relationTo: 'content', value: 'post-id' } } },
          { type: 'block', fields: { blockType: 'custom', preserved: { unknown: true } } },
        ],
      },
    })
    expect(JSON.stringify(hydrated)).toBe(original)
    expect(hashRichTextDocument(canonicalLexicalDocument(normalized))).toBe(
      hashRichTextDocument(normalized),
    )
  })
  it('does not append a spurious edited revision when only a media response is populated', async () => {
    const raw = {
      root: { children: [{ type: 'relationship', relationTo: 'media-assets', value: 'media-id' }] },
    }
    const create = vi.fn(),
      update = vi.fn()
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 'companion', lifecycle: 'draft', documentHash: hashRichTextDocument(raw) }],
      }),
      create,
      update,
    }
    await ensureEditorialCompanion(payload as never, {
      id: 'content',
      contentType: 'article',
      status: 'draft',
      body: {
        root: {
          children: [
            {
              type: 'relationship',
              relationTo: 'media-assets',
              value: { id: 'media-id', title: 'Hydrated label' },
            },
          ],
        },
      },
    })
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
  it('preserves combined bold italic underline strike and code marks', () => {
    const html = render([
      { type: 'paragraph', children: [{ type: 'text', text: 'All marks', format: 31 }] },
    ])
    expect(html).toContain('<strong><em><s><u><code>All marks</code></u></s></em></strong>')
  })
  it('renders actual Lexical link fields and styled children', () => {
    expect(
      render([
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              fields: { url: 'https://example.com/report', linkType: 'custom' },
              children: [{ type: 'text', text: 'Read report', format: 3 }],
            },
          ],
        },
      ]),
    ).toContain(
      '<a href="https://example.com/report" rel="noreferrer"><strong><em>Read report</em></strong></a>',
    )
  })
  it('rejects script URLs and protocol-relative media without discarding prose', () => {
    const html = render([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            fields: { url: 'javascript:alert(1)' },
            children: [{ type: 'text', text: 'Preserved link text' }],
          },
        ],
      },
      {
        type: 'block',
        fields: {
          blockType: 'editorialCallout',
          title: '<script>bad</script>',
          text: 'Retained body',
          url: '//foreign.test/tracker.png',
        },
      },
    ])
    expect(html).toContain('Preserved link text')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('src="//')
  })
  it('renders subscript and superscript independently', () => {
    expect(
      render([
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: '2', format: 32 },
            { type: 'text', text: '3', format: 64 },
          ],
        },
      ]),
    ).toContain('<sub>2</sub><sup>3</sup>')
  })
  it('includes supported callout text in canonical plain-text projections', () => {
    expect(
      extractPlainText({
        root: {
          children: [
            {
              type: 'block',
              fields: {
                blockType: 'editorialCallout',
                title: 'Context',
                text: 'Verified source',
                caption: 'Attribution',
              },
            },
          ],
        },
      }),
    ).toBe('Context Verified source Attribution')
  })
})
