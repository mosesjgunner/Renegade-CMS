import { describe, expect, it } from 'vitest'

import { hashRichTextDocument, type RichTextDocument } from '../../src/modules/editorial/contracts'
import {
  EditorialConflictError,
  EditorialWorkflow,
  hashRevisionIntegrity,
} from '../../src/modules/editorial/workflow'

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
const author = { id: 'author', role: 'author' as const }
const editor = { id: 'editor', role: 'editor' as const }
const publisher = { id: 'publisher', role: 'publisher' as const }

describe('M04-C editorial workflow', () => {
  it('enforces review, schedules, and publishes exactly once', () => {
    const flow = new EditorialWorkflow({
      document: doc('Original'),
      author,
      now: '2026-08-18T00:00:00Z',
    })
    flow.requestReview(author)
    flow.decideReview(editor, true)
    flow.schedule(publisher, '2026-08-19T12:00:00Z', 'America/Chicago', 'job-1')
    expect(flow.publishScheduled(publisher, 'job-1')).toBe(true)
    expect(flow.publishScheduled(publisher, 'job-1')).toBe(false)
    expect(flow.article.status).toBe('published')
    expect(flow.article.firstPublishedAt).toBeTruthy()
  })

  it('preserves immutable history, rejects stale autosaves, and restores by creating a revision', () => {
    const flow = new EditorialWorkflow({ document: doc('Original'), author })
    const original = flow.article.currentRevisionId
    const revised = flow.saveDraft({
      actor: author,
      document: doc('Changed'),
      baseRevisionId: original,
      mutationId: 'm1',
    })
    expect(() =>
      flow.saveDraft({
        actor: author,
        document: doc('Lost'),
        baseRevisionId: original,
        mutationId: 'm2',
      }),
    ).toThrow(EditorialConflictError)
    const restored = flow.restore(editor, original)
    expect(restored.restoredFromRevisionId).toBe(original)
    expect(flow.article.revisions).toHaveLength(3)
    expect(
      flow.saveDraft({
        actor: author,
        document: doc('Changed'),
        baseRevisionId: restored.id,
        mutationId: 'm1',
      }),
    ).toBe(revised)
  })

  it('orders citations deterministically and hashes meaningful revision provenance', () => {
    const flow = new EditorialWorkflow({ document: doc('Sourced'), author })
    flow.setCitations(author, [
      { id: 'b', sourceReferenceId: 's2', anchor: { nodeKey: 'b', offsetStart: 0, offsetEnd: 1 } },
      { id: 'a', sourceReferenceId: 's1', anchor: { nodeKey: 'a', offsetStart: 2, offsetEnd: 3 } },
    ])
    expect(flow.article.citations.map(({ id, ordinal }) => [id, ordinal])).toEqual([
      ['a', 1],
      ['b', 2],
    ])
    expect(
      hashRevisionIntegrity({
        document: doc('Sourced'),
        citationAttachments: [],
        mediaReferenceIds: [],
        provenance: { source: 'one' },
      }),
    ).not.toBe(
      hashRevisionIntegrity({
        document: doc('Sourced'),
        citationAttachments: [],
        mediaReferenceIds: [],
        provenance: { source: 'two' },
      }),
    )
  })
})
