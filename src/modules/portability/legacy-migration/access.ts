import type { Payload } from 'payload'
import { resolveOperatorGrantContext } from '../../operations/operator-grants'

// Migration can create global author identities and layouts. Apply the same
// all-sites authority required by the native Authors collection.
export async function canMigrateLegacySite(
  payload: Payload,
  user: { id?: unknown; role?: unknown; member?: unknown } | null | undefined,
  siteId?: string,
  createsSite = false,
): Promise<boolean> {
  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.authorized || (createsSite && user?.role !== 'owner')) return false
  if (grant.isGlobalOwner) return true
  if (!siteId || !grant.authorizedSiteIds.includes(siteId)) return false
  const foreign = await payload.count({
    collection: 'sites',
    overrideAccess: true,
    where: { id: { not_in: grant.authorizedSiteIds } },
  })
  return foreign.totalDocs === 0
}
