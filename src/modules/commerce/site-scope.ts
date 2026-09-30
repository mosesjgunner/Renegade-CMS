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
  const isLocal =
    !host ||
    host.toLowerCase().startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('0.0.0.0')

  const activePubs = await payload.find({
    collection: 'publications',
    where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const pub = activePubs.docs[0] as unknown as { site?: string | { id?: string } } | undefined
  const pubSiteId = typeof pub?.site === 'string' ? pub.site : pub?.site?.id
  if (pubSiteId) {
    return pubSiteId
  }

  const active = await payload.find({
    collection: 'sites',
    where: { lifecycle: { equals: 'active' } },
    sort: '-createdAt',
    limit: 2,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (active.docs.length === 1 || (isLocal && active.docs.length > 0)) {
    return String(active.docs[0].id)
  }
  throw new Error('Catalog site unavailable for this host.')
}
