import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  consumeCommentRateLimit,
  editThreadComment,
  extractMentions,
  linkResolvedMentions,
  postThreadComment,
  resetCommentRateLimitsForTest,
  sanitizeCommentHtml,
  toDeterministicUuid,
} from '@/modules/community/comment-composer'
import { toggleCommentReaction } from '@/modules/community/comment-reactions'
import {
  getThreadCommentsTree,
  getThreadLifecycle,
  getThreadSubscribers,
  isSubscribedToThread,
  scrubNonPublicComments,
  subscribeToThread,
  unsubscribeFromThread,
  updateThreadLifecycle,
  type CommentNode,
} from '@/modules/community/thread-lifecycle'
import type { CommunityActor } from '@/modules/community/contracts'

/**
 * COMM-03 (folded): the v1 comment surface on the live Payload
 * discussions / discussion-posts store (RC2-DEBT-20). Replaces the
 * SQL-mocked comm-03a/b/d suites, whose subjects (comment-identity,
 * the comments/comment_threads tables) retired in the fold. The
 * behavioral contracts pinned here are the same ones those suites
 * pinned: sanitization, mentions, idempotency window, edit window,
 * rate limit, lifecycle controls, tree shape, reactions, outbox.
 */

const siteId = '00000000-0000-7000-8000-000000000001'
const threadId = '00000000-0000-7000-8000-000000000002'
const canonicalContentId = '00000000-0000-7000-8000-000000000003'
const authorId = '00000000-0000-7000-8000-000000000004'
const memberId = '00000000-0000-7000-8000-000000000005'
const staffId = '00000000-0000-7000-8000-000000000006'

type Doc = Record<string, unknown>

function makeWorld(
  options: {
    discussion?: Doc
    failOutbox?: boolean
    reactionRows?: { target_id: string; emoji: string; count: number }[]
  } = {},
) {
  const discussion: Doc = {
    id: threadId,
    site: siteId,
    status: 'open',
    commentsPolicy: 'open',
    moderationState: 'clear',
    visibility: 'public',
    canonicalPath: '/content/story',
    attachedTo: { relationTo: 'content', value: canonicalContentId },
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...options.discussion,
  }
  const posts: Doc[] = []
  const outbox: Record<string, unknown>[] = []
  const audit: Record<string, unknown>[] = []
  const reactions = new Set<string>()
  const subscriptions = new Set<string>()
  let postSeq = 0

  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (text.includes('INSERT INTO outbox_events')) {
      if (options.failOutbox) throw new Error('SIMULATED_OUTBOX_STORAGE_FAILURE')
      outbox.push(JSON.parse(String(values[1])))
      return { rows: [{ id: 'outbox-1' }] }
    }
    if (text.includes('INSERT INTO community_audit_log')) {
      audit.push(JSON.parse(String(values[2])))
      return { rows: [] }
    }
    if (text.includes('FROM community_reactions') && text.includes('GROUP BY')) {
      return { rows: options.reactionRows ?? [] }
    }
    if (text.includes('WITH tuple_lock')) {
      const key = `${values[1]}:${values[2]}:${values[3]}`
      const existed = reactions.has(key)
      if (existed) reactions.delete(key)
      else reactions.add(key)
      const count = Array.from(reactions).filter(
        (k) => k.startsWith(`${values[1]}:`) && k.endsWith(`:${values[3]}`),
      ).length
      return { rows: [{ added: !existed, count }] }
    }
    if (text.includes('INSERT INTO comment_thread_subscriptions')) {
      subscriptions.add(`${values[0]}:${values[1]}`)
      return { rows: [] }
    }
    if (text.includes('DELETE FROM comment_thread_subscriptions')) {
      subscriptions.delete(`${values[0]}:${values[1]}`)
      return { rows: [] }
    }
    if (text.includes('SELECT EXISTS')) {
      return { rows: [{ exists: subscriptions.has(`${values[0]}:${values[1]}`) }] }
    }
    if (text.includes('SELECT member_id FROM comment_thread_subscriptions')) {
      return {
        rows: Array.from(subscriptions).map((key) => ({ member_id: key.split(':')[1] })),
      }
    }
    return { rows: [] }
  })

  const client = { query, release: vi.fn() }

  const payload = {
    find: vi.fn(async (args: { collection: string; where?: Doc; limit?: number }) => {
      if (args.collection !== 'discussion-posts') return { docs: [], totalDocs: 0 }
      const conditions =
        (args.where?.and as { [k: string]: { equals?: unknown } }[] | undefined) ?? []
      let docs = posts.slice()
      for (const cond of conditions) {
        if (cond.discussion?.equals)
          docs = docs.filter((p) => p.discussion === cond.discussion.equals)
        if (cond.clientMutationId?.equals)
          docs = docs.filter((p) => p.clientMutationId === cond.clientMutationId.equals)
      }
      if ((args.where as Doc | undefined)?.permalink)
        docs = docs.filter(
          (p) => p.permalink === ((args.where as Doc).permalink as { equals: unknown }).equals,
        )
      if ((args.where as Doc | undefined)?.discussion && !(args.where as Doc).and)
        docs = docs.filter(
          (p) => p.discussion === ((args.where as Doc).discussion as { equals: unknown }).equals,
        )
      return { docs, totalDocs: docs.length, hasNextPage: false }
    }),
    findByID: vi.fn(async (args: { collection: string; id: string }) => {
      if (args.collection === 'discussions') return args.id === threadId ? discussion : null
      if (args.collection === 'discussion-posts') return posts.find((p) => p.id === args.id) ?? null
      if (args.collection === 'sites')
        return { id: args.id, commentReactionCodes: ['thumbs_up', 'heart'] }
      return null
    }),
    create: vi.fn(async (args: { data: Doc }) => {
      postSeq++
      const doc: Doc = {
        id: `post-${postSeq}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...args.data,
      }
      posts.push(doc)
      return doc
    }),
    update: vi.fn(async (args: { collection: string; id: string; data: Doc }) => {
      if (args.collection === 'discussions') {
        Object.assign(discussion, args.data, { updatedAt: new Date().toISOString() })
        return discussion
      }
      const doc = posts.find((p) => p.id === args.id)
      if (!doc) throw new Error('not found')
      Object.assign(doc, args.data, { updatedAt: new Date().toISOString() })
      return doc
    }),
    delete: vi.fn(async (args: { id: string }) => {
      const idx = posts.findIndex((p) => p.id === args.id)
      if (idx >= 0) posts.splice(idx, 1)
      return { id: args.id }
    }),
    db: { pool: { query, connect: vi.fn(async () => client) } },
  }

  return { payload: payload as never, discussion, posts, outbox, audit, reactions, query }
}

const authorActor: CommunityActor = {
  kind: 'member',
  memberId: authorId,
  isStaff: false,
  isModerator: false,
}

beforeEach(() => {
  resetCommentRateLimitsForTest()
})

describe('COMM-03 folded: sanitization & mentions (unchanged pure contracts)', () => {
  it('strips script tags and executable contents completely', () => {
    expect(sanitizeCommentHtml('<p>Hi</p><script>alert(1)</script>')).not.toContain('script')
    expect(sanitizeCommentHtml('<p>Hi</p><script>alert(1)</script>')).toContain('Hi')
  })

  it('strips dangerous href protocols', () => {
    const out = sanitizeCommentHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toContain('javascript:')
  })

  it('preserves allowed markup and safe links', () => {
    const out = sanitizeCommentHtml(
      '<p>A <strong>bold</strong> <a href="https://x.test">link</a></p>',
    )
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('href="https://x.test"')
  })

  it('extracts mentions matching the handle pattern', () => {
    expect(extractMentions('hi @jane_doe and @bob-1')).toEqual(['jane_doe', 'bob-1'])
  })

  it('links resolved mentions without double-linking inside anchors or code', () => {
    const map = new Map([['jane_doe', { memberId: 'm1', handle: 'jane_doe' }]])
    const out = linkResolvedMentions('<p>@jane_doe</p><code>@jane_doe</code>', map)
    expect(out).toContain('<a href="/members/jane_doe">@jane_doe</a>')
    expect(out).toContain('<code>@jane_doe</code>')
  })
})

describe('COMM-03 folded: composer on the live store', () => {
  it('requires an idempotency key', async () => {
    const { payload } = makeWorld()
    await expect(
      postThreadComment(payload, { siteId, threadId, authorId, body: 'Hello', idempotencyKey: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' })
  })

  it('maps idempotency keys deterministically to UUIDs', () => {
    expect(toDeterministicUuid('client-req-001')).toBe(toDeterministicUuid('client-req-001'))
    expect(toDeterministicUuid('client-req-001')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('creates a discussion post, stores plain text, and emits the v1 outbox event', async () => {
    const world = makeWorld()
    const result = await postThreadComment(world.payload, {
      siteId,
      threadId,
      authorId,
      body: '<p>Hello <script>alert(1)</script>@jane_doe</p>',
      idempotencyKey: 'create-key-1',
    })
    expect(result.replayed).toBe(false)
    expect(world.posts).toHaveLength(1)
    expect(String(world.posts[0]?.body)).toBe('Hello @jane_doe')
    expect(world.posts[0]?.clientMutationId).toBe(toDeterministicUuid('create-key-1'))
    expect(world.outbox).toHaveLength(1)
    expect(world.outbox[0]).toMatchObject({
      site_id: siteId,
      comment_id: String(world.posts[0]?.id),
      thread_id: threadId,
      canonical_content_id: canonicalContentId,
      author_id: authorId,
      parent_id: null,
      mentioned_handles: ['jane_doe'],
    })
  })

  it('replays a duplicate key within 60 seconds without a second post', async () => {
    const world = makeWorld()
    const first = await postThreadComment(world.payload, {
      siteId,
      threadId,
      authorId,
      body: 'First post',
      idempotencyKey: 'dup-key-1',
    })
    const second = await postThreadComment(world.payload, {
      siteId,
      threadId,
      authorId,
      body: 'First post',
      idempotencyKey: 'dup-key-1',
      now: new Date(Date.now() + 30_000),
    })
    expect(second.replayed).toBe(true)
    expect(second.comment.id).toBe(first.comment.id)
    expect(world.posts).toHaveLength(1)
  })

  it('rejects a replay by a different author with 409', async () => {
    const world = makeWorld()
    await postThreadComment(world.payload, {
      siteId,
      threadId,
      authorId,
      body: 'Mine',
      idempotencyKey: 'dup-key-2',
    })
    await expect(
      postThreadComment(world.payload, {
        siteId,
        threadId,
        authorId: memberId,
        body: 'Mine',
        idempotencyKey: 'dup-key-2',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_AUTHOR_MISMATCH' })
  })

  it('rejects an expired idempotency key with 409', async () => {
    const world = makeWorld()
    const first = await postThreadComment(world.payload, {
      siteId,
      threadId,
      authorId,
      body: 'Old',
      idempotencyKey: 'dup-key-3',
      now: new Date('2026-09-21T10:00:00.000Z'),
    })
    expect(first.replayed).toBe(false)
    // The stored post carries the real creation time in this mock; move
    // the caller's clock beyond the window relative to it.
    const createdAt = new Date(String(world.posts[0]?.createdAt)).getTime()
    await expect(
      postThreadComment(world.payload, {
        siteId,
        threadId,
        authorId,
        body: 'Old',
        idempotencyKey: 'dup-key-3',
        now: new Date(createdAt + 61_000),
      }),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_EXPIRED' })
  })

  it('closed thread rejects new comments with 403 THREAD_CLOSED', async () => {
    const world = makeWorld({ discussion: { commentsPolicy: 'closed' } })
    await expect(
      postThreadComment(world.payload, {
        siteId,
        threadId,
        authorId,
        body: 'Nope',
        idempotencyKey: 'closed-key-1',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'THREAD_CLOSED' })
  })

  it('frozen (locked) thread rejects new comments with 403 THREAD_FROZEN', async () => {
    const world = makeWorld({ discussion: { status: 'locked' } })
    await expect(
      postThreadComment(world.payload, {
        siteId,
        threadId,
        authorId,
        body: 'Nope',
        idempotencyKey: 'frozen-key-1',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'THREAD_FROZEN' })
  })

  it('removes the created post when the outbox write fails', async () => {
    const world = makeWorld({ failOutbox: true })
    await expect(
      postThreadComment(world.payload, {
        siteId,
        threadId,
        authorId,
        body: 'Doomed',
        idempotencyKey: 'outbox-fail-1',
      }),
    ).rejects.toThrow('SIMULATED_OUTBOX_STORAGE_FAILURE')
    expect(world.posts).toHaveLength(0)
  })

  it('enforces the depth cap and parent thread membership', async () => {
    const world = makeWorld()
    let parentId: string | undefined
    for (let level = 0; level <= 5; level++) {
      const res = await postThreadComment(world.payload, {
        siteId,
        threadId,
        authorId: `depth-author-${level}`,
        parentId: parentId ?? null,
        body: `Level ${level}`,
        idempotencyKey: `depth-key-${level}`,
        now: new Date(Date.now() + level * 1000),
      })
      parentId = String(res.comment.id)
    }
    await expect(
      postThreadComment(world.payload, {
        siteId,
        threadId,
        authorId: 'depth-author-6',
        parentId,
        body: 'Too deep',
        idempotencyKey: 'depth-key-6',
      }),
    ).rejects.toMatchObject({ status: 422, code: 'COMMENT_DEPTH_EXCEEDED' })
  })

  it('rate limits the 6th comment in 60 seconds with 429', async () => {
    const world = makeWorld()
    const base = Date.now()
    for (let i = 1; i <= 5; i++) {
      await postThreadComment(world.payload, {
        siteId,
        threadId,
        authorId,
        body: `Comment ${i}`,
        idempotencyKey: `rate-key-${i}`,
        now: new Date(base + i * 1000),
      })
    }
    await expect(
      postThreadComment(world.payload, {
        siteId,
        threadId,
        authorId,
        body: 'Comment 6',
        idempotencyKey: 'rate-key-6',
        now: new Date(base + 10_000),
      }),
    ).rejects.toMatchObject({ status: 429, code: 'COMMENT_RATE_LIMITED' })
    expect(consumeCommentRateLimit('someone-else', base).allowed).toBe(true)
  })
})

describe('COMM-03 folded: edit window (15-minute rule)', () => {
  const createdAt = '2026-09-21T12:00:00.000Z'

  function worldWithComment() {
    const world = makeWorld()
    world.posts.push({
      id: 'comment-edit-1',
      discussion: threadId,
      authorMember: authorId,
      body: 'Original text',
      parent: null,
      status: 'published',
      moderationState: 'clear',
      clientMutationId: null,
      createdAt,
      updatedAt: createdAt,
    })
    return world
  }

  it('allows author edits within 15 minutes and records the previous body in the audit log', async () => {
    const world = worldWithComment()
    const updated = await editThreadComment(world.payload, {
      siteId,
      threadId,
      commentId: 'comment-edit-1',
      newBody: '<p>Edited text</p>',
      actor: authorActor,
      now: new Date('2026-09-21T12:10:00.000Z'),
    })
    expect(String(updated.body_raw)).toBe('Edited text')
    expect(world.audit).toHaveLength(1)
    expect(world.audit[0]).toMatchObject({
      comment_id: 'comment-edit-1',
      previous_body: 'Original text',
    })
  })

  it('allows author edits at exactly 14m59s', async () => {
    const world = worldWithComment()
    const updated = await editThreadComment(world.payload, {
      siteId,
      commentId: 'comment-edit-1',
      newBody: 'Still in window',
      actor: authorActor,
      now: new Date('2026-09-21T12:14:59.000Z'),
    })
    expect(String(updated.body_raw)).toBe('Still in window')
  })

  it('rejects author edits after 15 minutes', async () => {
    const world = worldWithComment()
    await expect(
      editThreadComment(world.payload, {
        siteId,
        commentId: 'comment-edit-1',
        newBody: 'Too late',
        actor: authorActor,
        now: new Date('2026-09-21T12:15:01.000Z'),
      }),
    ).rejects.toMatchObject({ status: 403, code: 'EDIT_WINDOW_EXPIRED' })
  })

  it('rejects other members within the window', async () => {
    const world = worldWithComment()
    await expect(
      editThreadComment(world.payload, {
        siteId,
        commentId: 'comment-edit-1',
        newBody: 'Not yours',
        actor: { kind: 'member', memberId, isStaff: false, isModerator: false },
        now: new Date('2026-09-21T12:05:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED_COMMENT_EDIT' })
  })

  it('rejects staff edits after the window without staff:community_moderate', async () => {
    const world = worldWithComment()
    await expect(
      editThreadComment(world.payload, {
        siteId,
        commentId: 'comment-edit-1',
        newBody: 'Staff edit',
        actor: {
          kind: 'user',
          userId: staffId,
          isStaff: true,
          isModerator: false,
          permissions: ['content.read'],
        },
        now: new Date('2026-09-21T13:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 403, code: 'EDIT_WINDOW_EXPIRED' })
  })

  it('allows staff edits after the window with staff:community_moderate', async () => {
    const world = worldWithComment()
    const updated = await editThreadComment(world.payload, {
      siteId,
      commentId: 'comment-edit-1',
      newBody: 'Moderated edit',
      actor: {
        kind: 'user',
        userId: staffId,
        isStaff: true,
        isModerator: false,
        permissions: ['staff:community_moderate'],
      },
      now: new Date('2026-09-21T13:00:00.000Z'),
    })
    expect(String(updated.body_raw)).toBe('Moderated edit')
  })

  it('rejects edits to a removed comment', async () => {
    const world = worldWithComment()
    world.posts[0]!.status = 'removed'
    await expect(
      editThreadComment(world.payload, {
        siteId,
        commentId: 'comment-edit-1',
        newBody: 'Zombie',
        actor: authorActor,
        now: new Date('2026-09-21T12:05:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 422, code: 'COMMENT_DELETED' })
  })
})

describe('COMM-03 folded: lifecycle controls on discussions', () => {
  it('reads lifecycle state from the discussion', async () => {
    const world = makeWorld({ discussion: { commentsPolicy: 'closed', status: 'locked' } })
    const thread = await getThreadLifecycle(world.payload, { siteId, threadId })
    expect(thread.isClosed).toBe(true)
    expect(thread.isFrozen).toBe(true)
    expect(thread.canonicalContentId).toBe(canonicalContentId)
    expect(thread.premoderationEnabled).toBe(false)
  })

  it('staff can close and freeze through the live controls', async () => {
    const world = makeWorld()
    const staff: CommunityActor = {
      kind: 'user',
      userId: staffId,
      isStaff: true,
      isModerator: false,
    }
    const updated = await updateThreadLifecycle(world.payload, {
      siteId,
      threadId,
      actor: staff,
      closed: true,
      frozen: true,
    })
    expect(updated.isClosed).toBe(true)
    expect(updated.isFrozen).toBe(true)
    expect(world.discussion.commentsPolicy).toBe('closed')
    expect(world.discussion.status).toBe('locked')
  })

  it('rejects non-staff lifecycle updates', async () => {
    const world = makeWorld()
    await expect(
      updateThreadLifecycle(world.payload, {
        siteId,
        threadId,
        actor: { kind: 'member', memberId, isStaff: false, isModerator: false },
        closed: true,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'STAFF_PERMISSION_REQUIRED' })
  })

  it('rejects the premoderation control honestly instead of dropping it', async () => {
    const world = makeWorld()
    await expect(
      updateThreadLifecycle(world.payload, {
        siteId,
        threadId,
        actor: { kind: 'user', userId: staffId, isStaff: true, isModerator: false },
        premoderationEnabled: true,
      }),
    ).rejects.toMatchObject({ status: 422, code: 'UNSUPPORTED_LIFECYCLE_CONTROL' })
  })
})

describe('COMM-03 folded: comment tree over discussion-posts', () => {
  function seedTree(world: ReturnType<typeof makeWorld>) {
    const base = [
      { id: 'c1', parent: null, body: 'Root 1', createdAt: '2026-09-21T10:00:00.000Z' },
      { id: 'c2', parent: 'c1', body: 'Reply', createdAt: '2026-09-21T10:05:00.000Z' },
      { id: 'c3', parent: null, body: 'Root 2', createdAt: '2026-09-21T11:00:00.000Z' },
      { id: 'c4', parent: 'c2', body: 'Depth 2', createdAt: '2026-09-21T10:10:00.000Z' },
      { id: 'c5', parent: 'c4', body: 'Depth 3', createdAt: '2026-09-21T10:15:00.000Z' },
      { id: 'c6', parent: 'c5', body: 'Depth 4', createdAt: '2026-09-21T10:20:00.000Z' },
      { id: 'c7', parent: 'c6', body: 'Depth 5', createdAt: '2026-09-21T10:25:00.000Z' },
      {
        id: 'c8',
        parent: null,
        body: 'Hidden root',
        createdAt: '2026-09-21T11:05:00.000Z',
        status: 'hidden',
      },
    ]
    for (const row of base) {
      world.posts.push({
        discussion: threadId,
        authorMember: authorId,
        status: 'published',
        moderationState: 'clear',
        updatedAt: row.createdAt,
        ...row,
      })
    }
  }

  it('builds the recursive tree bounded to depth 5 and hides non-public posts', async () => {
    const world = makeWorld({
      reactionRows: [
        { target_id: 'c1', emoji: 'thumbs_up', count: 10 },
        { target_id: 'c3', emoji: 'thumbs_up', count: 50 },
      ],
    })
    seedTree(world)
    const tree = await getThreadCommentsTree(world.payload, { threadId })
    expect(tree.map((n) => n.id)).toEqual(['c1', 'c3'])
    const root1 = tree[0]!
    expect(root1.reactionCount).toBe(10)
    expect(root1.children[0]?.id).toBe('c2')
    expect(root1.children[0]?.children[0]?.children[0]?.children[0]?.children[0]?.id).toBe('c7')
    expect(
      root1.children[0]?.children[0]?.children[0]?.children[0]?.children[0]?.children,
    ).toHaveLength(0)
  })

  it('sorts roots by reaction volume when asked', async () => {
    const world = makeWorld({
      reactionRows: [
        { target_id: 'c1', emoji: 'thumbs_up', count: 10 },
        { target_id: 'c3', emoji: 'thumbs_up', count: 50 },
      ],
    })
    seedTree(world)
    const tree = await getThreadCommentsTree(world.payload, { threadId, sort: 'reaction volume' })
    expect(tree[0]?.id).toBe('c3')
    expect(tree[1]?.id).toBe('c1')
  })

  it('scrubs non-public nodes from a tree', () => {
    const nodes: CommentNode[] = [
      {
        id: 'pub-1',
        threadId,
        parentId: null,
        rootId: null,
        authorId,
        authorType: 'member',
        status: 'visible',
        depth: 0,
        bodyRaw: 'Public',
        bodyHtml: 'Public',
        reactionCount: 0,
        reactions: {},
        createdAt: '2026-09-21T10:00:00.000Z',
        updatedAt: '2026-09-21T10:00:00.000Z',
        children: [
          {
            id: 'pending-child',
            threadId,
            parentId: 'pub-1',
            rootId: 'pub-1',
            authorId,
            authorType: 'member',
            status: 'pending_review',
            depth: 1,
            bodyRaw: 'Secret',
            bodyHtml: 'Secret',
            reactionCount: 0,
            reactions: {},
            createdAt: '2026-09-21T10:05:00.000Z',
            updatedAt: '2026-09-21T10:05:00.000Z',
            children: [],
          },
        ],
      },
      {
        id: 'deleted-1',
        threadId,
        parentId: null,
        rootId: null,
        authorId,
        authorType: 'member',
        status: 'deleted',
        depth: 0,
        bodyRaw: 'Deleted content',
        bodyHtml: 'Deleted content',
        reactionCount: 0,
        reactions: {},
        createdAt: '2026-09-21T10:10:00.000Z',
        updatedAt: '2026-09-21T10:10:00.000Z',
        children: [],
      },
    ]
    const scrubbed = scrubNonPublicComments(nodes)
    expect(scrubbed).toHaveLength(1)
    expect(scrubbed[0]?.children).toHaveLength(0)
    expect(JSON.stringify(scrubbed)).not.toContain('Deleted content')
    expect(JSON.stringify(scrubbed)).not.toContain('Secret')
  })
})

describe('COMM-03 folded: reactions on the live store', () => {
  function worldWithPost(discussion: Doc = {}) {
    const world = makeWorld({ discussion })
    world.posts.push({
      id: 'comment-1',
      discussion: threadId,
      authorMember: authorId,
      body: 'React to me',
      parent: null,
      status: 'published',
      moderationState: 'clear',
      createdAt: '2026-09-21T10:00:00.000Z',
      updatedAt: '2026-09-21T10:00:00.000Z',
    })
    return world
  }

  it('toggles a reaction on and off in community_reactions', async () => {
    const world = worldWithPost()
    const added = await toggleCommentReaction(world.payload, {
      siteId,
      commentId: 'comment-1',
      memberId,
      reactionCode: 'thumbs_up',
    })
    expect(added).toEqual({ added: true, reactionCode: 'thumbs_up', count: 1 })
    const removed = await toggleCommentReaction(world.payload, {
      siteId,
      commentId: 'comment-1',
      memberId,
      reactionCode: 'thumbs_up',
    })
    expect(removed).toEqual({ added: false, reactionCode: 'thumbs_up', count: 0 })
  })

  it('rejects reactions on a frozen thread', async () => {
    const world = worldWithPost({ status: 'locked' })
    await expect(
      toggleCommentReaction(world.payload, {
        siteId,
        commentId: 'comment-1',
        memberId,
        reactionCode: 'thumbs_up',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'COMMENT_FROZEN' })
  })

  it('permits reactions on a closed (not frozen) thread', async () => {
    const world = worldWithPost({ commentsPolicy: 'closed' })
    const result = await toggleCommentReaction(world.payload, {
      siteId,
      commentId: 'comment-1',
      memberId,
      reactionCode: 'thumbs_up',
    })
    expect(result.added).toBe(true)
  })

  it('rejects reactions from another site and on removed comments', async () => {
    const world = worldWithPost()
    await expect(
      toggleCommentReaction(world.payload, {
        siteId: '00000000-0000-7000-8000-000000000099',
        commentId: 'comment-1',
        memberId,
        reactionCode: 'thumbs_up',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'SITE_MISMATCH' })
    world.posts[0]!.status = 'removed'
    await expect(
      toggleCommentReaction(world.payload, {
        siteId,
        commentId: 'comment-1',
        memberId,
        reactionCode: 'thumbs_up',
      }),
    ).rejects.toMatchObject({ status: 422, code: 'COMMENT_DELETED' })
  })

  it('rejects reaction codes the site has not enabled', async () => {
    const world = worldWithPost()
    await expect(
      toggleCommentReaction(world.payload, {
        siteId,
        commentId: 'comment-1',
        memberId,
        reactionCode: 'party_popper',
      }),
    ).rejects.toMatchObject({ status: 422, code: 'INVALID_REACTION_CODE' })
  })
})

describe('COMM-03 folded: thread subscriptions (unchanged store, discussion ids)', () => {
  it('subscribes, checks, lists, and unsubscribes', async () => {
    const world = makeWorld()
    const sub = await subscribeToThread(world.payload, { siteId, threadId, memberId })
    expect(sub.subscribed).toBe(true)
    expect(await isSubscribedToThread(world.payload, { threadId, memberId })).toBe(true)
    expect(await getThreadSubscribers(world.payload, threadId)).toContain(memberId)
    const unsub = await unsubscribeFromThread(world.payload, { siteId, threadId, memberId })
    expect(unsub.subscribed).toBe(false)
    expect(await isSubscribedToThread(world.payload, { threadId, memberId })).toBe(false)
  })
})
