import { cache } from 'react'
import { cookies, headers } from 'next/headers.js'
import type { Payload } from 'payload'
import { resolveConfiguration, themePool } from './lifecycle'
import { requireAdminUser } from '../operations/passkey-auth'
import { loadConfig } from '../core/config'
/** Same publication precedence as existing public routes; never take site scope from preview input. */
export const requestTheme = cache(async (payload: Payload) => {
  const pubs = await payload.find({
    collection: 'publications',
    where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const publication = pubs.docs[0]
  const site = typeof publication?.site === 'string' ? publication.site : publication?.site?.id
  if (!site) return null
  let preview: { actor: string; token: string } | undefined
  let token: string | undefined
  try {
    token = (await cookies()).get('presentation-preview')?.value
  } catch {
    // Worker, migration, and local API callers have no HTTP request; they use active state.
  }
  if (token) {
    // Full Payload auth also calculates collection permissions. Host-scoped
    // permissions resolve site settings, which resolve this cached theme again.
    // Verify the canonical passkey session without entering that permission loop.
    const user = await requireAdminUser(payload, loadConfig().payloadSecret, await headers()).catch(
      () => null,
    )
    if (user?.role === 'owner') preview = { actor: String(user.id), token }
  }
  return resolveConfiguration(themePool(payload), site, preview)
})
