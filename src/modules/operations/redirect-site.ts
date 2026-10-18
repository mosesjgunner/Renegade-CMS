import type { Payload } from 'payload'
import { resolveOperatorGrantContext } from './operator-grants'

/** All redirect workspaces use one authorized site, including downloads and imports. */
export async function resolveRedirectSite(
  payload: Payload,
  user: Parameters<typeof resolveOperatorGrantContext>[1],
  request: Request,
  explicitSite?: string,
): Promise<string | null> {
  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.authorized) return null
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('renegade-active-site='))
    ?.slice('renegade-active-site='.length)
  let cookieSite: string | undefined
  try {
    cookieSite = cookie ? decodeURIComponent(cookie) : undefined
  } catch {
    return null
  }
  const site =
    explicitSite ||
    new URL(request.url).searchParams.get('siteId') ||
    cookieSite ||
    grant.authorizedSiteIds[0]
  if (!site || !grant.authorizedSiteIds.includes(site)) return null
  return site
}
