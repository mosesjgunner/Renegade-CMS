import type { Payload } from 'payload'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

export async function loadFixture(payload: Payload, path: string) {
  assert.equal(process.env.RC1_04A_DISPOSABLE, 'yes')
  assert.ok(process.env.DATABASE_URL?.endsWith(':5438/rc104a_release_acceptance'))
  try {
    return JSON.parse(await readFile(path, 'utf8')) as {
      id: string
      foreign: string
      owner: string
      site: string
      version: number
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const site = await payload.create({
    collection: 'sites',
    data: {
      name: '04A Alpha',
      slug: 'alpha-04a',
      description: 'Disposable visual editor verification',
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
      commentReactionCodes: ['thumbs_up', 'heart', 'insightful', 'applause'],
    },
  })
  const beta = await payload.create({
    collection: 'sites',
    data: {
      name: '04A Beta',
      slug: 'beta-04a',
      description: 'Disposable denied site',
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
      commentReactionCodes: ['thumbs_up', 'heart', 'insightful', 'applause'],
    },
  })
  const owner = await payload.create({
    collection: 'users',
    data: { email: 'owner@rc104a.test', role: 'owner' } as never,
  })
  const member = (
    await payload.find({ collection: 'members', where: { email: { equals: owner.email } } })
  ).docs[0]
  for (const target of [site.id, beta.id]) {
    const grants = await payload.count({
      collection: 'member-site-roles',
      where: { and: [{ member: { equals: member.id } }, { site: { equals: target } }] },
    })
    if (!grants.totalDocs)
      await payload.create({
        collection: 'member-site-roles',
        data: { member: member.id, site: target, role: 'community-manager' },
      })
  }
  const layout = await payload.create({
    collection: 'page-layouts',
    data: {
      site: site.id,
      path: '/custom-04a-final',
      name: '04A custom page',
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      status: 'draft',
      visibility: 'public',
      layoutVersion: 1,
      blocks: [],
      unknownBlocks: [],
      revision: 1,
      revisionHistory: [],
    } as never,
  })
  const foreign = await payload.create({
    collection: 'page-layouts',
    data: {
      site: beta.id,
      path: '/foreign-04a',
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      status: 'draft',
      layoutVersion: 1,
      blocks: [],
      unknownBlocks: [],
      revision: 1,
    } as never,
  })
  const fixture = { id: layout.id, foreign: foreign.id, owner: owner.id, site: site.id, version: 2 }
  await writeFile(path, JSON.stringify(fixture, null, 2))
  return fixture
}
