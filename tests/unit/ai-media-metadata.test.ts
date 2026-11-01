import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { AI_TASKS } from '../../src/modules/ai/contracts'
import { validateProposalOutput } from '../../src/modules/ai/gateway'
import { aiWorkflowUpdate, loadAiWorkflowTarget } from '../../src/modules/ai/workflows'

describe('media metadata proposal boundary', () => {
  it('allows bounded canonical metadata and drops provider commands and storage fields', async () => {
    const doc = {
      id: 'media',
      site: 'alpha',
      kind: 'image',
      altText: 'Old alt',
      caption: 'Old caption',
      description: 'Old description',
      storageLocation: 'private-location',
      updatedAt: 'now',
    }
    const payload = { findByID: async () => doc } as unknown as Payload
    const target = await loadAiWorkflowTarget(
      payload,
      'media.alt-text',
      'media',
      undefined,
      'alpha',
    )
    expect(target.original).toEqual({
      altText: 'Old alt',
      caption: 'Old caption',
      description: 'Old description',
    })
    expect(target.context.article).not.toContain('private-location')
    const output = validateProposalOutput(AI_TASKS['media.alt-text'], {
      altText: ' New alt ',
      caption: 'New caption',
      description: 'New description',
      publish: true,
      storageLocation: 'evil',
    })
    expect(aiWorkflowUpdate(target, output)).toEqual({
      altText: 'New alt',
      caption: 'New caption',
      description: 'New description',
    })
    expect(doc.altText).toBe('Old alt')
  })
  it.each([
    { caption: 3 },
    { description: {} },
    { caption: 'x'.repeat(501) },
    { description: 'x'.repeat(2001) },
  ])('rejects invalid optional metadata %j', (extra) => {
    expect(() =>
      validateProposalOutput(AI_TASKS['media.alt-text'], { altText: 'River', ...extra }),
    ).toThrow('metadata proposal')
  })
  it('preserves existing captions when an older alt-only output is applied', async () => {
    const payload = {
      findByID: async () => ({
        id: 'media',
        site: 'alpha',
        kind: 'image',
        caption: 'Retain',
        updatedAt: 'now',
      }),
    } as unknown as Payload
    const target = await loadAiWorkflowTarget(payload, 'media.alt-text', 'media')
    expect(
      aiWorkflowUpdate(
        target,
        validateProposalOutput(AI_TASKS['media.alt-text'], { altText: 'River' }),
      ),
    ).toEqual({ altText: 'River' })
  })
})

it('pins distribution parent and source versions even when variant is unchanged', async () => {
  const variant = { id: 'v', draft: 'd', status: 'draft', updatedAt: 'same', text: 'Copy' }
  const draft = {
    id: 'd',
    site: 's',
    status: 'draft',
    title: 'Draft',
    sourceContent: 'c',
    updatedAt: 'one',
  }
  const content = {
    id: 'c',
    site: 's',
    status: 'published',
    visibility: 'public',
    title: 'Source',
    updatedAt: 'one',
  }
  const records: Record<string, object> = {
    'social-network-variants': variant,
    'social-drafts': draft,
    content,
  }
  const payload = {
    findByID: async ({ collection }: { collection: string }) => records[collection],
  } as unknown as Payload
  const original = await loadAiWorkflowTarget(
    payload,
    'distribution.copy-variants',
    'v',
    undefined,
    's',
  )
  draft.updatedAt = 'two'
  const parentChanged = await loadAiWorkflowTarget(
    payload,
    'distribution.copy-variants',
    'v',
    undefined,
    's',
  )
  expect(original.updatedAt).toBe(parentChanged.updatedAt)
  expect(original.dependencyVersion).not.toBe(parentChanged.dependencyVersion)
  content.updatedAt = 'two'
  const sourceChanged = await loadAiWorkflowTarget(
    payload,
    'distribution.copy-variants',
    'v',
    undefined,
    's',
  )
  expect(parentChanged.dependencyVersion).not.toBe(sourceChanged.dependencyVersion)
})
