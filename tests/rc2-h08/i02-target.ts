// RC2-I-02 / RC2-DEBT-26 proof, target leg: create the target site in
// the target database (mode=create) or verify the import landed the
// member-space chain (mode=verify).
import { getPayload } from 'payload'

import config from '../../src/payload.config'

const mode = process.env.I02_MODE ?? ''
const payload = await getPayload({ config })

if (mode === 'create') {
  const site = await payload.create({
    collection: 'sites',
    data: { name: 'I02 Import Target', slug: 'i02-import-target', lifecycle: 'active' } as never,
    overrideAccess: true,
  })
  console.log(JSON.stringify({ targetSiteId: String(site.id) }))
} else if (mode === 'verify') {
  const siteId = process.env.I02_SITE_ID ?? ''
  const count = async (collection: string, where?: Record<string, unknown>) =>
    (
      await payload.find({
        collection: collection as never,
        where: (where ?? { site: { equals: siteId } }) as never,
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
    ).totalDocs
  const spaces = await payload.find({
    collection: 'spaces',
    where: { site: { equals: siteId } },
    limit: 5,
    depth: 0,
    overrideAccess: true,
  })
  const space = spaces.docs[0] as unknown as Record<string, unknown> | undefined
  const spacePosts = space ? await count('content', { space: { equals: String(space.id) } }) : 0
  // RC2-DEBT-01: spaces carry no member field; the member resolves
  // through the space's profile.
  const spaceProfileDoc = space
    ? await payload
        .findByID({
          collection: 'profiles',
          id: String(space.profile ?? ''),
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
    : null
  console.log(
    JSON.stringify(
      {
        spaces: spaces.totalDocs,
        spaceProfile: space ? String(space.profile ?? '') : null,
        spaceMember: spaceProfileDoc ? String(spaceProfileDoc.member ?? '') : null,
        spacePosts,
        profiles: await count('profiles', { id: { equals: String(space?.profile ?? '') } }),
        content: await count('content'),
        articleFamily: await count('article-family-content', {
          'content.site': { equals: siteId },
        }),
        revisions: await count('revision-records', {
          'article.content.site': { equals: siteId },
        }),
      },
      null,
      2,
    ),
  )
} else {
  throw new Error('I02_MODE must be create or verify')
}
await payload.db.destroy?.()
process.exit(0)
