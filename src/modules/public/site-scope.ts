import type { Payload } from 'payload'
import { resolveSiteSettings } from '../core/site-settings'

/** Unknown or ambiguous hosts never select the first tenant on a multi-site installation. */
export async function publicSiteForHost(payload: Payload, hostValue: string | null) {
  const host = hostValue?.toLowerCase() ?? ''
  if (!host) return ''
  const settings = await resolveSiteSettings(payload, { includeTheme: false })
  const matches = Object.entries(settings.canonicalOriginsBySite).filter(([, origin]) => {
    try {
      const u = new URL(origin)
      const uHost = u.host.toLowerCase()
      const uHostname = u.hostname.toLowerCase()
      const hostWithoutPort = host.split(':')[0]
      return (
        uHost === host ||
        uHostname === host ||
        uHostname === hostWithoutPort ||
        uHost === hostWithoutPort
      )
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
  const hostWithoutPort = host.split(':')[0]
  let canonical = false
  try {
    const canUrl = new URL(settings.canonicalOrigin)
    canonical =
      canUrl.host.toLowerCase() === host ||
      canUrl.hostname.toLowerCase() === host ||
      canUrl.hostname.toLowerCase() === hostWithoutPort
  } catch {}
  if (process.env.LOCAL_E2E_TEST_MODE === 'true' && local) {
    const e2eSite = await payload.find({
      collection: 'sites',
      where: { slug: { equals: 'analytics-e2e' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    if (e2eSite.docs[0]) return String(e2eSite.docs[0].id)
    if (sites.docs[0]) return String(sites.docs[0].id)
  }
  if (sites.docs.length === 1 && (local || canonical)) return String(sites.docs[0].id)
  if (matches.length === 0 && (canonical || local)) {
    const otherSitesOrigins = Object.values(settings.canonicalOriginsBySite).flatMap((o) => {
      try {
        const u = new URL(o)
        return [u.host.toLowerCase(), u.hostname.toLowerCase()]
      } catch {
        return []
      }
    })
    if (!otherSitesOrigins.includes(host) && !otherSitesOrigins.includes(hostWithoutPort)) {
      const allActive = await payload.find({
        collection: 'sites',
        where: { lifecycle: { equals: 'active' } },
        depth: 0,
        overrideAccess: true,
      } as never)
      const primarySite =
        allActive.docs.find((s) => !settings.canonicalOriginsBySite[s.id]) || allActive.docs[0]
      if (primarySite) return String(primarySite.id)
    }
  }
  return ''
}

/** Compare the browser origin with configured public origins, not the HTTP proxy upstream URL. */
export async function samePublicOrigin(payload: Payload, request: Request, requireOrigin = false) {
  const origin = request.headers.get('origin')
  if (!origin) return !requireOrigin
  const site = await publicSiteForHost(payload, request.headers.get('host'))
  if (!site) return false
  const settings = await resolveSiteSettings(payload, { includeTheme: false })
  const expected = settings.canonicalOriginsBySite[site] ?? settings.canonicalOrigin
  try {
    return new URL(origin).origin === new URL(expected).origin
  } catch {
    return false
  }
}
