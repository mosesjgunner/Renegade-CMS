/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic operator acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'

assert.equal(process.env.RC1_08B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5448/rc108b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/08B'
const base = 'http://localhost:38996'
const trace: any[] = []
let checks = 0
let succeeded = false

const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(60000)

const restart = process.argv.includes('--restart')

const api = async (
  route: string,
  method = 'GET',
  data?: any,
  cookie = '',
  status: number | number[] = 200,
  headers: Record<string, string> = {},
) => {
  const raw = await new Promise<{ status: number; headers: Headers; text: string }>(
    (resolve, reject) => {
      const request = http.request(
        `${base}${route}`,
        {
          method,
          headers: {
            origin: base,
            ...(cookie ? { cookie } : {}),
            ...(data ? { 'content-type': 'application/json' } : {}),
            ...headers,
          },
        },
        (response) => {
          let text = ''
          response.setEncoding('utf8')
          response.on('data', (chunk) => {
            text += chunk
          })
          response.on('end', () =>
            resolve({
              status: response.statusCode!,
              headers: new Headers(
                Object.entries(response.headers).flatMap(([key, value]) =>
                  value === undefined ? [] : [[key, String(value)] as [string, string]],
                ),
              ),
              text,
            }),
          )
          response.on('error', reject)
        },
      )
      request.setTimeout(60000, () => request.destroy(new Error('request timed out')))
      request.on('error', reject)
      request.end(data ? JSON.stringify(data) : undefined)
    },
  )
  const response = { status: raw.status, headers: raw.headers }
  const text = raw.text
  trace.push({
    route,
    method,
    status: response.status,
    bytes: text.length,
  })
  assert.ok(
    (Array.isArray(status) ? status : [status]).includes(response.status),
    `${method} ${route}: ${text.slice(0, 600)}`,
  )
  return { response, text, json: () => JSON.parse(text) }
}

const session = async (user: any) => {
  const result = await createPasskeySession(
    user,
    loadConfig().payloadSecret,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  return `renegade-passkey=${result.token}`
}

try {
  await mkdir(out, { recursive: true })

  if (restart) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const ownerUser = await payload.findByID({ collection: 'users', id: state.ownerId, depth: 0 })
    const ownCookie = `${await session(ownerUser)}; renegade-active-site=${state.siteId}`

    // 1. Verify Draft 1 persisted in scheduled status
    const persistedDraft1 = await payload.findByID({
      collection: 'social-drafts',
      id: state.draft1Id,
      depth: 0,
      overrideAccess: true,
    })
    check('restart: Draft 1 persisted across restart', Boolean(persistedDraft1))
    check('restart: Draft 1 status remains scheduled', persistedDraft1.status === 'scheduled')
    check('restart: Draft 1 canonicalUrl preserved', persistedDraft1.canonicalUrl === 'https://renegadeparty.org/releases/v1')

    // 2. Verify variants for Draft 1 persisted with approvalHash
    const persistedVariants = await payload.find({
      collection: 'social-network-variants',
      where: { draft: { equals: state.draft1Id } },
      depth: 0,
      overrideAccess: true,
    })
    check('restart: 2 variants for Draft 1 preserved', persistedVariants.docs.length === 2)
    for (const v of persistedVariants.docs) {
      check(`restart: variant ${v.network} status remains scheduled`, v.status === 'scheduled')
      check(`restart: variant ${v.network} approvalHash preserved`, Boolean(v.approvalHash && v.approvalHash.startsWith('sha256:')))
    }

    // 3. Verify queue items for Draft 1 persisted
    const persistedQueue = await payload.find({
      collection: 'social-queue-items',
      where: { id: { in: state.queueItemIds } },
      depth: 0,
      overrideAccess: true,
    })
    check('restart: social-queue-items persisted across restart', persistedQueue.docs.length === 2)
    for (const q of persistedQueue.docs) {
      check(`restart: queue item ${q.id} status remains scheduled`, q.status === 'scheduled')
      check(`restart: queue item ${q.id} scheduledFor intact`, Boolean(q.scheduledFor))
    }

    // 4. Verify Draft 2 persisted in cancelled status with zero queue items
    const persistedDraft2 = await payload.findByID({
      collection: 'social-drafts',
      id: state.draft2Id,
      depth: 0,
      overrideAccess: true,
    })
    check('restart: Draft 2 persisted in cancelled status', persistedDraft2.status === 'cancelled')

    const draft2Variants = await payload.find({
      collection: 'social-network-variants',
      where: { draft: { equals: state.draft2Id } },
      depth: 0,
      overrideAccess: true,
    })
    const draft2VariantIds = draft2Variants.docs.map((v: any) => v.id)
    const draft2Queue = await payload.find({
      collection: 'social-queue-items',
      where: { variant: { in: draft2VariantIds } },
      depth: 0,
      overrideAccess: true,
    })
    check('restart: Draft 2 has 0 queue items (unsent policy preserved)', draft2Queue.docs.length === 0)

    // 5. Query admin API after restart to verify refetch
    const apiRes = await api(`/api/admin/social/drafts?draftId=${state.draft1Id}`, 'GET', undefined, ownCookie, 200)
    const apiData = apiRes.json()
    check('restart: GET /api/admin/social/drafts?draftId returns draft, variants, and queueItems',
      apiData.draft.id === state.draft1Id && apiData.variants.length === 2 && apiData.queueItems.length === 2,
    )

    await writeFile(
      `${out}/persistence-final.json`,
      JSON.stringify({
        draft1: persistedDraft1,
        variants1: persistedVariants.docs,
        queueItems1: persistedQueue.docs,
        draft2: persistedDraft2,
      }, null, 2),
    )
    succeeded = true
  } else {
    // FRESH RUN:
    // 1. Create Sites & Users
    const site = await payload.create({
      collection: 'sites',
      data: { name: '08B Composer Alpha Site', slug: `composer-alpha-${Date.now()}`, lifecycle: 'active' },
    })
    const foreignSite = await payload.create({
      collection: 'sites',
      data: { name: '08B Foreign Site', slug: `foreign-${Date.now()}`, lifecycle: 'active' },
    })

    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${Date.now()}@rc108b.test`, role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${Date.now()}@rc108b.test`, role: 'staff' },
    })
    const foreignStaff = await payload.create({
      collection: 'users',
      data: { email: `foreign-${Date.now()}@rc108b.test`, role: 'staff' },
    })

    // Assign grants
    await payload.create({
      collection: 'member-site-roles',
      data: { member: staff.member, site: site.id, role: 'community-manager' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: { member: foreignStaff.member, site: foreignSite.id, role: 'community-manager' },
    })

    const ownerCookie = `${await session(owner)}; renegade-active-site=${site.id}`
    const staffCookie = `${await session(staff)}; renegade-active-site=${site.id}`
    const unauthorizedCookie = `renegade-passkey=bogus-unauthorized-session-token; renegade-active-site=${site.id}`
    const foreignCookie = `${await session(foreignStaff)}; renegade-active-site=${foreignSite.id}`

    // 2. Setup 2 Social Accounts for Site Alpha
    const bskyAccount = await payload.create({
      collection: 'social-accounts',
      data: {
        site: site.id,
        network: 'bluesky',
        displayName: '@renegade.bsky.social',
        actorType: 'site',
        externalAccountId: 'did:plc:renegade-test-123',
        capabilityState: 'available',
        capabilities: { textLimit: 300, postTypes: ['text', 'media'] },
        credentialHealth: 'healthy',
        diagnostics: { mode: 'local-harness' },
      },
    })
    check('created Bluesky social account', Boolean(bskyAccount.id))

    const mastoAccount = await payload.create({
      collection: 'social-accounts',
      data: {
        site: site.id,
        network: 'activitypub',
        displayName: '@renegade@mastodon.social',
        actorType: 'site',
        externalAccountId: 'renegade-masto-id-456',
        capabilityState: 'available',
        capabilities: { textLimit: 500, postTypes: ['text', 'media'] },
        credentialHealth: 'healthy',
        diagnostics: { mode: 'local-harness' },
      },
    })
    check('created ActivityPub/Mastodon social account', Boolean(mastoAccount.id))

    // 3. Negative Access Tests: Unauthorized roles & foreign sites
    await api('/api/admin/social/drafts', 'GET', undefined, '', 403)
    check('unauthenticated GET /api/admin/social/drafts rejected (403)', true)

    await api('/api/admin/social/drafts', 'GET', undefined, unauthorizedCookie, 403)
    check('unauthorized session GET /api/admin/social/drafts rejected (403)', true)

    await api(`/api/admin/social/drafts?siteId=${site.id}`, 'GET', undefined, foreignCookie, 403)
    check('foreign staff GET /api/admin/social/drafts on Site Alpha rejected (403)', true)

    // 4. Negative Validation Test: Platform limits enforcement on draft creation
    const overLimitRes = await api(
      '/api/admin/social/drafts',
      'POST',
      {
        action: 'create-draft',
        siteId: site.id,
        title: 'Draft with Over-Limit Bluesky Copy',
        variants: [
          {
            accountId: bskyAccount.id,
            network: 'bluesky',
            text: 'B'.repeat(350), // exceeds 300 limit
          },
        ],
      },
      staffCookie,
      400,
    )
    const overLimitJson = overLimitRes.json()
    check('negative validation: text > 300 on Bluesky rejected with 400',
      overLimitJson.error.includes('BLUESKY:') && overLimitJson.error.includes('300'),
    )

    // 5. Browser UI Journey: Create Draft 1 with per-network variants, submit review, approve, schedule
    console.log('Navigating Playwright browser to /admin/social...')
    await page.context().addCookies([
      { name: 'renegade-passkey', value: (await session(owner)).split('=')[1], domain: 'localhost', path: '/' },
      { name: 'renegade-active-site', value: String(site.id), domain: 'localhost', path: '/' },
    ])

    await page.goto(`${base}/admin/social`)
    await page.waitForLoadState('networkidle')

    // Verify UI components rendered
    await page.waitForSelector('[data-testid="draft-workflow-panel"]')
    check('browser: draft-workflow-panel loaded in DOM', true)

    // Check connected accounts rendered
    await page.waitForSelector('[data-testid="account-card-bluesky"]')
    await page.waitForSelector('[data-testid="account-card-activitypub"]')
    check('browser: connected Bluesky & ActivityPub account cards visible', true)

    // Fill Draft Title
    await page.fill('[data-testid="draft-title-input"]', 'Release 1.0 General Announcement')
    await page.fill('[data-testid="canonical-url-input"]', 'https://renegadeparty.org/releases/v1')
    await page.fill(
      '[data-testid="canonical-copy-textarea"]',
      'Renegade CMS 1.0 is officially released! High-performance decentralized publishing with sovereign ownership.',
    )

    // Tailor Bluesky Variant
    await page.click('[data-testid="network-tab-bluesky"]')
    await page.check('[data-testid="variant-override-checkbox"]')
    await page.fill(
      '[data-testid="variant-copy-textarea"]',
      'Renegade CMS 1.0 is here! Decentralized, sovereign publishing for modern movements. #RenegadeCMS @renegade.bsky.social',
    )

    // Tailor ActivityPub / Mastodon Variant
    await page.click('[data-testid="network-tab-activitypub"]')
    await page.check('[data-testid="variant-override-checkbox"]')
    await page.fill(
      '[data-testid="variant-copy-textarea"]',
      'Announcing Renegade CMS 1.0! A sovereign decentralized publishing platform with native ActivityPub federation and multi-tenant editorial governance. Read full release notes at https://renegadeparty.org/releases/v1 #RenegadeCMS #ActivityPub',
    )
    await page.fill('[data-testid="mastodon-cw-input"]', 'Software Release 1.0')

    // Verify Pre-flight validation gate passes
    await page.waitForSelector('[data-testid="validation-gate-passed"]')
    check('browser: pre-flight validation gates passed', true)

    // Save Draft 1
    await page.click('[data-testid="save-draft-btn"]')
    await page.waitForSelector('[data-testid="workflow-message"]')
    const saveMsg = await page.textContent('[data-testid="workflow-message"]')
    check('browser: draft saved successfully via UI', saveMsg?.includes('Draft successfully saved'))

    const currentDraftIdText = await page.textContent('[data-testid="current-draft-id"]')
    const draft1Id = currentDraftIdText?.replace('ID: ', '').trim()
    assert.ok(draft1Id, 'draft1Id extracted from UI')
    check(`browser: draft 1 ID resolved: ${draft1Id}`, true)

    // Inspect database persistence of Draft 1 and Variants
    const dbDraft1 = await payload.findByID({
      collection: 'social-drafts',
      id: draft1Id,
      depth: 0,
      overrideAccess: true,
    })
    check('db: draft 1 persisted with status=draft', dbDraft1.status === 'draft')
    check('db: draft 1 canonicalUrl matches', dbDraft1.canonicalUrl === 'https://renegadeparty.org/releases/v1')

    const dbVariants1 = await payload.find({
      collection: 'social-network-variants',
      where: { draft: { equals: draft1Id } },
      depth: 0,
      overrideAccess: true,
    })
    check('db: 2 variants created for draft 1', dbVariants1.docs.length === 2)
    const bskyVar = dbVariants1.docs.find((v: any) => v.network === 'bluesky')
    const mastoVar = dbVariants1.docs.find((v: any) => v.network === 'activitypub')
    check('db: Bluesky tailored copy persisted', bskyVar.text.includes('#RenegadeCMS @renegade.bsky.social'))
    check('db: Mastodon tailored copy persisted', mastoVar.text.includes('#ActivityPub'))

    // 6. Submit Draft 1 for Review via UI
    await page.click('[data-testid="submit-review-btn"]')
    await page.waitForSelector('[data-testid="draft-status-badge"]:has-text("review")')
    check('browser: draft 1 status badge updated to REVIEW', true)

    const dbDraft1Review = await payload.findByID({
      collection: 'social-drafts',
      id: draft1Id,
      depth: 0,
      overrideAccess: true,
    })
    check('db: draft 1 status updated to review', dbDraft1Review.status === 'review')

    // 7. Negative Authorization Test: Unauthorized role cannot approve
    const staffApproveAttempt = await api(
      '/api/admin/social/drafts',
      'POST',
      { action: 'approve', draftId: draft1Id },
      staffCookie,
      403,
    )
    check('forbidden: staff role cannot approve social drafts (403)', staffApproveAttempt.response.status === 403)

    // 8. Approve Draft 1 as Owner via UI
    await page.click('[data-testid="approve-draft-btn"]')
    await page.waitForSelector('[data-testid="draft-status-badge"]:has-text("approved")')
    check('browser: draft 1 status badge updated to APPROVED', true)

    const dbDraft1Approved = await payload.findByID({
      collection: 'social-drafts',
      id: draft1Id,
      depth: 0,
      overrideAccess: true,
    })
    check('db: draft 1 status is approved', dbDraft1Approved.status === 'approved')

    const dbApprovedVariants = await payload.find({
      collection: 'social-network-variants',
      where: { draft: { equals: draft1Id } },
      depth: 0,
      overrideAccess: true,
    })
    for (const v of dbApprovedVariants.docs) {
      check(`db: variant ${v.network} has valid approvalHash`, Boolean(v.approvalHash && v.approvalHash.startsWith('sha256:')))
      check(`db: variant ${v.network} approvedBy set`, Boolean(v.approvedBy))
    }

    // 9. Negative Scheduling Test: Unauthorized role cannot schedule
    const staffScheduleAttempt = await api(
      '/api/admin/social/drafts',
      'POST',
      { action: 'schedule', draftId: draft1Id },
      staffCookie,
      403,
    )
    check('forbidden: staff role cannot schedule release distribution (403)', staffScheduleAttempt.response.status === 403)

    // 10. Schedule Draft 1 via UI
    await page.waitForSelector('[data-testid="schedule-draft-btn"]')
    await page.click('[data-testid="schedule-draft-btn"]')
    await page.waitForSelector('[data-testid="draft-status-badge"]:has-text("scheduled")')
    check('browser: draft 1 status badge updated to SCHEDULED', true)

    // Inspect persisted queue items in DOM and DB
    await page.waitForSelector('[data-testid="persisted-queue-count"]')
    const queueCountText = await page.textContent('[data-testid="persisted-queue-count"]')
    check(`browser: persisted queue items count in UI: ${queueCountText}`, queueCountText === '2')

    const dbQueue = await payload.find({
      collection: 'social-queue-items',
      where: { variant: { in: dbApprovedVariants.docs.map((v: any) => v.id) } },
      depth: 0,
      overrideAccess: true,
    })
    check('db: exactly 2 social-queue-items created for draft 1', dbQueue.docs.length === 2)
    for (const q of dbQueue.docs) {
      check(`db: queue item ${q.id} status is scheduled`, q.status === 'scheduled')
      check(`db: queue item ${q.id} has deterministic idempotencyKey`, q.idempotencyKey.includes(draft1Id))
    }

    // Take screenshot of scheduled state in UI
    await page.screenshot({ path: `${out}/composer-scheduled.png` })
    check('browser: screenshot saved to composer-scheduled.png', true)

    // 11. Mandatory Journey 2: Create Draft 2, Submit Review, Decline & Verify Unsent
    const draft2Res = await api(
      '/api/admin/social/drafts',
      'POST',
      {
        action: 'create-draft',
        siteId: site.id,
        title: 'Draft 2 - Speculative Pitch',
        canonicalUrl: 'https://renegadeparty.org/speculative',
        variants: [
          { accountId: bskyAccount.id, network: 'bluesky', text: 'Speculative draft for Bluesky' },
          { accountId: mastoAccount.id, network: 'activitypub', text: 'Speculative draft for Mastodon' },
        ],
      },
      staffCookie,
      201,
    )
    const draft2Data = draft2Res.json()
    const draft2Id = draft2Data.draft.id
    check(`created Draft 2: ${draft2Id}`, Boolean(draft2Id))

    // Submit Draft 2 for review
    await api('/api/admin/social/drafts', 'POST', { action: 'submit-review', draftId: draft2Id }, staffCookie, 200)

    // Owner declines Draft 2
    const declineRes = await api(
      '/api/admin/social/drafts',
      'POST',
      { action: 'decline', draftId: draft2Id, reason: 'Declined during editorial review' },
      ownerCookie,
      200,
    )
    check('draft 2 declined successfully', declineRes.json().status === 'cancelled')

    const dbDraft2 = await payload.findByID({
      collection: 'social-drafts',
      id: draft2Id,
      depth: 0,
      overrideAccess: true,
    })
    check('db: draft 2 status is cancelled', dbDraft2.status === 'cancelled')

    const dbDraft2Variants = await payload.find({
      collection: 'social-network-variants',
      where: { draft: { equals: draft2Id } },
      depth: 0,
      overrideAccess: true,
    })
    for (const v of dbDraft2Variants.docs) {
      check(`db: draft 2 variant ${v.network} status is cancelled`, v.status === 'cancelled')
    }

    // Verify 0 queue items for Draft 2 (unsent policy)
    const dbDraft2Queue = await payload.find({
      collection: 'social-queue-items',
      where: { variant: { in: dbDraft2Variants.docs.map((v: any) => v.id) } },
      depth: 0,
      overrideAccess: true,
    })
    check('db: declined draft 2 has 0 queue items (remains unsent)', dbDraft2Queue.docs.length === 0)

    // Attempting to schedule cancelled draft is rejected
    await api('/api/admin/social/drafts', 'POST', { action: 'schedule', draftId: draft2Id }, ownerCookie, 400)
    check('scheduling cancelled draft rejected with 400', true)

    // 12. Save State for Restart Verification
    const stateData = {
      siteId: site.id,
      ownerId: owner.id,
      draft1Id,
      draft2Id,
      queueItemIds: dbQueue.docs.map((q: any) => q.id),
      checks,
    }
    await writeFile(`${out}/state.json`, JSON.stringify(stateData, null, 2))
    check('state.json saved for container restart test', true)

    await writeFile(`${out}/trace-verify.json`, JSON.stringify(trace, null, 2))
    succeeded = true
  }
} finally {
  await browser.close()
  if (!succeeded) {
    console.error(`Acceptance failed after ${checks} checks.`)
  } else {
    console.log(`ACCEPTANCE SUCCESS: ${checks} checks passed.`)
  }
}
