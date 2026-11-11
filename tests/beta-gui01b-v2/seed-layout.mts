import { writeFile, readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'

if (!process.env.DATABASE_URL?.endsWith('_release_acceptance')) throw new Error('disposable DB guard')
const session = JSON.parse(await readFile(process.env.GUI01B_SESSION_FILE!, 'utf8'))
void session
const payload: any = await getPayload({ config })
const sites = await payload.find({
  collection: 'sites',
  where: { slug: { equals: 'gui01b' } },
  limit: 1,
  overrideAccess: true,
})
const site = sites.docs[0]
if (!site) throw new Error('fixture site missing — run seed-session first')
const existing = await payload.find({
  collection: 'page-layouts',
  where: { path: { equals: '/builder-fixture' } },
  limit: 1,
  overrideAccess: true,
})
const layout =
  existing.docs[0] ??
  (await payload.create({
    collection: 'page-layouts',
    data: {
      site: site.id,
      name: 'Builder Fixture Page',
      path: '/builder-fixture',
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      layoutVersion: 1,
      status: 'draft',
      visibility: 'public',
      blocks: [],
      revision: 1,
    },
    overrideAccess: true,
  }))
await writeFile('/tmp/gui01b-layout.json', JSON.stringify({ layoutId: layout.id, siteId: site.id }))
console.log(`layout-seeded: id=${layout.id}`)
await payload.db?.pool?.end?.().catch(() => {})
process.exit(0)
