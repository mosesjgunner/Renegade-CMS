import { describe, expect, it } from 'vitest'

import { hashRichTextDocument, type RichTextDocument } from '../../src/modules/editorial/contracts'
import { importMarkdownToRichText } from '../../src/modules/editorial/markdown'
import {
  applyTextReplacement,
  collectTextSegments,
  diffParagraphs,
  paragraphTexts,
} from '../../src/modules/editorial/text-segments'

const doc = (markdown: string): RichTextDocument => importMarkdownToRichText(markdown).document

describe('RC3-17 text segments', () => {
  it('collects segments whose spans locate their text in the composed plain text', () => {
    const document = doc(['# Title', '', 'First para.', '', 'Second para.'].join('\n'))
    const { plainText, segments } = collectTextSegments(document)
    expect(plainText).toBe(document.plainTextProjection)
    expect(segments.map((segment) => segment.path)).toEqual(['0/0', '1/0', '2/0'])
    for (const segment of segments)
      expect(plainText.slice(segment.start, segment.end)).toBe(segment.text)
    expect(paragraphTexts(document)).toEqual(['Title', 'First para.', 'Second para.'])
  })

  it('collects one segment per text node, inline marks included', () => {
    const document = doc(['# Title', '', 'A para with **bold** text.'].join('\n'))
    const { segments } = collectTextSegments(document)
    expect(segments.map((segment) => segment.text)).toEqual(['Title', 'A para with bold text.'])
    expect(paragraphTexts(document)).toEqual(['Title', 'A para with bold text.'])
  })

  it('applies a replacement inside the anchored node and rebuilds the hash', () => {
    const document = doc(['# Title', '', 'Teh report is ready.'].join('\n'))
    const segment = collectTextSegments(document).segments.find((entry) =>
      entry.text.includes('Teh'),
    )!
    const result = applyTextReplacement(
      document,
      { nodeKey: segment.path, offsetStart: 0, offsetEnd: 3 },
      'Teh',
      'The',
    )
    expect(result).not.toBeNull()
    expect(result!.plainTextProjection).toContain('The report is ready.')
    expect(result!.canonicalHash).toBe(hashRichTextDocument(result!.document))
    expect(result!.canonicalHash).not.toBe(document.canonicalHash)
    // The input document is never mutated.
    expect(document.plainTextProjection).toContain('Teh report')
  })

  it('refuses a replacement when the anchored text moved', () => {
    const document = doc(['# Title', '', 'The report is ready.'].join('\n'))
    const segment = collectTextSegments(document).segments.find((entry) =>
      entry.text.includes('report'),
    )!
    expect(
      applyTextReplacement(
        document,
        { nodeKey: segment.path, offsetStart: 0, offsetEnd: 3 },
        'Teh',
        'The',
      ),
    ).toBeNull()
    expect(
      applyTextReplacement(
        document,
        { nodeKey: '99/99', offsetStart: 0, offsetEnd: 3 },
        'The',
        'Teh',
      ),
    ).toBeNull()
  })
})

describe('RC3-17 paragraph diffs', () => {
  it('reports unchanged, changed, added and removed paragraphs', () => {
    const before = ['Title', 'Keep me.', 'Old line.', 'Tail.']
    const after = ['Title', 'Keep me.', 'New line.', 'Tail.', 'Extra.']
    const diff = diffParagraphs(before, after)
    expect(diff.filter((entry) => entry.kind === 'unchanged')).toHaveLength(3)
    const changed = diff.filter((entry) => entry.kind === 'changed')
    expect(changed).toHaveLength(1)
    expect(changed[0].before).toBe('Old line.')
    expect(changed[0].after).toBe('New line.')
    expect(diff.filter((entry) => entry.kind === 'added').map((entry) => entry.after)).toEqual([
      'Extra.',
    ])
  })

  it('reports pure removals without inventing changes', () => {
    const diff = diffParagraphs(['A', 'B', 'C'], ['A', 'C'])
    expect(diff.filter((entry) => entry.kind === 'removed').map((entry) => entry.before)).toEqual([
      'B',
    ])
    expect(diff.filter((entry) => entry.kind === 'changed')).toHaveLength(0)
  })

  it('treats identical documents as fully unchanged', () => {
    const diff = diffParagraphs(['A', 'B'], ['A', 'B'])
    expect(diff.every((entry) => entry.kind === 'unchanged')).toBe(true)
  })
})
