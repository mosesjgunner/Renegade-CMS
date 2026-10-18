import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { POST as activeSitePost } from '@/app/(frontend)/api/admin/active-site/route'
import {
  checkOperatorSiteAccess,
  checkOperatorRecordAccess,
  preserveRecordRelationshipsAccess,
} from '@/modules/operations/operator-grants'

const FIXTURE_PATH = 'scratch/rc102d-20261017/fixture.json'

async function run() {
  assert.equal(process.env.RC1_02D_DISPOSABLE, 'yes')
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/rc102d_release_acceptance')

  const payload = await getPayload({ config })
  const pool = (payload.db as any).pool

  if (process.argv.includes('--restart-check')) {
    console.log('Running 02D Restart Persistence Verification...')
    const rawFixture = await readFile(FIXTURE_PATH, 'utf8')
    const fixture = JSON.parse(rawFixture)

    // Verify Site Alpha & Beta exist
    const siteA = await payload.findByID({ collection: 'sites', id: fixture.siteAId, depth: 0 })
    const siteB = await payload.findByID({ collection: 'sites', id: fixture.siteBId, depth: 0 })
    assert.equal(siteA.slug, 'site-alpha')
    assert.equal(siteB.slug, 'site-beta')

    // Verify Content Alpha & Beta exist with untouched attributes
    const contentA = await payload.findByID({ collection: 'content', id: fixture.contentAId, depth: 0 })
    const contentB = await payload.findByID({ collection: 'content', id: fixture.contentBId, depth: 0 })
    assert.equal((contentA.site as any)?.id || contentA.site, fixture.siteAId)
    assert.equal((contentB.site as any)?.id || contentB.site, fixture.siteBId)
    assert.equal(contentA.title, 'Article Alpha Pristine')
    assert.equal(contentB.title, 'Article Beta Pristine')

    // Verify Direct SQL queries confirm no cross-site contamination
    const sqlCheck = await pool.query('SELECT id, site_id, title FROM content WHERE id = $1', [fixture.contentAId])
    assert.equal(sqlCheck.rows[0].site_id, fixture.siteAId)
    assert.equal(sqlCheck.rows[0].title, 'Article Alpha Pristine')

    console.log('PASS 02D Restart Verification: Multi-site boundary and content integrity confirmed in PostgreSQL after restart.')
    process.exit(0)
  }

  await mkdir('scratch/rc102d-20261017', { recursive: true })

  console.log('1. Seeding Multi-Site Fixtures: Site Alpha & Site Beta...')
  const siteA = await payload.create({
    collection: 'sites',
    data: {
      name: 'Site Alpha',
      slug: 'site-alpha',
      host: 'alpha.rc102d.test',
      status: 'active',
      isDefault: true,
    } as any,
  })
  const siteB = await payload.create({
    collection: 'sites',
    data: {
      name: 'Site Beta',
      slug: 'site-beta',
      host: 'beta.rc102d.test',
      status: 'active',
      isDefault: false,
    } as any,
  })

  const pubA = await payload.create({
    collection: 'publications',
    data: {
      site: siteA.id,
      name: 'Publication Alpha',
      slug: 'pub-alpha',
    } as any,
  })
  const pubB = await payload.create({
    collection: 'publications',
    data: {
      site: siteB.id,
      name: 'Publication Beta',
      slug: 'pub-beta',
    } as any,
  })

  console.log('2. Seeding Multi-Site Actors across 5 canonical roles...')
  // Global Owner
  const globalOwnerUser = await payload.create({
    collection: 'users',
    data: {
      email: 'global-owner@rc102d.test',
      role: 'owner',
    } as any,
  })

  // Scoped Owner A
  const scopedOwnerUser = await payload.create({
    collection: 'users',
    data: {
      email: 'scoped-owner@rc102d.test',
      role: 'owner',
    } as any,
  })
  const scopedOwnerMember = (
    await payload.find({
      collection: 'members',
      where: { email: { equals: 'scoped-owner@rc102d.test' } },
      depth: 0,
    })
  ).docs[0]
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: scopedOwnerMember.id,
      site: siteA.id,
      role: 'community-manager',
    },
  })

  // Admin A
  const adminUser = await payload.create({
    collection: 'users',
    data: {
      email: 'admin-alpha@rc102d.test',
      role: 'administrator',
    } as any,
  })
  const adminMember = (
    await payload.find({
      collection: 'members',
      where: { email: { equals: 'admin-alpha@rc102d.test' } },
      depth: 0,
    })
  ).docs[0]
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: adminMember.id,
      site: siteA.id,
      role: 'community-manager',
    },
  })

  // Staff A
  const staffUser = await payload.create({
    collection: 'users',
    data: {
      email: 'staff-alpha@rc102d.test',
      role: 'staff',
    } as any,
  })
  const staffMember = (
    await payload.find({
      collection: 'members',
      where: { email: { equals: 'staff-alpha@rc102d.test' } },
      depth: 0,
    })
  ).docs[0]
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: staffMember.id,
      site: siteA.id,
      role: 'contributor',
    },
  })

  // Member A (subscriber with member role)
  const subscriberMember = await payload.create({
    collection: 'members',
    data: {
      email: 'member-alpha@rc102d.test',
      displayName: 'Subscriber Alpha',
      status: 'active',
    },
  })
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: subscriberMember.id,
      site: siteA.id,
      role: 'member',
    },
  })
  const memberActor = {
    id: subscriberMember.id,
    email: subscriberMember.email,
    role: 'subscriber',
    member: subscriberMember.id,
  }

  console.log('3. Seeding Test Articles on Site Alpha & Site Beta...')
  const contentA = await payload.create({
    collection: 'content',
    data: {
      site: siteA.id,
      publication: pubA.id,
      contentType: 'article',
      title: 'Article Alpha Pristine',
      slug: 'article-alpha-pristine',
      status: 'draft',
    },
    overrideAccess: true,
  } as never)

  const contentB = await payload.create({
    collection: 'content',
    data: {
      site: siteB.id,
      publication: pubB.id,
      contentType: 'article',
      title: 'Article Beta Pristine',
      slug: 'article-beta-pristine',
      status: 'draft',
    },
    overrideAccess: true,
  } as never)

  console.log('4. Seeding Public Redirects on Site Alpha & Site Beta...')
  const redirectA = await payload.create({
    collection: 'public-redirects',
    data: {
      site: siteA.id,
      fromPath: '/old-alpha-path',
      toPath: '/new-alpha-path',
      statusCode: '301',
      match: 'exact',
    },
    overrideAccess: true,
  } as never)
  const redirectB = await payload.create({
    collection: 'public-redirects',
    data: {
      site: siteB.id,
      fromPath: '/old-beta-path',
      toPath: '/new-beta-path',
      statusCode: '301',
      match: 'exact',
    },
    overrideAccess: true,
  } as never)

  // Capture pre-adversarial SQL state hashes
  const preSqlContent = await pool.query('SELECT id, site_id, title FROM content ORDER BY id')
  const preSqlRedirects = await pool.query('SELECT id, site_id, from_path FROM public_redirects ORDER BY id')

  console.log('5. Adversarial Test: Operator Site Grants & Isolation Checks...')
  // Global Owner: unrestricted access
  assert.equal(await checkOperatorSiteAccess(payload, globalOwnerUser, siteA.id), true)
  assert.equal(await checkOperatorSiteAccess(payload, globalOwnerUser, siteB.id), true)

  // Scoped Owner: bounded to Site A
  assert.equal(await checkOperatorSiteAccess(payload, scopedOwnerUser, siteA.id), true)
  assert.equal(await checkOperatorSiteAccess(payload, scopedOwnerUser, siteB.id), false)

  // Admin A: bounded to Site A
  assert.equal(await checkOperatorSiteAccess(payload, adminUser, siteA.id), true)
  assert.equal(await checkOperatorSiteAccess(payload, adminUser, siteB.id), false)

  // Staff A: bounded to Site A
  assert.equal(await checkOperatorSiteAccess(payload, staffUser, siteA.id), true)
  assert.equal(await checkOperatorSiteAccess(payload, staffUser, siteB.id), false)

  // Member A: denied operator access
  assert.equal(await checkOperatorSiteAccess(payload, memberActor, siteA.id), false)
  assert.equal(await checkOperatorSiteAccess(payload, memberActor, siteB.id), false)

  // Anonymous: denied operator access
  assert.equal(await checkOperatorSiteAccess(payload, null, siteA.id), false)

  console.log('6. Adversarial Test: Cross-Site Object-ID Substitution on Content...')
  // Admin A attempting to read/access Site B content record by ID
  const canAdminAccessContentB = await checkOperatorRecordAccess(payload, adminUser, 'content', contentB.id)
  assert.equal(canAdminAccessContentB, false, 'Admin A must NOT have operator access to Site B content')

  // Staff A attempting to read/access Site B content record by ID
  const canStaffAccessContentB = await checkOperatorRecordAccess(payload, staffUser, 'content', contentB.id)
  assert.equal(canStaffAccessContentB, false, 'Staff A must NOT have operator access to Site B content')

  // Verify DB unchanged after denied object-ID substitution attempts
  const postSubstitutionSql = await pool.query('SELECT id, site_id, title FROM content ORDER BY id')
  assert.deepEqual(postSubstitutionSql.rows, preSqlContent.rows)

  console.log('7. Adversarial Test: Attempted Site Move / Reparenting Prevention...')
  // Admin A attempting to re-parent Site Alpha content to Site Beta
  const updateAccess = preserveRecordRelationshipsAccess('content', ['site'], async () => true)
  const reparentAllowed = await updateAccess({
    req: { payload, user: adminUser } as any,
    id: contentA.id,
    data: {
      site: siteB.id,
      title: 'Malicious Cross-Site Re-parenting',
    },
  } as any)
  assert.equal(reparentAllowed, false, 'Cross-site re-parenting of content MUST be rejected by preserveRecordRelationshipsAccess')

  // Verify DB unchanged after denied re-parenting attempt
  const postReparentSql = await pool.query('SELECT id, site_id, title FROM content ORDER BY id')
  assert.deepEqual(postReparentSql.rows, preSqlContent.rows)

  console.log('8. Adversarial Test: Active-Site Switcher Route Authorization...')
  // Create passkey sessions for Admin A and Global Owner
  const adminSession = await createPasskeySession(
    { id: adminUser.id, email: adminUser.email },
    process.env.PAYLOAD_SECRET!,
    async (id, expiry) => {
      await pool.query('INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)', [
        id,
        adminUser.id,
        expiry,
      ])
    },
  )
  const globalOwnerSession = await createPasskeySession(
    { id: globalOwnerUser.id, email: globalOwnerUser.email },
    process.env.PAYLOAD_SECRET!,
    async (id, expiry) => {
      await pool.query('INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)', [
        id,
        globalOwnerUser.id,
        expiry,
      ])
    },
  )

  // Admin A sets active-site to Site Alpha -> 200 OK
  const adminSetAlphaReq = new Request('http://localhost:38905/api/admin/active-site', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `renegade-passkey=${adminSession.token}`,
    },
    body: JSON.stringify({ siteId: siteA.id }),
  })
  const adminAlphaRes = await activeSitePost(adminSetAlphaReq)
  assert.equal(adminAlphaRes.status, 200)
  const adminAlphaBody = await adminAlphaRes.json()
  assert.equal(adminAlphaBody.activeSiteId, siteA.id)

  // Admin A attempts to set active-site to foreign Site Beta -> 403 Forbidden
  const adminSetBetaReq = new Request('http://localhost:38905/api/admin/active-site', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `renegade-passkey=${adminSession.token}`,
    },
    body: JSON.stringify({ siteId: siteB.id }),
  })
  const adminBetaRes = await activeSitePost(adminSetBetaReq)
  assert.equal(adminBetaRes.status, 403, 'Admin A must be denied setting active site to Site Beta')

  // Global Owner sets active-site to Site Beta -> 200 OK
  const ownerSetBetaReq = new Request('http://localhost:38905/api/admin/active-site', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `renegade-passkey=${globalOwnerSession.token}`,
    },
    body: JSON.stringify({ siteId: siteB.id }),
  })
  const ownerBetaRes = await activeSitePost(ownerSetBetaReq)
  assert.equal(ownerBetaRes.status, 200)
  const ownerBetaBody = await ownerBetaRes.json()
  assert.equal(ownerBetaBody.activeSiteId, siteB.id)

  // Final DB integrity assertion
  const finalSqlContent = await pool.query('SELECT id, site_id, title FROM content ORDER BY id')
  const finalSqlRedirects = await pool.query('SELECT id, site_id, from_path FROM public_redirects ORDER BY id')
  assert.deepEqual(finalSqlContent.rows, preSqlContent.rows, 'Content table must remain completely unchanged')
  assert.deepEqual(finalSqlRedirects.rows, preSqlRedirects.rows, 'Redirects table must remain completely unchanged')

  // Write fixture for restart-check
  const fixture = {
    siteAId: siteA.id,
    siteBId: siteB.id,
    contentAId: contentA.id,
    contentBId: contentB.id,
    redirectAId: redirectA.id,
    redirectBId: redirectB.id,
    adminUserId: adminUser.id,
    globalOwnerUserId: globalOwnerUser.id,
  }
  await writeFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2))
  console.log('PASS 02D Adversarial Matrix: All cross-site denials, moves, and DB-unchanged assertions succeeded.')
  process.exit(0)
}

run().catch((err) => {
  console.error('FAIL in verify-adversarial-matrix:', err)
  process.exit(1)
})
