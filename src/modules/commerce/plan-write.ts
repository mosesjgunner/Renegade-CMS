import { publishPlan, type PlanRevision } from './subscription-contract'

/** Validate native operator creation before an immutable agreement can be sold. */
export function validatePlanWrite(data: Record<string, unknown>) {
  const siteId = String(
    typeof data.site === 'object' && data.site
      ? (data.site as { id: unknown }).id
      : (data.site ?? ''),
  )
  if (!siteId || !data.planKey || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1)
    throw new Error('Plan site, key and integer revision are required.')
  if (!Array.isArray(data.entitlements) || !data.entitlements.length)
    throw new Error('A plan requires explicit entitlements.')
  if (!/^(0|[1-9][0-9]{0,11})$/.test(String(data.amountMinor)))
    throw new Error('Plan amount must be bounded integer minor units.')
  const keys = new Set<string>()
  for (const grant of data.entitlements) {
    if (!grant || grant.siteId !== siteId || !['subscription', 'fixed'].includes(grant.term))
      throw new Error('Plan entitlements must belong to the plan site and have a valid term.')
    if (
      ![grant.resource, grant.capability].every(
        (value) => typeof value === 'string' && value.trim() && value.length <= 200,
      ) ||
      (grant.scope != null &&
        (typeof grant.scope !== 'string' || !grant.scope.trim() || grant.scope.length > 200))
    )
      throw new Error('Invalid entitlement resource, capability or scope.')
    if (grant.limit != null) throw new Error('Usage-limited plan capabilities are not supported.')
    const key = JSON.stringify([grant.resource, grant.capability, grant.scope ?? ''])
    if (keys.has(key)) throw new Error('Duplicate plan capability.')
    keys.add(key)
  }
  if (!['week', 'month', 'year'].includes(String(data.interval)))
    throw new Error('Invalid billing interval.')
  if (
    !data.providerMappings ||
    typeof data.providerMappings !== 'object' ||
    Array.isArray(data.providerMappings) ||
    Object.values(data.providerMappings).some((value) => typeof value !== 'string' || !value.trim())
  )
    throw new Error('Invalid provider price mapping.')
  publishPlan(data as unknown as PlanRevision)
}
