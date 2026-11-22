import type { Payload } from 'payload'

import { buildRc2World, teardownRc2World, type Rc2World } from './rc2-world'

/** Baseline fixtures only: none of these aliases grant Creator permissions. */
export interface CreatorStudioWorld {
  base: Rc2World
  suspendedMemberId: string
  guestIds: readonly string[]
  actors: {
    owner: string
    staff: string
    creator: string
    reviewerCandidate: string
    moderatorCandidate: string
    guestCandidate: string
    outsider: string
    anonymous: null
  }
}

export async function buildCreatorStudioWorld(payload: Payload): Promise<CreatorStudioWorld> {
  const base = await buildRc2World(payload)
  try {
    const guestIds: string[] = []
    for (const label of ['one', 'two']) {
      const guest = await payload.create({
        collection: 'members',
        data: {
          displayName: `Creator guest ${label} ${base.suffix}`,
          email: `creator-guest-${label}-${base.suffix}@example.test`,
          status: 'active',
        },
        overrideAccess: true,
      })
      ;(base.createdIds.members ||= []).push(String(guest.id))
      guestIds.push(String(guest.id))
    }
    const suspended = await payload.create({
      collection: 'members',
      data: {
        displayName: `Creator suspended ${base.suffix}`,
        email: `creator-suspended-${base.suffix}@example.test`,
        status: 'suspended',
      },
      overrideAccess: true,
    })
    ;(base.createdIds.members ||= []).push(String(suspended.id))
    const role = await payload.create({
      collection: 'member-site-roles',
      data: { member: suspended.id, site: base.siteA.siteId, role: 'member' },
      overrideAccess: true,
    })
    ;(base.createdIds['member-site-roles'] ||= []).push(String(role.id))
    return {
      base,
      suspendedMemberId: String(suspended.id),
      guestIds,
      actors: {
        owner: base.siteA.owner.memberId,
        staff: base.siteA.admin.memberId,
        creator: base.siteA.member.memberId,
        reviewerCandidate: base.siteA.editor.memberId,
        moderatorCandidate: base.siteB.admin.memberId,
        guestCandidate: guestIds[0]!,
        outsider: base.outsider.memberId,
        anonymous: null,
      },
    }
  } catch (error) {
    await teardownRc2World(payload, base)
    throw error
  }
}

export async function teardownCreatorStudioWorld(payload: Payload, world: CreatorStudioWorld) {
  await teardownRc2World(payload, world.base)
}
