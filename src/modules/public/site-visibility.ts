import type { Payload } from 'payload'

import { resolveOperatorGrantContext } from '../operations/operator-grants'

/**
 * Site-level visibility policy (UXI-06). Three states, stored on the
 * site record (`sites.visibility`):
 *
 * - `public` — everyone can read the site (the historical behavior and
 *   the default for every existing site).
 * - `coming-soon` — anonymous visitors get the designed holding page
 *   (site name + a plain note) and NO site content; signed-in users
 *   with an operator grant on the site can still preview it.
 * - `private` — same holding page for anonymous visitors, plus a
 *   sign-in link; authorized preview works the same way.
 *
 * Enforcement is at the server render boundary: the public page routes
 * (`src/app/(frontend)/page.tsx` and `[...path]/page.tsx`) call
 * `resolvePublicSiteAccess` before loading any site content, so a
 * non-public site never reaches the content queries for anonymous
 * visitors. `noindex` is not the mechanism.
 */
export type SiteVisibility = 'public' | 'coming-soon' | 'private'

export const SITE_VISIBILITIES: readonly SiteVisibility[] = ['public', 'coming-soon', 'private']

export function normalizeSiteVisibility(value: unknown): SiteVisibility {
  return value === 'coming-soon' || value === 'private' ? value : 'public'
}

export async function getSiteVisibility(
  payload: Payload,
  siteId: string,
): Promise<{ visibility: SiteVisibility; siteName: string }> {
  const site = (await payload
    .findByID({ collection: 'sites', id: siteId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { name?: unknown; visibility?: unknown } | null
  return {
    visibility: normalizeSiteVisibility(site?.visibility),
    siteName: typeof site?.name === 'string' && site.name.trim() ? site.name : 'This site',
  }
}

/**
 * Whether the request behind `headers` belongs to a signed-in user who
 * may operate (and therefore preview) this site. Staff authentication
 * alone is not enough: the user needs an operator grant covering the
 * site (a global owner qualifies).
 */
export async function isAuthorizedSiteViewer(
  payload: Payload,
  headers: Headers,
  siteId: string,
): Promise<boolean> {
  try {
    const { user } = await payload.auth({ headers })
    if (!user) return false
    const grant = await resolveOperatorGrantContext(payload, user)
    if (!grant.authorized) return false
    return grant.isGlobalOwner || grant.authorizedSiteIds.includes(siteId)
  } catch {
    return false
  }
}

export type PublicSiteAccess =
  | { allowed: true; visibility: SiteVisibility; siteName: string }
  | { allowed: false; visibility: Exclude<SiteVisibility, 'public'>; siteName: string }

/**
 * The single gate the public routes consult before rendering site
 * content. Public sites always pass; non-public sites pass only for
 * authorized previewers.
 */
export async function resolvePublicSiteAccess(
  payload: Payload,
  input: { siteId: string; headers: Headers },
): Promise<PublicSiteAccess> {
  const { visibility, siteName } = await getSiteVisibility(payload, input.siteId)
  if (visibility === 'public') return { allowed: true, visibility, siteName }
  const authorized = await isAuthorizedSiteViewer(payload, input.headers, input.siteId)
  return authorized
    ? { allowed: true, visibility, siteName }
    : { allowed: false, visibility, siteName }
}
