import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { aiWorkflowUpdate, loadAiWorkflowTarget } from '../../src/modules/ai/workflows'

const body = {
  root: {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Original passage.' }] }],
  },
}
const content = {
  id: 'content-1',
  site: 'site-a',
  publication: 'publication-a',
  contentType: 'article',
  status: 'draft',
  title: 'A title',
  summary: 'A summary',
  body,
  updatedAt: '2026-09-24T12:00:00.000Z',
  visibility: 'public',
}
const media = {
  id: 'media-1',
  site: 'site-a',
  kind: 'image',
  title: 'A river',
  description: 'River at dusk',
  storageLocation: 'secret-blob-location',
  updatedAt: content.updatedAt,
  altText: '',
}
const variant = {
  id: 'variant-1',
  draft: 'draft-1',
  status: 'draft',
  text: 'Current copy',
  updatedAt: content.updatedAt,
}
const draft = {
  id: 'draft-1',
  site: 'site-a',
  publication: 'publication-a',
  status: 'draft',
  title: 'Distribution draft',
  sourceContent: 'source-1',
}
const source = { ...content, id: 'source-1', status: 'published' }

function payloadWith(records: Record<string, Record<string, unknown>>): Payload {
  return {
    findByID: async ({ collection }: { collection: string }) => records[collection],
  } as unknown as Payload
}

describe('four AI workflow contracts', () => {
  it('revises one exact draft text node and leaves the source object unchanged', async () => {
    const target = await loadAiWorkflowTarget(
      payloadWith({ content }),
      'editor.improve-selection',
      content.id,
      'Original passage.',
    )
    const update = aiWorkflowUpdate(target, 'Clearer passage.')
    expect(JSON.stringify(update.body)).toContain('Clearer passage.')
    expect(JSON.stringify(content.body)).toContain('Original passage.')
    await expect(
      loadAiWorkflowTarget(
        payloadWith({ content }),
        'editor.improve-selection',
        content.id,
        'partial',
      ),
    ).rejects.toThrow('complete text node')
  })
  it('uses Discovery fields and rejects published content changes', async () => {
    const target = await loadAiWorkflowTarget(
      payloadWith({ content }),
      'intelligence.metadata-seo',
      content.id,
    )
    expect(
      aiWorkflowUpdate(target, { title: 'SEO title', description: 'SEO description' }),
    ).toEqual({
      seoTitle: 'SEO title',
      seoDescription: 'SEO description',
    })
    await expect(
      loadAiWorkflowTarget(
        payloadWith({ content: { ...content, status: 'published' } }),
        'intelligence.metadata-seo',
        content.id,
      ),
    ).rejects.toThrow('draft revision')
  })
  it('supplies media metadata without a storage location and applies only alt text', async () => {
    const target = await loadAiWorkflowTarget(
      payloadWith({ 'media-assets': media }),
      'media.alt-text',
      media.id,
    )
    expect(target.context.article).not.toContain('secret-blob-location')
    expect(aiWorkflowUpdate(target, { altText: 'A river at dusk' })).toEqual({
      altText: 'A river at dusk',
    })
  })
  it('requires a public published same-site source for Distribution and applies draft copy only', async () => {
    const records = { 'social-network-variants': variant, 'social-drafts': draft, content: source }
    const target = await loadAiWorkflowTarget(
      payloadWith(records),
      'distribution.copy-variants',
      variant.id,
    )
    expect(aiWorkflowUpdate(target, { variants: ['First', 'Second'] }, 1)).toEqual({
      text: 'Second',
    })
    await expect(
      loadAiWorkflowTarget(
        payloadWith({ ...records, content: { ...source, visibility: 'private' } }),
        'distribution.copy-variants',
        variant.id,
      ),
    ).rejects.toThrow('public, published')
    await expect(
      loadAiWorkflowTarget(
        payloadWith({ ...records, content: { ...source, site: 'other' } }),
        'distribution.copy-variants',
        variant.id,
      ),
    ).rejects.toThrow('this site')
  })
})
