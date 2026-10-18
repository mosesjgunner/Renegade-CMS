import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPersistedReviewComment,
  listPersistedReviewComments,
  transitionPersistedReviewComment,
} from '@/modules/editorial/persisted-review-comments'

const boundary = vi.hoisted(() => ({ allowed: true, authorized: true }))
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  createLocalReq: async ({ user }: { user: unknown }) => ({ user }),
}))
vi.mock('@/modules/operations/operator-grants', () => ({
  checkOperatorRecordAccess: vi.fn(async () => boundary.allowed),
  resolveOperatorGrantContext: vi.fn(async () => ({
    authorized: boundary.authorized,
    user: { member: 'member-a' },
  })),
}))
const user = { id: 'operator-a', role: 'staff', collection: 'users' } as never
const makePayload = () => ({
  collections: { 'editorial-comments': {}, 'editorial-discussions': {} },
  db: { beginTransaction: vi.fn() },
  find: vi.fn(async () => ({
    docs: [
      {
        id: 'comment-a',
        body: 'Persisted feedback',
        createdAt: '2026-10-17',
        updatedAt: '2026-10-17',
        review: { articleId: 'a', status: 'open', target: 'body' },
      },
      {
        id: 'comment-b',
        body: 'Resolved feedback',
        createdAt: '2026-10-17',
        updatedAt: '2026-10-17',
        review: { articleId: 'b', status: 'resolved', target: 'seo' },
      },
    ],
  })),
  create: vi.fn(),
  update: vi.fn(),
})
describe('Persisted workflow comment boundaries', () => {
  beforeEach(() => {
    boundary.allowed = true
    boundary.authorized = true
  })
  it('explains unavailable storage without starting a write', async () => {
    const payload = makePayload()
    payload.collections = {} as never
    await expect(
      createPersistedReviewComment(payload as never, user, { articleId: 'a', content: 'Feedback' }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('collaboration module'),
    })
    expect(payload.db.beginTransaction).not.toHaveBeenCalled()
  })
  it.each(['', ' '.repeat(3), 'x'.repeat(10001)])(
    'rejects invalid feedback length before writing',
    async (content) => {
      const payload = makePayload()
      await expect(
        createPersistedReviewComment(payload as never, user, { articleId: 'a', content }),
      ).rejects.toMatchObject({ status: 400 })
      expect(payload.create).not.toHaveBeenCalled()
    },
  )
  it('rejects a substituted article ID before starting a transaction', async () => {
    boundary.allowed = false
    const payload = makePayload()
    await expect(
      createPersistedReviewComment(payload as never, user, {
        articleId: 'foreign',
        content: 'Feedback',
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(payload.db.beginTransaction).not.toHaveBeenCalled()
  })
  it.each(['resolve', 'addressed'] as const)(
    'denies foreign comment %s without mutation',
    async (action) => {
      boundary.allowed = false
      const payload = makePayload()
      await expect(
        transitionPersistedReviewComment(payload as never, user, { commentId: 'foreign', action }),
      ).rejects.toMatchObject({ status: 403 })
      expect(payload.update).not.toHaveBeenCalled()
      expect(payload.db.beginTransaction).not.toHaveBeenCalled()
    },
  )
  it('lists persisted rows through canonical access and returns unresolved projections', async () => {
    const payload = makePayload()
    const comments = await listPersistedReviewComments(payload as never, user)
    expect(comments).toHaveLength(1)
    expect(comments[0]).toMatchObject({ id: 'comment-a', content: 'Persisted feedback' })
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideAccess: false,
        req: expect.objectContaining({ user }),
        pagination: false,
      }),
    )
  })
  it('includes resolved history only on an explicit all request', async () => {
    const payload = makePayload()
    expect(
      await listPersistedReviewComments(payload as never, user, { articleId: 'b', all: true }),
    ).toHaveLength(1)
    expect(
      await listPersistedReviewComments(payload as never, user, { articleId: 'b' }),
    ).toHaveLength(0)
  })
  it('denies list access after the final operator grant is revoked', async () => {
    boundary.authorized = false
    const payload = makePayload()
    await expect(listPersistedReviewComments(payload as never, user)).rejects.toMatchObject({
      status: 403,
    })
    expect(payload.find).not.toHaveBeenCalled()
  })
})
