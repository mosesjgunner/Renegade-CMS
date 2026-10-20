import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SafeRichText } from '../../src/modules/editorial/RichText'
import { extractPlainText } from '../../src/modules/editorial/presentation'
const render = (children: unknown[]) =>
  renderToStaticMarkup(<SafeRichText document={{ root: { children } }} />)
describe('03B persisted Lexical rendering', () => {
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
