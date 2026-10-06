import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { resolveCommunityActor } from '../../src/modules/community/service'

vi.mock('../../src/modules/identity/member-identity', () => ({
  readMemberSession: () => undefined,
  currentMember: vi.fn(),
  changeMemberAccountState: vi.fn(),
}))

function store(role: string | null, grantedSite: string | null, linked = true) {
  return {
    auth: async () => ({
      user: role ? { id: 'user', role, member: linked ? 'member' : null } : null,
    }),
    findByID: async () => ({ id: 'member', status: 'active' }),
    find: async ({
      collection,
      where,
    }: {
      collection: string
      where: { and: Array<Record<string, { equals?: string }>> }
    }) => ({
      docs:
        collection === 'member-site-roles' &&
        where.and.some((term) => term.site?.equals === grantedSite)
          ? [{ id: 'grant' }]
          : [],
    }),
  } as unknown as Payload
}

describe('admin identity retains site-specific community authority', () => {
  for (const role of ['owner', 'administrator', 'staff']) {
    it(`${role} can moderate only a site with a canonical-member grant`, async () => {
      expect(
        await resolveCommunityActor(store(role, 'site-a'), new Headers(), 'site-a'),
      ).toMatchObject({ memberId: 'member', isModerator: true, isStaff: false })
      expect(
        await resolveCommunityActor(store(role, 'site-a'), new Headers(), 'site-b'),
      ).toMatchObject({ isModerator: false, isStaff: false })
    })
    it(`${role} alone grants no moderation privilege`, async () => {
      expect(await resolveCommunityActor(store(role, null), new Headers(), 'site-a')).toMatchObject(
        { isModerator: false, isStaff: false },
      )
    })
  }
  it('rejects an anonymous identity and an unlinked admin identity', async () => {
    expect(await resolveCommunityActor(store(null, null), new Headers(), 'site-a')).toMatchObject({
      kind: 'anonymous',
      isModerator: false,
    })
    expect(
      await resolveCommunityActor(store('owner', 'site-a', false), new Headers(), 'site-a'),
    ).toMatchObject({ kind: 'anonymous', isModerator: false })
  })
})
