import type { Payload } from 'payload'

import { resolveSiteSettings } from '../core/site-settings'

/** Resolve catalog identity from the configured host, never a caller-selected tenant. */
export async function catalogSiteForHost(payload: Payload, host: string | null): Promise<string> {
  const settings = await resolveSiteSettings(payload)
  const matches = Object.entries(settings.canonicalOriginsBySite)
    .filter(([, origin]) => {
      try {
        return new URL(origin).host.toLowerCase() === String(host ?? '').toLowerCase()
      } catch {
        return false
      }
    })
    .map(([siteId]) => siteId)
  if (matches.length === 1) return matches[0]
  const active = await payload.find({
    collection: 'sites',
    where: { lifecycle: { equals: 'active' } },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (active.docs.length === 1) return String(active.docs[0].id)
  throw new Error('Catalog site unavailable for this host.')
}
