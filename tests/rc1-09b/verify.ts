/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic operator acceptance */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { audienceDigest } from '../../src/modules/audience/contracts'

assert.equal(process.env.RC1_09B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5450/rc109b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/09B'
const base = 'http://localhost:38998'
const trace: any[] = []
let checks = 0

const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}

const restart = process.argv.includes('--restart')

try {
  await mkdir(out, { recursive: true })

  // =========================================================================
  // RESTART VERIFICATION
  // =========================================================================
  if (restart) {
    console.log('\n--- Running 09B Restart Persistence Verification ---')
    const raw = await readFile(`${out}/state.json`, 'utf-8')
    const state = JSON.parse(raw)

    const site = await payload.findByID({
      collection: 'sites',
      id: state.siteId,
      depth: 0,
      overrideAccess: true,
    })
    check('Restart: site retained', site && site.slug === 'renegadeparty-09b')

    const message = await payload.findByID({
      collection: 'email-messages',
      id: state.messageId,
      depth: 0,
      overrideAccess: true,
    })
    check('Restart: campaign email message retained', Boolean(message))
    check('Restart: campaign status retained as scheduled', message.status === 'scheduled')
    check('Restart: scheduledFor date preserved', Boolean(message.scheduledFor))
    check('Restart: approvedRender snapshot preserved', Boolean(message.approvedRender?.hash))
    check('Restart: approvedRender HTML preserved', message.approvedRender?.html?.includes('max-width:600px'))

    const snapshot = await payload.findByID({
      collection: 'recipient-snapshots',
      id: state.snapshotId,
      depth: 0,
      overrideAccess: true,
    })
    check('Restart: recipient-snapshots record retained', Boolean(snapshot))
    check('Restart: recipient snapshot hash preserved', snapshot.hash === state.snapshotHash)
    check('Restart: recipient snapshot frozen count preserved', snapshot.recipients?.length === 2)
    check(
      'Restart: recipient snapshot exclusion counts preserved',
      snapshot.exclusionCounts?.duplicates === 1 && snapshot.exclusionCounts?.unconsentedOrPending === 1,
    )

    console.log(`\nALL ${checks} RESTART CHECKS PASSED cleanly. State survived container restart.`)
    await writeFile(`${out}/restart-trace.json`, JSON.stringify(trace, null, 2))
    process.exit(0)
  }

  // =========================================================================
  // PRIMARY OPERATOR VERIFICATION
  // =========================================================================
  console.log('\n--- Starting RC1 Subpass 09B Acceptance Verification ---')

  // 1. SETUP SITES AND OPERATORS
  console.log('\n[1/6] Setting up sites, operator sessions, and audience entities...')

  // Site Alpha: Renegade Party 09B
  const siteAlpha = await payload.create({
    collection: 'sites',
    data: {
      name: 'Renegade Movement 09B',
      slug: 'renegadeparty-09b',
      lifecycle: 'active',
      description: 'Acceptance site for subpass 09B campaigns and templates.',
    },
    overrideAccess: true,
  })
  check('Site Alpha created', Boolean(siteAlpha.id))

  // Site Beta: Foreign Adversary Site (for multi-tenant cross-site security checks)
  const siteBeta = await payload.create({
    collection: 'sites',
    data: {
      name: 'Foreign Adversary Site',
      slug: 'adversary-09b',
      lifecycle: 'active',
      description: 'Adversary site for multi-tenant boundary checks.',
    },
    overrideAccess: true,
  })
  check('Site Beta (Foreign) created', Boolean(siteBeta.id))

  // Owner User
  const ownerUser = await payload.create({
    collection: 'users',
    data: {
      email: 'owner@renegadeparty.org',
      role: 'owner',
    },
    overrideAccess: true,
  })
  check('Owner user created', Boolean(ownerUser.id))

  const secret = loadConfig().payloadSecret
  const ownerSession = await createPasskeySession(
    { id: String(ownerUser.id), email: String(ownerUser.email) },
    secret,
    async (id, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
        [id, ownerUser.id, expiresAt],
      )
    },
  )
  const ownCookie = `renegade-passkey=${ownerSession.token}; renegade-active-site=${siteAlpha.id}`

  // 2. SEED PUBLISHED ARTICLE ON SITE ALPHA
  console.log('\n[2/6] Seeding published article for newsletter derivation...')
  const article = await payload.create({
    collection: 'content',
    data: {
      site: siteAlpha.id,
      title: 'Freedom Act Update 2026',
      slug: 'freedom-act-update-2026',
      contentType: 'article',
      status: 'published',
      publishedAt: new Date().toISOString(),
      canonicalPath: '/news/freedom-act-update-2026',
      summary: 'Breakthrough developments in digital freedom legislation and community mobilization.',
      body: {
        root: {
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'Official briefing on the Freedom Act of 2026.' }],
            },
          ],
        },
      },
    },
    overrideAccess: true,
  })
  check('Article created and published', article && article.status === 'published')

  // 3. SEED AUDIENCE LIST, SEGMENTS & SUBSCRIBERS
  console.log('\n[3/6] Seeding audience list, segments, and subscribers with consent/suppression states...')
  const listAlpha = await payload.create({
    collection: 'audience-lists',
    data: {
      site: siteAlpha.id,
      name: 'Renegade Campaign Dispatch List',
      slug: 'campaign-dispatch-09b',
      title: 'Campaign Dispatch',
      visibility: 'public',
    },
    overrideAccess: true,
  })
  check('Audience list created', Boolean(listAlpha.id))

  // Segment A on Site Alpha: matches members of listAlpha
  const segmentActive = await payload.create({
    collection: 'audience-segments',
    data: {
      site: siteAlpha.id,
      name: 'Active Newsletter Supporters',
      version: 'v1.0.0',
      status: 'active',
      definition: {
        all: [{ predicate: { field: 'list', op: 'is', value: String(listAlpha.id) } }],
      },
    },
    overrideAccess: true,
  })
  check('Active supporters segment created', Boolean(segmentActive.id))

  // Segment B on Site Alpha: matches nothing (Empty Audience)
  const segmentEmpty = await payload.create({
    collection: 'audience-segments',
    data: {
      site: siteAlpha.id,
      name: 'Empty Audience Segment',
      version: 'v1.0.0',
      status: 'active',
      definition: {
        all: [{ predicate: { field: 'tag', op: 'is', value: 'tag-never-exists-09b' } }],
      },
    },
    overrideAccess: true,
  })
  check('Empty audience segment created', Boolean(segmentEmpty.id))

  // Segment C on Site Beta: foreign site segment
  const segmentForeign = await payload.create({
    collection: 'audience-segments',
    data: {
      site: siteBeta.id,
      name: 'Adversary Foreign Site Segment',
      version: 'v1.0.0',
      status: 'active',
      definition: {
        all: [{ predicate: { field: 'channelEligible', op: 'is', value: 'true' } }],
      },
    },
    overrideAccess: true,
  })
  check('Foreign site segment created', Boolean(segmentForeign.id))

  // Subscribers for Site Alpha:
  // Sub 1: Active, consented
  const sub1 = await payload.create({
    collection: 'subscribers',
    data: {
      site: siteAlpha.id,
      email: 'reader1@renegadeparty.org',
      emailHash: audienceDigest('reader1@renegadeparty.org'),
      status: 'active',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'audience-memberships',
    data: {
      subscriber: sub1.id,
      audienceList: listAlpha.id,
      status: 'active',
      confirmedAt: new Date().toISOString(),
      source: 'public-form',
    },
    overrideAccess: true,
  })

  // Sub 2: Active, consented
  const sub2 = await payload.create({
    collection: 'subscribers',
    data: {
      site: siteAlpha.id,
      email: 'reader2@renegadeparty.org',
      emailHash: audienceDigest('reader2@renegadeparty.org'),
      status: 'active',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'audience-memberships',
    data: {
      subscriber: sub2.id,
      audienceList: listAlpha.id,
      status: 'active',
      confirmedAt: new Date().toISOString(),
      source: 'public-form',
    },
    overrideAccess: true,
  })

  // Sub 3: Duplicate email uppercase (READER2@RENEGADEPARTY.ORG)
  const sub3Dup = await payload.create({
    collection: 'subscribers',
    data: {
      site: siteAlpha.id,
      email: 'READER2@RENEGADEPARTY.ORG',
      emailHash: audienceDigest('READER2@RENEGADEPARTY.ORG'),
      status: 'active',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'audience-memberships',
    data: {
      subscriber: sub3Dup.id,
      audienceList: listAlpha.id,
      status: 'active',
      confirmedAt: new Date().toISOString(),
      source: 'public-form',
    },
    overrideAccess: true,
  })

  // Sub 4: Pending (unconsented)
  const sub4Pending = await payload.create({
    collection: 'subscribers',
    data: {
      site: siteAlpha.id,
      email: 'pending@renegadeparty.org',
      emailHash: audienceDigest('pending@renegadeparty.org'),
      status: 'pending',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'audience-memberships',
    data: {
      subscriber: sub4Pending.id,
      audienceList: listAlpha.id,
      status: 'active',
      source: 'public-form',
    },
    overrideAccess: true,
  })

  // Sub 5: Suppressed (bounced)
  const sub5Suppressed = await payload.create({
    collection: 'subscribers',
    data: {
      site: siteAlpha.id,
      email: 'bounced@renegadeparty.org',
      emailHash: audienceDigest('bounced@renegadeparty.org'),
      status: 'active',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'audience-memberships',
    data: {
      subscriber: sub5Suppressed.id,
      audienceList: listAlpha.id,
      status: 'active',
      confirmedAt: new Date().toISOString(),
      source: 'public-form',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'suppressions',
    data: {
      site: siteAlpha.id,
      emailHash: audienceDigest('bounced@renegadeparty.org'),
      reason: 'bounce',
      occurredAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  check('Subscribers seeded (2 active, 1 dup, 1 pending, 1 suppressed)', true)

  // 4. BROWSER AUTOMATION: PLAYWRIGHT JOURNEY IN EMAIL COMPOSER
  console.log('\n[4/6] Executing operator UI journey in Chromium browser...')
  const browser = await chromium.launch({ headless: true })
  const browserContext = await browser.newContext()

  await browserContext.addCookies([
    { name: 'renegade-passkey', value: ownerSession.token, url: base },
    { name: 'renegade-active-site', value: siteAlpha.id, url: base },
  ])

  const page = await browserContext.newPage()
  await page.goto(`${base}/admin/email-composer`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('[data-testid="email-composer-view"]', { timeout: 30000 })

  // Verify UI View
  const composerHeading = await page.textContent('h1')
  check('UI loads with composer heading', composerHeading?.includes('Newsletter & Campaign Composer'))

  // A. Derive Newsletter from Article
  console.log('-> Testing Article Derivation in UI...')
  await page.selectOption('[data-testid="article-select"]', article.id)
  await page.click('[data-testid="derive-article-btn"]')

  // Verify subject updated
  const subjectVal = await page.inputValue('[data-testid="campaign-subject-input"]')
  check('Subject line derived from article title', subjectVal === 'Freedom Act Update 2026')

  // Verify pinned content card visible
  const cardTitle = await page.textContent('[data-testid="pinned-content-card"]')
  check('Pinned content card visible with article details', cardTitle?.includes('Freedom Act Update 2026'))

  // B. Live Responsive Preview & MIME Output
  console.log('-> Testing Live Responsive MIME Preview...')
  await page.click('[data-testid="update-preview-btn"]')
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="preview-iframe"]')
      const srcdoc = el?.getAttribute('srcdoc') || ''
      return srcdoc.includes('max-width:600px') && srcdoc.includes('Freedom Act Update 2026')
    },
    { timeout: 15000 },
  )

  const warningText = await page.textContent('[data-testid="preview-warning"]')
  check('Approximation warning is visible', warningText?.includes('Mailbox/device previews are approximations'))

  const iframeSrcDoc = await page.getAttribute('[data-testid="preview-iframe"]', 'srcdoc')
  check('Rendered MIME HTML has responsive container', iframeSrcDoc?.includes('max-width:600px'))
  check('Rendered MIME HTML has derived article title', iframeSrcDoc?.includes('Freedom Act Update 2026'))
  check(
    'Rendered MIME HTML has mandatory legal/unsubscribe link',
    iframeSrcDoc?.includes('https://renegadeparty.org/audience/unsubscribe'),
  )

  // Switch to Plain Text companion tab
  await page.click('[data-testid="preview-tab-text"]')
  const plainTextView = await page.textContent('[data-testid="preview-text-view"]')
  check('Plain text companion renders', plainTextView?.includes('Freedom Act Update 2026'))
  check('Plain text companion contains unsubscribe', plainTextView?.includes('Unsubscribe'))

  // Switch back to HTML tab
  await page.click('[data-testid="preview-tab-html"]')

  // C. Audience Segment Targeting, Live Evaluation & Recipient Deduplication
  console.log('-> Testing Audience Segment Selection & Deduplication...')
  await page.selectOption('[data-testid="segment-select"]', segmentActive.id)
  await page.click('[data-testid="evaluate-segment-btn"]')
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="count-total-matched"]')
      return el?.textContent?.trim() === '5'
    },
    { timeout: 15000 },
  )

  const totalMatchedText = await page.textContent('[data-testid="count-total-matched"]')
  check('Live analysis matches all 5 list subscribers', totalMatchedText?.trim() === '5')

  const eligibleCountText = await page.textContent('[data-testid="count-eligible-consented"]')
  check('Live analysis counts exactly 2 eligible consented recipients', eligibleCountText?.includes('2 Consented Recipients'))

  const dupCountText = await page.textContent('[data-testid="count-duplicates"]')
  check('Live analysis reports 1 duplicate email deduplicated', dupCountText?.trim() === '1')

  const unconsentedCountText = await page.textContent('[data-testid="count-unconsented"]')
  check('Live analysis reports 1 pending/unconsented subscriber', unconsentedCountText?.trim() === '1')

  const suppressedCountText = await page.textContent('[data-testid="count-suppressed"]')
  check('Live analysis reports 1 suppressed subscriber', suppressedCountText?.trim() === '1')

  // D. Empty Audience State Verification
  console.log('-> Testing Empty Audience State Handling...')
  await page.selectOption('[data-testid="segment-select"]', segmentEmpty.id)
  await page.click('[data-testid="evaluate-segment-btn"]')
  await page.waitForSelector('[data-testid="empty-audience-warning"]', { timeout: 15000 })

  const emptyWarning = await page.textContent('[data-testid="empty-audience-warning"]')
  check('Empty audience state warning is displayed', emptyWarning?.includes('Empty audience: 0 eligible consented recipients found'))

  const isScheduleDisabled = await page.isDisabled('[data-testid="schedule-campaign-btn"]')
  check('Schedule button is disabled on empty audience state', isScheduleDisabled === true)

  // E. Scheduling Campaign & Reaching Scheduled Status
  console.log('-> Testing Campaign Scheduling...')
  await page.selectOption('[data-testid="segment-select"]', segmentActive.id)
  await page.click('[data-testid="evaluate-segment-btn"]')
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="count-total-matched"]')
      return el?.textContent?.trim() === '5'
    },
    { timeout: 15000 },
  )

  await page.fill('[data-testid="schedule-time-input"]', '2026-10-21T15:30')
  await page.click('[data-testid="schedule-campaign-btn"]')
  await page.waitForSelector('[data-testid="composer-success-alert"]', { timeout: 15000 })

  const successAlert = await page.textContent('[data-testid="composer-success-alert"]')
  check('Campaign scheduled success banner displayed', successAlert?.includes('Campaign scheduled successfully'))

  const statusBadge = await page.textContent('[data-testid="campaign-status-badge"]')
  check('Campaign status transitioned to SCHEDULED', statusBadge?.trim().toLowerCase() === 'scheduled')

  const snapshotHashEl = await page.textContent('[data-testid="snapshot-hash"]')
  check('Immutable recipient snapshot SHA-256 hash displayed', /^[a-f0-9]{64}$/.test(snapshotHashEl?.trim() || ''))

  const frozenRecipientsEl = await page.textContent('[data-testid="frozen-recipients"]')
  check('Frozen recipients count displayed as 2', frozenRecipientsEl?.includes('2'))

  // F. Operator Test Send
  console.log('-> Testing Operator Test Send...')
  await page.fill('[data-testid="test-send-email"]', 'operator@renegadeparty.org')
  await page.click('[data-testid="test-send-btn"]')
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="test-send-status"]')
      return Boolean(el?.textContent?.includes('Test send queued successfully'))
    },
    { timeout: 15000 },
  )

  const testStatus = await page.textContent('[data-testid="test-send-status"]')
  check('Test send status indicates success', testStatus?.includes('Test send queued successfully'))

  await browser.close()

  // 5. DATABASE INTEGRITY & NEGATIVE BOUNDARY CHECKS
  console.log('\n[5/6] Verifying database records, snapshots, and security boundaries...')

  // Locate scheduled message in DB
  const scheduledMessages = await payload.find({
    collection: 'email-messages',
    where: {
      and: [
        { site: { equals: siteAlpha.id } },
        { status: { equals: 'scheduled' } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  check('Scheduled email message persisted in database', scheduledMessages.docs.length === 1)
  const scheduledMessage = scheduledMessages.docs[0]

  check('Persisted message has scheduledFor timestamp', Boolean(scheduledMessage.scheduledFor))
  check('Persisted message has approvedRender snapshot', Boolean(scheduledMessage.approvedRender?.hash))
  check('Persisted message has pinned recipientSnapshot reference', Boolean(scheduledMessage.recipientSnapshot))

  const snapshotId =
    typeof scheduledMessage.recipientSnapshot === 'object' && scheduledMessage.recipientSnapshot !== null
      ? scheduledMessage.recipientSnapshot.id
      : scheduledMessage.recipientSnapshot

  const snapshotDoc = await payload.findByID({
    collection: 'recipient-snapshots',
    id: snapshotId,
    depth: 0,
    overrideAccess: true,
  })
  check('Recipient snapshot record exists in DB', Boolean(snapshotDoc))
  check('Recipient snapshot has SHA-256 hash', /^[a-f0-9]{64}$/.test(snapshotDoc.hash))
  check('Recipient snapshot contains exactly 2 recipients', snapshotDoc.recipients?.length === 2)
  check(
    'Recipient snapshot records accurate exclusion counts',
    snapshotDoc.exclusionCounts?.duplicates === 1 &&
      snapshotDoc.exclusionCounts?.unconsentedOrPending === 1 &&
      snapshotDoc.exclusionCounts?.suppressed === 1,
  )

  // Negative Boundary 1: Foreign Site Segment Access via API
  console.log('-> Testing Security Boundary: Foreign Site Segment Access...')
  const foreignEvalRes = await fetch(`${base}/api/admin/audience/campaign`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: ownCookie,
    },
    body: JSON.stringify({
      action: 'evaluate-segment',
      segmentId: segmentForeign.id,
    }),
  })
  check('Foreign site segment evaluation rejected with 403 Forbidden', foreignEvalRes.status === 403)
  const foreignEvalData = await foreignEvalRes.json()
  check(
    'Forbidden response explains site scoping violation',
    foreignEvalData.error?.includes('outside owning site is forbidden'),
  )

  // Negative Boundary 2: Anonymous Access Denial
  console.log('-> Testing Security Boundary: Unauthenticated Access Denial...')
  const anonRes = await fetch(`${base}/api/admin/audience/campaign`, {
    method: 'GET',
  })
  check('Anonymous GET rejected with 403 Forbidden', anonRes.status === 403)

  // Negative Boundary 3: Missing Consent / Suppression Exclusion Verified
  console.log('-> Verifying unconsented and suppressed subscribers received 0 sends...')
  const deliveries = await payload.find({
    collection: 'email-deliveries',
    where: { message: { equals: scheduledMessage.id } },
    overrideAccess: true,
  })
  // At scheduling time, only the test send delivery was queued, not the bulk scheduled send
  const pendingDeliveries = deliveries.docs.filter((d: any) => d.recipientEmail === 'pending@renegadeparty.org')
  const bouncedDeliveries = deliveries.docs.filter((d: any) => d.recipientEmail === 'bounced@renegadeparty.org')
  check('Unconsented subscriber has zero deliveries', pendingDeliveries.length === 0)
  check('Suppressed subscriber has zero deliveries', bouncedDeliveries.length === 0)

  // 6. PERSIST STATE FOR RESTART VERIFICATION
  console.log('\n[6/6] Writing state and evidence for restart verification...')
  const stateData = {
    siteId: siteAlpha.id,
    messageId: scheduledMessage.id,
    snapshotId: snapshotDoc.id,
    snapshotHash: snapshotDoc.hash,
    articleId: article.id,
    verifiedAt: new Date().toISOString(),
  }
  await writeFile(`${out}/state.json`, JSON.stringify(stateData, null, 2))
  await writeFile(`${out}/journey-trace.json`, JSON.stringify(trace, null, 2))

  console.log(`\nALL ${checks} ACCEPTANCE CHECKS PASSED. Ready for restart check.`)
  process.exit(0)
} catch (error) {
  console.error('\nEXECUTION FAILED:', error)
  process.exit(1)
}
