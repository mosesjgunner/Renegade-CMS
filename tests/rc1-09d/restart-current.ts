/* eslint-disable @typescript-eslint/no-explicit-any -- isolated restart comparison */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { GET as report } from '../../src/app/(frontend)/api/admin/audience/command-center/route'
import { POST as retry } from '../../src/app/(frontend)/api/admin/audience/retry/route'

assert.equal(process.env.RC1_09D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5453/rc109d_release_acceptance',
)
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/09D'
const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
const browser = JSON.parse(await readFile(`${out}/browser-state.json`, 'utf8'))
const collections = [
  'subscribers',
  'contacts',
  'consent-events',
  'suppressions',
  'email-messages',
  'email-deliveries',
  'form-submissions',
  'workflow-items',
  'telecom-messages',
  'telecom-deliveries',
  'recipient-snapshots',
]
const trace: any[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
try {
  const snapshot: Record<string, any> = {}
  for (const collection of collections) {
    const rows = await payload.find({
      collection,
      sort: 'id',
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    snapshot[collection] = {
      total: rows.totalDocs,
      siteTotal: rows.docs.filter((r: any) => r.site === state.alphaSiteId).length,
      siteTriaged: rows.docs.filter(
        (r: any) => r.site === state.alphaSiteId && r.status === 'triaged',
      ).length,
      sha256: createHash('sha256').update(JSON.stringify(rows.docs)).digest('hex'),
    }
  }
  if (process.argv.includes('--capture')) {
    await writeFile(`${out}/restart-before.json`, JSON.stringify(snapshot, null, 2))
    console.log('Captured exact persisted records for isolated database restart.')
  } else {
    const before = JSON.parse(await readFile(`${out}/restart-before.json`, 'utf8'))
    for (const collection of collections) {
      assert.deepEqual(
        snapshot[collection],
        before[collection],
        `${collection}: exact record equality`,
      )
      check(`database and process restart retain exact ${collection} records`, true)
    }
    const delivery = await payload.findByID({
      collection: 'email-deliveries',
      id: browser.deliveryId,
      depth: 0,
      overrideAccess: true,
    })
    const cancelled = await payload.findByID({
      collection: 'email-deliveries',
      id: browser.suppressedDeliveryId,
      depth: 0,
      overrideAccess: true,
    })
    check(
      'browser campaign remains accepted once; subsequent send remains cancelled',
      delivery.status === 'accepted' &&
        delivery.attempts === 1 &&
        cancelled.status === 'cancelled' &&
        cancelled.attempts === 0,
    )
    const admin = (
      await payload.find({
        collection: 'users',
        where: { role: { equals: 'owner' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
    ).docs[0]
    const session = await createPasskeySession(
      admin,
      process.env.PAYLOAD_SECRET!,
      async (id, expiresAt) => {
        await payload.db.pool.query(
          'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
          [id, admin.id, expiresAt],
        )
      },
    )
    const headers = {
      cookie: `renegade-passkey=${session.token}`,
      host: 'localhost:39003',
      origin: 'http://localhost:39003',
    }
    const response = await report(
      new Request(
        `http://localhost:39003/api/admin/audience/command-center?siteId=${state.alphaSiteId}`,
        { headers },
      ),
    )
    const body = await response.json()
    check(
      'post-restart operator counts reconcile all subscriber records',
      response.status === 200 && body.subscribers === before.subscribers.siteTotal,
    )
    check(
      'post-restart operator form counts retain complete 51-row cohort',
      body.forms.total === before['form-submissions'].siteTotal &&
        body.forms.triaged === before['form-submissions'].siteTriaged,
    )
    const denied = await retry(
      new Request('http://localhost:39003/api/admin/audience/retry', {
        method: 'POST',
        headers,
        body: JSON.stringify({ deliveryId: browser.deliveryId }),
      }),
    )
    check('post-restart retry of accepted browser campaign denied', denied.status === 409)
    await writeFile(`${out}/restart-trace.json`, JSON.stringify(trace, null, 2))
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await payload.destroy()
  process.exit(process.exitCode ?? 0)
}
