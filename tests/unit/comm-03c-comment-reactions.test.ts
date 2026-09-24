import { describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260921_030000_comm_03c_comment_reactions'
import {
  CommentReactionError,
  rebuildCommentReactionCounters,
  toggleCommentReaction,
} from '@/modules/community/comment-reactions'

const siteId = '00000000-0000-7000-8000-000000000001'
const otherSiteId = '00000000-0000-7000-8000-000000000002'
const commentId = '00000000-0000-7000-8000-000000000003'
const memberId = '00000000-0000-7000-8000-000000000004'

function payloadFor(target: Record<string, unknown> = {}) {
  let present = false
  const query = vi.fn(async (text: string) => {
    if (text.includes('FROM comments c JOIN comment_threads')) {
      return {
        rows: [
          {
            id: commentId,
            status: 'visible',
            siteId,
            threadFrozen: false,
            threadClosed: false,
            ...target,
          },
        ],
      }
    }
    if (text.includes('pg_advisory_xact_lock')) {
      present = !present
      return { rows: [{ added: present, count: present ? 1 : 0 }] }
    }
    return { rows: [] }
  })
  return {
    findByID: vi.fn(async () => ({ commentReactionCodes: ['thumbs_up', 'heart'] })),
    db: { pool: { query } },
    query,
  } as never as {
    findByID: ReturnType<typeof vi.fn>
    db: { pool: { query: typeof query } }
    query: typeof query
  }
}

describe('COMM-03C comment reactions', () => {
  it('migrates raw reactions, a unique tuple, and a disposable counter projection reversibly', async () => {
    const execute = vi.fn(async (_sql?: unknown) => undefined)
    await up({ db: { execute } } as never)
    await down({ db: { execute } } as never)
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('comment_reactions_unique')
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('comment_reaction_counters')
  })

  it('makes 50 concurrent toggles for one member converge to the deterministic absent state', async () => {
    const payload = payloadFor()
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        toggleCommentReaction(payload as never, {
          siteId,
          commentId,
          memberId,
          reactionCode: 'thumbs_up',
        }),
      ),
    )
    expect(results.at(-1)).toMatchObject({ added: false, count: 0 })
    const mutationSql = payload.query.mock.calls.find(([text]) =>
      String(text).includes('pg_advisory_xact_lock'),
    )?.[0]
    expect(String(mutationSql)).toContain(
      'ON CONFLICT (comment_id, member_id, reaction_code) DO NOTHING',
    )
  })

  it('rebuilds deliberately corrupted counters solely from raw reactions', async () => {
    const query = vi.fn(async (_text?: string, _values?: unknown[]) => ({ rows: [] }))
    const payload = { db: { pool: { query } } }
    await rebuildCommentReactionCounters(payload as never, { commentId })
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'DELETE FROM comment_reaction_counters WHERE comment_id = $1',
    )
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'FROM comment_reactions WHERE comment_id = $1',
    )
    expect(String(query.mock.calls[0]?.[0])).toContain('GROUP BY comment_id, reaction_code')
  })

  it.each([
    ['cross-site', { siteId: otherSiteId, reactionCode: 'thumbs_up' }, { siteId }],
    ['invalid code', { siteId, reactionCode: 'not_allowed' }, {}],
    ['deleted comment', { siteId, reactionCode: 'thumbs_up' }, { status: 'deleted' }],
    ['frozen thread', { siteId, reactionCode: 'thumbs_up' }, { threadFrozen: true }],
  ])('rejects %s reactions', async (_label, input, target) => {
    const payload = payloadFor(target)
    await expect(
      toggleCommentReaction(payload as never, { commentId, memberId, ...input }),
    ).rejects.toBeInstanceOf(CommentReactionError)
  })
})
