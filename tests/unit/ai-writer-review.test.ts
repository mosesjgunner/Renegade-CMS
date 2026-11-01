import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { aiWorkflowUpdate, loadAiWorkflowTarget } from '../../src/modules/ai/workflows'

const doc = {
  id: 'draft',
  site: 'site',
  contentType: 'page',
  status: 'draft',
  title: 'Original title',
  updatedAt: '2026-11-01T00:00:00.000Z',
  body: { root: { children: [{ type: 'text', text: 'Original passage' }] } },
}
const payload = (record: object) =>
  ({
    findByID: async () => record,
    find: async () => ({ docs: [{ currentRevision: 'canonical-revision' }] }),
  }) as unknown as Payload

describe('writer and discovery review safety', () => {
  it.each(['published', 'scheduled', 'updated'])(
    'rejects writer proposals for %s content',
    async (status) => {
      await expect(
        loadAiWorkflowTarget(
          payload({ ...doc, status }),
          'editor.improve-selection',
          doc.id,
          'Original passage',
          'site',
        ),
      ).rejects.toThrow('draft revision')
    },
  )
  it('rejects ambiguous duplicate text instead of replacing both nodes', async () => {
    await expect(
      loadAiWorkflowTarget(
        payload({
          ...doc,
          body: {
            root: {
              children: [
                { type: 'text', text: 'Original passage' },
                { type: 'text', text: 'Original passage' },
              ],
            },
          },
        }),
        'editor.improve-selection',
        doc.id,
        'Original passage',
        'site',
      ),
    ).rejects.toThrow('complete text node')
  })
  it('keeps the lexical tree and edits only the approved node', async () => {
    const target = await loadAiWorkflowTarget(
      payload(doc),
      'editor.improve-selection',
      doc.id,
      'Original passage',
      'site',
    )
    expect(aiWorkflowUpdate(target, '  Clear passage  ')).toEqual({
      body: { root: { children: [{ type: 'text', text: 'Clear passage' }] } },
    })
    expect(doc.body.root.children[0].text).toBe('Original passage')
    expect(() => aiWorkflowUpdate(target, '   ')).toThrow('no longer matches')
  })
  it('projects SEO output onto canonical discovery fields only', async () => {
    const target = await loadAiWorkflowTarget(
      payload(doc),
      'intelligence.metadata-seo',
      doc.id,
      undefined,
      'site',
    )
    expect(
      aiWorkflowUpdate(target, {
        title: 'Suggested title',
        description: 'Suggested description',
        status: 'published',
        body: 'overwrite',
      }),
    ).toEqual({ seoTitle: 'Suggested title', seoDescription: 'Suggested description' })
  })
})
