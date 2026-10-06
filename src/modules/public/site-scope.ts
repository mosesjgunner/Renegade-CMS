import type { Payload } from 'payload'
import { resolveSiteSettings } from '../core/site-settings'

/** Unknown or ambiguous hosts never select the first tenant on a multi-site installation. */
export async function publicSiteForHost(payload: Payload, hostValue: string | null) {
  const host = hostValue?.toLowerCase() ?? ''
  const settings = await resolveSiteSettings(payload)
  const matches = Object.entries(settings.canonicalOriginsBySite).filter(([, origin]) => {
    try {
      return new URL(origin).host.toLowerCase() === host
    } catch {
      return false
    }
  })
  if (matches.length === 1) return matches[0][0]
  if (matches.length > 1) return ''
  const sites = await payload.find({
    collection: 'sites',
    where: { lifecycle: { equals: 'active' } },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  } as never)
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
  let canonical = false
  try {
    canonical = new URL(settings.canonicalOrigin).host.toLowerCase() === host
  } catch {}
  return sites.docs.length === 1 && (local || canonical) ? String(sites.docs[0].id) : ''
}

/** Compare the browser origin with configured public origins, not the HTTP proxy upstream URL. */
export async function samePublicOrigin(payload: Payload, request: Request, requireOrigin = false) {
  const origin = request.headers.get('origin')
  if (!origin) return !requireOrigin
  const site = await publicSiteForHost(payload, request.headers.get('host'))
  if (!site) return false
  const settings = await resolveSiteSettings(payload)
  const expected = settings.canonicalOriginsBySite[site] ?? settings.canonicalOrigin
  try {
    return new URL(origin).origin === new URL(expected).origin
  } catch {
    return false
  }
}
