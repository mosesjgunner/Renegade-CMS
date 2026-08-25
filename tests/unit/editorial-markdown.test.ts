import { describe, expect, it } from 'vitest'

import { hashMarkdownSource } from '../../src/modules/editorial/contracts'
import {
  exportRichTextToMarkdown,
  importMarkdownToRichText,
} from '../../src/modules/editorial/markdown'

describe('M04-C editorial markdown round trip', () => {
  it('round-trips supported markdown while preserving deterministic report hashes', () => {
    const source = [
      '# Sourced op-ed',
      '',
      'A paragraph with a [link](https://example.test).',
      '',
      '- First point',
      '- Second point',
      '',
      '> Quoted material.',
    ].join('\n')

    const imported = importMarkdownToRichText(source)

    expect(imported.document.plainTextProjection).toContain('Sourced op-ed')
    const exported = exportRichTextToMarkdown(imported.document)

    expect(imported.report.status).toBe('accepted')
    expect(imported.report.targetDocumentHash).toBe(imported.document.canonicalHash)
    expect(exported.markdown).toBe(source)
    expect(exported.report.markdownChecksum).toBe(hashMarkdownSource(source))
    expect(exported.report.status).toBe('accepted')
  })
})
