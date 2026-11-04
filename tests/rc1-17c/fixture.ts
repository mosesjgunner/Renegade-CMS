/* eslint-disable @typescript-eslint/no-explicit-any -- isolated disposable 17C fixture CLI */
/**
 * RC1 17C fixture/operator CLI. Runs INSIDE the production image (the
 * harness bind-mounts this directory read-only at /app/tests/rc1-17c) so
 * every write below is executed by the exact shipped artifact against
 * its own Compose PostgreSQL. It creates two disposable sites, an owner
 * and a site-scoped staff account, mints fixture passkey sessions (the
 * 15E–17B convention; no genuine passkey claim), queues durable
 * operations jobs for the separate worker service, and reports job and
 * registration state as JSON on stdout.
 */
import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'

const runId = process.env.RC117C_RUN_ID ?? 'rc117c'
const payload: any = await getPayload({ config })
const pool = payload.db.pool

const emit = (value: unknown) => console.log(`FIXTURE_JSON:${JSON.stringify(value)}`)

async function session(id: string): Promise<string> {
  const user = await payload.findByID({ collection: 'users', id })
  const value = await createPasskeySession(
    user,
    String(process.env.PAYLOAD_SECRET ?? ''),
    async (sid: string, expires: Date) => {
      await pool.query('INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)', [
        sid,
        id,
        expires,
      ])
    },
  )
  return `renegade-passkey=${value.token}`
}

try {
  const [mode, arg] = process.argv.slice(2)
  if (mode === 'collections') {
    emit({ collections: Object.keys(payload.collections).sort() })
  } else if (mode === 'init') {
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '17C Alpha', slug: `${runId}-alpha`, lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '17C Beta', slug: `${runId}-beta`, lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner@${runId}.test`, role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-a@${runId}.test`, role: 'staff' },
    })
    const staffMember = typeof staff.member === 'object' ? staff.member.id : staff.member
    await payload.create({
      collection: 'member-site-roles',
      data: { member: staffMember, site: alpha.id, role: 'contributor' },
    })
    // Creating a user auto-links a member identity (Users beforeChange), and
    // a member-linked owner is scoped by canonical grants: the legacy
    // installation fallback applies only to owners with no member identity
    // (src/modules/operations/operator-grants.ts). Without this grant the
    // owner is deliberately unauthorized for site-scoped media upload
    // (assertMediaPermission -> checkOperatorSiteAccess -> 403). Mirror the
    // installation-canonical state, as the R-05C harness documented.
    const ownerMember = typeof owner.member === 'object' ? owner.member.id : owner.member
    await payload.create({
      collection: 'member-site-roles',
      data: { member: ownerMember, site: alpha.id, role: 'community-manager' },
    })
    emit({
      alphaId: String(alpha.id),
      betaId: String(beta.id),
      ownerId: String(owner.id),
      staffId: String(staff.id),
      ownerCookie: await session(String(owner.id)),
      staffCookie: await session(String(staff.id)),
      collections: Object.keys(payload.collections).sort(),
    })
  } else if (mode === 'queue') {
    const waitSeconds = Number(arg ?? '0')
    const queued = await payload.jobs.queue({
      task: 'operations-heartbeat',
      input: {},
      queue: 'operations',
      waitUntil: new Date(Date.now() + waitSeconds * 1000),
    })
    emit({ jobId: String(queued.id) })
  } else if (mode === 'job') {
    const job = await payload.findByID({ collection: 'payload-jobs', id: arg })
    emit({
      jobId: String(job.id),
      completedAt: job.completedAt ?? null,
      hasError: Boolean(job.hasError),
      totalTried: Number(job.totalTried ?? 0),
      waitUntil: job.waitUntil ?? null,
    })
  } else {
    throw new Error('usage: fixture.ts collections|init|queue [waitSeconds]|job <id>')
  }
} finally {
  if (payload.db?.destroy) await payload.db.destroy()
}
process.exit(0)
