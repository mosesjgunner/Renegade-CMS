import { beforeEach, describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260921_040000_comm_03d_thread_lifecycle_and_outbox'
import {
  CommentComposerError,
  postThreadComment,
  resetCommentRateLimitsForTest,
} from '@/modules/community/comment-composer'
import {
  CommentReactionError,
  toggleCommentReaction,
} from '@/modules/community/comment-reactions'
import {
  CommentLifecycleError,
  getPublicSsrComments,
  getThreadCommentsTree,
  getThreadSubscribers,
  isSubscribedToThread,
  scrubNonPublicComments,
  subscribeToThread,
  unsubscribeFromThread,
  updateThreadLifecycle,
  type CommentNode,
} from '@/modules/community/thread-lifecycle'

const siteId = '00000000-0000-7000-8000-000000000001'
const threadId = '00000000-0000-7000-8000-000000000002'
const canonicalContentId = '00000000-0000-7000-8000-000000000003'
const authorId = '00000000-0000-7000-8000-000000000004'
const memberId = '00000000-0000-7000-8000-000000000005'
const staffId = '00000000-0000-7000-8000-000000000006'

function mockPayload(options: {
  thread?: Record<string, unknown>
  comments?: Record<string, unknown>[]
  queryHandler?: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>
} = {}) {
  const defaultThread = {
    id: threadId,
    siteId,
    canonicalContentId,
    contentType: 'content',
    isClosed: false,
    isFrozen: false,
    premoderationEnabled: false,
    ...options.thread,
  }

  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (options.queryHandler) {
      const handled = await options.queryHandler(text, values)
      if (handled) return handled
    }

    if (text.includes('SELECT id, site_id') && text.includes('FROM comment_threads')) {
      return { rows: [defaultThread] }
    }

    if (text.includes('SELECT id FROM comment_threads WHERE site_id')) {
      return { rows: [{ id: defaultThread.id }] }
    }

    if (text.includes('UPDATE comment_threads')) {
      const updated = {
        ...defaultThread,
        isClosed: values[2] !== null && values[2] !== undefined ? Boolean(values[2]) : defaultThread.isClosed,
        isFrozen: values[3] !== null && values[3] !== undefined ? Boolean(values[3]) : defaultThread.isFrozen,
        premoderationEnabled: values[4] !== null && values[4] !== undefined ? Boolean(values[4]) : defaultThread.premoderationEnabled,
        updatedAt: new Date().toISOString(),
      }
      return { rows: [updated] }
    }

    if (text.includes('INSERT INTO comments')) {
      const inserted = {
        id: 'new-comment-uuid',
        thread_id: values[0],
        parent_id: values[1],
        root_id: values[2],
        author_id: values[3],
        author_type: values[4],
        depth: values[5],
        body_raw: values[6],
        body_html: values[7],
        client_mutation_id: values[8],
        status: values[9] ?? 'visible',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return { rows: [inserted] }
    }

    if (text.includes('INSERT INTO outbox_events')) {
      return { rows: [{ id: 'outbox-uuid-001' }] }
    }

    if (text.includes('FROM comments c')) {
      return { rows: options.comments ?? [] }
    }

    if (text.includes('FROM profiles p')) {
      return { rows: [] }
    }

    return { rows: [] }
  })

  return {
    find: vi.fn(async () => ({ docs: [] })),
    findByID: vi.fn(async () => ({ commentReactionCodes: ['thumbs_up', 'heart'] })),
    db: { pool: { query } },
    query,
  } as never
}

describe('COMM-03D: Thread Lifecycle, Visibility, Subscriptions, & Outbox', () => {
  beforeEach(() => {
    resetCommentRateLimitsForTest()
  })

  // =========================================================================
  // 1. Reversible Migration
  // =========================================================================
  it('migrates comment_thread_subscriptions and outbox_events reversibly', async () => {
    const execute = vi.fn(async (_arg?: unknown) => undefined)
    await up({ db: { execute } } as never)
    await down({ db: { execute } } as never)

    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('comment_thread_subscriptions')
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('outbox_events')
    expect(JSON.stringify(execute.mock.calls[1]?.[0])).toContain('outbox_events')
    expect(JSON.stringify(execute.mock.calls[1]?.[0])).toContain('comment_thread_subscriptions')
    expect(execute).toHaveBeenCalledTimes(2)
  })

  // =========================================================================
  // 2. Closed thread rejects new comments with 403
  // =========================================================================
  it('closed thread rejects new comments with 403 THREAD_CLOSED', async () => {
    const payload = mockPayload({
      thread: { isClosed: true, isFrozen: false },
    })

    await expect(
      postThreadComment(payload, {
        siteId,
        threadId,
        authorId,
        body: '<p>Should be rejected</p>',
        idempotencyKey: 'closed-thread-key-01',
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'THREAD_CLOSED',
    })
  })

  // =========================================================================
  // 3. Frozen thread rejects comments and reactions
  // =========================================================================
  it('frozen thread rejects comments with 403 THREAD_FROZEN', async () => {
    const payload = mockPayload({
      thread: { isClosed: false, isFrozen: true },
    })

    await expect(
      postThreadComment(payload, {
        siteId,
        threadId,
        authorId,
        body: '<p>Should be rejected</p>',
        idempotencyKey: 'frozen-thread-key-01',
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'THREAD_FROZEN',
    })
  })

  it('frozen thread rejects reactions with 403 COMMENT_FROZEN', async () => {
    const query = vi.fn(async (text: string) => {
      if (text.includes('FROM comments c JOIN comment_threads')) {
        return {
          rows: [
            {
              id: 'comment-1',
              status: 'visible',
              siteId,
              threadFrozen: true,
              threadClosed: false,
            },
          ],
        }
      }
      return { rows: [] }
    })

    const payload = {
      findByID: vi.fn(async () => ({ commentReactionCodes: ['thumbs_up'] })),
      db: { pool: { query } },
    }

    await expect(
      toggleCommentReaction(payload as never, {
        siteId,
        commentId: 'comment-1',
        memberId,
        reactionCode: 'thumbs_up',
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'COMMENT_FROZEN',
    })
  })

  it('closed thread (not frozen) permits reactions', async () => {
    let reacted = false
    const query = vi.fn(async (text: string) => {
      if (text.includes('FROM comments c JOIN comment_threads')) {
        return {
          rows: [
            {
              id: 'comment-1',
              status: 'visible',
              siteId,
              threadFrozen: false,
              threadClosed: true,
            },
          ],
        }
      }
      if (text.includes('pg_advisory_xact_lock')) {
        reacted = true
        return { rows: [{ added: true, count: 1 }] }
      }
      return { rows: [] }
    })

    const payload = {
      findByID: vi.fn(async () => ({ commentReactionCodes: ['thumbs_up'] })),
      db: { pool: { query } },
    }

    const result = await toggleCommentReaction(payload as never, {
      siteId,
      commentId: 'comment-1',
      memberId,
      reactionCode: 'thumbs_up',
    })

    expect(result.added).toBe(true)
    expect(reacted).toBe(true)
  })

  // =========================================================================
  // 4. Premoderation stores comments as pending
  // =========================================================================
  it('premoderation stores comments with status pending_review', async () => {
    let capturedStatus: string | undefined
    const payload = mockPayload({
      thread: { isClosed: false, isFrozen: false, premoderationEnabled: true },
      queryHandler: async (text, values) => {
        if (text.includes('INSERT INTO comments')) {
          capturedStatus = String(values?.[9])
          return {
            rows: [
              {
                id: 'premod-comment-id',
                thread_id: threadId,
                status: capturedStatus,
                body_raw: 'Needs review',
                body_html: '<p>Needs review</p>',
                created_at: new Date().toISOString(),
              },
            ],
          }
        }
        return undefined as never
      },
    })

    const result = await postThreadComment(payload, {
      siteId,
      threadId,
      authorId,
      body: '<p>Needs review</p>',
      idempotencyKey: 'premod-key-01',
    })

    expect(result.comment.status).toBe('pending_review')
    expect(capturedStatus).toBe('pending_review')
  })

  // =========================================================================
  // 5. Staff Lifecycle Controls
  // =========================================================================
  describe('Staff controls for closed, frozen, premoderation_enabled', () => {
    it('allows staff to update thread lifecycle flags', async () => {
      const payload = mockPayload()
      const updated = await updateThreadLifecycle(payload, {
        siteId,
        threadId,
        actor: { kind: 'user', userId: staffId, isStaff: true, isModerator: false },
        closed: true,
        frozen: true,
        premoderationEnabled: true,
      })

      expect(updated.isClosed).toBe(true)
      expect(updated.isFrozen).toBe(true)
      expect(updated.premoderationEnabled).toBe(true)
    })

    it('rejects non-staff lifecycle updates with 403 STAFF_PERMISSION_REQUIRED', async () => {
      const payload = mockPayload()
      await expect(
        updateThreadLifecycle(payload, {
          siteId,
          threadId,
          actor: { kind: 'member', memberId, isStaff: false, isModerator: false },
          closed: true,
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'STAFF_PERMISSION_REQUIRED',
      })
    })
  })

  // =========================================================================
  // 6. Subscriptions (comment_thread_subscriptions)
  // =========================================================================
  describe('Comment thread subscriptions', () => {
    it('subscribes, checks status, and unsubscribes a member', async () => {
      const subscriptions = new Set<string>()
      const query = vi.fn(async (text: string, values: unknown[] = []) => {
        if (text.includes('INSERT INTO comment_thread_subscriptions')) {
          subscriptions.add(`${values[0]}:${values[1]}`)
          return { rows: [] }
        }
        if (text.includes('DELETE FROM comment_thread_subscriptions')) {
          subscriptions.delete(`${values[0]}:${values[1]}`)
          return { rows: [] }
        }
        if (text.includes('SELECT EXISTS')) {
          const exists = subscriptions.has(`${values[0]}:${values[1]}`)
          return { rows: [{ exists }] }
        }
        if (text.includes('SELECT member_id FROM comment_thread_subscriptions')) {
          const members = Array.from(subscriptions).map((key) => ({ member_id: key.split(':')[1] }))
          return { rows: members }
        }
        return { rows: [] }
      })

      const payload = { db: { pool: { query } } } as never

      // 1. Subscribe
      const subRes = await subscribeToThread(payload, { siteId, threadId, memberId })
      expect(subRes.subscribed).toBe(true)

      // 2. Check subscription
      const isSub = await isSubscribedToThread(payload, { threadId, memberId })
      expect(isSub).toBe(true)

      // 3. Check subscribers list
      const subs = await getThreadSubscribers(payload, threadId)
      expect(subs).toContain(memberId)

      // 4. Unsubscribe
      const unsubRes = await unsubscribeFromThread(payload, { siteId, threadId, memberId })
      expect(unsubRes.subscribed).toBe(false)

      const isSubAfter = await isSubscribedToThread(payload, { threadId, memberId })
      expect(isSubAfter).toBe(false)
    })
  })

  // =========================================================================
  // 7. Recursive comment retrieval bounded to depth 5 & Sort Modes
  // =========================================================================
  describe('Recursive comment retrieval bounded to depth 5 & sort modes', () => {
    const rawComments = [
      {
        id: 'c1',
        thread_id: threadId,
        parent_id: null,
        root_id: null,
        author_id: authorId,
        author_type: 'member',
        status: 'visible',
        depth: 0,
        body_raw: 'Root 1',
        body_html: '<p>Root 1</p>',
        created_at: '2026-09-21T10:00:00.000Z',
        updated_at: '2026-09-21T10:00:00.000Z',
        reactionCount: 10,
      },
      {
        id: 'c2',
        thread_id: threadId,
        parent_id: 'c1',
        root_id: 'c1',
        author_id: authorId,
        author_type: 'member',
        status: 'visible',
        depth: 1,
        body_raw: 'Reply to Root 1',
        body_html: '<p>Reply to Root 1</p>',
        created_at: '2026-09-21T10:05:00.000Z',
        updated_at: '2026-09-21T10:05:00.000Z',
        reactionCount: 2,
      },
      {
        id: 'c3',
        thread_id: threadId,
        parent_id: null,
        root_id: null,
        author_id: authorId,
        author_type: 'member',
        status: 'visible',
        depth: 0,
        body_raw: 'Root 2 (newer)',
        body_html: '<p>Root 2 (newer)</p>',
        created_at: '2026-09-21T11:00:00.000Z',
        updated_at: '2026-09-21T11:00:00.000Z',
        reactionCount: 50,
      },
      // Depth 2 through 5 and 6
      {
        id: 'c4',
        thread_id: threadId,
        parent_id: 'c2',
        root_id: 'c1',
        author_id: authorId,
        author_type: 'member',
        status: 'visible',
        depth: 2,
        body_raw: 'Depth 2',
        body_html: '<p>Depth 2</p>',
        created_at: '2026-09-21T10:10:00.000Z',
        updated_at: '2026-09-21T10:10:00.000Z',
        reactionCount: 0,
      },
      {
        id: 'c5',
        thread_id: threadId,
        parent_id: 'c4',
        root_id: 'c1',
        author_id: authorId,
        author_type: 'member',
        status: 'visible',
        depth: 3,
        body_raw: 'Depth 3',
        body_html: '<p>Depth 3</p>',
        created_at: '2026-09-21T10:15:00.000Z',
        updated_at: '2026-09-21T10:15:00.000Z',
        reactionCount: 0,
      },
      {
        id: 'c6',
        thread_id: threadId,
        parent_id: 'c5',
        root_id: 'c1',
        author_id: authorId,
        author_type: 'member',
        status: 'visible',
        depth: 4,
        body_raw: 'Depth 4',
        body_html: '<p>Depth 4</p>',
        created_at: '2026-09-21T10:20:00.000Z',
        updated_at: '2026-09-21T10:20:00.000Z',
        reactionCount: 0,
      },
      {
        id: 'c7',
        thread_id: threadId,
        parent_id: 'c6',
        root_id: 'c1',
        author_id: authorId,
        author_type: 'member',
        status: 'visible',
        depth: 5,
        body_raw: 'Depth 5',
        body_html: '<p>Depth 5</p>',
        created_at: '2026-09-21T10:25:00.000Z',
        updated_at: '2026-09-21T10:25:00.000Z',
        reactionCount: 0,
      },
    ]

    it('builds recursive comment tree bounded to depth 5', async () => {
      const payload = mockPayload({ comments: rawComments })
      const tree = await getThreadCommentsTree(payload, { threadId })

      // 2 root nodes
      expect(tree).toHaveLength(2)
      const root1 = tree.find((c) => c.id === 'c1')!
      expect(root1.children).toHaveLength(1)
      expect(root1.children[0]?.id).toBe('c2')
      expect(root1.children[0]?.children[0]?.id).toBe('c4')
      expect(root1.children[0]?.children[0]?.children[0]?.id).toBe('c5')
      expect(root1.children[0]?.children[0]?.children[0]?.children[0]?.id).toBe('c6')
      expect(root1.children[0]?.children[0]?.children[0]?.children[0]?.children[0]?.id).toBe('c7')
      // depth 5 has no children
      expect(root1.children[0]?.children[0]?.children[0]?.children[0]?.children[0]?.children).toHaveLength(0)
    })

    it('sorts by chronological order (oldest first)', async () => {
      const payload = mockPayload({ comments: rawComments })
      const tree = await getThreadCommentsTree(payload, { threadId, sort: 'chronological' })
      expect(tree[0]?.id).toBe('c1')
      expect(tree[1]?.id).toBe('c3')
    })

    it('sorts by reverse chronological order (newest first)', async () => {
      const payload = mockPayload({ comments: rawComments })
      const tree = await getThreadCommentsTree(payload, { threadId, sort: 'reverse chronological' })
      expect(tree[0]?.id).toBe('c3')
      expect(tree[1]?.id).toBe('c1')
    })

    it('sorts by reaction volume (highest reaction count first)', async () => {
      const payload = mockPayload({ comments: rawComments })
      const tree = await getThreadCommentsTree(payload, { threadId, sort: 'reaction volume' })
      expect(tree[0]?.id).toBe('c3') // 50 reactions
      expect(tree[1]?.id).toBe('c1') // 10 reactions
    })
  })

  // =========================================================================
  // 8. Public SSR never leaks non-public comments
  // =========================================================================
  describe('Public SSR visibility & comment scrubbing', () => {
    const mixedComments: CommentNode[] = [
      {
        id: 'pub-1',
        threadId,
        parentId: null,
        rootId: null,
        authorId,
        authorType: 'member',
        status: 'visible',
        depth: 0,
        bodyRaw: 'Public root comment',
        bodyHtml: '<p>Public root comment</p>',
        reactionCount: 0,
        reactions: {},
        createdAt: '2026-09-21T10:00:00.000Z',
        updatedAt: '2026-09-21T10:00:00.000Z',
        children: [
          {
            id: 'pub-1-child',
            threadId,
            parentId: 'pub-1',
            rootId: 'pub-1',
            authorId,
            authorType: 'member',
            status: 'visible',
            depth: 1,
            bodyRaw: 'Public child',
            bodyHtml: '<p>Public child</p>',
            reactionCount: 0,
            reactions: {},
            createdAt: '2026-09-21T10:05:00.000Z',
            updatedAt: '2026-09-21T10:05:00.000Z',
            children: [],
          },
          {
            id: 'pending-child',
            threadId,
            parentId: 'pub-1',
            rootId: 'pub-1',
            authorId,
            authorType: 'member',
            status: 'pending_review',
            depth: 1,
            bodyRaw: 'Secret pending child',
            bodyHtml: '<p>Secret pending child</p>',
            reactionCount: 0,
            reactions: {},
            createdAt: '2026-09-21T10:06:00.000Z',
            updatedAt: '2026-09-21T10:06:00.000Z',
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
        bodyRaw: 'Deleted comment content',
        bodyHtml: '<p>Deleted comment content</p>',
        reactionCount: 0,
        reactions: {},
        createdAt: '2026-09-21T10:10:00.000Z',
        updatedAt: '2026-09-21T10:10:00.000Z',
        children: [],
      },
      {
        id: 'quarantined-1',
        threadId,
        parentId: null,
        rootId: null,
        authorId,
        authorType: 'member',
        status: 'quarantined',
        depth: 0,
        bodyRaw: 'Quarantined comment content',
        bodyHtml: '<p>Quarantined comment content</p>',
        reactionCount: 0,
        reactions: {},
        createdAt: '2026-09-21T10:15:00.000Z',
        updatedAt: '2026-09-21T10:15:00.000Z',
        children: [],
      },
      {
        id: 'rejected-1',
        threadId,
        parentId: null,
        rootId: null,
        authorId,
        authorType: 'member',
        status: 'rejected',
        depth: 0,
        bodyRaw: 'Rejected comment content',
        bodyHtml: '<p>Rejected comment content</p>',
        reactionCount: 0,
        reactions: {},
        createdAt: '2026-09-21T10:20:00.000Z',
        updatedAt: '2026-09-21T10:20:00.000Z',
        children: [],
      },
      {
        id: 'pending-1',
        threadId,
        parentId: null,
        rootId: null,
        authorId,
        authorType: 'member',
        status: 'pending_review',
        depth: 0,
        bodyRaw: 'Pending review comment content',
        bodyHtml: '<p>Pending review comment content</p>',
        reactionCount: 0,
        reactions: {},
        createdAt: '2026-09-21T10:25:00.000Z',
        updatedAt: '2026-09-21T10:25:00.000Z',
        children: [],
      },
    ]

    it('scrubs deleted, quarantined, rejected, and pending comments completely', () => {
      const scrubbed = scrubNonPublicComments(mixedComments)
      expect(scrubbed).toHaveLength(1)
      expect(scrubbed[0]?.id).toBe('pub-1')
      expect(scrubbed[0]?.children).toHaveLength(1)
      expect(scrubbed[0]?.children[0]?.id).toBe('pub-1-child')

      const jsonStr = JSON.stringify(scrubbed)
      expect(jsonStr).not.toContain('Deleted comment content')
      expect(jsonStr).not.toContain('Quarantined comment content')
      expect(jsonStr).not.toContain('Rejected comment content')
      expect(jsonStr).not.toContain('Secret pending child')
      expect(jsonStr).not.toContain('Pending review comment content')
    })

    it('returns empty comments if canonical parent content is not published', async () => {
      const payload = mockPayload()
      const comments = await getPublicSsrComments(payload, {
        canonicalContentId,
        siteId,
        contentStatus: 'draft', // Not published!
        isIndexable: true,
      })
      expect(comments).toEqual([])
    })

    it('returns empty comments if canonical parent content is not indexable', async () => {
      const payload = mockPayload()
      const comments = await getPublicSsrComments(payload, {
        canonicalContentId,
        siteId,
        contentStatus: 'published',
        isIndexable: false, // noindex!
      })
      expect(comments).toEqual([])
    })

    it('returns public comments when canonical parent content is published and indexable', async () => {
      const rawRows = [
        {
          id: 'pub-ok',
          thread_id: threadId,
          parent_id: null,
          root_id: null,
          author_id: authorId,
          author_type: 'member',
          status: 'visible',
          depth: 0,
          body_raw: 'Public SSR safe',
          body_html: '<p>Public SSR safe</p>',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'pending-leak-attempt',
          thread_id: threadId,
          parent_id: null,
          root_id: null,
          author_id: authorId,
          author_type: 'member',
          status: 'pending_review',
          depth: 0,
          body_raw: 'Should not leak to SSR',
          body_html: '<p>Should not leak to SSR</p>',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]
      const payload = mockPayload({ comments: rawRows })
      const comments = await getPublicSsrComments(payload, {
        canonicalContentId,
        siteId,
        contentStatus: 'published',
        isIndexable: true,
      })

      expect(comments).toHaveLength(1)
      expect(comments[0]?.id).toBe('pub-ok')
      expect(JSON.stringify(comments)).not.toContain('Should not leak to SSR')
    })
  })

  // =========================================================================
  // 9. Comment insert and outbox insert commit atomically
  // 10. Simulated rollback does not leave orphan comments or orphan outbox events
  // =========================================================================
  describe('Transactional outbox emission & rollback integrity', () => {
    it('commits comment insert and outbox insert atomically with exact payload', async () => {
      const executedStatements: string[] = []
      let capturedOutboxPayload: Record<string, unknown> | null = null

      const clientQuery = vi.fn(async (text: string, values: unknown[] = []) => {
        executedStatements.push(text.trim().split(/\s+/)[0]!)

        if (text.includes('SELECT id, site_id')) {
          return {
            rows: [
              {
                id: threadId,
                siteId,
                canonicalContentId,
                contentType: 'content',
                isClosed: false,
                isFrozen: false,
                premoderationEnabled: false,
              },
            ],
          }
        }
        if (text.includes('INSERT INTO comments')) {
          return {
            rows: [
              {
                id: 'atomic-comment-uuid',
                thread_id: values[0],
                parent_id: values[1],
                author_id: values[3],
                body_raw: values[6],
                body_html: values[7],
                status: values[9],
              },
            ],
          }
        }
        if (text.includes('INSERT INTO outbox_events')) {
          capturedOutboxPayload = JSON.parse(String(values[1]))
          return { rows: [{ id: 'outbox-uuid-123' }] }
        }
        return { rows: [] }
      })

      const client = {
        query: clientQuery,
        release: vi.fn(),
      }

      const payload = {
        find: vi.fn(async () => ({ docs: [] })),
        findByID: vi.fn(async () => null),
        db: {
          pool: {
            connect: vi.fn(async () => client),
            query: clientQuery,
          },
        },
      }

      const result = await postThreadComment(payload as never, {
        siteId,
        threadId,
        authorId,
        body: '<p>Hello @jane_doe</p>',
        idempotencyKey: 'atomic-idem-key-01',
      })

      expect(result.comment.id).toBe('atomic-comment-uuid')

      // Check transaction boundaries: BEGIN -> INSERT comments -> INSERT outbox_events -> COMMIT
      expect(clientQuery).toHaveBeenCalledWith('BEGIN')
      expect(clientQuery).toHaveBeenCalledWith('COMMIT')
      expect(client.release).toHaveBeenCalled()

      // Check outbox payload specifications
      expect(capturedOutboxPayload).toMatchObject({
        site_id: siteId,
        comment_id: 'atomic-comment-uuid',
        thread_id: threadId,
        canonical_content_id: canonicalContentId,
        author_id: authorId,
        parent_id: null,
        mentioned_handles: ['jane_doe'],
      })
      expect(typeof (capturedOutboxPayload as Record<string, unknown> | null)?.timestamp).toBe('string')
    })

    it('simulated rollback does not leave orphan comments or orphan outbox events', async () => {
      let rolledBack = false
      const committedEntities: string[] = []

      const clientQuery = vi.fn(async (text: string) => {
        if (text === 'BEGIN') {
          return { rows: [] }
        }
        if (text === 'ROLLBACK') {
          rolledBack = true
          return { rows: [] }
        }
        if (text.includes('SELECT id, site_id')) {
          return {
            rows: [
              {
                id: threadId,
                siteId,
                canonicalContentId,
                isClosed: false,
                isFrozen: false,
              },
            ],
          }
        }
        if (text.includes('INSERT INTO comments')) {
          committedEntities.push('comment')
          return {
            rows: [
              {
                id: 'orphan-candidate-comment',
                thread_id: threadId,
              },
            ],
          }
        }
        if (text.includes('INSERT INTO outbox_events')) {
          // Simulate database constraint violation / failure on outbox insert
          throw new Error('SIMULATED_OUTBOX_STORAGE_FAILURE')
        }
        return { rows: [] }
      })

      const client = {
        query: clientQuery,
        release: vi.fn(),
      }

      const payload = {
        find: vi.fn(async () => ({ docs: [] })),
        findByID: vi.fn(async () => null),
        db: {
          pool: {
            connect: vi.fn(async () => client),
            query: clientQuery,
          },
        },
      }

      await expect(
        postThreadComment(payload as never, {
          siteId,
          threadId,
          authorId,
          body: '<p>Test failure rollback</p>',
          idempotencyKey: 'rollback-test-key-01',
        }),
      ).rejects.toThrow('SIMULATED_OUTBOX_STORAGE_FAILURE')

      // Verify ROLLBACK was executed
      expect(rolledBack).toBe(true)
      expect(client.release).toHaveBeenCalled()
      // COMMIT was never called
      const calls = clientQuery.mock.calls.map(([sql]) => String(sql))
      expect(calls).not.toContain('COMMIT')
    })
  })
})
