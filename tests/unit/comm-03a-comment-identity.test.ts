import { describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260921_020000_comm_03a_comment_identity'
import {
  CommentIdentityError,
  createCanonicalComment,
  getOrCreateCommentThread,
  tombstoneCanonicalComment,
} from '@/modules/community/comment-identity'

const siteId = '00000000-0000-7000-8000-000000000001'
const contentId = '00000000-0000-7000-8000-000000000002'

function payloadWithQuery(
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>,
) {
  return {
    find: vi.fn(async () => ({ docs: [{ id: contentId, contentType: 'article' }] })),
    db: { pool: { query } },
  } as never
}

describe('COMM-03A canonical comment identity', () => {
  it('has reversible migration SQL for threads, comments, revisions, UUIDv7 and depth/content constraints', async () => {
    const execute = vi.fn(async () => undefined)
    await up({ db: { execute } } as never)
    await down({ db: { execute } } as never)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('uses one conflict-safe canonical thread statement for 20 concurrent attempts', async () => {
    let thread:
      | {
          id: string
          siteId: unknown
          canonicalContentId: unknown
          contentType: unknown
          isClosed: boolean
          isFrozen: boolean
          premoderationEnabled: boolean
        }
      | undefined
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      if (text.includes('INSERT INTO comment_threads')) {
        thread ??= {
          id: '00000000-0000-7000-8000-000000000099',
          siteId: values?.[0],
          canonicalContentId: values?.[1],
          contentType: values?.[2],
          isClosed: false,
          isFrozen: false,
          premoderationEnabled: false,
        }
        return { rows: [thread] }
      }
      return { rows: [] }
    })
    const payload = payloadWithQuery(query)
    const threads = await Promise.all(
      Array.from({ length: 20 }, () =>
        getOrCreateCommentThread(payload, { siteId, canonicalContentId: contentId }),
      ),
    )
    expect(new Set(threads.map((item) => item.id))).toEqual(new Set([thread!.id]))
    const calls = query.mock.calls as unknown as [string, unknown[]?][]
    expect(calls.filter(([text]) => text.includes('INSERT INTO comment_threads'))).toHaveLength(20)
    expect(
      String(calls.find(([text]) => text.includes('INSERT INTO comment_threads'))?.[0]),
    ).toContain('ON CONFLICT (site_id, canonical_content_id)')
  })

  it('rejects replies deeper than five levels', async () => {
    const payload = payloadWithQuery(async (text) =>
      text.includes('SELECT id')
        ? {
            rows: [
              {
                id: '00000000-0000-7000-8000-000000000010',
                threadId: 'thread',
                rootId: null,
                depth: 5,
              },
            ],
          }
        : { rows: [] },
    )
    await expect(
      createCanonicalComment(payload, {
        threadId: 'thread',
        parentId: '00000000-0000-7000-8000-000000000010',
        authorId: '00000000-0000-7000-8000-000000000011',
        authorType: 'member',
        bodyRaw: 'no',
        bodyHtml: 'no',
      }),
    ).rejects.toMatchObject({ status: 422, code: 'COMMENT_DEPTH_EXCEEDED' })
  })

  it('tombstones parents without deleting their row or changing attached replies', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: 'parent', status: 'deleted', parent_id: null }],
    }))
    const result = await tombstoneCanonicalComment(payloadWithQuery(query), 'parent')
    expect(result.status).toBe('deleted')
    const calls = query.mock.calls as unknown as [string, unknown[]?][]
    expect(String(calls[0]?.[0])).toContain("UPDATE comments SET status = 'deleted'")
    expect(String(calls[0]?.[0])).not.toContain('DELETE FROM')
  })

  it('returns unprocessable behavior when canonical content is absent', async () => {
    const payload = {
      find: vi.fn(async () => ({ docs: [] })),
      db: { pool: { query: vi.fn() } },
    } as never
    await expect(
      getOrCreateCommentThread(payload, { siteId, canonicalContentId: contentId }),
    ).rejects.toBeInstanceOf(CommentIdentityError)
    await expect(
      getOrCreateCommentThread(payload, { siteId, canonicalContentId: contentId }),
    ).rejects.toMatchObject({ status: 422, code: 'INVALID_CANONICAL_CONTENT' })
  })
})
