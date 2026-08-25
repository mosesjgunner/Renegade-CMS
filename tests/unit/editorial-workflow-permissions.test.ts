import { describe, expect, it } from 'vitest'

import { hashRichTextDocument, type RichTextDocument } from '../../src/modules/editorial/contracts'
import { EditorialPermissionError, EditorialWorkflow } from '../../src/modules/editorial/workflow'

const doc = (text: string): RichTextDocument => {
  const document = { root: { children: [{ text, type: 'paragraph' }], type: 'root' } }
  return {
    format: 'payload-lexical',
    schemaVersion: 1,
    document,
    canonicalHash: hashRichTextDocument(document),
    plainTextProjection: text,
    unknownNodePolicy: 'preserve',
  }
}

describe('M04-C editorial workflow permissions', () => {
  it('rejects unauthorized review and publish transitions', () => {
    const flow = new EditorialWorkflow({
      document: doc('Permissions check'),
      author: { id: 'author', role: 'author' },
    })

    flow.requestReview({ id: 'author', role: 'author' })
    expect(() => flow.decideReview({ id: 'author', role: 'author' }, true)).toThrow(
      EditorialPermissionError,
    )
    flow.decideReview({ id: 'editor', role: 'editor' }, true)
    expect(() =>
      flow.schedule({ id: 'editor', role: 'editor' }, '2026-08-19T12:00:00Z', 'UTC', 'schedule-1'),
    ).toThrow(EditorialPermissionError)
  })
})
