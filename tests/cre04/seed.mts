import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { issueMagicLink, consumeMagicLink } from '../../src/modules/identity/member-identity'
const app = loadConfig()
if (!new URL(app.databaseUrl).pathname.endsWith('_release_acceptance')) {
  throw new Error('Use a dedicated release acceptance database.')
}
const payload = await getPayload({ config })
const access = { overrideAccess: true, depth: 0 } as const
const site = await payload.create({
  ...access,
  collection: 'sites',
  data: {
    name: 'Capture Proof',
    slug: 'capture-proof',
    lifecycle: 'active',
    visibility: 'public',
    creatorPolicy: {
      enabled: true,
      quotas: { bytes: 500000000, uploadCount: 50, concurrentRecordings: 5 },
    },
  },
})
await payload.create({
  ...access,
  collection: 'publications',
  data: {
    site: site.id,
    name: 'Capture Proof',
    slug: 'main',
    canonicalBasePath: '/',
    status: 'active',
    visibility: 'public',
  },
})
await payload.updateGlobal({
  ...access,
  slug: 'site-settings',
  data: {
    siteName: 'Capture Proof',
    canonicalOrigin: app.appUrl,
    launchState: 'live',
  },
})
async function principal(handle: string) {
  const email = handle + '@example.test'
  const member = await payload.create({
    ...access,
    collection: 'members',
    data: { email, displayName: handle, status: 'active' },
  })
  await payload.create({
    ...access,
    collection: 'profiles',
    data: { member: member.id, displayName: handle, handle },
  })
  await payload.create({
    ...access,
    collection: 'member-site-roles',
    data: {
      site: site.id,
      member: member.id,
      role: 'contributor',
      creatorCapabilities: ['media.upload', 'content.draft-own'],
    },
  })
  const issued = await issueMagicLink(payload as never, email)
  const session = await consumeMagicLink(payload as never, issued.token!)
  return { id: member.id, session: session!.sessionToken, csrf: randomUUID() }
}
const fixture = process.env.CRE04_BROWSER_FIXTURE || 'scratch/cre04-fixture.json'
await mkdir(path.dirname(fixture), { recursive: true })
await writeFile(
  fixture,
  JSON.stringify({
    site: site.id,
    author: await principal('capture-maker'),
    other: await principal('capture-outsider'),
  }),
  { mode: 0o600 },
)
console.log('Seeded two real member sessions')
await payload.destroy()
