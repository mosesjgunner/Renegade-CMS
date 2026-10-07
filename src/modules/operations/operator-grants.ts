import type { Payload } from 'payload'

export interface OperatorGrantContext {
  authorized: boolean
  user: {
    id: string
    email?: string | null
    role?: string | null
    member?: string | null
  }
  authorizedSiteIds: string[]
  isGlobalOwner: boolean
}

const asId = (value: unknown): string => {
  if (!value) return ''
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: unknown }).id ?? '')
  }
  return String(value)
}

/**
 * Resolves the canonical site grants for an administrative / staff user.
 * - 'owner': Global superuser; has implicit authority over all sites.
 * - 'administrator', 'publisher', 'staff': Authority bounded strictly by their
 *   linked canonical Member record and explicit `member-site-roles` grants.
 */
export async function resolveOperatorGrantContext(
  payload: Payload,
  user: { id?: unknown; email?: unknown; role?: unknown; member?: unknown } | null | undefined,
): Promise<OperatorGrantContext> {
  const userId = asId(user?.id)
  const role = String(user?.role ?? '')
  const email = user?.email ? String(user.email) : null
  const memberRelation = asId(user?.member)

  const emptyContext: OperatorGrantContext = {
    authorized: false,
    user: { id: userId, email, role, member: memberRelation || null },
    authorizedSiteIds: [],
    isGlobalOwner: false,
  }

  if (!userId || !['owner', 'administrator', 'publisher', 'staff'].includes(role)) {
    return emptyContext
  }

  if (role === 'owner') {
    try {
      const allSites = await payload.find({
        collection: 'sites',
        depth: 0,
        limit: 100,
        overrideAccess: true,
      })
      const siteIds = allSites.docs.map((d) => String(d.id))
      return {
        authorized: true,
        user: { id: userId, email, role, member: memberRelation || null },
        authorizedSiteIds: siteIds,
        isGlobalOwner: true,
      }
    } catch {
      return {
        authorized: true,
        user: { id: userId, email, role, member: memberRelation || null },
        authorizedSiteIds: [],
        isGlobalOwner: true,
      }
    }
  }

  // Scoped operator (administrator, publisher, staff): resolve canonical member
  let memberId = memberRelation
  if (!memberId && email) {
    try {
      const memberRes = await payload.find({
        collection: 'members',
        where: { email: { equals: email } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      if (memberRes.docs.length > 0) {
        memberId = String(memberRes.docs[0].id)
      }
    } catch {
      // ignore
    }
  }

  if (!memberId) {
    return emptyContext
  }

  try {
    const roleGrants = await payload.find({
      collection: 'member-site-roles',
      where: { member: { equals: memberId } },
      depth: 0,
      limit: 100,
      overrideAccess: true,
    })

    const authorizedSiteIds = Array.from(
      new Set(
        roleGrants.docs
          .map((doc) => asId((doc as unknown as Record<string, unknown>).site))
          .filter(Boolean),
      ),
    )

    return {
      authorized: authorizedSiteIds.length > 0,
      user: { id: userId, email, role, member: memberId },
      authorizedSiteIds,
      isGlobalOwner: false,
    }
  } catch {
    return emptyContext
  }
}

/**
 * Asserts whether a given operator has authority over the specified siteId.
 */
export async function checkOperatorSiteAccess(
  payload: Payload,
  user: { id?: unknown; email?: unknown; role?: unknown; member?: unknown } | null | undefined,
  siteId: string | null | undefined,
): Promise<boolean> {
  if (!siteId) return false
  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.authorized) return false
  if (grant.isGlobalOwner) return true
  return grant.authorizedSiteIds.includes(String(siteId))
}
