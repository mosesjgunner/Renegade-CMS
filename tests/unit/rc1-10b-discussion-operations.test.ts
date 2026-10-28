import { beforeEach, describe, expect, it, vi } from 'vitest'
import { discussionRows } from '@/modules/community/discussion-tree'
import { editComment, resolveCommunityActor } from '@/modules/community/service'
import { evaluateCommunityPolicy } from '@/modules/community/policy'
import { updateDiscussion, moderateDiscussionPost } from '@/modules/community/discussion-operations'
import { resetApiRateLimitsForTest } from '@/modules/integrations/rate-limit'
import { communityRealtime, emitCommunityEvent } from '@/modules/community/realtime'

const context = {
  siteId: 'alpha',
  now: new Date('2026-10-26T12:30:00Z'),
  actor: {
    kind: 'member' as const,
    memberId: 'alice',
    status: 'active' as const,
    isStaff: false,
    isModerator: false,
  },
}
beforeEach(() => resetApiRateLimitsForTest())
describe('canonical discussion controls', () => {
  it('resolves community authority without querying an unregistered collaboration collection', async () => {
    const find = vi.fn(async (_input: { collection: string }) => ({ docs: [] }))
    const payload = {
      collections: { 'member-site-roles': {}, relationships: {} },
      auth: async () => ({ user: { role: 'staff', member: 'alice' } }),
      findByID: async () => ({ status: 'active' }),
      find,
    } as never
    const actor = await resolveCommunityActor(payload, new Headers(), 'alpha')
    expect(actor.memberId).toBe('alice')
    expect(actor.isModerator).toBe(false)
    expect(
      find.mock.calls.every(
        (call) => (call[0] as { collection: string }).collection !== 'team-memberships',
      ),
    ).toBe(true)
  })
  it('leaves realtime sequence allocation to PostgreSQL and propagates registered storage failures', async () => {
    const create = vi.fn(async (_input: { data: Record<string, unknown> }) => ({ id: 'event' }))
    const payload = { collections: { 'realtime-events': {} }, create } as never
    const event = {
      type: 'community.comment_created' as const,
      siteId: 'alpha',
      payload: { commentId: 'comment' },
    }
    await emitCommunityEvent(payload, event)
    expect(create.mock.calls[0][0].data).not.toHaveProperty('sequence')
    create.mockRejectedValueOnce(new Error('Storage rejected event'))
    const publish = vi.spyOn(communityRealtime, 'emitCommunityEvent')
    await expect(emitCommunityEvent(payload, event)).rejects.toThrow('Storage rejected event')
    expect(publish).not.toHaveBeenCalled()
    publish.mockRestore()
  })
  it.each(['friends', 'unknown'])(
    'fails closed for %s visibility without a relationship grant',
    (visibility) => {
      expect(
        evaluateCommunityPolicy(
          context,
          { siteId: 'alpha', visibility, ownerId: 'someone-else' },
          'read',
        ).allowed,
      ).toBe(false)
    },
  )
  it('orders multiple branches by ancestry and preserves real multilevel depth', () => {
    const rows = discussionRows([
      { id: 'root' },
      { id: 'second-root' },
      { id: 'child', parent: 'root' },
      { id: 'grandchild', parent: 'child' },
    ])
    expect(rows.map(({ post, depth }) => [post.id, depth])).toEqual([
      ['root', 0],
      ['child', 1],
      ['grandchild', 2],
      ['second-root', 0],
    ])
  })
  it('bounds malformed cycles and renders children of hidden parents without losing records', () => {
    const rows = discussionRows([
      { id: 'a', parent: 'b' },
      { id: 'b', parent: 'a' },
      { id: 'orphan', parent: 'hidden' },
    ])
    expect(new Set(rows.map(({ post }) => post.id)).size).toBe(3)
    expect(rows).toHaveLength(3)
  })
  it.each(['draft', 'hidden', 'archived'])('excludes %s from ordinary reads', (status) => {
    expect(
      evaluateCommunityPolicy(context, { siteId: 'alpha', status, visibility: 'public' }, 'read')
        .allowed,
    ).toBe(false)
  })
  it('rejects an expired author edit without updating the post', async () => {
    const update = vi.fn()
    const payload = {
      findByID: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'discussions'
          ? { site: 'alpha', kind: 'thread', status: 'open' }
          : {
              discussion: 'thread',
              authorMember: 'alice',
              createdAt: '2026-10-26T12:00:00Z',
              status: 'published',
              moderationState: 'clear',
            },
      ),
      update,
    } as never
    await expect(
      editComment(
        payload,
        { siteId: 'alpha', commentId: 'post', authorMemberId: 'alice', body: 'Late change' },
        context,
      ),
    ).rejects.toMatchObject({ code: 'EDIT_WINDOW_EXPIRED', status: 403 })
    expect(update).not.toHaveBeenCalled()
  })
  it('rejects member and foreign-site moderator mutations before updating', async () => {
    const update = vi.fn()
    const payload = { findByID: vi.fn(async () => ({ site: 'beta' })), update } as never
    await expect(
      updateDiscussion(payload, 'thread', { pinned: true, reason: 'Attempt' }, context),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      updateDiscussion(
        payload,
        'thread',
        { pinned: true, reason: 'Attempt' },
        { ...context, actor: { ...context.actor, isModerator: true } },
      ),
    ).rejects.toMatchObject({ status: 404 })
    expect(update).not.toHaveBeenCalled()
  })
  it('does not allow arbitrary post moderation states or missing reasons', async () => {
    const payload = { findByID: vi.fn(), update: vi.fn() }
    await expect(
      moderateDiscussionPost(payload as never, 'post', 'invented', '', {
        ...context,
        actor: { ...context.actor, isModerator: true },
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(payload.findByID).not.toHaveBeenCalled()
  })
})
