import type { Payload } from 'payload'
import { privacyPolicyFromSettings } from './privacy'
import type { ConsentChoices } from './contracts'

/** Legacy/unlinked browser records are unknown, never assumed consented for reporting. */
export async function reportableAnalyticsRows<T>(
  payload: Payload,
  siteId: string,
  rows: T[],
): Promise<T[]> {
  const policy = privacyPolicyFromSettings(
    await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
  )
  if (!policy.analyticsEnabled) return []
  const records = await payload.find({
    collection: 'analytics-consent-records',
    where: { site: { equals: siteId } },
    sort: '-occurredAt',
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  const latest = new Map<string, boolean>()
  for (const record of records.docs) {
    if (!latest.has(record.subjectHash))
      latest.set(
        record.subjectHash,
        record.consentVersion === policy.consentVersion &&
          record.action !== 'withdraw' &&
          (record.categories as ConsentChoices)?.analytics === true,
      )
  }
  return rows.filter((row) => {
    const value = row as Record<string, unknown>
    return (
      value.consentBasis === 'analytics-consent' &&
      typeof value.anonymousHash === 'string' &&
      latest.get(value.anonymousHash) === true
    )
  })
}
