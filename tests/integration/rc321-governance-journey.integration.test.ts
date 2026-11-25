/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import {
  MEMBER_CSRF_COOKIE,
  MEMBER_SESSION_COOKIE,
  currentMember,
  digest,
  opaqueToken,
} from '../../src/modules/identity/member-identity'
import { analyticsRetentionTask } from '../../src/modules/analytics/tasks'
import { GET as exportRoute } from '../../src/app/(frontend)/api/member-auth/export/route'
import { POST as deleteRoute } from '../../src/app/(frontend)/api/member-auth/delete/route'
import { POST as finalizeDeletionRoute } from '../../src/app/(frontend)/api/admin/members/deletion/route'

const suffix = randomUUID().slice(0, 8)

let payload: Payload
let siteId: string
let adminCookie: string
let staffCookie: string

let journeyMemberId: string
let journeyProfileId: string
let journeyIdentityId: string
let journeyEmail: string
let sessionToken: string
let csrfToken: string

async function makeStaffCookie(role: 'administrator' | 'staff', label: string): Promise<string> {
  const email = `rc321-${label}-${suffix}@renegade.test`
  const user = (await payload.create({
    collection: 'users',
    data: { email, role },
    overrideAccess: true,
  } as never)) as unknown as { id: string; email: string; member?: unknown }
  // The users hooks only auto-grant site roles on a single-site install, so
  // grant this run's site explicitly: the grant resolver counts
  // 'community-manager' (administrator) and 'contributor' (staff) rows.
  const memberId = String(
    typeof user.member === 'object' && user.member
      ? (user.member as { id?: unknown }).id
      : user.member,
  )
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: memberId,
      site: siteId,
      role: role === 'administrator' ? 'community-manager' : 'contributor',
    },
    overrideAccess: true,
  } as never)
  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await (payload.db as any).pool.query(
        'INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [sessionId, user.id, expiresAt],
      )
    },
  )
  return `renegade-passkey=${session.token}`
}

function memberRequest(path: string, withCsrf: boolean, withSession: boolean): Request {
  const cookies: string[] = []
  if (withSession) cookies.push(`${MEMBER_SESSION_COOKIE}=${sessionToken}`)
  if (withCsrf) cookies.push(`${MEMBER_CSRF_COOKIE}=${csrfToken}`)
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookies.length ? { cookie: cookies.join('; ') } : {}),
      ...(withCsrf ? { 'x-member-csrf': csrfToken } : {}),
    },
  })
}

function adminRequest(cookie: string | null, memberId: string): Request {
  return new Request('http://localhost/api/admin/members/deletion', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ memberId }),
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })

  const site = (await payload.create({
    collection: 'sites',
    data: {
      name: `RC321 Governance Site ${suffix}`,
      slug: `rc321-governance-${suffix}`,
      domain: `rc321-${suffix}.example.test`,
      status: 'published',
    },
    overrideAccess: true,
  } as never)) as unknown as { id: string }
  siteId = String(site.id)

  // Staff users: the users hooks link their canonical members; makeStaffCookie
  // adds the explicit site-role grant the operator grant resolver counts.
  adminCookie = await makeStaffCookie('administrator', 'admin')
  staffCookie = await makeStaffCookie('staff', 'staff')

  journeyEmail = `rc321-journey-${suffix}@renegade.test`
  const member = (await payload.create({
    collection: 'members',
    data: { displayName: 'Journey Person', email: journeyEmail, status: 'active' },
    overrideAccess: true,
  } as never)) as unknown as { id: string }
  journeyMemberId = String(member.id)

  const profile = (await payload.create({
    collection: 'profiles',
    data: {
      member: journeyMemberId,
      displayName: 'Journey Person',
      handle: `journey-${suffix}`,
      visibility: 'public',
      bio: 'Governance journey fixture.',
      preferences: {},
    },
    overrideAccess: true,
  } as never)) as unknown as { id: string }
  journeyProfileId = String(profile.id)

  const identity = (await payload.create({
    collection: 'linked-identities',
    data: {
      member: journeyMemberId,
      kind: 'email-magic-link',
      providerKey: 'renegade-email',
      externalSubject: digest(journeyEmail),
      verifiedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  } as never)) as unknown as { id: string }
  journeyIdentityId = String(identity.id)

  sessionToken = opaqueToken()
  csrfToken = opaqueToken()
  await payload.create({
    collection: 'member-sessions',
    data: {
      member: journeyMemberId,
      tokenHash: digest(sessionToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdFrom: 'magic-link',
      lastSeenAt: new Date().toISOString(),
    },
    overrideAccess: true,
  } as never)
}, 120_000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('RC3-21 member deletion journey (#67)', () => {
  it('refuses the delete route without a session and without CSRF', async () => {
    const noSession = await deleteRoute(memberRequest('/api/member-auth/delete', true, false))
    expect(noSession.status).toBe(401)
    const noCsrf = await deleteRoute(memberRequest('/api/member-auth/delete', false, true))
    expect(noCsrf.status).toBe(403)
    const member = (await payload.findByID({
      collection: 'members',
      id: journeyMemberId,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(member.status).toBe('active')
  }, 60_000)

  it('exports, requests deletion, refuses staff finalize, and anonymizes on administrator finalize', async () => {
    // Export through the real route contains the member's own data.
    const exportResponse = await exportRoute(
      new Request('http://localhost/api/member-auth/export', {
        headers: { cookie: `${MEMBER_SESSION_COOKIE}=${sessionToken}` },
      }),
    )
    expect(exportResponse.status).toBe(200)
    const exported = (await exportResponse.json()) as any
    expect(exported.member.email).toBe(journeyEmail)
    expect(exported.member.displayName).toBe('Journey Person')
    expect(exported.profile?.displayName).toBe('Journey Person')
    expect(exported.linkedIdentities).toHaveLength(1)
    expect(exported.sessions).toHaveLength(1)

    // Member requests deletion through the real route (session + CSRF).
    const deleteResponse = await deleteRoute(memberRequest('/api/member-auth/delete', true, true))
    expect(deleteResponse.status).toBe(200)
    expect(await deleteResponse.json()).toMatchObject({ status: 'deletion-pending' })
    const pending = (await payload.findByID({
      collection: 'members',
      id: journeyMemberId,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(pending.status).toBe('deletion-pending')

    // A non-admin staff role cannot finalize.
    const staffFinalize = await finalizeDeletionRoute(adminRequest(staffCookie, journeyMemberId))
    expect(staffFinalize.status).toBe(403)
    const stillPending = (await payload.findByID({
      collection: 'members',
      id: journeyMemberId,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(stillPending.status).toBe('deletion-pending')

    // An administrator finalizes.
    const finalizeResponse = await finalizeDeletionRoute(adminRequest(adminCookie, journeyMemberId))
    expect(finalizeResponse.status).toBe(200)
    expect(await finalizeResponse.json()).toMatchObject({
      memberId: journeyMemberId,
      status: 'deleted',
      displayName: 'Deleted member',
      email: null,
    })

    // Anonymized readback.
    const member = (await payload.findByID({
      collection: 'members',
      id: journeyMemberId,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(member.displayName).toBe('Deleted member')
    expect(member.email).toBeNull()
    expect(member.status).toBe('deleted')

    const profile = (await payload.findByID({
      collection: 'profiles',
      id: journeyProfileId,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(profile.displayName).toBe('Deleted member')
    expect(profile.visibility).toBe('private')

    // The old session no longer authenticates anyone.
    expect(await currentMember(payload as never, sessionToken)).toBeNull()
    const sessions = await payload.find({
      collection: 'member-sessions',
      where: { member: { equals: journeyMemberId } },
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(sessions.docs).toHaveLength(1)
    expect((sessions.docs[0] as any).revokedAt).toBeTruthy()

    // Linked identity revoked by finalize.
    const identity = (await payload.findByID({
      collection: 'linked-identities',
      id: journeyIdentityId,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(identity.revokedAt).toBeTruthy()

    // Audit event written.
    const audit = await payload.find({
      collection: 'identity-audit-events',
      where: {
        and: [
          { member: { equals: journeyMemberId } },
          { event: { equals: 'member.deletion.finalized' } },
        ],
      },
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(audit.docs).toHaveLength(1)
  }, 60_000)

  it('refuses to finalize a member who never requested deletion', async () => {
    const member = (await payload.create({
      collection: 'members',
      data: {
        displayName: 'Never Requested',
        email: `rc321-never-${suffix}@renegade.test`,
        status: 'active',
      },
      overrideAccess: true,
    } as never)) as unknown as { id: string }
    const response = await finalizeDeletionRoute(adminRequest(adminCookie, String(member.id)))
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    const readBack = (await payload.findByID({
      collection: 'members',
      id: String(member.id),
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(readBack.status).toBe('active')
    expect(readBack.displayName).toBe('Never Requested')

    const unauthenticated = await finalizeDeletionRoute(adminRequest(null, String(member.id)))
    expect(unauthenticated.status).toBe(403)
  }, 60_000)
})

describe('RC3-21 analytics retention purge (#68)', () => {
  it('deletes only expired expire-at rows with no hold when the task handler executes', async () => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    const mkEvent = (label: string, data: Record<string, unknown>) =>
      payload.create({
        collection: 'analytics-events',
        data: {
          site: siteId,
          eventId: `rc321-${label}-${suffix}`,
          dedupeKey: `rc321-${label}-${suffix}`,
          eventType: 'rc321.retention-probe',
          occurredAt: new Date(now).toISOString(),
          receivedAt: new Date(now).toISOString(),
          schemaVersion: 1,
          consentBasis: 'necessary',
          context: {},
          ...data,
        },
        overrideAccess: true,
      } as never)
    const expiredPurgeable = await mkEvent('expired-purgeable', {
      retentionMode: 'expire-at',
      retentionHold: 'none',
      retentionExpiresAt: new Date(now - day).toISOString(),
    })
    const expiredHeld = await mkEvent('expired-held', {
      retentionMode: 'expire-at',
      retentionHold: 'legal',
      retentionExpiresAt: new Date(now - day).toISOString(),
    })
    const unexpired = await mkEvent('unexpired', {
      retentionMode: 'expire-at',
      retentionHold: 'none',
      retentionExpiresAt: new Date(now + day).toISOString(),
    })
    const ids = [expiredPurgeable, expiredHeld, unexpired].map((doc: any) => String(doc.id))

    const countOurs = () =>
      payload.count({
        collection: 'analytics-events',
        where: { id: { in: ids } },
        overrideAccess: true,
      } as never)
    const before = await countOurs()
    expect(before.totalDocs).toBe(3)

    // Invoke the Payload jobs task handler the way the jobs framework does:
    // the registered task's handler with the job input and a req carrying the
    // real Payload instance.
    const handler = (
      analyticsRetentionTask as unknown as {
        handler: (args: unknown) => Promise<{ output: { deleted: number; observedAt: string } }>
      }
    ).handler
    const result = await handler({ input: {}, req: { payload } })
    expect(result.output.deleted).toBeGreaterThanOrEqual(1)

    const after = await countOurs()
    expect(after.totalDocs).toBe(2)
    const remaining = await payload.find({
      collection: 'analytics-events',
      where: { id: { in: ids } },
      depth: 0,
      overrideAccess: true,
    } as never)
    const remainingIds = remaining.docs.map((doc: any) => String(doc.id)).sort()
    expect(remainingIds).toEqual([String(expiredHeld.id), String(unexpired.id)].sort())
  }, 60_000)
})
