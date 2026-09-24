import { describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260921_050000_comm_04a_forum_spaces'
import {
  ForumSpaceAccessError,
  initialSpaceMembershipForJoin,
  requireForumSpaceCapability,
  resolveForumSpaceAccess,
  type SpaceRole,
} from '@/modules/community/forum-space-access'

const siteId = '00000000-0000-7000-8000-000000000001'
const otherSiteId = '00000000-0000-7000-8000-000000000002'
const spaceId = '00000000-0000-7000-8000-000000000003'
const memberId = '00000000-0000-7000-8000-000000000004'

function payload(
  options: {
    visibility?: 'public' | 'member_only' | 'private' | 'hidden'
    role?: SpaceRole | null
    siteAdmin?: boolean
  } = {},
) {
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (text.includes('FROM forum_spaces')) {
      if (values[0] !== spaceId || values[1] !== siteId) return { rows: [] }
      return {
        rows: [
          {
            id: spaceId,
            siteId,
            parentId: null,
            name: 'General',
            slug: 'general',
            visibility: options.visibility ?? 'public',
            joinPolicy: 'open',
          },
        ],
      }
    }
    if (text.includes('FROM space_memberships'))
      return { rows: options.role ? [{ role: options.role }] : [] }
    if (text.includes('FROM member_site_roles'))
      return { rows: [{ exists: Boolean(options.siteAdmin) }] }
    return { rows: [] }
  })
  return { db: { pool: { query } }, query } as never
}

describe('COMM-04A: forum space hierarchy, membership roles, and access', () => {
  it('creates reversible site-scoped spaces, shallow hierarchy guard, and memberships', async () => {
    const execute = vi.fn(async (_statement: unknown) => undefined)
    await up({ db: { execute } } as never)
    await down({ db: { execute } } as never)
    const schema = JSON.stringify(execute.mock.calls[0]?.[0])
    expect(schema).toContain('forum_spaces_site_slug_unique')
    expect(schema).toContain('forum_spaces_parent_not_self')
    expect(schema).toContain('validate_forum_space_parent')
    expect(schema).toContain('space_memberships_space_member_unique')
    expect(schema).toContain("'hidden'")
    expect(JSON.stringify(execute.mock.calls[1]?.[0])).toContain('space_memberships')
  })

  it.each([
    ['viewer', false, false, false],
    ['contributor', true, true, false],
    ['moderator', true, true, true],
    ['administrator', true, true, true],
  ] as const)('resolves the %s capability matrix', async (role, creates, replies, pins) => {
    const access = await resolveForumSpaceAccess(payload({ role }), {
      siteId,
      spaceId,
      actor: { memberId },
    })
    expect(access.canView).toBe(true)
    expect(access.canCreateTopic).toBe(creates)
    expect(access.canReply).toBe(replies)
    expect(access.canPinLock).toBe(pins)
    expect(access.canManageMembers).toBe(role === 'administrator')
  })

  it('denies viewer topic creation and contributor pin/lock with a capability error', async () => {
    const viewer = await resolveForumSpaceAccess(payload({ role: 'viewer' }), {
      siteId,
      spaceId,
      actor: { memberId },
    })
    const contributor = await resolveForumSpaceAccess(payload({ role: 'contributor' }), {
      siteId,
      spaceId,
      actor: { memberId },
    })
    try {
      requireForumSpaceCapability(viewer, 'can_create_topic')
    } catch (error) {
      expect(error).toMatchObject({ status: 403, code: 'SPACE_CAPABILITY_DENIED' })
    }
    try {
      requireForumSpaceCapability(contributor, 'can_pin_lock')
    } catch (error) {
      expect(error).toMatchObject({ status: 403, code: 'SPACE_CAPABILITY_DENIED' })
    }
  })

  it('grants every capability to a site administrator without a space membership', async () => {
    const access = await resolveForumSpaceAccess(
      payload({ visibility: 'hidden', siteAdmin: true }),
      { siteId, spaceId, actor: { memberId } },
    )
    expect(access).toMatchObject({
      isSiteAdministrator: true,
      canCreateTopic: true,
      canReply: true,
      canPinLock: true,
      canManageMembers: true,
    })
  })

  it.each(['private', 'hidden'] as const)(
    'returns the same 404 for unauthorized %s spaces',
    async (visibility) => {
      const hidden = await resolveForumSpaceAccess(payload({ visibility }), { siteId, spaceId })
        .then(() => null)
        .catch((error) => error)
      const absent = await resolveForumSpaceAccess(payload(), {
        siteId,
        spaceId: '00000000-0000-7000-8000-000000000099',
      })
        .then(() => null)
        .catch((error) => error)
      expect(hidden).toBeInstanceOf(ForumSpaceAccessError)
      expect(hidden).toMatchObject({
        status: 404,
        code: 'SPACE_NOT_FOUND',
        message: 'Forum space not found.',
      })
      expect(absent).toMatchObject({
        status: 404,
        code: 'SPACE_NOT_FOUND',
        message: 'Forum space not found.',
      })
    },
  )

  it('blocks cross-site space lookup before membership can confer access', async () => {
    await expect(
      resolveForumSpaceAccess(payload({ role: 'administrator' }), {
        siteId: otherSiteId,
        spaceId,
        actor: { memberId },
      }),
    ).rejects.toMatchObject({ status: 404, code: 'SPACE_NOT_FOUND' })
  })

  it('models open and approval joins without silently accepting invite-only joins', () => {
    expect(initialSpaceMembershipForJoin('open')).toEqual({ status: 'active', role: 'viewer' })
    expect(initialSpaceMembershipForJoin('request_approval')).toEqual({
      status: 'pending',
      role: 'viewer',
    })
    try {
      initialSpaceMembershipForJoin('invite_only')
    } catch (error) {
      expect(error).toMatchObject({ status: 403, code: 'SPACE_INVITE_REQUIRED' })
    }
  })
})
