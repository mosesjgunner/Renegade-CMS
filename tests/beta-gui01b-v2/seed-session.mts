/* eslint-disable @typescript-eslint/no-explicit-any -- isolated capture fixture */
// GUI-01B (pack) fixture seeder: disposable DB only. Creates the fixture
// site/owner/article and a passkey session, then writes the session cookie
// to GUI01B_SESSION_FILE for capture.mjs. Never touches a browser.
import { writeFile } from 'node:fs/promises'

import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { fixtureRichText } from '../helpers/fixture-rich-text'

const out = process.env.GUI01B_SESSION_FILE
if (!out) throw new Error('GUI01B_SESSION_FILE required')
if (!process.env.DATABASE_URL?.endsWith('_release_acceptance')) throw new Error('disposable DB guard')

const payload: any = await getPayload({ config })
const existingSite = await payload.find({
  collection: 'sites',
  where: { slug: { equals: 'gui01b' } },
  limit: 1,
  overrideAccess: true,
})
const site =
  existingSite.docs[0] ??
  (await payload.create({
    collection: 'sites',
    data: { name: 'GUI01B Site', slug: 'gui01b', lifecycle: 'active' },
    overrideAccess: true,
  }))
const existingUser = await payload.find({
  collection: 'users',
  where: { email: { equals: 'owner@gui01b.example.com' } },
  limit: 1,
  overrideAccess: true,
})
const ownerUser =
  existingUser.docs[0] ??
  (await payload.create({
    collection: 'users',
    data: { email: 'owner@gui01b.example.com', role: 'owner' },
    overrideAccess: true,
  }))
const grants = await payload.find({
  collection: 'member-site-roles',
  where: { and: [{ site: { equals: site.id } }] },
  limit: 5,
  overrideAccess: true,
})
if (!grants.docs.length) {
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: String(ownerUser.member?.id ?? ownerUser.member),
      site: site.id,
      role: 'contributor',
    },
    overrideAccess: true,
  })
}
const base = process.env.APP_URL!
await payload.updateGlobal({
  slug: 'site-settings',
  data: { canonicalOrigin: base, canonicalOriginsBySite: { [site.id]: base }, launchState: 'live' },
  overrideAccess: true,
})
const existingArticle = await payload.find({
  collection: 'content',
  where: { slug: { equals: 'gui01b-seeded-article' } },
  limit: 1,
  overrideAccess: true,
})
const article =
  existingArticle.docs[0] ??
  (await payload.create({
    collection: 'content',
    data: {
      site: site.id,
      contentType: 'article',
      title: 'Seeded GUI01B Article',
      slug: 'gui01b-seeded-article',
      body: fixtureRichText('Seeded article body paragraph for the editor inspection.'),
      status: 'draft',
      visibility: 'public',
      commentsPolicy: 'open',
      publicChangeHistoryPolicy: 'summary',
    },
    overrideAccess: true,
  }))
const sessionValue = await createPasskeySession(ownerUser, process.env.PAYLOAD_SECRET!, async (id, expires) => {
  await payload.db.pool.query(
    'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',
    [id, ownerUser.id, expires],
  )
})
await writeFile(out, JSON.stringify({ cookieName: 'renegade-passkey', token: sessionValue.token, articleId: article.id }))
console.log(`seeded: site=${site.id} article=${article.id}`)
await payload.db?.pool?.end?.().catch(() => {})
process.exit(0)
