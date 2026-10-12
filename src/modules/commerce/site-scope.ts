import type { Payload } from 'payload'
import { publicSiteForHost } from '../public/site-scope'
import { resolveSiteSettings } from '../core/site-settings'

/** Catalog identity follows the same unambiguous host mapping as other public surfaces. */
export async function catalogSiteForHost(payload: Payload, host: string | null): Promise<string> {
  const siteId = await publicSiteForHost(payload, host)
  if (!siteId) throw new Error('Catalog site unavailable for this host.')
  return siteId
}

/** Provider returns use the configured site origin rather than a proxy upstream address. */
export async function catalogOriginForSite(payload: Payload, siteId: string): Promise<string> {
  const settings = await resolveSiteSettings(payload)
  const origin = new URL(settings.canonicalOriginsBySite[siteId] ?? settings.canonicalOrigin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password)
    throw new Error('The site requires a valid public origin.')
  return origin.origin
}
