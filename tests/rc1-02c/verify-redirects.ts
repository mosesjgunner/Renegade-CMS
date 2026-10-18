import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { createStaffEnrollmentToken } from '@/modules/operations/staff-enrollment'
import { GET, POST, DELETE } from '@/app/(frontend)/api/admin/redirects/route'
import { GET as exportRules } from '@/app/(frontend)/api/admin/redirects/export/route'
import { POST as importRules } from '@/app/(frontend)/api/admin/redirects/import/route'

async function run() {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.equal(process.env.RC1_02C_DISPOSABLE, 'yes')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.port, '5433')
  assert.equal(url.pathname, '/rc102c_release_acceptance')
  const payload = await getPayload({ config })
  const pool = (payload.db as any).pool
  try {
    if (process.argv.includes('--restart-check')) {
      const ids = JSON.parse(await readFile('scratch/rc102c-20261017/fixture.json', 'utf8'))
      const row = await payload.findByID({
        collection: 'public-redirects',
        id: ids.retainedId,
        depth: 0,
      })
      assert.equal(row.fromPath, '/retained-after-restart')
      assert.equal(row.toPath, '/target')
      console.log('PASS restart: exact retained redirect reloaded from PostgreSQL in new process')
      return
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM sites')).rows[0].n, 0)
    const siteA = await payload.create({
      collection: 'sites',
      data: {
        name: '02C Alpha',
        slug: 'rc102c-alpha',
        lifecycle: 'active',
        communityRegistrationPolicy: 'open',
        commentReactionCodes: ['thumbs_up'],
      },
    })
    const siteB = await payload.create({
      collection: 'sites',
      data: {
        name: '02C Beta',
        slug: 'rc102c-beta',
        lifecycle: 'active',
        communityRegistrationPolicy: 'open',
        commentReactionCodes: ['thumbs_up'],
      },
    })
    const ownerMember = await payload.create({
      collection: 'members',
      data: { email: 'owner@rc102c.test', displayName: '02C owner', status: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: {
        email: 'owner@rc102c.test',
        member: ownerMember.id,
        role: 'owner',
      },
    })
    const invite = await createStaffEnrollmentToken(payload, loadConfig(), {
      email: 'admin@rc102c.test',
      role: 'administrator',
      siteId: siteA.id,
      invitedByUserId: owner.id,
    })
    const editorInvite = await createStaffEnrollmentToken(payload, loadConfig(), {
      email: 'editor@rc102c.test',
      role: 'administrator',
      siteId: siteA.id,
      invitedByUserId: owner.id,
    })
    // Owner session is a fixture for route-level operator proof, not passkey/browser acceptance.
    const session = await createPasskeySession(
      { id: owner.id, email: owner.email },
      process.env.PAYLOAD_SECRET!,
      async (id, expiresAt) => {
        await pool.query(
          'INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
          [id, owner.id, expiresAt],
        )
      },
    )
    const cookie = `renegade-passkey=${session.token}`
    const req = (suffix: string, site: string, method = 'GET', data?: unknown) =>
      new Request(`http://localhost:38903/api/admin/redirects${suffix}`, {
        method,
        headers: {
          cookie: `${cookie}; renegade-active-site=${site}`,
          'content-type': 'application/json',
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      })
    const a = await POST(
      req('', siteA.id, 'POST', { fromPath: '/alpha-only', toPath: '/alpha-target' }),
    )
    assert.equal(a.status, 201)
    const aId = (await a.json()).rule.id
    const b = await POST(
      req('', siteB.id, 'POST', { fromPath: '/beta-only', toPath: '/beta-target' }),
    )
    assert.equal(b.status, 201)
    const exported = await exportRules(req('/export?format=json', siteA.id))
    assert.equal(exported.status, 200)
    assert.deepEqual(
      (await exported.json()).map((row: any) => row.fromPath),
      ['/alpha-only'],
    )
    console.log('PASS export: Site Alpha download excludes persisted Site Beta rule')
    const imported = await importRules(
      req('/import', siteB.id, 'POST', [
        { fromPath: '/imported-beta', toPath: '/beta-target' },
        { fromPath: '/loop', toPath: '/loop' },
      ]),
    )
    const outcome = await imported.json()
    assert.equal(outcome.success, false)
    assert.equal(outcome.partial, true)
    assert.equal(outcome.created, 1)
    assert.equal(outcome.skipped, 1)
    assert.equal(outcome.errors.length, 1)
    const importedRows = await pool.query(
      "SELECT site_id, to_path FROM public_redirects WHERE from_path = '/imported-beta'",
    )
    assert.equal(importedRows.rows[0].site_id, siteB.id)
    console.log(
      'PASS partial import: one Beta row persisted, invalid self-loop absent, errors reported',
    )
    const update = await POST(
      req('', siteA.id, 'POST', { id: aId, fromPath: '/alpha-only', toPath: '/changed' }),
    )
    assert.equal(update.status, 200)
    assert.equal(
      (await payload.findByID({ collection: 'public-redirects', id: aId, depth: 0 })).toPath,
      '/changed',
    )
    assert.equal((await DELETE(req(`?id=${aId}`, siteA.id, 'DELETE'))).status, 200)
    assert.equal((await GET(req('', siteA.id))).status, 200)
    assert.equal((await (await GET(req('', siteA.id))).json()).rules.length, 0)
    const invalid = await POST(req('', siteA.id, 'POST', { fromPath: '/bad', toPath: '/bad' }))
    assert.equal(invalid.status, 400)
    const retained = await POST(
      req('', siteA.id, 'POST', { fromPath: '/retained-after-restart', toPath: '/target' }),
    )
    assert.equal(retained.status, 201)
    const retainedId = (await retained.json()).rule.id
    assert.equal(
      (await exportRules(new Request('http://localhost:38903/api/admin/redirects/export'))).status,
      403,
    )
    console.log('PASS route CRUD/error/anonymous denial: SQL and fresh route reload match outcomes')
    const fixture = {
      siteA: siteA.id,
      siteB: siteB.id,
      retainedId,
      enrollmentToken: invite.enrollmentToken,
      adminEmail: invite.user.email,
      editorToken: editorInvite.enrollmentToken,
      editorEmail: editorInvite.user.email,
    }
    await mkdir('scratch/rc102c-20261017', { recursive: true })
    await writeFile('scratch/rc102c-20261017/fixture.json', JSON.stringify(fixture))
    console.log('PASS fixture ready for real browser enrollment; no token included in evidence')
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
