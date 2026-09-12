import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import type { Payload } from 'payload'
import { resolveConfiguration, themePool } from './lifecycle'
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
    const auth = await payload.auth({ headers: await headers() })
    if (auth.user?.role === 'owner') preview = { actor: String(auth.user.id), token }
  }
  return resolveConfiguration(themePool(payload), site, preview)
})
