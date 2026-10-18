import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getPayload, createLocalReq } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import config from '@/payload.config'
import Dashboard from '@/modules/admin/PublisherDashboard'

async function run() {
  assert.equal(process.env.RC1_02C_DISPOSABLE, 'yes')
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/rc102c_release_acceptance')
  const fixture = JSON.parse(await readFile('scratch/rc102c-20261017/fixture.json', 'utf8'))
  const payload = await getPayload({ config })
  const runId = Date.now().toString(36)
  try {
    const owner = (
      await payload.find({
        collection: 'users',
        where: { email: { equals: 'owner@rc102c.test' } },
        depth: 0,
      })
    ).docs[0]
    const ownerReq = await createLocalReq({ user: { ...owner, collection: 'users' } }, payload)
    const member = await payload.create({
      collection: 'members',
      data: {
        email: `controls-${runId}@rc102c.test`,
        displayName: 'Controls actor',
        status: 'active',
      },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: `controls-${runId}@rc102c.test`, role: 'staff', member: member.id },
    })
    const staffReq = await createLocalReq({ user: { ...staff, collection: 'users' } }, payload)
    const role = await payload.create({
      collection: 'member-site-roles',
      data: { site: fixture.siteA, member: member.id, role: 'contributor' },
      overrideAccess: false,
      req: ownerReq,
    })
    await payload.update({
      collection: 'member-site-roles',
      id: role.id,
      data: { role: 'moderator' },
      overrideAccess: false,
      req: ownerReq,
    })
    const auditRows = async () =>
      (
        await payload.find({
          collection: 'identity-audit-events',
          where: { member: { equals: member.id } },
          depth: 0,
          sort: 'createdAt',
        })
      ).docs
    let audit = await auditRows()
    assert.deepEqual(
      audit.map((row) => row.event),
      ['site-role.granted', 'site-role.changed'],
    )
    assert.equal((audit[0].details as any).before, null)
    assert.equal((audit[1].details as any).actorUserId, owner.id)
    assert.equal((audit[1].details as any).before.role, 'contributor')
    assert.equal((audit[1].details as any).after.role, 'moderator')
    await assert.rejects(
      payload.update({
        collection: 'member-site-roles',
        id: role.id,
        data: { role: 'community-manager' },
        overrideAccess: false,
        req: staffReq,
      }),
    )
    assert.equal(
      (await payload.findByID({ collection: 'member-site-roles', id: role.id, depth: 0 })).role,
      'moderator',
    )
    assert.equal((await auditRows()).length, 2)
    console.log(
      'PASS sensitive role create/change emit real persisted audit; denied staff change preserves role and audit',
    )
    const originalCreate = payload.create.bind(payload)
    payload.create = ((options: any) => {
      if (options.collection === 'identity-audit-events')
        throw new Error('Injected audit storage failure')
      return originalCreate(options)
    }) as typeof payload.create
    try {
      await assert.rejects(
        payload.update({
          collection: 'member-site-roles',
          id: role.id,
          data: { role: 'community-manager' },
          overrideAccess: false,
          req: ownerReq,
        }),
        /Injected audit storage failure/,
      )
    } finally {
      payload.create = originalCreate
    }
    assert.equal(
      (await payload.findByID({ collection: 'member-site-roles', id: role.id, depth: 0 })).role,
      'moderator',
    )
    assert.equal((await auditRows()).length, 2)
    console.log('PASS audit storage failure rejects operation and rolls back sensitive role update')
    const article = await payload.create({
      collection: 'content',
      data: {
        site: fixture.siteA,
        contentType: 'article',
        title: '02C operator lock proof',
        slug: `operator-lock-proof-${runId}`,
        status: 'draft',
      } as never,
      overrideAccess: false,
      req: ownerReq,
    })
    const foreign = await payload.create({
      collection: 'content',
      data: {
        site: fixture.siteB,
        contentType: 'article',
        title: 'PRIVATE FOREIGN 02C DRAFT',
        slug: `foreign-02c-draft-${runId}`,
        status: 'draft',
      } as never,
      overrideAccess: false,
      req: ownerReq,
    })
    const lock = await payload.create({
      collection: 'payload-locked-documents',
      data: {
        document: { relationTo: 'content', value: article.id },
        user: { relationTo: 'users', value: owner.id },
      },
      req: ownerReq,
    })
    await assert.rejects(
      payload.update({
        collection: 'content',
        id: article.id,
        data: { title: 'Silent overwrite attempt' },
        overrideAccess: false,
        overrideLock: false,
        req: staffReq,
      }),
      /locked/,
    )
    assert.equal(
      (await payload.findByID({ collection: 'content', id: article.id, depth: 0 })).title,
      '02C operator lock proof',
    )
    await payload.delete({ collection: 'payload-locked-documents', id: lock.id, req: ownerReq })
    await payload.update({
      collection: 'content',
      id: article.id,
      data: { title: '02C allowed after unlock' },
      overrideAccess: false,
      overrideLock: false,
      req: staffReq,
    })
    assert.equal(
      (await payload.findByID({ collection: 'content', id: article.id, depth: 0 })).title,
      '02C allowed after unlock',
    )
    console.log(
      'PASS actual access-checked update blocked by lock; release permits update; persisted title matches',
    )
    const before = await payload.findByID({ collection: 'content', id: foreign.id, depth: 0 })
    await assert.rejects(
      payload.update({
        collection: 'content',
        id: foreign.id,
        data: { title: 'Foreign overwrite' },
        overrideAccess: false,
        req: staffReq,
      }),
    )
    assert.deepEqual(
      await payload.findByID({ collection: 'content', id: foreign.id, depth: 0 }),
      before,
    )
    console.log('PASS foreign content update denied; entire persisted record unchanged')
    const visibleRedirects = await payload.find({
      collection: 'public-redirects',
      overrideAccess: false,
      req: staffReq,
      depth: 0,
    })
    assert.ok(visibleRedirects.docs.every((row) => row.site === fixture.siteA))
    assert.ok(visibleRedirects.docs.some((row) => row.fromPath === '/retained-after-restart'))
    // Call real server views with real access-checked Payload reads, not a mock.
    const rendered = renderToStaticMarkup(
      await Dashboard({ initPageResult: { req: staffReq } } as never),
    )
    assert.ok(!rendered.includes('PRIVATE FOREIGN 02C DRAFT'))
    assert.ok(rendered.includes('02C allowed after unlock'))
    console.log('PASS dashboard real server render excludes foreign persisted draft')
    await payload.delete({
      collection: 'member-site-roles',
      id: role.id,
      overrideAccess: false,
      req: ownerReq,
    })
    audit = await auditRows()
    assert.equal(audit.at(-1)?.event, 'site-role.revoked')
    await assert.rejects(
      payload.update({
        collection: 'content',
        id: article.id,
        data: { title: 'Revoked overwrite' },
        overrideAccess: false,
        req: staffReq,
      }),
    )
    assert.equal(
      (await payload.findByID({ collection: 'content', id: article.id, depth: 0 })).title,
      '02C allowed after unlock',
    )
    console.log('PASS role revocation emits audit and immediately denies content update')
  } finally {
    await payload.db.destroy?.()
  }
}
run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
