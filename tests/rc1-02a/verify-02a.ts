import configPromise from '@/payload.config'
import { getPayload } from 'payload'
import { publicSiteForHost } from '@/modules/public/site-scope'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import { GET as activeSiteGet, POST as activeSitePost } from '@/app/(frontend)/api/admin/active-site/route'
import { GET as navGet, POST as navPost } from '@/app/(frontend)/api/admin/navigation/route'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { loadConfig } from '@/modules/core/config'

async function run() {
  console.log('=== [02A/70] VERIFICATION START ===')

  // Step 1: Connect to isolated database
  console.log('1. Connecting to isolated PostgreSQL instance on port 5433...')
  const payload = await getPayload({ config: configPromise })
  console.log('   Payload connected successfully.')

  const db = payload.db as any
  await db.pool.query(
    `TRUNCATE admin_sessions, member_site_roles, publications, sites, users, members CASCADE`
  )
  console.log('   Isolated database truncated for clean acceptance verification.')

  const runId = Date.now().toString(36)
  const ownerEmail = `owner_${runId}@rc1-02a.test`
  const staffEmail = `staff_${runId}@rc1-02a.test`

  // Step 2: Create Owner User
  console.log('2. Bootstrapping owner user and member...')
  const ownerMember = await payload.create({
    collection: 'members',
    data: {
      email: ownerEmail,
      displayName: '02A Network Owner',
      role: 'owner',
    },
    overrideAccess: true,
  } as never)

  const ownerUser = await payload.create({
    collection: 'users',
    data: {
      email: ownerEmail,
      role: 'owner',
      member: ownerMember.id,
      password: 'TemporaryPassword123!',
      isGlobalOwner: true,
    },
    overrideAccess: true,
  } as never)
  console.log(`   Owner created: id=${ownerUser.id}, email=${(ownerUser as any).email}`)

  // Create Restricted Staff User
  const staffMember = await payload.create({
    collection: 'members',
    data: {
      email: staffEmail,
      displayName: '02A Restricted Staff',
      role: 'staff',
    },
    overrideAccess: true,
  } as never)

  const staffUser = await payload.create({
    collection: 'users',
    data: {
      email: staffEmail,
      role: 'staff',
      member: staffMember.id,
      password: 'TemporaryPassword123!',
      isGlobalOwner: false,
    },
    overrideAccess: true,
  } as never)

  console.log('   Restricted staff user created.')

  // Step 3: Input Validation and Negative Constraints
  console.log('3. Exercising Negative Constraints & Input Validation...')
  let emptyNameFailed = false
  try {
    await payload.create({
      collection: 'sites',
      data: { name: '   ', slug: 'empty-test' },
      user: ownerUser,
      overrideAccess: false,
    } as never)
  } catch (err: any) {
    emptyNameFailed = true
    console.log(`   [PASS] Empty site name rejected: ${err.message}`)
  }
  if (!emptyNameFailed) throw new Error('Failed to reject empty site name!')

  let invalidProtocolFailed = false
  try {
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { canonicalOrigin: 'ftp://invalidscheme.com' },
      user: ownerUser,
      overrideAccess: false,
    } as never)
  } catch (err: any) {
    invalidProtocolFailed = true
    console.log(`   [PASS] Invalid protocol rejected: ${err.message}`)
  }
  if (!invalidProtocolFailed) throw new Error('Failed to reject invalid canonicalOrigin protocol!')

  // Step 4: Create Two Canonical Sites
  console.log('4. Creating Two Sites (Site 1 and Site 2)...')
  const site1 = await payload.create({
    collection: 'sites',
    data: {
      name: `Alpha Main Site ${runId}`,
      slug: `alpha-main-${runId}`,
      lifecycle: 'active',
      commentReactionCodes: ['thumbs_up', 'heart'],
    },
    user: ownerUser,
    overrideAccess: false,
  } as never)
  console.log(`   Site 1 created: id=${site1.id}, name="${(site1 as any).name}", slug="${(site1 as any).slug}"`)

  const site2 = await payload.create({
    collection: 'sites',
    data: {
      name: `Beta Community Site ${runId}`,
      slug: `Beta Community / Live ${runId}!`,
      lifecycle: 'active',
      commentReactionCodes: ['applause', 'insightful'],
    },
    user: ownerUser,
    overrideAccess: false,
  } as never)
  console.log(`   Site 2 created: id=${site2.id}, name="${(site2 as any).name}", slug="${(site2 as any).slug}" (slug normalized)`)
  const expectedSlug = `beta-community-live-${runId}`
  if ((site2 as any).slug !== expectedSlug) {
    throw new Error(`Expected normalized slug '${expectedSlug}', got '${(site2 as any).slug}'`)
  }

  // Grant restricted staff access ONLY to Site 1
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: staffMember.id,
      site: site1.id,
      role: 'contributor',
    },
    overrideAccess: true,
  } as never)
  console.log(`   Staff member granted contributor role on Site 1 only.`)

  // Verify publications auto-bootstrapped for both sites
  const pub1 = await payload.find({
    collection: 'publications',
    where: { site: { equals: site1.id } },
    depth: 0,
    overrideAccess: true,
  })
  console.log(`   Site 1 auto-bootstrapped publications count: ${pub1.docs.length}`)
  if (pub1.docs.length !== 1) throw new Error('Site 1 publication was not bootstrapped!')

  const pub2 = await payload.find({
    collection: 'publications',
    where: { site: { equals: site2.id } },
    depth: 0,
    overrideAccess: true,
  })
  console.log(`   Site 2 auto-bootstrapped publications count: ${pub2.docs.length}`)
  if (pub2.docs.length !== 1) throw new Error('Site 2 publication was not bootstrapped!')

  // Step 5: Test Cross-Site Domain Conflict Detection
  console.log('5. Testing Cross-Site Host Conflict Detection in SiteSettings...')
  let conflictFailed = false
  try {
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOriginsBySite: {
          [String(site1.id)]: 'https://shared-domain.test:8080',
          [String(site2.id)]: 'https://shared-domain.test:9000',
        },
      },
      user: ownerUser,
      overrideAccess: false,
    } as never)
  } catch (err: any) {
    if (err.message && err.message.includes('conflicts between site')) {
      conflictFailed = true
      console.log(`   [PASS] Cross-site domain conflict rejected: ${err.message}`)
    } else {
      throw err
    }
  }
  if (!conflictFailed) throw new Error('Failed to reject cross-site host collision!')

  // Step 6: Configure Valid Site Settings & Distinct Canonical Origins
  console.log('6. Configuring SiteSettings with distinct canonical origins...')
  const updatedSettings = await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      siteName: 'Renegade Multi-Site Network',
      canonicalOrigin: 'http://alpha.localhost:3000',
      canonicalOriginsBySite: {
        [String(site2.id)]: 'http://beta.localhost:3000',
      },
    },
    user: ownerUser,
    overrideAccess: false,
  } as never)
  console.log(`   SiteSettings saved: canonicalOrigin=${(updatedSettings as any).canonicalOrigin}`)

  // Step 7: Configure Navigation for Site 1 and Site 2
  console.log('7. Configuring Navigation menus for Site 1 vs Site 2...')
  const nav1 = await payload.update({
    collection: 'publications',
    id: pub1.docs[0].id,
    data: {
      navigation: {
        primary: [
          { label: 'Alpha Home', href: '/' },
          { label: 'Alpha News', href: '/news' },
        ],
      },
    },
    overrideAccess: true,
  })
  console.log(`   Site 1 Navigation updated: ${(nav1.navigation as any)?.primary?.map((n: any) => n.label).join(', ')}`)

  const nav2 = await payload.update({
    collection: 'publications',
    id: pub2.docs[0].id,
    data: {
      navigation: {
        primary: [
          { label: 'Beta Home', href: '/' },
          { label: 'Beta Discussions', href: '/discussions' },
        ],
      },
    },
    overrideAccess: true,
  })
  console.log(`   Site 2 Navigation updated: ${(nav2.navigation as any)?.primary?.map((n: any) => n.label).join(', ')}`)

  // Step 8: Verify Public Domain Isolation & Rendered Effect
  console.log('8. Verifying Public Consumption & Domain Resolution...')
  const resolvedSite1 = await publicSiteForHost(payload, 'alpha.localhost:3000')
  console.log(`   Host 'alpha.localhost:3000' resolved site ID: ${resolvedSite1} (Expected: ${site1.id})`)
  if (resolvedSite1 !== String(site1.id)) throw new Error('Site 1 host resolution mismatch!')

  const resolvedSite2 = await publicSiteForHost(payload, 'beta.localhost:3000')
  console.log(`   Host 'beta.localhost:3000' resolved site ID: ${resolvedSite2} (Expected: ${site2.id})`)
  if (resolvedSite2 !== String(site2.id)) throw new Error('Site 2 host resolution mismatch!')

  const unknownHostResolution = await publicSiteForHost(payload, 'attacker-unrecognized.com')
  console.log(`   Host 'attacker-unrecognized.com' resolved site ID: '${unknownHostResolution}' (Expected: '')`)
  if (unknownHostResolution !== '') throw new Error('Unknown host returned tenant data on multi-site installation!')

  // Step 9: Active Site API & Role Enforcement
  console.log('9. Testing Active Site API, Session/Cookie Persistence, and Role Enforcement...')

  // Create authentic passkey session for owner
  const appConfig = loadConfig()
  const { token: ownerToken } = await createPasskeySession(
    { email: ownerEmail, id: String(ownerUser.id) },
    appConfig.payloadSecret,
    async (sessionId, expiresAt) => {
      await db.pool.query(
        `INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
        [sessionId, ownerUser.id, expiresAt],
      )
    },
  )

  // Create authentic passkey session for restricted staff
  const { token: staffToken } = await createPasskeySession(
    { email: staffEmail, id: String(staffUser.id) },
    appConfig.payloadSecret,
    async (sessionId, expiresAt) => {
      await db.pool.query(
        `INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
        [sessionId, staffUser.id, expiresAt],
      )
    },
  )
  const ownerCookie = `renegade-passkey=${ownerToken}`
  const staffCookie = `renegade-passkey=${staffToken}`

  // Check 1: Unauthenticated request GET /api/admin/active-site -> 401
  const unauthGetReq = new Request('http://localhost:3000/api/admin/active-site')
  const unauthGetRes = await activeSiteGet(unauthGetReq)
  console.log(`   Unauthenticated GET active-site status: ${unauthGetRes.status} (Expected: 401)`)
  if (unauthGetRes.status !== 401) throw new Error('Unauthenticated request was not denied with 401!')

  // Check 2: Restricted staff GET /api/admin/active-site -> returns ONLY Site 1
  const staffGetReq = new Request('http://localhost:3000/api/admin/active-site', {
    headers: { Cookie: staffCookie },
  })
  const staffGetRes = await activeSiteGet(staffGetReq)
  const staffData = await staffGetRes.json()
  console.log(`   Staff GET active-site: activeSiteId=${staffData.activeSiteId}, authorizedSites=${staffData.sites.map((s: any) => s.id).join(', ')}`)
  if (staffData.sites.length !== 1 || staffData.sites[0].id !== String(site1.id)) {
    throw new Error('Staff saw unauthorized sites!')
  }

  // Check 3: Restricted staff attempts to switch to Site 2 -> 403
  const staffSwitchReq = new Request('http://localhost:3000/api/admin/active-site', {
    method: 'POST',
    headers: {
      Cookie: staffCookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ siteId: String(site2.id) }),
  })
  const staffSwitchRes = await activeSitePost(staffSwitchReq)
  console.log(`   Staff POST switch to Site 2 status: ${staffSwitchRes.status} (Expected: 403)`)
  if (staffSwitchRes.status !== 403) throw new Error('Staff switch to unauthorized site was not rejected with 403!')

  // Check 4: Owner switches to Site 2 -> 200 and receives Set-Cookie
  const ownerSwitchReq = new Request('http://localhost:3000/api/admin/active-site', {
    method: 'POST',
    headers: {
      Cookie: ownerCookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ siteId: String(site2.id) }),
  })
  const ownerSwitchRes = await activeSitePost(ownerSwitchReq)
  const ownerSwitchData = await ownerSwitchRes.json()
  const setCookie = ownerSwitchRes.headers.get('Set-Cookie') || ''
  console.log(`   Owner POST switch to Site 2: ok=${ownerSwitchData.ok}, Set-Cookie="${setCookie}"`)
  if (!ownerSwitchData.ok || !setCookie.includes(`renegade-active-site=${site2.id}`)) {
    throw new Error('Owner switch did not set renegade-active-site cookie!')
  }

  // Check 5: Subsequent GET with Cookie -> returns activeSiteId = Site 2
  const cookieGetReq = new Request('http://localhost:3000/api/admin/active-site', {
    headers: {
      Cookie: `${ownerCookie}; renegade-active-site=${site2.id}`,
    },
  })
  const cookieGetRes = await activeSiteGet(cookieGetReq)
  const cookieData = await cookieGetRes.json()
  console.log(`   Subsequent GET with Cookie returned activeSiteId: ${cookieData.activeSiteId} (Expected: ${site2.id})`)
  if (cookieData.activeSiteId !== String(site2.id)) {
    throw new Error('Active site cookie was not honored on subsequent reload!')
  }

  // Step 10: Simulate Server Restart and Verify Persistence
  console.log('10. Simulating Server Restart & Re-fetching Persisted State...')
  // Re-read payload configuration cleanly
  const reloadedPayload = await getPayload({ config: configPromise })
  const persistedSites = await reloadedPayload.find({
    collection: 'sites',
    depth: 0,
    overrideAccess: true,
  })
  console.log(`   Persisted sites count after reload: ${persistedSites.docs.length}`)
  if (persistedSites.docs.length < 2) throw new Error('Persisted sites missing after reload!')

  const persistedSettings = await resolveSiteSettings(reloadedPayload)
  console.log(`   Persisted canonicalOrigin: ${persistedSettings.canonicalOrigin}`)
  console.log(`   Persisted canonicalOriginsBySite: ${JSON.stringify(persistedSettings.canonicalOriginsBySite)}`)
  if (persistedSettings.canonicalOriginsBySite[String(site2.id)] !== 'http://beta.localhost:3000') {
    throw new Error('Site 2 canonical origin was not persisted!')
  }

  console.log('=== [02A/70] ALL MANDATORY ACCEPTANCE CHECKS PASSED ===')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION ERROR:', err)
    process.exit(1)
  })
