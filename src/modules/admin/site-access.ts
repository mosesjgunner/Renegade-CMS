import type { Access, AccessResult } from 'payload'

export type StaffUser = {
  id?: string | number
  role?: string | null
  adminSites?: unknown
}

const relationID = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return String(id)
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const id = (value as { value?: unknown }).value
    if (typeof id === 'string' || typeof id === 'number') return String(id)
  }
  return undefined
}

export function getAdminSiteIDs(user: StaffUser | null | undefined): string[] {
  const sites = user?.adminSites
  if (!Array.isArray(sites)) return []
  return [...new Set(sites.map(relationID).filter((id): id is string => Boolean(id)))]
}

export function canManageAdminSite(user: StaffUser | null | undefined, siteID: unknown): boolean {
  if (user?.role === 'owner' || user?.role === 'administrator') return true
  const id = relationID(siteID)
  return user?.role === 'staff' && Boolean(id) && getAdminSiteIDs(user).includes(id!)
}

export function adminSiteWhere(user: StaffUser | null | undefined): AccessResult {
  if (user?.role === 'owner' || user?.role === 'administrator') return true
  const ids = getAdminSiteIDs(user)
  return user?.role === 'staff' && ids.length ? { site: { in: ids } } : false
}

export function staffAdminReadAccess(): Access {
  return ({ req }) => adminSiteWhere(req.user as StaffUser | null)
}

export function staffAdminCreateAccess(): Access {
  return async ({ req, data }) => {
    const user = req.user as StaffUser | null
    if (user?.role === 'owner' || user?.role === 'administrator') return true
    if (
      user?.role !== 'staff' ||
      !canManageAdminSite(user, (data as Record<string, unknown> | undefined)?.site)
    )
      return false
    const payload = req.payload as unknown as {
      find(args: Record<string, unknown>): Promise<{ docs: Array<Record<string, unknown>> }>
    }
    const input = data as Record<string, unknown> | undefined
    const relationChecks: Array<[string, string]> = [
      ['publication', 'publications'],
      ['space', 'spaces'],
    ]
    for (const [field, collection] of relationChecks) {
      const id = relationID(input?.[field])
      if (!id) continue
      const related = await payload.find({
        collection,
        where: { and: [{ id: { equals: id } }, { site: { in: getAdminSiteIDs(user) } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (!related.docs.length) return false
    }
    return true
  }
}

export function staffAdminUpdateAccess(): Access {
  return async ({ req, data, id }) => {
    const user = req.user as StaffUser | null
    if (user?.role === 'owner' || user?.role === 'administrator') return true
    if (user?.role !== 'staff' || !id || !getAdminSiteIDs(user).length) return false
    if (data && Object.prototype.hasOwnProperty.call(data, 'site')) {
      const proposedSite = relationID((data as Record<string, unknown>).site)
      if (!proposedSite || !getAdminSiteIDs(user).includes(proposedSite)) return false
    }
    const currentWhere = adminSiteWhere(user)
    const payload = req.payload as unknown as {
      findByID(args: Record<string, unknown>): Promise<Record<string, unknown>>
      find(args: Record<string, unknown>): Promise<{ docs: Array<Record<string, unknown>> }>
    }
    const collectionSlug = req.pathname?.match(/^\/api\/([^/]+)/)?.[1]
    if (!collectionSlug) return false
    const current = await payload
      .findByID({ collection: collectionSlug, id, depth: 0, overrideAccess: true })
      .catch(() => null)
    const currentSite = relationID(current?.site)
    if (!currentSite || !getAdminSiteIDs(user).includes(currentSite)) return false
    if (data) {
      const values = data as Record<string, unknown>
      for (const [field, collection] of [
        ['publication', 'publications'],
        ['space', 'spaces'],
      ] as const) {
        if (!Object.prototype.hasOwnProperty.call(values, field) || !values[field]) continue
        const relatedID = relationID(values[field])
        if (!relatedID) return false
        const related = await payload.find({
          collection,
          where: { and: [{ id: { equals: relatedID } }, { site: { equals: currentSite } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (!related.docs.length) return false
      }
    }
    return currentWhere
  }
}

export function siteScopedAdminAccess() {
  const read = staffAdminReadAccess()
  const remove: Access = async ({ req, id }) => {
    const user = req.user as StaffUser | null
    if (user?.role === 'owner' || user?.role === 'administrator') return true
    if (user?.role !== 'staff' || !id) return false
    const slug = req.pathname?.match(/^\/api\/([^/]+)/)?.[1]
    if (!slug) return false
    const payload = req.payload as unknown as {
      findByID(args: Record<string, unknown>): Promise<Record<string, unknown>>
    }
    const current = await payload
      .findByID({ collection: slug, id, depth: 0, overrideAccess: true })
      .catch(() => null)
    const siteID = relationID(current?.site)
    return Boolean(siteID && getAdminSiteIDs(user).includes(siteID))
  }
  return {
    create: staffAdminCreateAccess(),
    delete: remove,
    read,
    update: staffAdminUpdateAccess(),
  }
}

export function siteScopedRelationAdminAccess(options: {
  relationField: string
  targetCollection: string
  targetSitePath?: { anchorCollection: string; targetRelationField: string }
  publicRead?: boolean
}) {
  const accessibleTargetIDs = async (
    user: StaffUser,
    payload: {
      find(args: Record<string, unknown>): Promise<{ docs: Array<Record<string, unknown>> }>
    },
  ) => {
    const siteIDs = getAdminSiteIDs(user)
    if (user.role !== 'staff' || !siteIDs.length) return []
    if (options.targetSitePath) {
      const query =
        options.targetSitePath.targetRelationField === 'id'
          ? { site: { in: siteIDs } }
          : { [options.targetSitePath.targetRelationField]: { in: siteIDs } }
      const anchors = await payload.find({
        collection: options.targetSitePath.anchorCollection,
        where: query,
        limit: 10000,
        depth: 0,
        overrideAccess: true,
      })
      const anchorIDs = anchors.docs.map((doc) => String(doc.id))
      if (!anchorIDs.length) return []
      if (options.targetCollection === options.targetSitePath.anchorCollection) return anchorIDs
      const targets = await payload.find({
        collection: options.targetCollection,
        where:
          options.targetSitePath.targetRelationField === 'id'
            ? { id: { in: anchorIDs } }
            : { [options.targetSitePath.targetRelationField]: { in: anchorIDs } },
        limit: 10000,
        depth: 0,
        overrideAccess: true,
      })
      return targets.docs.map((doc) => String(doc.id))
    }
    const targets = await payload.find({
      collection: options.targetCollection,
      where: { site: { in: siteIDs } },
      limit: 10000,
      depth: 0,
      overrideAccess: true,
    })
    return targets.docs.map((doc) => String(doc.id))
  }

  const read: Access = async ({ req }) => {
    const user = req.user as StaffUser | null
    if (user?.role === 'owner' || user?.role === 'administrator') return true
    if (!user || !['staff'].includes(String(user.role))) return options.publicRead === true
    const ids = await accessibleTargetIDs(user, req.payload as never)
    return ids.length ? { [options.relationField]: { in: ids } } : false
  }

  const create: Access = async ({ req, data }) => {
    const user = req.user as StaffUser | null
    if (user?.role === 'owner' || user?.role === 'administrator') return true
    if (user?.role !== 'staff') return false
    const targetID = relationID(
      (data as Record<string, unknown> | undefined)?.[options.relationField],
    )
    return Boolean(
      targetID && (await accessibleTargetIDs(user, req.payload as never)).includes(targetID),
    )
  }
  const update: Access = async ({ req, data, id }) => {
    const user = req.user as StaffUser | null
    if (user?.role === 'owner' || user?.role === 'administrator') return true
    if (user?.role !== 'staff' || !id) return false
    const collectionSlug = req.pathname?.match(/^\/api\/([^/]+)/)?.[1]
    if (!collectionSlug) return false
    const payload = req.payload as unknown as {
      findByID(args: Record<string, unknown>): Promise<Record<string, unknown>>
    }
    const current = await payload
      .findByID({ collection: collectionSlug, id, depth: 0, overrideAccess: true })
      .catch(() => null)
    const currentTargetID = relationID(current?.[options.relationField])
    const requestedTargetID =
      data && Object.prototype.hasOwnProperty.call(data, options.relationField)
        ? relationID((data as Record<string, unknown>)[options.relationField])
        : currentTargetID
    if (!currentTargetID || requestedTargetID !== currentTargetID) return false
    return (await accessibleTargetIDs(user, req.payload as never)).includes(currentTargetID)
  }
  const remove: Access = async ({ req, id }) => {
    const user = req.user as StaffUser | null
    if (user?.role === 'owner' || user?.role === 'administrator') return true
    if (user?.role !== 'staff' || !id) return false
    const collectionSlug = req.pathname?.match(/^\/api\/([^/]+)/)?.[1]
    if (!collectionSlug) return false
    const payload = req.payload as unknown as {
      findByID(args: Record<string, unknown>): Promise<Record<string, unknown>>
    }
    const current = await payload
      .findByID({ collection: collectionSlug, id, depth: 0, overrideAccess: true })
      .catch(() => null)
    const targetID = relationID(current?.[options.relationField])
    return Boolean(
      targetID && (await accessibleTargetIDs(user, req.payload as never)).includes(targetID),
    )
  }
  return {
    create,
    delete: remove,
    read,
    update,
  }
}

export function siteScopedPublicAdminAccess() {
  return {
    ...siteScopedAdminAccess(),
    read: ({ req }: { req: { user?: StaffUser | null } }) =>
      req.user && ['owner', 'administrator', 'staff'].includes(String(req.user.role))
        ? adminSiteWhere(req.user)
        : true,
  }
}

export const siteScopedPublishedReadAccess: Access = ({ req }) => {
  if (
    req.user &&
    ['owner', 'administrator', 'staff'].includes(String((req.user as StaffUser).role))
  )
    return adminSiteWhere(req.user as StaffUser)
  return { _status: { equals: 'published' } }
}
