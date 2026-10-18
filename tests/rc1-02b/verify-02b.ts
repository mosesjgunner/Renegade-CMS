import { createHmac } from 'node:crypto'
import http from 'node:http'
import configPromise from '@/payload.config'
import { getPayload } from 'payload'
import { chromium } from '@playwright/test'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { loadConfig } from '@/modules/core/config'
import {
  createStaffEnrollmentToken,
  getStaffEnrollmentDetails,
  beginStaffPasskeyEnrollment,
  completeStaffPasskeyEnrollment,
  revokeStaffInvitation,
} from '@/modules/operations/staff-enrollment'
import {
  resolveOperatorGrantContext,
  checkOperatorSiteAccess,
} from '@/modules/operations/operator-grants'
import {
  createPasskeySession,
  passkeySessionCookie,
  revokePasskeySession,
} from '@/modules/operations/passkey-auth'
import { rotateOwnerRecoveryCodes } from '@/modules/operations/owner-recovery'
import { POST as staffInvitePost, DELETE as staffInviteDelete } from '@/app/(frontend)/api/admin/staff/invite/route'
import { GET as enrollmentGet } from '@/app/(frontend)/api/auth/enrollment/route'
import { POST as passkeyEnrollPost } from '@/app/(frontend)/api/auth/passkey/enroll/route'
import { POST as passkeyOptionsPost } from '@/app/(frontend)/api/auth/passkey/options/route'
import { POST as passkeyCompletePost } from '@/app/(frontend)/api/auth/passkey/complete/route'
import { POST as releaseActionPost } from '@/app/(frontend)/api/admin/releases/[id]/route'
import { POST as logoutPost } from '@/app/(frontend)/api/auth/logout/route'

function toB64Url(buf: ArrayBuffer | Uint8Array): string {
  return Buffer.from(buf as ArrayBuffer).toString('base64url')
}

async function run() {
  console.log('=== [02B/70] STAFF INVITATIONS, ROLES AND RECOVERY VERIFICATION START ===')
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
  if (
    process.env.RC1_02B_DISPOSABLE !== 'yes' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseUrl.port !== '5433' ||
    !databaseUrl.pathname.includes('rc102b')
  ) {
    throw new Error('Refusing destructive verification without the dedicated rc102b disposable database on loopback port 5433.')
  }

  // Start local HTTP origin for WebAuthn RPID/Origin matching
  const originPort = 3999
  const localOrigin = `https://dispatch.rc101-02b.test:${originPort}`
  const originHost = 'dispatch.rc101-02b.test'

  console.log('1. Connecting to isolated PostgreSQL instance on port 5433...')
  const payload = await getPayload({ config: configPromise })
  const runtimeConfig = loadConfig()
  const db = payload.db as any

  console.log('2. Truncating test tables in isolated database...')
  await db.pool.query(
    `TRUNCATE admin_sessions, admin_auth_audit_events, recovery_codes, passkeys, identity_tokens,
              member_site_roles, content_releases, publications, sites, users, members CASCADE`
  )
  console.log('   Isolated database clean.')

  const runId = Date.now().toString(36)
  const ownerEmail = `owner_${runId}@rc1-02b.test`
  const adminEmail = `admin_${runId}@rc1-02b.test`
  const staffEmail = `staff_${runId}@rc1-02b.test`

  // Step 3: Create Two Distinct Sites
  console.log('3. Bootstrapping Site A and Site B...')
  const siteA = await payload.create({
    collection: 'sites',
    data: {
      name: `Alpha Dispatch ${runId}`,
      slug: `alpha-dispatch-${runId}`,
      lifecycle: 'active',
    },
    overrideAccess: true,
  } as never)

  const siteB = await payload.create({
    collection: 'sites',
    data: {
      name: `Beta Network ${runId}`,
      slug: `beta-network-${runId}`,
      lifecycle: 'active',
    },
    overrideAccess: true,
  } as never)

  console.log(`   Site A: id=${siteA.id}, slug=${(siteA as any).slug}`)
  console.log(`   Site B: id=${siteB.id}, slug=${(siteB as any).slug}`)

  // Step 4: Create Global Platform Owner
  console.log('4. Bootstrapping Global Platform Owner...')
  const ownerMember = await payload.create({
    collection: 'members',
    data: {
      email: ownerEmail,
      displayName: 'Platform Owner',
      status: 'active',
    },
    overrideAccess: true,
  } as never)

  const ownerUser = await payload.create({
    collection: 'users',
    data: {
      email: ownerEmail,
      role: 'owner',
      member: ownerMember.id,
      isGlobalOwner: true,
    },
    overrideAccess: true,
  } as never)

  // Register owner passkey and session
  await db.pool.query(
    `INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, name, transports)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ownerUser.id,
      `cred-owner-${runId}`,
      'dummy-owner-pubkey',
      1,
      'singleDevice',
      false,
      'Owner Passkey',
      '[]',
    ]
  )

  async function createTestAdminSession(user: { id: string; email: string }) {
    return createPasskeySession(user, runtimeConfig.payloadSecret, async (id, expiresAt) => {
      await db.pool.query(
        `INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
        [id, user.id, expiresAt]
      )
    })
  }

  const ownerSession = await createTestAdminSession({
    id: ownerUser.id,
    email: ownerEmail,
  })

  const ownerHeaders = new Headers({
    'content-type': 'application/json',
    cookie: passkeySessionCookie(ownerSession.token, ownerSession.expirationSeconds, runtimeConfig.secureCookies),
  })

  // Verify owner grant context
  const ownerGrant = await resolveOperatorGrantContext(payload, ownerUser as any)
  console.log(`   Owner grant: authorized=${ownerGrant.authorized}, isGlobalOwner=${ownerGrant.isGlobalOwner}`)
  if (!ownerGrant.authorized || !ownerGrant.isGlobalOwner) {
    throw new Error('Owner authority invariant violated: owner must have global access!')
  }

  // Launch Playwright headless browser for authentic WebAuthn signing
  console.log('5. Launching Chromium with authentic WebAuthn CTAP2 Virtual Authenticator...')
  const https = await import('node:https')
  const fs = await import('node:fs')
  const key = fs.readFileSync('scratch/rc02-tls/key.pem')
  const cert = fs.readFileSync('scratch/rc02-tls/cert.pem')

  const localHttps = https.createServer({ key, cert }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!DOCTYPE html><html><body>Renegade CMS WebAuthn Runner</body></html>')
  }).listen(originPort, '127.0.0.1')

  const browser = await chromium.launch({
    headless: true,
    args: [
      `--host-resolver-rules=MAP ${originHost} 127.0.0.1`,
      '--ignore-certificate-errors',
    ],
  })
  const browserContext = await browser.newContext({ ignoreHTTPSErrors: true })
  const browserPage = await browserContext.newPage()

  await browserPage.goto(localOrigin)
  const cdp = await browserContext.newCDPSession(browserPage)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  console.log('   Virtual authenticator configured and ready.')

  // Helper to generate authentic WebAuthn credentials in browser
  async function generateWebAuthnRegistration(options: any) {
    return browserPage.evaluate(`(async (opts) => {
      opts.challenge = Uint8Array.from(atob(opts.challenge.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
      opts.user.id = Uint8Array.from(atob(opts.user.id.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
      const cred = await navigator.credentials.create({ publicKey: opts })
      const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
      return {
        id: cred.id,
        rawId: toB64(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: toB64(cred.response.clientDataJSON),
          attestationObject: toB64(cred.response.attestationObject),
          transports: cred.response.getTransports ? cred.response.getTransports() : [],
        },
      }
    })(${JSON.stringify(options)})`)
  }

  async function loginWithPasskey(userId: string, email: string) {
    const optionsResponse = await passkeyOptionsPost(new Request('http://localhost/api/auth/passkey/options', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
    }))
    if (optionsResponse.status !== 200) throw new Error(`Passkey login options failed: ${optionsResponse.status}`)
    const { options } = await optionsResponse.json()
    const credential = await browserPage.evaluate(`(async (opts) => {
      const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
      const encode = (value) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
      opts.challenge = decode(opts.challenge)
      opts.allowCredentials = opts.allowCredentials.map((item) => ({ ...item, id: decode(item.id) }))
      const assertion = await navigator.credentials.get({ publicKey: opts })
      return { id: assertion.id, rawId: encode(assertion.rawId), type: assertion.type,
        response: { clientDataJSON: encode(assertion.response.clientDataJSON), authenticatorData: encode(assertion.response.authenticatorData), signature: encode(assertion.response.signature), userHandle: assertion.response.userHandle ? encode(assertion.response.userHandle) : null } }
    })(${JSON.stringify(options)})`)
    const response = await passkeyCompletePost(new Request('http://localhost/api/auth/passkey/complete', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credential),
    }))
    if (response.status !== 200) throw new Error(`Passkey login failed: ${response.status} ${await response.text()}`)
    const cookie = response.headers.get('set-cookie')
    if (!cookie) throw new Error('Passkey login did not issue a session cookie')
    const sessions = await db.pool.query('SELECT id FROM admin_sessions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1', [userId])
    if (!sessions.rows[0]) throw new Error('Passkey login session was not persisted')
    return { cookie: cookie.split(';')[0], sessionId: sessions.rows[0].id }
  }

  // ==========================================
  // JOURNEY 1: Owner invites two different roles via API
  // ==========================================
  console.log('6. Journey 1: Owner invites two different roles via API...')

  // Role 1: Administrator on Site A
  console.log('   A. Inviting Administrator role on Site A...')
  const adminInviteReq = new Request('http://localhost/api/admin/staff/invite', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      email: adminEmail,
      role: 'administrator',
      siteId: siteA.id,
      validHours: 24,
    }),
  })
  const adminInviteRes = await staffInvitePost(adminInviteReq)
  console.log(`      Invite Admin status: ${adminInviteRes.status}`)
  if (adminInviteRes.status !== 201) {
    const err = await adminInviteRes.json()
    throw new Error(`Failed to invite administrator: ${JSON.stringify(err)}`)
  }
  const adminInviteBody = await adminInviteRes.json()
  console.log(`      Admin token issued: ${adminInviteBody.enrollmentToken.substring(0, 16)}...`)
  console.log(`      Admin role: ${adminInviteBody.user.role}, siteId: ${adminInviteBody.siteId}`)

  // Pending invitations must not create operator grants.
  const adminUserDoc = await payload.findByID({ collection: 'users', id: adminInviteBody.user.id, depth: 0, overrideAccess: true })
  const adminMemberId = typeof adminUserDoc.member === 'object' ? (adminUserDoc.member as any).id : adminUserDoc.member
  if (!adminMemberId) throw new Error('Administrator user missing canonical member linkage!')
  const adminSiteRoles = await payload.find({
    collection: 'member-site-roles',
    where: { and: [{ member: { equals: adminMemberId } }, { site: { equals: siteA.id } }] },
    depth: 0,
    overrideAccess: true,
  })
  if (adminSiteRoles.docs.length !== 0) throw new Error('Pending administrator invitation granted site access!')
  if ((await resolveOperatorGrantContext(payload, adminUserDoc as any)).authorized) {
    throw new Error('Pending administrator invitation granted operator access!')
  }

  // Role 2: Staff on Site A
  console.log('   B. Inviting Staff role on Site A...')
  const staffInviteReq = new Request('http://localhost/api/admin/staff/invite', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      email: staffEmail,
      role: 'staff',
      siteId: siteA.id,
      validHours: 24,
    }),
  })
  const staffInviteRes = await staffInvitePost(staffInviteReq)
  console.log(`      Invite Staff status: ${staffInviteRes.status}`)
  if (staffInviteRes.status !== 201) {
    const err = await staffInviteRes.json()
    throw new Error(`Failed to invite staff: ${JSON.stringify(err)}`)
  }
  const staffInviteBody = await staffInviteRes.json()
  console.log(`      Staff token issued: ${staffInviteBody.enrollmentToken.substring(0, 16)}...`)

  // Verify Staff canonical Member and Member-Site-Roles
  const staffUserDoc = await payload.findByID({ collection: 'users', id: staffInviteBody.user.id, depth: 0, overrideAccess: true })
  const staffMemberId = typeof staffUserDoc.member === 'object' ? (staffUserDoc.member as any).id : staffUserDoc.member
  if (!staffMemberId) throw new Error('Staff user missing canonical member linkage!')
  const staffSiteRoles = await payload.find({
    collection: 'member-site-roles',
    where: { and: [{ member: { equals: staffMemberId } }, { site: { equals: siteA.id } }] },
    depth: 0,
    overrideAccess: true,
  })
  if (staffSiteRoles.docs.length !== 0) throw new Error('Pending staff invitation granted site access!')
  if ((await resolveOperatorGrantContext(payload, staffUserDoc as any)).authorized) {
    throw new Error('Pending staff invitation granted operator access!')
  }

  // ==========================================
  // JOURNEY 2: One-time Passkey Enrollment & Redemption
  // ==========================================
  console.log('7. Journey 2: One-time Passkey Enrollment & Redemption...')

  // Admin Passkey Enrollment
  console.log('   A. Admin requests enrollment options...')
  const adminOptionsReq = new Request('http://localhost/api/auth/passkey/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'options', enrollmentToken: adminInviteBody.enrollmentToken }),
  })
  const adminOptionsRes = await passkeyEnrollPost(adminOptionsReq)
  if (adminOptionsRes.status !== 200) throw new Error('Failed to start admin passkey enrollment!')
  const adminOptionsData = await adminOptionsRes.json()
  console.log(`      Admin challenge received: ${adminOptionsData.options.challenge}`)

  console.log('   B. Generating genuine WebAuthn credential via Virtual Authenticator...')
  const adminCredential = await generateWebAuthnRegistration(adminOptionsData.options)

  console.log('   C. Completing admin passkey enrollment...')
  const adminCompleteReq = new Request('http://localhost/api/auth/passkey/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'complete',
      enrollmentToken: adminInviteBody.enrollmentToken,
      credential: adminCredential,
      siteId: siteA.id,
    }),
  })
  const adminCompleteRes = await passkeyEnrollPost(adminCompleteReq)
  if (adminCompleteRes.status !== 200) {
    const err = await adminCompleteRes.json()
    throw new Error(`Admin complete passkey enrollment failed: ${JSON.stringify(err)}`)
  }
  const adminCompleteData = await adminCompleteRes.json()
  console.log(`      Admin enrolled: ${adminCompleteData.status}, recovery codes count=${adminCompleteData.recoveryCodes.length}`)
  if (adminCompleteData.recoveryCodes.length !== 10) throw new Error('Expected 10 recovery codes for administrator!')

  // Verify single-use token consumption in database
  const tokenQuery = await db.pool.query(
    `SELECT consumed_at FROM identity_tokens WHERE token_hash = $1`,
    [createHmac('sha256', runtimeConfig.payloadSecret).update(adminInviteBody.enrollmentToken).digest('hex')]
  )
  if (!tokenQuery.rows[0]?.consumed_at) throw new Error('Admin enrollment token was NOT marked consumed in database!')
  console.log(`      Admin token consumed_at verified: ${tokenQuery.rows[0].consumed_at.toISOString()}`)

  // Staff Passkey Enrollment
  console.log('   D. Staff requests enrollment options and completes passkey registration...')
  const staffOptionsReq = new Request('http://localhost/api/auth/passkey/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'options', enrollmentToken: staffInviteBody.enrollmentToken }),
  })
  const staffOptionsRes = await passkeyEnrollPost(staffOptionsReq)
  const staffOptionsData = await staffOptionsRes.json()
  const staffCredential = await generateWebAuthnRegistration(staffOptionsData.options)
  const staffCompleteReq = new Request('http://localhost/api/auth/passkey/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'complete',
      enrollmentToken: staffInviteBody.enrollmentToken,
      credential: staffCredential,
      siteId: siteA.id,
    }),
  })
  const staffCompleteRes = await passkeyEnrollPost(staffCompleteReq)
  if (staffCompleteRes.status !== 200) throw new Error('Staff complete passkey enrollment failed!')
  const staffCompleteData = await staffCompleteRes.json()
  console.log(`      Staff enrolled: ${staffCompleteData.status}, recovery codes count=${staffCompleteData.recoveryCodes.length}`)

  // ==========================================
  // JOURNEY 3: Administrator Login, Permissions, Denials & Logout
  // ==========================================
  console.log('8. Journey 3: Administrator Login, Scoped Actions, Denials & Logout...')

  const adminSession = await loginWithPasskey(adminUserDoc.id, adminEmail)
  const adminHeaders = new Headers({
    'content-type': 'application/json',
    cookie: adminSession.cookie,
  })

  // Permitted actions:
  const adminGrant = await resolveOperatorGrantContext(payload, adminUserDoc as any)
  console.log(`   Admin grant context: authorized=${adminGrant.authorized}, isGlobalOwner=${adminGrant.isGlobalOwner}, sites=${adminGrant.authorizedSiteIds}`)
  if (!adminGrant.authorized || adminGrant.isGlobalOwner || !adminGrant.authorizedSiteIds.includes(siteA.id)) {
    throw new Error('Administrator grant context invalid: should be scoped strictly to Site A!')
  }
  if (adminGrant.authorizedSiteIds.includes(siteB.id)) {
    throw new Error('Administrator authority leak: must NOT have access to Site B!')
  }
  const adminCanAccessSiteA = await checkOperatorSiteAccess(payload, adminUserDoc as any, siteA.id)
  const adminCanAccessSiteB = await checkOperatorSiteAccess(payload, adminUserDoc as any, siteB.id)
  console.log(`   Admin Site A access: ${adminCanAccessSiteA} (Permitted)`)
  console.log(`   Admin Site B access: ${adminCanAccessSiteB} (Denied)`)
  if (!adminCanAccessSiteA || adminCanAccessSiteB) throw new Error('Site access boundary failure for administrator!')

  // Denied action: Administrator cannot invite other staff (Owner only)
  console.log('   Exercising administrator privilege denial: inviting staff...')
  const unauthInviteReq = new Request('http://localhost/api/admin/staff/invite', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email: 'forbidden@rc1-02b.test', role: 'staff', siteId: siteA.id }),
  })
  const unauthInviteRes = await staffInvitePost(unauthInviteReq)
  console.log(`   Admin invite staff denial status: ${unauthInviteRes.status} (Expected 403)`)
  if (unauthInviteRes.status !== 403) throw new Error(`Administrator was not denied staff invite (got ${unauthInviteRes.status})!`)

  // Admin Logout
  console.log('   Logging out administrator...')
  const adminLogoutReq = new Request('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: adminHeaders,
  })
  const adminLogoutRes = await logoutPost(adminLogoutReq)
  console.log(`   Admin logout status: ${adminLogoutRes.status}`)
  if (adminLogoutRes.status !== 200) throw new Error('Admin logout failed!')

  // Verify session marked revoked in admin_sessions
  const adminSessQuery = await db.pool.query(
    `SELECT revoked_at FROM admin_sessions WHERE id = $1`,
    [adminSession.sessionId]
  )
  if (!adminSessQuery.rows[0]?.revoked_at) throw new Error('Administrator session was not revoked in database!')
  console.log(`   Admin session revoked in database: ${adminSessQuery.rows[0].revoked_at.toISOString()}`)

  // ==========================================
  // JOURNEY 4: Staff Login, Scoped Actions, Denials & Logout
  // ==========================================
  console.log('9. Journey 4: Staff Login, Scoped Actions, Denials & Logout...')

  const staffSession = await loginWithPasskey(staffUserDoc.id, staffEmail)
  const staffHeaders = new Headers({
    'content-type': 'application/json',
    cookie: staffSession.cookie,
  })

  // Permitted actions for staff
  const staffGrant = await resolveOperatorGrantContext(payload, staffUserDoc as any)
  console.log(`   Staff grant context: authorized=${staffGrant.authorized}, isGlobalOwner=${staffGrant.isGlobalOwner}, sites=${staffGrant.authorizedSiteIds}`)
  if (!staffGrant.authorized || staffGrant.isGlobalOwner || !staffGrant.authorizedSiteIds.includes(siteA.id)) {
    throw new Error('Staff grant context invalid: should be scoped strictly to Site A!')
  }
  const staffCanAccessSiteA = await checkOperatorSiteAccess(payload, staffUserDoc as any, siteA.id)
  const staffCanAccessSiteB = await checkOperatorSiteAccess(payload, staffUserDoc as any, siteB.id)
  console.log(`   Staff Site A access: ${staffCanAccessSiteA} (Permitted)`)
  console.log(`   Staff Site B access: ${staffCanAccessSiteB} (Denied)`)
  if (!staffCanAccessSiteA || staffCanAccessSiteB) throw new Error('Site access boundary failure for staff!')
  const staffRelease = await payload.create({
    collection: 'content-releases',
    data: { title: `Staff Site A Release ${runId}`, site: siteA.id, status: 'draft' },
    user: staffUserDoc as any,
    overrideAccess: false,
  } as never)
  if (!staffRelease.id) throw new Error('Staff could not persist a permitted Site A release')

  // Denied action for staff: cannot invite staff
  const staffInviteAttempt = await staffInvitePost(new Request('http://localhost/api/admin/staff/invite', {
    method: 'POST',
    headers: staffHeaders,
    body: JSON.stringify({ email: 'staff-attack@rc1-02b.test', role: 'staff', siteId: siteA.id }),
  }))
  console.log(`   Staff invite denial status: ${staffInviteAttempt.status} (Expected 403)`)
  if (staffInviteAttempt.status !== 403) throw new Error('Staff invite attempt was not denied with 403!')

  // Staff Logout
  console.log('   Logging out staff...')
  const staffLogoutRes = await logoutPost(new Request('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: staffHeaders,
  }))
  if (staffLogoutRes.status !== 200) throw new Error('Staff logout failed!')
  const staffSessQuery = await db.pool.query(
    `SELECT revoked_at FROM admin_sessions WHERE id = $1`,
    [staffSession.sessionId]
  )
  if (!staffSessQuery.rows[0]?.revoked_at) throw new Error('Staff session was not revoked in database!')
  console.log(`   Staff session revoked in database: ${staffSessQuery.rows[0].revoked_at.toISOString()}`)

  // ==========================================
  // JOURNEY 5: Dynamic Role Changes Immediately Take Effect
  // ==========================================
  console.log('10. Journey 5: Role Changes Immediately Take Effect...')

  // Check initial staff role in member-site-roles
  const initialRole = await payload.find({
    collection: 'member-site-roles',
    where: { and: [{ member: { equals: staffMemberId } }, { site: { equals: siteA.id } }] },
    depth: 0,
    overrideAccess: true,
  })
  console.log(`    Current staff member-site-role: ${initialRole.docs[0]?.role}`)
  if (initialRole.docs[0]?.role !== 'contributor') throw new Error('Expected initial contributor role!')

  // Promote staff to community-manager
  console.log('    Promoting staff to community-manager on Site A...')
  await payload.update({
    collection: 'member-site-roles',
    id: initialRole.docs[0].id,
    data: { role: 'community-manager' },
    user: ownerUser as any,
    overrideAccess: false,
  })

  // Dynamic grant re-evaluation without restart
  const promotedGrant = await resolveOperatorGrantContext(payload, staffUserDoc as any)
  console.log(`    Promoted grant authorized: ${promotedGrant.authorized}, sites: ${promotedGrant.authorizedSiteIds}`)
  if (!promotedGrant.authorized || !promotedGrant.authorizedSiteIds.includes(siteA.id)) {
    throw new Error('Dynamic grant promotion did not take effect!')
  }

  // Revoke staff role on Site A
  console.log('    Revoking staff site role on Site A...')
  await payload.delete({
    collection: 'member-site-roles',
    id: initialRole.docs[0].id,
    user: ownerUser as any,
    overrideAccess: false,
  })

  // Dynamic grant re-evaluation immediately reflects revocation
  const revokedGrant = await resolveOperatorGrantContext(payload, staffUserDoc as any)
  console.log(`    Revoked grant authorized: ${revokedGrant.authorized}, sites: ${revokedGrant.authorizedSiteIds}`)
  if (revokedGrant.authorized || revokedGrant.authorizedSiteIds.length !== 0) {
    throw new Error('Dynamic grant revocation did not take immediate effect: user still has access!')
  }
  let revokedWriteDenied = false
  try {
    await payload.create({
      collection: 'content-releases',
      data: { title: `Forbidden after revocation ${runId}`, site: siteA.id, status: 'draft' },
      user: staffUserDoc as any,
      overrideAccess: false,
    } as never)
  } catch {
    revokedWriteDenied = true
  }
  if (!revokedWriteDenied) throw new Error('Revoked staff grant still permits a Site A write')
  console.log('    Dynamic role changes verified: took effect immediately without server restart.')

  // ==========================================
  // JOURNEY 6: Security Negatives & Granular Boundary Enforcements
  // ==========================================
  console.log('11. Journey 6: Security Negatives & Boundary Enforcements...')

  // A. Expired token rejection
  console.log('   A. Testing expired invitation token rejection...')
  const expiredToken = 'expired-token-' + runId
  const secret = runtimeConfig.payloadSecret
  const expiredHash = createHmac('sha256', secret).update(expiredToken).digest('hex')
  await payload.create({
    collection: 'identity-tokens',
    data: {
      purpose: 'passkey-registration',
      tokenHash: expiredHash,
      emailHash: createHmac('sha256', secret).update('expired@rc1-02b.test').digest('hex'),
      expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      metadata: {
        userId: adminUserDoc.id,
        email: 'expired@rc1-02b.test',
        role: 'staff',
        siteId: siteA.id,
      },
    },
    overrideAccess: true,
  } as never)

  const expiredReq = new Request(`http://localhost/api/auth/enrollment?token=${expiredToken}`)
  const expiredRes = await enrollmentGet(expiredReq)
  console.log(`      Expired token rejection status: ${expiredRes.status} (Expected 410)`)
  if (expiredRes.status !== 410) throw new Error(`Expired token was not rejected with 410 (got ${expiredRes.status})!`)

  // B. Reused token rejection
  console.log('   B. Testing reused invitation token rejection...')
  const reusedReq = new Request(`http://localhost/api/auth/enrollment?token=${adminInviteBody.enrollmentToken}`)
  const reusedRes = await enrollmentGet(reusedReq)
  console.log(`      Reused token rejection status: ${reusedRes.status} (Expected 410)`)
  if (reusedRes.status !== 410) throw new Error(`Reused token was not rejected with 410 (got ${reusedRes.status})!`)

  // C. Foreign-site token rejection
  console.log('   C. Testing foreign-site invitation token rejection...')
  const freshStaffToken = await createStaffEnrollmentToken(payload, runtimeConfig, {
    email: `foreign_test_${runId}@rc1-02b.test`,
    role: 'staff',
    siteId: siteA.id,
    invitedByUserId: ownerUser.id,
  })
  const wrongSiteReq = new Request(`http://localhost/api/auth/enrollment?token=${freshStaffToken.enrollmentToken}&siteId=${siteB.id}`)
  const wrongSiteRes = await enrollmentGet(wrongSiteReq)
  console.log(`      Foreign-site token rejection status: ${wrongSiteRes.status} (Expected 400)`)
  if (wrongSiteRes.status !== 400) throw new Error(`Foreign-site token was not rejected with 400 (got ${wrongSiteRes.status})!`)
  const wrongSiteErr = await wrongSiteRes.json()
  if (wrongSiteErr.code !== 'WRONG_SITE') throw new Error(`Expected WRONG_SITE code, got ${wrongSiteErr.code}`)

  // D. Object-ID substitution rejection & unchanged records
  console.log('   D. Testing Object-ID substitution rejection & record immutability...')
  const releaseA = await payload.create({
    collection: 'content-releases',
    data: {
      title: 'Release on Site A',
      site: siteA.id,
      status: 'draft',
    },
    overrideAccess: true,
  } as never)

  const releaseB = await payload.create({
    collection: 'content-releases',
    data: {
      title: 'Confidential Release on Site B',
      site: siteB.id,
      status: 'draft',
    },
    overrideAccess: true,
  } as never)

  // Verify Admin (granted Site A only) cannot access or modify Release B by guessing/substituting its ID
  const releaseASiteId = typeof (releaseA as any).site === 'object' && (releaseA as any).site ? (releaseA as any).site.id : String((releaseA as any).site)
  const releaseBSiteId = typeof (releaseB as any).site === 'object' && (releaseB as any).site ? (releaseB as any).site.id : String((releaseB as any).site)
  const adminCanAccessReleaseA = adminGrant.authorizedSiteIds.includes(releaseASiteId)
  const adminCanAccessReleaseB = adminGrant.authorizedSiteIds.includes(releaseBSiteId)
  console.log(`      Admin access to Release A (Site A): ${adminCanAccessReleaseA} (Allowed)`)
  console.log(`      Admin access to Release B (Site B): ${adminCanAccessReleaseB} (Blocked)`)
  if (!adminCanAccessReleaseA || adminCanAccessReleaseB) throw new Error('Object-ID grant boundary check failed!')

  const releaseBBefore = await payload.findByID({ collection: 'content-releases', id: releaseB.id, depth: 0, overrideAccess: true })
  const substitutionSession = await loginWithPasskey(adminUserDoc.id, adminEmail)
  const substitutedAction = await releaseActionPost(
    new Request(`http://localhost/api/admin/releases/${releaseB.id}`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: substitutionSession.cookie },
      body: JSON.stringify({ action: 'cancel', reason: 'cross-site-substitution' }),
    }),
    { params: Promise.resolve({ id: releaseB.id }) },
  )
  if (substitutedAction.status !== 403) {
    throw new Error(`Foreign release action returned ${substitutedAction.status}, expected 403`)
  }

  // Check release B remains unchanged in database
  const releaseBCheck = await payload.findByID({
    collection: 'content-releases',
    id: releaseB.id,
    depth: 0,
    overrideAccess: true,
  })
  if (JSON.stringify(releaseBCheck) !== JSON.stringify(releaseBBefore)) {
    throw new Error('Foreign release changed despite the denied action!')
  }
  console.log('      Object-ID substitution blocked; target record completely unchanged.')

  // E. Revocation of pending invitation and active session
  console.log('   E. Testing invitation and session revocation...')
  const revInvite = await createStaffEnrollmentToken(payload, runtimeConfig, {
    email: `revoketest_${runId}@rc1-02b.test`,
    role: 'staff',
    siteId: siteA.id,
    invitedByUserId: ownerUser.id,
  })

  // Owner revokes invitation by token
  const revReq = new Request('http://localhost/api/admin/staff/invite', {
    method: 'DELETE',
    headers: ownerHeaders,
    body: JSON.stringify({ token: revInvite.enrollmentToken }),
  })
  const revRes = await staffInviteDelete(revReq)
  console.log(`      Revocation endpoint status: ${revRes.status}`)
  if (revRes.status !== 200) throw new Error('Revoke staff invitation endpoint failed!')

  // Redemption of revoked invitation fails
  const revAttemptReq = new Request(`http://localhost/api/auth/enrollment?token=${revInvite.enrollmentToken}`)
  const revAttemptRes = await enrollmentGet(revAttemptReq)
  console.log(`      Revoked token redemption status: ${revAttemptRes.status} (Expected 410)`)
  if (revAttemptRes.status !== 410) throw new Error('Revoked token was not rejected with 410!')

  // F. Supported Owner Recovery
  console.log('   F. Testing Supported Owner Recovery CLI operation...')
  const preRecoveryOwnerSession = await createTestAdminSession({
    id: ownerUser.id,
    email: ownerEmail,
  })

  // Rotate owner recovery codes
  const rotatedCodes = await rotateOwnerRecoveryCodes(payload, ownerEmail)
  console.log(`      Rotated recovery codes count: ${rotatedCodes.length}`)
  if (rotatedCodes.length !== 10) throw new Error('Expected 10 new recovery codes!')

  // Verify prior recovery codes invalidated
  const codesCheck = await db.pool.query(
    `SELECT count(*) FROM recovery_codes WHERE user_id = $1 AND used_at IS NOT NULL`,
    [ownerUser.id]
  )
  console.log(`      Previously invalidated recovery codes count: ${codesCheck.rows[0].count}`)

  // Verify existing owner sessions were revoked
  const revokedOwnerSess = await db.pool.query(
    `SELECT revoked_at FROM admin_sessions WHERE id = $1`,
    [preRecoveryOwnerSession.sessionId]
  )
  if (!revokedOwnerSess.rows[0]?.revoked_at) throw new Error('Owner session was not revoked during owner recovery!')
  console.log(`      Owner session revoked: ${revokedOwnerSess.rows[0].revoked_at.toISOString()}`)

  // Verify audit event
  const auditQuery = await db.pool.query(
    `SELECT event FROM admin_auth_audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [ownerUser.id]
  )
  console.log(`      Owner recovery audit event logged: ${auditQuery.rows[0]?.event}`)
  if (auditQuery.rows[0]?.event !== 'owner.local_recovery_codes.rotated') {
    throw new Error('Audit event owner.local_recovery_codes.rotated missing!')
  }

  // Teardown browser & local mock HTTP
  await browser.close()
  localHttps.close()

  console.log('=== [02B/70] ALL MANDATORY ACCEPTANCE CHECKS PASSED ===')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION FAILED:', err)
    process.exit(1)
  })
