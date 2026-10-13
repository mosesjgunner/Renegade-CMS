import type { Access, CollectionSlug, Payload } from 'payload'

/** Child records inherit authority from their persisted parent, never a caller's site hint. */
export function operatorRelatedSiteAccess(sitePath: string, parentCollection: CollectionSlug) {
  const [relation, ...parentPath] = sitePath.split('.')
  const read: Access = async ({ req }) => {
    const grant = await resolveOperatorGrantContext(req.payload, req.user)
    if (!grant.authorized) return false
    return grant.isGlobalOwner ? true : { [sitePath]: { in: grant.authorizedSiteIds } }
  }
  const canReference: Access = async ({ req, data }) => {
    const grant = await resolveOperatorGrantContext(req.payload, req.user)
    if (!grant.authorized) return false
    if (!data || !Object.prototype.hasOwnProperty.call(data, relation)) return true
    const id = asId(data[relation])
    if (!id) return false
    const result = await req.payload.count({
      collection: parentCollection,
      where: grant.isGlobalOwner
        ? { id: { equals: id } }
        : {
            and: [
              { id: { equals: id } },
              { [parentPath.join('.')]: { in: grant.authorizedSiteIds } },
            ],
          },
      overrideAccess: true,
    })
    return result.totalDocs === 1
  }
  const update: Access = async (args) => ((await canReference(args)) ? read(args) : false)
  return { create: canReference, read, update, delete: read }
}

/** Native Payload reads must apply the same site grants as operator APIs. */
export const operatorSiteReadAccess: Access = async ({ req }) => {
  const grant = await resolveOperatorGrantContext(req.payload, req.user)
  if (!grant.authorized) return false
  if (grant.isGlobalOwner) return true
  return { site: { in: grant.authorizedSiteIds } }
}

export async function checkOperatorRecordAccess(
  payload: Payload,
  user: Parameters<typeof resolveOperatorGrantContext>[1],
  collection: CollectionSlug,
  id: string,
  sitePath = 'site',
): Promise<boolean> {
  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.authorized) return false
  const result = await payload.count({
    collection,
    overrideAccess: true,
    where: grant.isGlobalOwner
      ? { id: { equals: id } }
      : {
          and: [{ id: { equals: id } }, { [sitePath]: { in: grant.authorizedSiteIds } }],
        },
  })
  return result.totalDocs === 1
}

export const operatorSiteCreateAccess: Access = async ({ req, data }) => {
  // Payload evaluates permission to open the create form before it has form data.
  if (data?.site === undefined)
    return (await resolveOperatorGrantContext(req.payload, req.user)).authorized
  return checkOperatorSiteAccess(req.payload, req.user, asId(data?.site))
}

export const operatorSiteUpdateAccess: Access = async ({ req, data }) => {
  if (
    data &&
    Object.prototype.hasOwnProperty.call(data, 'site') &&
    !(await checkOperatorSiteAccess(req.payload, req.user, asId(data.site)))
  )
    return false
  return operatorSiteReadAccess({ req })
}

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
  const role = String(user?.role ?? '')
  const userId = asId(user?.id) || (role ? 'operator' : '')
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

  if (Array.isArray((user as { authorizedSiteIds?: string[] })?.authorizedSiteIds)) {
    const authorizedSiteIds = ((user as { authorizedSiteIds?: string[] }).authorizedSiteIds || [])
      .map(String)
      .filter(Boolean)
    return {
      authorized:
        authorizedSiteIds.length > 0 ||
        (role === 'owner' && Boolean((user as { isGlobalOwner?: boolean })?.isGlobalOwner)),
      user: { id: userId, email, role, member: memberRelation || null },
      authorizedSiteIds,
      isGlobalOwner:
        role === 'owner' && Boolean((user as { isGlobalOwner?: boolean })?.isGlobalOwner),
    }
  }

  // Explicit platform superuser / global owner override
  if (role === 'owner' && (user as { isGlobalOwner?: boolean })?.isGlobalOwner === true) {
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

  // Scoped operator (owner, administrator, publisher, staff): resolve canonical member
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

  if (memberId) {
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
            .filter((doc) => {
              const r = String((doc as unknown as Record<string, unknown>).role ?? '')
              return [
                'owner',
                'administrator',
                'community-manager',
                'contributor',
                'moderator',
              ].includes(r)
            })
            .map((doc) => asId((doc as unknown as Record<string, unknown>).site))
            .filter(Boolean),
        ),
      )

      if (authorizedSiteIds.length > 0) {
        let isAllSites = false
        try {
          const allSites = await payload.find({
            collection: 'sites',
            depth: 0,
            limit: 100,
            overrideAccess: true,
          })
          const allSiteIds = allSites.docs.map((d) => String(d.id))
          isAllSites =
            allSiteIds.length > 0 && allSiteIds.every((id) => authorizedSiteIds.includes(id))
        } catch {
          // ignore
        }

        const isGlobal =
          (role === 'owner' && Boolean((user as { isGlobalOwner?: boolean })?.isGlobalOwner)) ||
          (role === 'owner' && isAllSites)

        return {
          authorized: true,
          user: { id: userId, email, role, member: memberId },
          authorizedSiteIds,
          isGlobalOwner: isGlobal,
        }
      }
    } catch {
      // ignore
    }
  }

  // Only platform owners retain the installation fallback. Administrators must
  // have an explicit site grant, including after their last grant is revoked.
  if (role === 'owner' && (user as { isGlobalOwner?: boolean })?.isGlobalOwner !== false) {
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

  return emptyContext
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
