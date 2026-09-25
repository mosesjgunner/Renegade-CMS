import type { Payload } from 'payload'
import { resolveSiteSettings } from '../core/site-settings'
import { ProfileAccessError } from './profile-projection'

/** Bind community privacy decisions to the configured host, never a caller-selected site. */
export async function communitySiteForHost(
  payload: Payload,
  host: string | null,
  requestedSiteId?: string,
): Promise<string> {
  const settings = await resolveSiteSettings(payload)
  const matches = Object.entries(settings.canonicalOriginsBySite)
    .filter(([, origin]) => {
      try {
        return new URL(origin).host.toLowerCase() === String(host ?? '').toLowerCase()
      } catch {
        return false
      }
    })
    .map(([id]) => id)
  let siteId = matches.length === 1 ? matches[0] : ''
  if (!siteId) {
    const isLocal =
      !host ||
      host.toLowerCase().startsWith('localhost') ||
      host.startsWith('127.0.0.1') ||
      host.startsWith('0.0.0.0')
    const active = await payload.find({
      collection: 'sites',
      where: { lifecycle: { equals: 'active' } },
      limit: 2,
      depth: 0,
      overrideAccess: true,
    } as never)
    if (active.docs.length === 1) {
      siteId = String(active.docs[0].id)
    } else if (isLocal && active.docs.length > 0) {
      siteId =
        requestedSiteId && active.docs.some((d: any) => String(d.id) === requestedSiteId)
          ? requestedSiteId
          : String(active.docs[0].id)
    }
  }
  if (!siteId || (requestedSiteId && requestedSiteId !== siteId))
    throw new ProfileAccessError(404, 'Community site unavailable.')
  return siteId
}
