import type { resolveSiteSettings } from '../core/site-settings'

type ResolvedSettings = Awaited<ReturnType<typeof resolveSiteSettings>>

/**
 * POD-RC-01 Step 03 — which origin a podcast feed's URLs are built
 * from. A creator's real domain is authoritative: the show's site's
 * entry in canonicalOriginsBySite wins, then the install's configured
 * canonical origin. A local/dev origin (localhost, loopback, *.local,
 * *.test) is NOT a creator domain — dev installs and shared test
 * fixtures constantly reuse and overwrite those values — so when the
 * configured origin is local, feed URLs fall back to the install's
 * own APP_URL, exactly as they did before domain binding existed.
 */
export function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.test')
    )
  } catch {
    return false
  }
}

export function podcastFeedOrigin(
  settings: ResolvedSettings,
  siteId: string | undefined,
  appUrl: string,
): string {
  const mapped = siteId ? settings.canonicalOriginsBySite[siteId] : undefined
  if (mapped && !isLocalOrigin(mapped)) return mapped.replace(/\/$/, '')
  if (settings.canonicalOrigin && !isLocalOrigin(settings.canonicalOrigin)) {
    return settings.canonicalOrigin.replace(/\/$/, '')
  }
  return appUrl.replace(/\/$/, '')
}
