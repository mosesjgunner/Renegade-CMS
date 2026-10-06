import type { Payload } from 'payload'
import { publicSiteForHost } from '../public/site-scope'
import { ProfileAccessError } from './profile-projection'
/** Bind privacy decisions to a configured host. Unknown multi-site hosts fail closed. */
export async function communitySiteForHost(
  payload: Payload,
  host: string | null,
  requestedSiteId?: string,
): Promise<string> {
  const site = await publicSiteForHost(payload, host)
  if (!site || (requestedSiteId && site !== requestedSiteId))
    throw new ProfileAccessError(404, 'Community site unavailable.')
  return site
}
