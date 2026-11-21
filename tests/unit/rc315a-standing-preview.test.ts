import { describe, expect, it } from 'vitest'
import { postingStandingDecision } from '../../src/modules/community/site-standing'
import { evaluateCommunityPolicy } from '../../src/modules/community/policy'
import { projectMemberProfile } from '../../src/modules/community/profile-projection'

describe('RC3-15A site standing decision preview', () => {
  it('keeps legacy friends profiles private from a one-way follower', () => {
    const profile = { id: 'p', member: 'owner', visibility: 'friends' }
    expect(() =>
      projectMemberProfile(profile, { signedIn: true, memberId: 'follower', following: true }),
    ).toThrow('Profile unavailable')
    expect(projectMemberProfile(profile, { signedIn: true, memberId: 'owner' })).toMatchObject({
      visibility: 'friends',
      visibilityNotice: 'Legacy friends visibility is treated as private.',
    })
    expect(
      evaluateCommunityPolicy(
        {
          siteId: 's',
          actor: { kind: 'member', memberId: 'follower', isStaff: false, isModerator: false },
        },
        { siteId: 's', visibility: 'friends', ownerId: 'owner' },
        'read',
        { isBlocked: false, isFollowing: true },
      ).allowed,
    ).toBe(false)
  })
  it('reports a hypothetical join requirement while preserving existing reply behavior', () => {
    const preview = postingStandingDecision(false)
    expect(preview).toEqual({
      decision: 'owner-decision-required',
      enforcementEnabled: false,
      wouldRequireJoin: true,
    })
    expect(postingStandingDecision(true).wouldRequireJoin).toBe(false)
    expect(
      evaluateCommunityPolicy(
        {
          siteId: 'site-b',
          actor: {
            kind: 'member',
            memberId: 'member-a',
            status: 'active',
            isStaff: false,
            isModerator: false,
          },
        },
        { siteId: 'site-b', status: 'open', commentsPolicy: 'open' },
        'reply',
      ).allowed,
    ).toBe(true)
  })
})
