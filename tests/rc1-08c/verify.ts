/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic operator acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { encryptSecret } from '../../src/modules/social/security'

assert.equal(process.env.RC1_08C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5449/rc108c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')

const sha256Hex = (text: string) => createHash('sha256').update(text).digest('hex')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/08C'
const base = 'http://localhost:38997'
const trace: any[] = []
let checks = 0
let succeeded = false

const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}

const restart = process.argv.includes('--restart')

// =========================================================================
// LOCAL PROVIDER TEST HARNESS ON 127.0.0.1:3131
// Simulates AT Protocol XRPC & Mastodon REST APIs deterministically
// =========================================================================
const harnessPublishedRecords = new Map<string, { uri: string; cid: string; text: string }>()
let createRecordCallCount = 0
let mastoPostCallCount = 0

const harnessServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1:3131'}`)
  let body = ''
  req.on('data', (c) => {
    body += c
  })
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')

    // 1. AT Protocol Session Creation
    if (url.pathname === '/xrpc/com.atproto.server.createSession') {
      const parsed = body ? JSON.parse(body) : {}
      if (parsed.identifier === 'revoked.bsky.test') {
        res.statusCode = 401
        res.end(
          JSON.stringify({
            error: 'AuthenticationRequired',
            message: 'App password was revoked or expired',
          }),
        )
        return
      }
      if (parsed.identifier === 'ratelimit.bsky.test') {
        res.statusCode = 429
        res.setHeader('RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 60))
        res.end(JSON.stringify({ error: 'RateLimitExceeded', message: 'Too many requests' }))
        return
      }
      res.statusCode = 200
      res.end(
        JSON.stringify({
          did: 'did:plc:localoperator1',
          handle: 'operator.bsky.test',
          accessJwt: 'local-harness-access-jwt',
          refreshJwt: 'local-harness-refresh-jwt',
        }),
      )
      return
    }

    // 2. AT Protocol Pre-flight GetRecord Check
    if (url.pathname === '/xrpc/com.atproto.repo.getRecord') {
      const rkey = url.searchParams.get('rkey') || ''
      const existing = harnessPublishedRecords.get(rkey)
      if (existing) {
        res.statusCode = 200
        res.end(
          JSON.stringify({
            uri: existing.uri,
            cid: existing.cid,
            value: { text: existing.text, createdAt: new Date().toISOString() },
          }),
        )
        return
      }
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'RecordNotFound', message: 'Could not locate record' }))
      return
    }

    // 3. AT Protocol Create Record
    if (url.pathname === '/xrpc/com.atproto.repo.createRecord') {
      createRecordCallCount++
      const parsed = body ? JSON.parse(body) : {}
      const rkey = parsed.rkey || sha256Hex(parsed.record?.text || 'default').slice(0, 32)
      const record = {
        uri: `at://did:plc:localoperator1/app.bsky.feed.post/${rkey}`,
        cid: `bafyrei-${rkey.slice(0, 16)}`,
        text: parsed.record?.text || '',
      }
      harnessPublishedRecords.set(rkey, record)
      res.statusCode = 200
      res.end(JSON.stringify({ uri: record.uri, cid: record.cid }))
      return
    }

    // 4. Mastodon / ActivityPub Status Post
    if (url.pathname === '/api/v1/statuses') {
      mastoPostCallCount++
      const authHeader = req.headers.authorization || ''
      if (authHeader.includes('fail-token-activitypub')) {
        res.statusCode = 500
        res.end(
          JSON.stringify({
            error: 'Federation host unreachable / delivery dropped (simulated failure)',
          }),
        )
        return
      }
      res.statusCode = 200
      res.end(
        JSON.stringify({
          id: `masto-post-${Date.now()}`,
          url: `http://127.0.0.1:3131/@operator/${Date.now()}`,
          created_at: new Date().toISOString(),
        }),
      )
      return
    }

    res.statusCode = 404
    res.end(JSON.stringify({ error: 'NotFound', path: url.pathname }))
  })
})

await new Promise<void>((resolve) => harnessServer.listen(3131, '127.0.0.1', resolve))
console.log('Local Provider Test Harness listening on http://127.0.0.1:3131')

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
    async (id: string, expires: Date) => {
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

    // 1. Verify Draft 1 persisted in partially-published status
    const persistedDraft1 = await payload.findByID({
      collection: 'social-drafts',
      id: state.draft1Id,
      depth: 0,
      overrideAccess: true,
    })
    check('restart: Draft 1 persisted across restart', Boolean(persistedDraft1))
    check(
      'restart: Draft 1 status remains partially-published',
      persistedDraft1.status === 'partially-published',
    )

    // 2. Verify Bluesky item remains published with external post receipt
    const blueskyItem = await payload.findByID({
      collection: 'social-queue-items',
      id: state.draft1BlueskyItemId,
      depth: 0,
      overrideAccess: true,
    })
    check('restart: Bluesky queue item remains published', blueskyItem.status === 'published')

    const extPost = await payload.find({
      collection: 'external-posts',
      where: { variant: { equals: state.draft1BlueskyVariantId } },
      depth: 0,
      overrideAccess: true,
    })
    check('restart: External post receipt persisted', extPost.docs.length === 1)
    check(
      'restart: External post remoteId persisted',
      Boolean(extPost.docs[0].remoteId),
    )

    const restartAttempt = await payload.find({
      collection: 'social-publish-attempts',
      where: { queueItem: { equals: state.draft1BlueskyItemId } },
      depth: 0,
      overrideAccess: true,
    })
    check(
      'restart: Publish attempt receipt records local-harness',
      restartAttempt.docs[0]?.response?.receipt?.rawResponse?.providerMode === 'local-harness' ||
        restartAttempt.docs[0]?.response?.providerMode === 'local-harness',
    )

    // 3. Verify ActivityPub item remains failed with attempts count intact
    const actPubItem = await payload.findByID({
      collection: 'social-queue-items',
      id: state.draft1ActivityPubItemId,
      depth: 0,
      overrideAccess: true,
    })
    check('restart: ActivityPub queue item remains failed', actPubItem.status === 'failed')
    check(
      'restart: ActivityPub attempt count preserved at 3 (bounded max)',
      actPubItem.attemptCount === 3,
    )

    // 4. Verify Draft 2 (reconciled lost response) remains published
    const draft2Item = await payload.findByID({
      collection: 'social-queue-items',
      id: state.draft2ItemId,
      depth: 0,
      overrideAccess: true,
    })
    check(
      'restart: Draft 2 reconciled item remains published',
      draft2Item.status === 'published',
    )

    // 5. Verify Draft 3 (safe disconnect) remains failed with reconnect-required
    const draft3Item = await payload.findByID({
      collection: 'social-queue-items',
      id: state.draft3ItemId,
      depth: 0,
      overrideAccess: true,
    })
    check(
      'restart: Draft 3 safe disconnect item remains failed',
      draft3Item.status === 'failed',
    )
    check(
      'restart: Draft 3 dead letter reason remains reconnect-required',
      draft3Item.deadLetterReason === 'reconnect-required' ||
        draft3Item.deadLetterReason?.kind === 'reconnect-required',
    )

    console.log(`\nALL ${checks} RESTART PERSISTENCE CHECKS PASSED SUCCESSFULLY.`)
    succeeded = true
    process.exit(0)
  }

  // =========================================================================
  // NORMAL ACCEPTANCE RUN
  // =========================================================================

  // 1. Seed Sites
  const runId = Date.now()
  const siteAlpha = await payload.create({
    collection: 'sites',
    data: { name: 'Renegade Alpha', slug: `alpha-${runId}`, domain: `alpha-${runId}.renegade.test`, lifecycle: 'active' },
  })
  const siteBeta = await payload.create({
    collection: 'sites',
    data: { name: 'Renegade Beta', slug: `beta-${runId}`, domain: `beta-${runId}.renegade.test`, lifecycle: 'active' },
  })
  check('site Alpha created', Boolean(siteAlpha.id))
  check('site Beta created', Boolean(siteBeta.id))

  // 2. Seed Users
  const ownerUser = await payload.create({
    collection: 'users',
    data: {
      email: `owner-${Date.now()}@rc108c.test`,
      role: 'owner',
    },
  })
  const staffUser = await payload.create({
    collection: 'users',
    data: {
      email: `staff-${Date.now()}@rc108c.test`,
      role: 'staff',
    },
  })
  const foreignStaffUser = await payload.create({
    collection: 'users',
    data: {
      email: `foreign-${Date.now()}@rc108c.test`,
      role: 'staff',
    },
  })

  // Assign operator grants
  await payload.create({
    collection: 'member-site-roles',
    data: { member: staffUser.member, site: siteAlpha.id, role: 'community-manager' },
  })
  await payload.create({
    collection: 'member-site-roles',
    data: { member: foreignStaffUser.member, site: siteBeta.id, role: 'community-manager' },
  })
  check('users and operator grants seeded', Boolean(ownerUser.id && staffUser.id && foreignStaffUser.id))

  const ownCookie = `${await session(ownerUser)}; renegade-active-site=${siteAlpha.id}`
  const staffCookie = `${await session(staffUser)}; renegade-active-site=${siteAlpha.id}`
  const foreignCookie = `${await session(foreignStaffUser)}; renegade-active-site=${siteBeta.id}`
  const invalidSessionCookie = `renegade-passkey=bogus-invalid-token; renegade-active-site=${siteAlpha.id}`

  // 3. Seed Connected Social Accounts
  // Account 1: Bluesky (succeeds via local harness)
  const bskyAccount = await payload.create({
    collection: 'social-accounts',
    data: {
      site: siteAlpha.id,
      network: 'bluesky',
      displayName: 'Renegade Operator Bluesky',
      actorType: 'site',
      externalAccountId: 'did:plc:localoperator1',
      accountHandle: '@operator.bsky.test',
      status: 'active',
      capabilityState: 'available',
      capabilities: { textLimit: 300, postTypes: ['text', 'media'] },
      credentialHealth: 'healthy',
      connectionReference: `enc:${encryptSecret(
        JSON.stringify({
          identifier: 'operator.bsky.test',
          appPassword: 'valid-app-password-123',
          service: 'http://127.0.0.1:3131',
        }),
      )}`,
      diagnostics: { mode: 'local-harness' },
    },
  })

  // Account 2: ActivityPub / Mastodon (deliberately configured to fail on harness)
  const actPubAccount = await payload.create({
    collection: 'social-accounts',
    data: {
      site: siteAlpha.id,
      network: 'activitypub',
      displayName: 'Renegade Federation Node',
      actorType: 'site',
      externalAccountId: 'actpub-node-fail-1',
      accountHandle: '@operator@local.social',
      status: 'active',
      capabilityState: 'available',
      capabilities: { textLimit: 500, postTypes: ['text', 'media'] },
      credentialHealth: 'healthy',
      connectionReference: `enc:${encryptSecret(
        JSON.stringify({
          serverUrl: 'http://127.0.0.1:3131',
          accessToken: 'fail-token-activitypub',
        }),
      )}`,
      diagnostics: { mode: 'local-harness' },
    },
  })

  // Account 3: Revoked Bluesky account (triggers safe disconnect)
  const revokedAccount = await payload.create({
    collection: 'social-accounts',
    data: {
      site: siteAlpha.id,
      network: 'bluesky',
      displayName: 'Revoked Operator',
      actorType: 'site',
      externalAccountId: 'did:plc:revoked-operator',
      accountHandle: '@revoked.bsky.test',
      status: 'active',
      capabilityState: 'available',
      capabilities: { textLimit: 300, postTypes: ['text', 'media'] },
      credentialHealth: 'healthy',
      connectionReference: `enc:${encryptSecret(
        JSON.stringify({
          identifier: 'revoked.bsky.test',
          appPassword: 'revoked-password',
          service: 'http://127.0.0.1:3131',
        }),
      )}`,
      diagnostics: { mode: 'local-harness' },
    },
  })
  check('connected accounts seeded', Boolean(bskyAccount.id && actPubAccount.id && revokedAccount.id))

  // 4. NEGATIVE SECURITY & AUTHORIZATION TESTS
  const anonWorkerGet = await api('/api/admin/social/worker', 'GET', undefined, '', 403)
  check('negative: unauthenticated worker GET denied with 403', anonWorkerGet.response.status === 403)

  const anonWorkerPost = await api(
    '/api/admin/social/worker',
    'POST',
    { action: 'dispatch' },
    '',
    403,
  )
  check('negative: unauthenticated worker POST denied with 403', anonWorkerPost.response.status === 403)

  const invalidTokenPost = await api(
    '/api/admin/social/worker',
    'POST',
    { action: 'dispatch' },
    invalidSessionCookie,
    403,
  )
  check('negative: invalid token worker POST denied with 403', invalidTokenPost.response.status === 403)

  const foreignSiteDraftAccess = await api(
    `/api/admin/social/drafts?siteId=${siteAlpha.id}`,
    'GET',
    undefined,
    foreignCookie,
    403,
  )
  check('negative: foreign operator accessing site-alpha denied with 403', foreignSiteDraftAccess.response.status === 403)

  const statsRes = await api('/api/admin/social/worker', 'GET', undefined, ownCookie, 200)
  const stats = statsRes.json()
  check('worker GET stats returns success', stats.success === true)
  check('worker GET stats has queue counters', typeof stats.stats.scheduled === 'number')

  // 5. DRAFT 1: MULTI-DESTINATION WITH PARTIAL DESTINATION FAILURE & BROWSER JOURNEY
  console.log('\n--- Executing Draft 1: Partial Destination Failure & UI Dispatch ---')
  const createDraft1 = await api(
    '/api/admin/social/drafts',
    'POST',
    {
      action: 'create-draft',
      siteId: siteAlpha.id,
      title: 'RC1 Subpass 08C Multi-Destination Delivery',
      canonicalUrl: 'https://renegadeparty.org/releases/08c',
      variants: [
        {
          accountId: bskyAccount.id,
          network: 'bluesky',
          text: 'Autonomous release delivery for Subpass 08C #Bluesky',
        },
        {
          accountId: actPubAccount.id,
          network: 'activitypub',
          text: 'Federated release dispatch for Subpass 08C #ActivityPub',
        },
      ],
    },
    ownCookie,
    201,
  )
  const draft1Data = createDraft1.json()
  const draft1Id = draft1Data.draft.id
  check('Draft 1 created', Boolean(draft1Id))

  // Submit for review -> Approve -> Schedule
  await api(
    '/api/admin/social/drafts',
    'POST',
    { action: 'submit-review', draftId: draft1Id },
    staffCookie,
    200,
  )
  await api(
    '/api/admin/social/drafts',
    'POST',
    { action: 'approve', draftId: draft1Id },
    ownCookie,
    200,
  )
  const schedRes = await api(
    '/api/admin/social/drafts',
    'POST',
    {
      action: 'schedule',
      draftId: draft1Id,
      scheduledFor: new Date(Date.now() - 1000).toISOString(), // Due immediately
    },
    ownCookie,
    200,
  )
  const schedData = schedRes.json()
  check('Draft 1 scheduled', schedData.status === 'scheduled')
  check('Draft 1 created 2 queue items', schedData.queueCount === 2)

  const draft1Variants = await payload.find({
    collection: 'social-network-variants',
    where: { draft: { equals: draft1Id } },
    depth: 0,
    overrideAccess: true,
  })
  const bskyVariant = draft1Variants.docs.find((v: any) => v.network === 'bluesky')
  const actPubVariant = draft1Variants.docs.find((v: any) => v.network === 'activitypub')

  const queueDocs = await payload.find({
    collection: 'social-queue-items',
    where: { variant: { in: draft1Variants.docs.map((v: any) => v.id) } },
    depth: 0,
    overrideAccess: true,
  })
  const blueskyQueueItem = queueDocs.docs.find((q: any) => String(q.variant) === String(bskyVariant?.id))
  const actPubQueueItem = queueDocs.docs.find((q: any) => String(q.variant) === String(actPubVariant?.id))
  check('Bluesky queue item identified', Boolean(blueskyQueueItem?.id))
  check('ActivityPub queue item identified', Boolean(actPubQueueItem?.id))

  // 6. PLAYWRIGHT BROWSER UI JOURNEY
  console.log('\n--- Launching Headless Chromium for Operator UI Journey ---')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(60000)

  // Set passkey session cookie in browser
  await page.context().addCookies([
    {
      name: 'renegade-passkey',
      value: (await session(ownerUser)).replace('renegade-passkey=', ''),
      domain: 'localhost',
      path: '/',
    },
    {
      name: 'renegade-active-site',
      value: siteAlpha.id,
      domain: 'localhost',
      path: '/',
    },
  ])

  // Navigate to Social Command Center
  await page.goto(`${base}/admin/social`)
  await page.waitForSelector('[data-testid="draft-workflow-panel"]')
  check('Browser loaded Social Command Center', true)

  // Select Draft 1 from dropdown
  await page.selectOption('[data-testid="draft-select"]', draft1Id)
  await page.waitForSelector(`[data-testid="current-draft-id"]:has-text("${draft1Id}")`)
  check('Browser selected Draft 1 and loaded queue items', true)

  // Verify scheduled status badge and 2 persisted queue items in table
  const statusBeforeDispatch = await page.textContent('[data-testid="draft-status-badge"]')
  check('Initial draft status in UI is SCHEDULED', statusBeforeDispatch?.toLowerCase().includes('scheduled'))

  await page.screenshot({ path: `${out}/01-draft-scheduled.png`, fullPage: true })

  // Operator clicks [⚡ Dispatch Due Queue] button
  console.log('Operator clicking [⚡ Dispatch Due Queue] button...')
  await page.click('[data-testid="dispatch-queue-btn"]')

  // Wait for worker result and draft status update
  await page.waitForFunction(
    () => {
      const badge = document.querySelector('[data-testid="draft-status-badge"]')
      return badge && badge.textContent?.toLowerCase().includes('partially-published')
    },
    { timeout: 15000 },
  )
  check('UI dynamically updated draft status to PARTIALLY-PUBLISHED', true)

  // Verify Bluesky item shows PUBLISHED badge, external link, and local-harness pill
  const bskyStatusText = await page.textContent(`[data-testid="item-status-${blueskyQueueItem.id}"]`)
  check('UI displays PUBLISHED for Bluesky item', bskyStatusText?.toLowerCase().includes('published'))

  const bskyModePill = await page.textContent(`[data-testid="provider-mode-pill-${blueskyQueueItem.id}"]`)
  check('UI displays local-harness pill for Bluesky receipt', bskyModePill?.toLowerCase().includes('local-harness'))

  // Verify ActivityPub item shows FAILED badge and error message
  const actPubStatusText = await page.textContent(`[data-testid="item-status-${actPubQueueItem.id}"]`)
  check('UI displays FAILED for ActivityPub item', actPubStatusText?.toLowerCase().includes('failed'))

  const actPubErrorText = await page.textContent(`[data-testid="item-error-${actPubQueueItem.id}"]`)
  check(
    'UI displays truthful failure reason for ActivityPub',
    actPubErrorText?.includes('Federation host unreachable') || actPubErrorText?.includes('failed'),
  )

  await page.screenshot({ path: `${out}/02-after-dispatch.png`, fullPage: true })

  // 7. DATABASE INTEGRITY ASSERTIONS FOR DRAFT 1
  const dbDraft1 = await payload.findByID({
    collection: 'social-drafts',
    id: draft1Id,
    depth: 0,
    overrideAccess: true,
  })
  check('DB Draft 1 status updated to partially-published', dbDraft1.status === 'partially-published')

  const dbBlueskyItem = await payload.findByID({
    collection: 'social-queue-items',
    id: blueskyQueueItem.id,
    depth: 0,
    overrideAccess: true,
  })
  check('DB Bluesky item status is published', dbBlueskyItem.status === 'published')
  check('DB Bluesky attemptCount is 1', dbBlueskyItem.attemptCount === 1)

  const dbActPubItem = await payload.findByID({
    collection: 'social-queue-items',
    id: actPubQueueItem.id,
    depth: 0,
    overrideAccess: true,
  })
  check('DB ActivityPub item status is failed', dbActPubItem.status === 'failed')
  check('DB ActivityPub attemptCount is 1', dbActPubItem.attemptCount === 1)

  // External Posts receipt verification
  const extPosts = await payload.find({
    collection: 'external-posts',
    where: { variant: { equals: bskyVariant.id } },
    depth: 0,
    overrideAccess: true,
  })
  check('DB created 1 external-posts record for Bluesky', extPosts.docs.length === 1)
  const bskyExtPost = extPosts.docs[0]
  check('External post records remoteId', Boolean(bskyExtPost.remoteId))
  check('External post records remoteId URI', bskyExtPost.remoteId?.startsWith('at://did:plc:'))
  check('External post records remoteUrl', Boolean(bskyExtPost.remoteUrl))

  // Publish attempts audit log verification
  const attempts = await payload.find({
    collection: 'social-publish-attempts',
    where: { queueItem: { in: [blueskyQueueItem.id, actPubQueueItem.id] } },
    depth: 0,
    overrideAccess: true,
  })
  check('DB logged 2 publish attempts', attempts.docs.length === 2)
  const bskyAttempt = attempts.docs.find((a: any) => String(a.queueItem) === String(blueskyQueueItem.id))
  const actPubAttempt = attempts.docs.find((a: any) => String(a.queueItem) === String(actPubQueueItem.id))
  check(
    'Bluesky attempt status is published',
    bskyAttempt?.status === 'published' || bskyAttempt?.status === 'succeeded',
  )
  check('ActivityPub attempt status is failed', actPubAttempt?.status === 'failed')

  // 8. BOUNDED FAILED-ONLY RETRY PROOF
  console.log('\n--- Testing Bounded Failed-Only Retries in UI ---')
  const bskyCreateCallsBeforeRetry = createRecordCallCount
  const mastoCallsBeforeRetry = mastoPostCallCount

  // Click [🔄 Retry Failed] button in UI
  await page.click('[data-testid="retry-failed-btn"]')
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="retry-failed-btn"]')
      return btn && !btn.hasAttribute('disabled')
    },
    { timeout: 15000 },
  )

  // Verify: Bluesky item was NOT re-dispatched (no duplicate send)
  check(
    'Idempotent: Bluesky was not re-sent on retry (harness calls unchanged)',
    createRecordCallCount === bskyCreateCallsBeforeRetry,
  )
  check(
    'Failed-only: ActivityPub was retried (harness call count incremented)',
    mastoPostCallCount > mastoCallsBeforeRetry,
  )

  // Verify attempt count in DB became 2
  const dbActPubAfterRetry1 = await payload.findByID({
    collection: 'social-queue-items',
    id: actPubQueueItem.id,
    depth: 0,
    overrideAccess: true,
  })
  check('ActivityPub attemptCount incremented to 2', dbActPubAfterRetry1.attemptCount === 2)

  // Retry again to reach bound (attemptCount = 3)
  await page.click('[data-testid="retry-failed-btn"]')
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="retry-failed-btn"]')
      return btn && !btn.hasAttribute('disabled')
    },
    { timeout: 15000 },
  )

  const dbActPubAfterRetry2 = await payload.findByID({
    collection: 'social-queue-items',
    id: actPubQueueItem.id,
    depth: 0,
    overrideAccess: true,
  })
  check('ActivityPub attemptCount reached 3', dbActPubAfterRetry2.attemptCount === 3)

  // Additional retry attempt: worker bounded policy prevents items with attemptCount >= 3 from retrying
  const retryBoundedRes = await api(
    '/api/admin/social/worker',
    'POST',
    { action: 'retry-failed' },
    ownCookie,
    200,
  )
  const retryBoundedData = retryBoundedRes.json()
  check(
    'Bounded policy: 0 items retried when attemptCount >= 3',
    retryBoundedData.summary?.retriedCount === 0,
  )

  // 9. DRAFT 2: LOST RESPONSE / WORKER RESTART RECONCILIATION (IDEMPOTENT GETRECORD PRE-FLIGHT)
  console.log('\n--- Testing Lost Response Reconciliation on Worker Restart ---')
  const createDraft2 = await api(
    '/api/admin/social/drafts',
    'POST',
    {
      action: 'create-draft',
      siteId: siteAlpha.id,
      title: 'RC1 Subpass 08C Lost Response Reconciliation',
      canonicalUrl: 'https://renegadeparty.org/releases/08c-lost-response',
      variants: [
        {
          accountId: bskyAccount.id,
          network: 'bluesky',
          text: 'Pre-existing record reconciliation test #Bluesky',
        },
      ],
    },
    ownCookie,
    201,
  )
  const draft2Id = createDraft2.json().draft.id
  await api('/api/admin/social/drafts', 'POST', { action: 'submit-review', draftId: draft2Id }, staffCookie, 200)
  await api('/api/admin/social/drafts', 'POST', { action: 'approve', draftId: draft2Id }, ownCookie, 200)
  const schedDraft2 = await api(
    '/api/admin/social/drafts',
    'POST',
    {
      action: 'schedule',
      draftId: draft2Id,
      scheduledFor: new Date().toISOString(),
    },
    ownCookie,
    200,
  )
  const draft2QueueItem = schedDraft2.json().queueItems[0]

  // Pre-seed local harness with this item's deterministic rkey
  // (Simulates worker having posted to provider, then crashing before writing DB response)
  const draft2Rkey = sha256Hex(draft2QueueItem.idempotencyKey).slice(0, 32)
  harnessPublishedRecords.set(draft2Rkey, {
    uri: `at://did:plc:localoperator1/app.bsky.feed.post/${draft2Rkey}`,
    cid: 'bafyrei-pre-existing-cid-888',
    text: 'Pre-existing record reconciliation test #Bluesky',
  })

  const bskyCreateCallsBeforeDraft2 = createRecordCallCount

  // Dispatch item via worker
  const dispatchDraft2Res = await api(
    '/api/admin/social/worker',
    'POST',
    { action: 'dispatch-item', queueItemId: draft2QueueItem.id },
    ownCookie,
    200,
  )
  const draft2DispatchData = dispatchDraft2Res.json()
  check('Draft 2 dispatch-item succeeded', draft2DispatchData.success === true)

  // Verify: createRecord was NOT called again (pre-flight getRecord recovered existing record)
  check(
    'Reconciled: createRecord was NOT invoked for existing record',
    createRecordCallCount === bskyCreateCallsBeforeDraft2,
  )

  const dbDraft2Item = await payload.findByID({
    collection: 'social-queue-items',
    id: draft2QueueItem.id,
    depth: 0,
    overrideAccess: true,
  })
  check('Draft 2 item status transitioned to published', dbDraft2Item.status === 'published')

  const draft2VariantId =
    typeof draft2QueueItem.variant === 'object' && draft2QueueItem.variant !== null
      ? draft2QueueItem.variant.id
      : draft2QueueItem.variant
  const draft2ExtPost = await payload.find({
    collection: 'external-posts',
    where: { variant: { equals: draft2VariantId } },
    depth: 0,
    overrideAccess: true,
  })
  check('Draft 2 external post recorded', draft2ExtPost.docs.length === 1)
  check('Draft 2 external post remoteId recorded', Boolean(draft2ExtPost.docs[0].remoteId))

  const draft2Attempt = await payload.find({
    collection: 'social-publish-attempts',
    where: { queueItem: { equals: draft2QueueItem.id } },
    depth: 0,
    overrideAccess: true,
  })
  check(
    'Draft 2 attempt receipt notes reconciled: true',
    draft2Attempt.docs[0]?.response?.receipt?.rawResponse?.reconciled === true,
  )
  check(
    'Draft 2 attempt receipt records local-harness',
    draft2Attempt.docs[0]?.response?.receipt?.rawResponse?.providerMode === 'local-harness' ||
      draft2Attempt.docs[0]?.response?.providerMode === 'local-harness',
  )

  // 10. DRAFT 3: SAFE DISCONNECT ON REVOKED ACCOUNT
  console.log('\n--- Testing Safe Disconnect on Revoked Credentials ---')
  const createDraft3 = await api(
    '/api/admin/social/drafts',
    'POST',
    {
      action: 'create-draft',
      siteId: siteAlpha.id,
      title: 'RC1 Subpass 08C Revoked Account Safe Disconnect',
      variants: [
        {
          accountId: revokedAccount.id,
          network: 'bluesky',
          text: 'This post will encounter revoked credentials safely',
        },
      ],
    },
    ownCookie,
    201,
  )
  const draft3Id = createDraft3.json().draft.id
  await api('/api/admin/social/drafts', 'POST', { action: 'submit-review', draftId: draft3Id }, staffCookie, 200)
  await api('/api/admin/social/drafts', 'POST', { action: 'approve', draftId: draft3Id }, ownCookie, 200)
  const schedDraft3 = await api(
    '/api/admin/social/drafts',
    'POST',
    {
      action: 'schedule',
      draftId: draft3Id,
      scheduledFor: new Date().toISOString(),
    },
    ownCookie,
    200,
  )
  const draft3QueueItem = schedDraft3.json().queueItems[0]

  // Dispatch item
  await api(
    '/api/admin/social/worker',
    'POST',
    { action: 'dispatch-item', queueItemId: draft3QueueItem.id },
    ownCookie,
    200,
  )

  const dbDraft3Item = await payload.findByID({
    collection: 'social-queue-items',
    id: draft3QueueItem.id,
    depth: 0,
    overrideAccess: true,
  })
  check('Draft 3 item status is failed', dbDraft3Item.status === 'failed')
  check(
    'Draft 3 dead letter reason recorded as reconnect-required',
    dbDraft3Item.deadLetterReason === 'reconnect-required' ||
      dbDraft3Item.deadLetterReason?.kind === 'reconnect-required',
  )

  // 11. PERSIST STATE FOR RESTART VERIFICATION
  const stateData = {
    siteId: siteAlpha.id,
    ownerId: ownerUser.id,
    draft1Id,
    draft1BlueskyVariantId: bskyVariant.id,
    draft1BlueskyItemId: blueskyQueueItem.id,
    draft1ActivityPubItemId: actPubQueueItem.id,
    draft2Id,
    draft2ItemId: draft2QueueItem.id,
    draft3Id,
    draft3ItemId: draft3QueueItem.id,
    verifiedAt: new Date().toISOString(),
  }
  await writeFile(`${out}/state.json`, JSON.stringify(stateData, null, 2))
  await writeFile(`${out}/journey-trace.json`, JSON.stringify(trace, null, 2))

  console.log(`\nALL ${checks} ACCEPTANCE CHECKS PASSED. Ready for restart check.`)
  succeeded = true
} catch (error) {
  console.error('\nEXECUTION FAILED:', error)
  process.exit(1)
} finally {
  harnessServer.close()
}
