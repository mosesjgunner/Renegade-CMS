/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-20 SHOP-UX Pass 04 — site-level view of merchant policy records.
 *
 * Policies are configured per merchant connection (`configuration.policies`,
 * see merchant-config.ts). Storefront surfaces — checkout consent links,
 * product-page delivery/returns, the order center, and the public
 * /policies/[type] pages — read them through this one helper so every
 * surface shows the same record and version.
 */
import { merchantPolicies, type MerchantPolicy } from './merchant-config'

export async function siteMerchantPolicies(
  payload: any,
  siteId: string,
): Promise<MerchantPolicy[]> {
  const connections = await payload.find({
    collection: 'merchant-connections',
    where: { site: { equals: siteId } },
    limit: 25,
    depth: 0,
    overrideAccess: true,
  })
  const byType = new Map<string, MerchantPolicy>()
  for (const connection of connections.docs) {
    for (const policy of merchantPolicies(connection.configuration)) {
      if (!byType.has(policy.type)) byType.set(policy.type, policy)
    }
  }
  return [...byType.values()]
}

export function policyHref(policy: MerchantPolicy): string {
  return policy.url ?? `/policies/${policy.type}`
}
