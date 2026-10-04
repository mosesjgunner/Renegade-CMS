import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { hashRichTextDocument } from '@/modules/editorial/contracts'
import { ensureEditorialCompanion } from '@/modules/editorial/persistence'

describe('RC-02 republishing a saved revision', () => {
  it('advances the public pointer only when the saved update is published', async () => {
    const body = { root: { type: 'root', children: [] } }
    const existing = {
      id: 'family',
      lifecycle: 'published',
      documentHash: hashRichTextDocument(body),
      currentRevision: 'new-saved-revision',
      latestPublishedRevision: 'old-public-revision',
    }
    const update = vi.fn(async ({ data }) => Object.assign(existing, data))
    const payload = {
      find: vi.fn(async () => ({ docs: [existing] })),
      update,
    } as unknown as Payload
    await ensureEditorialCompanion(payload, {
      id: 'article',
      contentType: 'article',
      body,
      status: 'updated',
    })
    expect(existing.latestPublishedRevision).toBe('old-public-revision')
    await ensureEditorialCompanion(payload, {
      id: 'article',
      contentType: 'article',
      body,
      status: 'published',
    })
    expect(existing.latestPublishedRevision).toBe('new-saved-revision')
  })
})
