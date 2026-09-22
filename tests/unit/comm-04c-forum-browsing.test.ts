import { describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260922_010000_comm_04c_forum_browsing_read_state'
import { getForumTopicPosts, listForumTopics, markForumTopicRead } from '@/modules/community/forum-browsing'

const siteId = '00000000-0000-7000-8000-000000000001'
const topicId = '00000000-0000-7000-8000-000000000002'
const spaceId = '00000000-0000-7000-8000-000000000003'
const memberId = '00000000-0000-7000-8000-000000000004'

function payload(posts = 0) {
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (text.includes('FROM forum_topics WHERE id')) return { rows: [{ id: topicId, spaceId, lastPostSequenceNumber: posts }] }
    if (text.includes('FROM forum_spaces')) return { rows: [{ id: spaceId, siteId, parentId: null, name: 'General', slug: 'general', visibility: 'public', joinPolicy: 'open' }] }
    if (text.includes('FROM member_site_roles')) return { rows: [{ exists: false }] }
    if (text.includes('FROM forum_posts WHERE topic_id')) {
      const after = Number(values[1]); const limit = Number(values[2])
      return { rows: Array.from({ length: Math.min(limit, Math.max(0, posts - after)) }, (_, index) => ({ id: `post-${after + index + 1}`, sequenceNumber: after + index + 1 })) }
    }
    if (text.includes('member_topic_read_state')) return { rows: [{ memberId, topicId, lastReadSequenceNumber: posts }] }
    if (text.includes('FROM forum_topics t JOIN')) return { rows: [{ id: topicId, unread: true, lastPostSequenceNumber: posts }] }
    return { rows: [] }
  })
  return { db: { pool: { query } }, query } as never
}

describe('COMM-04C: forum browsing, summaries, and unread cursors', () => {
  it('creates reversible summary/read-state storage and projection indexes', async () => {
    const execute = vi.fn(async () => undefined)
    await up({ db: { execute } } as never); await down({ db: { execute } } as never)
    expect(JSON.stringify(execute.mock.calls[0])).toContain('member_topic_read_state')
    expect(JSON.stringify(execute.mock.calls[0])).toContain('project_forum_topic_summary')
    expect(JSON.stringify(execute.mock.calls[1])).toContain('DROP TABLE IF EXISTS \\"member_topic_read_state\\"')
  })

  it('pages a 10,000-post topic by sequence cursor with no omissions, duplicates, or OFFSET', async () => {
    const p = payload(10_000); let cursor: string | null = null; const seen: number[] = []
    do {
      const page = await getForumTopicPosts(p, { siteId, topicId, memberId, cursor, limit: 137, countView: false })
      seen.push(...page.posts.map((post) => Number(post.sequenceNumber)))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toHaveLength(10_000)
    expect(new Set(seen)).toHaveLength(10_000)
    expect(seen[0]).toBe(1); expect(seen.at(-1)).toBe(10_000)
    expect(p.query.mock.calls.filter(([sql]: [string]) => /OFFSET/i.test(sql))).toHaveLength(0)
  })

  it('exposes sort modes and only allows bounded, accessible topic listing', async () => {
    const p = payload(3)
    for (const sort of ['latest_activity', 'creation_date', 'most_replies', 'unanswered'])
      await expect(listForumTopics(p, { siteId, memberId, sort, limit: 1_000 })).resolves.toHaveLength(1)
    expect(p.query.mock.calls.find(([sql]: [string]) => sql.includes('FROM forum_topics t JOIN'))?.[0]).toContain('space_memberships')
  })

  it('marks a topic read at its current sequence; a later sequence is unread again', async () => {
    const p = payload(12)
    await expect(markForumTopicRead(p, { siteId, topicId, memberId })).resolves.toMatchObject({ lastReadSequenceNumber: 12 })
    // The list projection compares a durable cursor against the topic's current last sequence.
    await listForumTopics(p, { siteId, memberId })
    const statement = p.query.mock.calls.find(([sql]: [string]) => sql.includes('FROM forum_topics t JOIN'))?.[0]
    expect(statement).toContain('last_post_sequence_number > COALESCE(rs.last_read_sequence_number, 0)')
  })
})
