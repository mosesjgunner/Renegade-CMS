import type { Payload } from 'payload'

/**
 * Per-site member standing (member-standing model C — one identity,
 * per-site standing; owner decision, 2026-11-12).
 *
 * A member's standing on a site is their `member-site-roles` row for that
 * site. Joining a site provisions the plain 'member' row; the row is what
 * the moderation resolvers join through, so a joined member is reportable
 * and sanctionable on that site — and only that site (RC2-DEBT-19: before
 * this, self-signup and ordinary participation never created the row, so
 * reporting an ordinary member's profile returned 404 and no moderation
 * case could ever open against them).
 *
 * A plain 'member' row confers no community authority: the actor resolver
 * and the grant resolver only honor moderator / community-manager /
 * operator roles, never 'member'. Provisioning goes through Payload with
 * overrideAccess (the collection's REST create stays owner-only, for
 * operator grants), and the collection's afterChange hook writes the
 * site-role.granted audit event for free.
 */
export interface SiteStanding {
  id: string
  siteId: string
  memberId: string
  role: string
  created: boolean
}

/** Compatibility preview only. An owner decision is required before enforcement. */
export function postingStandingDecision(joined: boolean) {
  return {
    decision: 'owner-decision-required' as const,
    enforcementEnabled: false as const,
    wouldRequireJoin: !joined,
  }
}

export async function findSiteStanding(
  payload: Payload,
  siteId: string,
  memberId: string,
): Promise<SiteStanding | null> {
  const found = await payload.find({
    collection: 'member-site-roles',
    where: {
      and: [{ site: { equals: siteId } }, { member: { equals: memberId } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = found.docs[0] as unknown as Record<string, unknown> | undefined
  if (!doc) return null
  return {
    id: String(doc.id),
    siteId,
    memberId,
    role: String(doc.role ?? 'member'),
    created: false,
  }
}

export async function joinSite(
  payload: Payload,
  siteId: string,
  memberId: string,
): Promise<SiteStanding> {
  const existing = await findSiteStanding(payload, siteId, memberId)
  if (existing) return existing
  try {
    const doc = (await payload.create({
      collection: 'member-site-roles',
      data: { site: siteId, member: memberId, role: 'member' },
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
    return {
      id: String(doc.id),
      siteId,
      memberId,
      role: String(doc.role ?? 'member'),
      created: true,
    }
  } catch {
    // The (site, member) unique index makes a concurrent join race safe:
    // the loser of the race re-reads the row the winner created.
    const raced = await findSiteStanding(payload, siteId, memberId)
    if (raced) return raced
    throw new Error('Could not provision site standing.')
  }
}
