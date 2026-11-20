/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import {
  GET as startersGET,
  POST as startersPOST,
} from '../../src/app/(frontend)/api/admin/starters/route'
import { GET as guidedSetupGET } from '../../src/app/(frontend)/api/admin/guided-setup/route'

// UXI-13 failure-matrix row: wrong-site and crafted-ID attempts against the
// install/UX operator surface. A scoped operator of site A must never read
// or mutate site B through the starter APIs; a crafted (nonexistent) site
// ID must be refused even for the global owner; a forged active-site cookie
// must not leak a foreign site into guided setup. The control cases prove
// the refusals are authorization, not breakage: the global owner CAN read
// site B, and the scoped operator CAN see site A in guided setup.

let payload: Payload
const suffix = randomUUID().slice(0, 8)
let siteAId = ''
let siteBId = ''
let ownerHeaders: Headers
let adminHeaders: Headers

async function sessionHeaders(userId: string, email: string): Promise<Headers> {
  const pool = payload.db.pool
  const session = await createPasskeySession(
    { email, id: userId },
    loadConfig().payloadSecret,
    async (id, expiresAt) => {
      await pool.query(`INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`, [
        id,
        userId,
        expiresAt,
      ])
    },
  )
  return new Headers({ cookie: `renegade-passkey=${session.token}` })
}

beforeAll(async () => {
  payload = await getPayload({ config })

  const siteA = await payload.create({
    collection: 'sites',
    data: { name: `UXI13 Site A ${suffix}`, slug: `uxi13-a-${suffix}`, lifecycle: 'active' } as any,
    overrideAccess: true,
  })
  siteAId = String(siteA.id)
  const siteB = await payload.create({
    collection: 'sites',
    data: { name: `UXI13 Site B ${suffix}`, slug: `uxi13-b-${suffix}`, lifecycle: 'active' } as any,
    overrideAccess: true,
  })
  siteBId = String(siteB.id)

  // Global owner (installation-owner shape: role owner + isGlobalOwner).
  const owner = await payload.create({
    collection: 'users',
    data: {
      email: `uxi13-owner-${suffix}@example.test`,
      role: 'owner',
      isGlobalOwner: true,
    } as any,
    overrideAccess: true,
    context: { skipEnrollmentToken: true, seeding: true },
  })
  ownerHeaders = await sessionHeaders(String(owner.id), String((owner as any).email))

  // Scoped operator: administrator whose member holds a role on site A only.
  const member = await payload.create({
    collection: 'members',
    data: {
      displayName: `UXI13 Admin ${suffix}`,
      email: `uxi13-admin-${suffix}@example.test`,
      site: siteAId,
      status: 'active',
    } as any,
    overrideAccess: true,
  })
  await payload.create({
    collection: 'member-site-roles',
    data: { member: member.id, site: siteAId, role: 'community-manager' } as any,
    overrideAccess: true,
  })
  const admin = await payload.create({
    collection: 'users',
    data: {
      email: `uxi13-admin-${suffix}@example.test`,
      role: 'administrator',
      member: member.id,
    } as any,
    overrideAccess: true,
    context: { skipEnrollmentToken: true, seeding: true },
  })
  adminHeaders = await sessionHeaders(String(admin.id), String((admin as any).email))
})

afterAll(async () => {
  await payload?.db.destroy?.()
})

const startersUrl = (site?: string) =>
  `http://localhost/api/admin/starters${site ? `?site=${site}` : ''}`

describe('UXI-13 wrong-site / crafted-ID attempts', () => {
  it('refuses unauthenticated starter reads', async () => {
    const res = await startersGET(new Request(startersUrl(siteBId)))
    expect(res.status).toBe(403)
  })

  it('refuses a scoped site-A administrator at the starters API entirely', async () => {
    const res = await startersGET(new Request(startersUrl(siteBId), { headers: adminHeaders }))
    expect(res.status).toBe(403)
  })

  it('refuses a crafted (nonexistent) site ID even for the global owner', async () => {
    const crafted = randomUUID()
    const res = await startersGET(new Request(startersUrl(crafted), { headers: ownerHeaders }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(String(body.error)).toMatch(/denied/i)
  })

  it('control: the global owner CAN read the real site B starter status', async () => {
    const res = await startersGET(new Request(startersUrl(siteBId), { headers: ownerHeaders }))
    expect(res.status).toBe(200)
  })

  it('refuses a starter install POST against a crafted site ID and writes nothing', async () => {
    const crafted = randomUUID()
    const before = await payload.find({
      collection: 'sites',
      where: { id: { equals: crafted } },
      overrideAccess: true,
    })
    expect(before.totalDocs).toBe(0)
    const req = new Request('http://localhost/api/admin/starters', {
      method: 'POST',
      headers: {
        ...Object.fromEntries(ownerHeaders.entries()),
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'install', siteId: crafted, starterId: 'publication' }),
    })
    const res = await startersPOST(req)
    expect(res.status).toBe(403)
    const after = await payload.find({
      collection: 'sites',
      where: { id: { equals: crafted } },
      overrideAccess: true,
    })
    expect(after.totalDocs).toBe(0)
  })

  it('guided setup shows the scoped administrator ONLY site A', async () => {
    const res = await guidedSetupGET(
      new Request('http://localhost/api/admin/guided-setup', { headers: adminHeaders }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const ids = (body.sites as Array<{ id: string }>).map((s) => s.id)
    expect(ids).toContain(siteAId)
    expect(ids).not.toContain(siteBId)
  })

  it('a forged active-site cookie naming site B does not leak it into guided setup', async () => {
    const headers = new Headers(adminHeaders)
    headers.set('cookie', `${adminHeaders.get('cookie')}; renegade-active-site=${siteBId}`)
    const res = await guidedSetupGET(
      new Request('http://localhost/api/admin/guided-setup', { headers }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const ids = (body.sites as Array<{ id: string }>).map((s) => s.id)
    expect(ids).not.toContain(siteBId)
    // The forged cookie is ignored: the active site falls back to the
    // operator's own first authorized site, never the foreign one.
    expect(body.activeSiteId).toBe(siteAId)
  })
})
