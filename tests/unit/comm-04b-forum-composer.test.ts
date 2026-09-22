import { describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260922_000000_comm_04b_forum_topics_posts'
import { createForumTopic, replyToForumTopic } from '@/modules/community/forum-composer'

const siteId = '00000000-0000-7000-8000-000000000001'
const spaceId = '00000000-0000-7000-8000-000000000002'
const topicId = '00000000-0000-7000-8000-000000000003'
const memberId = '00000000-0000-7000-8000-000000000004'
const privateSpaceId = '00000000-0000-7000-8000-000000000005'
const quotedPostId = '00000000-0000-7000-8000-000000000006'

function payload(options: { locked?: boolean; privateQuote?: boolean } = {}) {
  const calls: string[] = []
  let next = 2
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    calls.push(text)
    if (text.includes('FROM forum_topics WHERE'))
      return { rows: [{ id: topicId, spaceId, isLocked: Boolean(options.locked) }] }
    if (text.includes('FROM forum_posts p JOIN'))
      return { rows: [{ id: quotedPostId, spaceId: privateSpaceId }] }
    if (text.includes('FROM forum_spaces'))
      return {
        rows: [
          {
            id: values[0],
            siteId,
            parentId: null,
            name: 'General',
            slug: 'general',
            visibility: values[0] === privateSpaceId ? 'private' : 'public',
            joinPolicy: 'open',
          },
        ],
      }
    if (text.includes('FROM space_memberships'))
      return { rows: values[0] === privateSpaceId ? [] : [{ role: 'contributor' }] }
    if (text.includes('FROM member_site_roles')) return { rows: [{ exists: false }] }
    if (text.includes('UPDATE forum_topics SET next_post_sequence'))
      return { rows: [{ sequenceNumber: next++ }] }
    if (text.includes('INSERT INTO forum_topics'))
      return { rows: [{ id: topicId, spaceId, isLocked: false }] }
    if (text.includes('INSERT INTO forum_posts'))
      return { rows: [{ id: `post-${next}`, body_html: values.at(-1) }] }
    return { rows: [] }
  })
  return {
    db: { pool: { query, connect: async () => ({ query, release: vi.fn() }) } },
    calls,
  } as never
}

describe('COMM-04B: forum topics, posts, quotes, and drafts', () => {
  it('creates the three durable tables and identity/quote guards', async () => {
    const execute = vi.fn(async () => undefined)
    await up({ db: { execute } } as never)
    await down({ db: { execute } } as never)
    const schema = JSON.stringify(execute.mock.calls[0]?.[0])
    expect(schema).toContain('forum_topics')
    expect(schema).toContain('forum_posts_topic_sequence_unique')
    expect(schema).toContain('forum_drafts')
    expect(schema).toContain('forum_post_immutable_identity')
  })

  it('creates a topic and its first sanitized post in one transaction', async () => {
    const p = payload()
    const result = await createForumTopic(p, {
      siteId,
      spaceId,
      authorId: memberId,
      title: 'Hello',
      body: '<p>Safe</p><script>nope()</script>',
    })
    expect(result.post).toMatchObject({ body_html: '<p>Safe</p>' })
    expect(p.calls).toContain('BEGIN')
    expect(p.calls).toContain('COMMIT')
    expect(p.calls.find((call) => call.includes('INSERT INTO forum_topics'))).toBeTruthy()
    expect(p.calls.find((call) => call.includes('INSERT INTO forum_posts'))).toBeTruthy()
  })

  it('allocates reply sequences under a locked topic row', async () => {
    const p = payload()
    await replyToForumTopic(p, { siteId, topicId, authorId: memberId, body: '<p>One</p>' })
    await replyToForumTopic(p, { siteId, topicId, authorId: memberId, body: '<p>Two</p>' })
    expect(p.calls.filter((call) => call.includes('FOR UPDATE'))).toHaveLength(2)
    expect(
      p.calls.filter((call) => call.includes('next_post_sequence = next_post_sequence + 1')),
    ).toHaveLength(2)
  })

  it('rejects a reply after observing locked state', async () => {
    await expect(
      replyToForumTopic(payload({ locked: true }), {
        siteId,
        topicId,
        authorId: memberId,
        body: '<p>No</p>',
      }),
    ).rejects.toMatchObject({ code: 'TOPIC_LOCKED', status: 403 })
  })

  it('does not disclose a quoted post from an unreadable private space', async () => {
    await expect(
      replyToForumTopic(payload({ privateQuote: true }), {
        siteId,
        topicId,
        authorId: memberId,
        body: '<p>No</p>',
        replyToPostId: quotedPostId,
      }),
    ).rejects.toMatchObject({ code: 'SPACE_NOT_FOUND', status: 404 })
  })
})
