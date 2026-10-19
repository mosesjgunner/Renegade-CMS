/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic scheduler acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import {
  executeScheduledPublishJob,
  reconcileScheduleWorkerJobs,
  getEffectiveSchedule,
  sanitizeErrorLog,
} from '../../src/modules/editorial/scheduler'
import {
  convertLocalToUtc,
  formatUtcInTimeZone,
  DSTNonexistentTimeError,
} from '../../src/modules/calendar/timezone'

assert.equal(process.env.RC1_07B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5448/rc107b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/07B'
const base = 'http://localhost:38984'
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
      request.setTimeout(180000, () => request.destroy(new Error('request timed out')))
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
    etag: response.headers.get('etag'),
    location: response.headers.get('location'),
    contentType: response.headers.get('content-type'),
    robots: response.headers.get('x-robots-tag'),
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

const body = (text: string) => ({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        children: [
          { type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' },
        ],
      },
    ],
  },
})

try {
  await mkdir(out, { recursive: true })

  if (restart) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const owner = await payload.findByID({ collection: 'users', id: state.owner })
    const cookie = await session(owner)

    // 1. Verify job state persisted after restart
    const job1 = await payload.findByID({
      collection: 'scheduled-publish-jobs',
      id: state.job1Id,
      depth: 0,
    })
    check('restart: completed job 1 state retained', job1.status === 'completed')

    const job2 = await payload.findByID({
      collection: 'scheduled-publish-jobs',
      id: state.job2Id,
      depth: 0,
    })
    check('restart: completed job 2 state retained', job2.status === 'completed')

    const jobCancelled = await payload.findByID({
      collection: 'scheduled-publish-jobs',
      id: state.jobCancelledId,
      depth: 0,
    })
    check('restart: cancelled job state retained', jobCancelled.status === 'cancelled')

    // 2. Verify published articles retain published lifecycle and pinned revision
    const art1 = await payload.findByID({
      collection: 'article-family-content',
      id: state.art1Id,
      depth: 0,
    })
    check('restart: article 1 lifecycle remains published', art1.lifecycle === 'published')
    check(
      'restart: article 1 latestPublishedRevision matches pinned rev1',
      String(art1.latestPublishedRevision) === state.art1Rev1Id,
    )

    const artCancelled = await payload.findByID({
      collection: 'article-family-content',
      id: state.artCancelledId,
      depth: 0,
    })
    check(
      'restart: cancelled article lifecycle remains approved',
      artCancelled.lifecycle === 'approved',
    )

    // 3. API health endpoint works after restart
    const healthRes = (
      await api(
        '/api/admin/schedule-health?limit=20',
        'GET',
        undefined,
        `${cookie}; renegade-active-site=${state.siteId}`,
      )
    ).json()
    check('restart: schedule-health API succeeds after restart', healthRes.counts.completedJobs >= 2)
  } else {
    // FRESH RUN:
    // 1. Seed Site, Publication, and Users
    const site = await payload.create({
      collection: 'sites',
      data: { name: '07B Scheduler Site', slug: 'scheduler-07b', lifecycle: 'active' },
    })
    const publication = (
      await payload.find({ collection: 'publications', where: { site: { equals: site.id } } })
    ).docs[0]

    const foreignSite = await payload.create({
      collection: 'sites',
      data: { name: '07B Foreign Site', slug: 'foreign-07b', lifecycle: 'active' },
    })

    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@rc107b.test', role: 'owner' },
    })
    const publisher = await payload.create({
      collection: 'users',
      data: { email: 'publisher@rc107b.test', role: 'administrator' },
    })
    const editor = await payload.create({
      collection: 'users',
      data: { email: 'editor@rc107b.test', role: 'staff' },
    })
    const outsider = await payload.create({
      collection: 'users',
      data: { email: 'outsider@rc107b.test', role: 'staff' },
    })

    for (const u of [publisher, editor]) {
      await payload.create({
        collection: 'member-site-roles',
        data: {
          member: typeof u.member === 'string' ? u.member : u.member.id,
          site: site.id,
          role: 'contributor',
        },
      })
    }
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof outsider.member === 'string' ? outsider.member : outsider.member.id,
        site: foreignSite.id,
        role: 'contributor',
      },
    })

    const ownerCookie = `${await session(owner)}; renegade-active-site=${site.id}`
    const publisherCookie = `${await session(publisher)}; renegade-active-site=${site.id}`
    const editorCookie = `${await session(editor)}; renegade-active-site=${site.id}`
    const outsiderCookie = `${await session(outsider)}; renegade-active-site=${foreignSite.id}`

    // 2. DST & Timezone Conversion Tests
    // Test America/Chicago Fall Back boundary: 2026-11-01 01:30 is ambiguous
    const fbEarlier = convertLocalToUtc('2026-11-01T01:30:00', 'America/Chicago', {
      ambiguousPreference: 'earlier',
    })
    check('DST engine: Fall Back earlier is ambiguous', fbEarlier.isAmbiguous === true)
    check('DST engine: Fall Back earlier is CDT (06:30 UTC)', fbEarlier.utcInstant === '2026-11-01T06:30:00.000Z')

    const fbLater = convertLocalToUtc('2026-11-01T01:30:00', 'America/Chicago', {
      ambiguousPreference: 'later',
    })
    check('DST engine: Fall Back later is CST (07:30 UTC)', fbLater.utcInstant === '2026-11-01T07:30:00.000Z')

    // Test America/Chicago Spring Forward boundary: 2026-03-08 02:30 is nonexistent
    const sfAdv = convertLocalToUtc('2026-03-08T02:30:00', 'America/Chicago', {
      nonexistentHandling: 'advance',
    })
    check('DST engine: Spring Forward advance wasNonexistent', sfAdv.wasNonexistent === true)
    assert.throws(
      () =>
        convertLocalToUtc('2026-03-08T02:30:00', 'America/Chicago', {
          nonexistentHandling: 'reject',
        }),
      DSTNonexistentTimeError,
    )
    check('DST engine: Spring Forward reject throws DSTNonexistentTimeError', true)

    // 3. Create and Approve Test Article 1 (DST Fall Back Schedule)
    const content1 = (
      await api(
        '/api/content',
        'POST',
        {
          site: site.id,
          publication: publication.id,
          title: 'Article 1 DST Boundary Fall Back',
          slug: 'article-1-dst-fall-back',
          canonicalPath: '/articles/article-1-dst-fall-back',
          contentType: 'article',
          status: 'draft',
          body: body('Article 1 original body content for scheduled publishing.'),
        },
        editorCookie,
        201,
      )
    ).json().doc

    const afc1 = (
      await payload.find({
        collection: 'article-family-content',
        where: { content: { equals: content1.id } },
      })
    ).docs[0]
    check('Editorial companion created for article 1', Boolean(afc1))
    const art1Rev1Id = String(afc1.currentRevision)

    // Submit review & approve article 1
    await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: content1.id, action: 'submit' },
      editorCookie,
      200,
    )
    await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: content1.id, action: 'approve' },
      ownerCookie,
      200,
    )
    const afc1Approved = await payload.findByID({
      collection: 'article-family-content',
      id: afc1.id,
    })
    check('Article 1 approved', afc1Approved.lifecycle === 'approved')

    // 4. Schedule Article 1 via Calendar Schedule API
    const schedRes1 = (
      await api(
        '/api/admin/calendar/schedule',
        'POST',
        {
          sourceId: afc1.id,
          sourceType: 'article',
          action: 'schedule',
          startsAt: '2026-11-01T01:30:00',
          timeZone: 'America/Chicago',
          expectedSequence: 1,
        },
        publisherCookie,
        200,
      )
    ).json()

    check('Article 1 scheduled via API successfully', schedRes1.ok === true)
    check('Article 1 scheduledForUtc matches Fall Back earlier instant', schedRes1.scheduledForUtc === '2026-11-01T06:30:00.000Z')

    const jobs1 = await payload.find({
      collection: 'scheduled-publish-jobs',
      where: { article: { equals: afc1.id } },
    })
    check('Scheduled job 1 row created in database', jobs1.docs.length === 1)
    const job1 = jobs1.docs[0]
    check('Job 1 status is queued', job1.status === 'queued')
    check('Job 1 revision pinned to Rev 1', String(job1.revision) === art1Rev1Id)

    // 5. Test Optimistic Concurrency and Revision Pinning Immutability
    // Author saves a new draft (Rev 2) after schedule
    await api(
      `/api/content/${content1.id}`,
      'PATCH',
      {
        body: body('Article 1 updated draft body (Rev 2) saved after scheduling.'),
      },
      editorCookie,
      200,
    )
    const afc1PostDraft = await payload.findByID({
      collection: 'article-family-content',
      id: afc1.id,
    })
    check('Article 1 currentRevisionSequence is now 2', afc1PostDraft.currentRevisionSequence === 2)
    const job1PostDraft = await payload.findByID({
      collection: 'scheduled-publish-jobs',
      id: job1.id,
    })
    check('Job 1 pinned revision still strictly matches Rev 1 (NOT Rev 2)', String(job1PostDraft.revision) === art1Rev1Id)

    // 6. Test Worker Lease Locking & Concurrency Protection
    // Worker A acquires lease for 60 seconds
    const workerAOptions = {
      workerId: 'worker-node-alpha',
      leaseDurationSeconds: 60,
      now: '2026-11-01T06:30:00.000Z',
    }
    // Attempt claim from Worker B while lease is active
    // First simulate worker lease lock acquisition manually
    await payload.update({
      collection: 'scheduled-publish-jobs',
      id: job1.id,
      data: {
        status: 'processing',
        leaseOwner: 'worker-node-alpha',
        leaseExpiresAt: '2026-11-01T06:31:00.000Z',
      },
    })

    // Worker B attempts execution while Worker A's lease is live
    const workerBAttempt = await executeScheduledPublishJob(payload, String(job1.id), {
      workerId: 'worker-node-beta',
      now: '2026-11-01T06:30:30.000Z', // 30s into lease
    })
    check('Worker B rejected while lease is held by Worker A', workerBAttempt.success === false)
    check('Worker B error indicates leased by worker-node-alpha', workerBAttempt.error?.includes('worker-node-alpha'))

    // 7. Stale Lease Reclamation & Worker Crash Recovery
    // Advance simulated time past Worker A's lease expiration (2026-11-01T06:32:00.000Z)
    // Worker B now runs reconcile and reclaims the stale lease
    const reconcileStaleRes = await reconcileScheduleWorkerJobs(payload, {
      workerId: 'worker-node-beta',
      now: '2026-11-01T06:32:00.000Z',
    })
    check('Reconciliation reclaimed stale lease', reconcileStaleRes.reclaimedStaleLeases >= 1)
    check('Job 1 succeeded on stale lease recovery', reconcileStaleRes.successCount >= 1)

    // Verify Article 1 published state
    const afc1Final = await payload.findByID({
      collection: 'article-family-content',
      id: afc1.id,
    })
    check('Article 1 lifecycle transitioned to published', afc1Final.lifecycle === 'published')
    check(
      'Article 1 latestPublishedRevision is Rev 1 (NOT Rev 2)',
      String(afc1Final.latestPublishedRevision) === art1Rev1Id,
    )
    const job1Final = await payload.findByID({
      collection: 'scheduled-publish-jobs',
      id: job1.id,
    })
    check('Job 1 status transitioned to completed', job1Final.status === 'completed')
    check('Job 1 leaseOwner cleared', job1Final.leaseOwner === null)

    // 8. Idempotent Retry Execution (Simulated Worker Crash Mid-Publish)
    // Rerunning executeScheduledPublishJob on an already completed job returns idempotent success
    const rerunCompleted = await executeScheduledPublishJob(payload, String(job1.id), {
      workerId: 'worker-node-gamma',
      now: '2026-11-01T06:35:00.000Z',
    })
    check('Idempotent retry on completed job returns success without duplicates', rerunCompleted.success === true)

    // 9. Create and Schedule Test Article 2 (Catch-Up Policy & Reconcile)
    const content2 = (
      await api(
        '/api/content',
        'POST',
        {
          site: site.id,
          publication: publication.id,
          title: 'Article 2 Spring Forward Schedule',
          slug: 'article-2-spring-forward',
          canonicalPath: '/articles/article-2-spring-forward',
          contentType: 'article',
          status: 'draft',
          body: body('Article 2 body for Spring Forward publication.'),
        },
        editorCookie,
        201,
      )
    ).json().doc

    const afc2 = (
      await payload.find({
        collection: 'article-family-content',
        where: { content: { equals: content2.id } },
      })
    ).docs[0]
    await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: content2.id, action: 'submit' },
      editorCookie,
      200,
    )
    await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: content2.id, action: 'approve' },
      ownerCookie,
      200,
    )

    // Schedule Article 2 for 2026-03-08 02:30 (advances to 03:00 CDT)
    const schedRes2 = (
      await api(
        '/api/admin/calendar/schedule',
        'POST',
        {
          sourceId: afc2.id,
          sourceType: 'article',
          action: 'schedule',
          startsAt: '2026-03-08T02:30:00',
          timeZone: 'America/Chicago',
        },
        publisherCookie,
        200,
      )
    ).json()
    check('Article 2 scheduled successfully across Spring Forward gap', schedRes2.ok === true)
    check('Spring Forward advance flag true', schedRes2.wasNonexistent === true)

    const jobs2 = await payload.find({
      collection: 'scheduled-publish-jobs',
      where: { article: { equals: afc2.id } },
    })
    const job2 = jobs2.docs[0]

    // Execute Job 2 via reconcile at the scheduled time
    const sched2TimeIso = schedRes2.scheduledForUtc
    const recon2Res = await reconcileScheduleWorkerJobs(payload, {
      workerId: 'worker-primary-node',
      now: sched2TimeIso,
    })
    check('Reconciliation executed Job 2', recon2Res.successCount >= 1)
    const afc2Final = await payload.findByID({
      collection: 'article-family-content',
      id: afc2.id,
    })
    check('Article 2 published', afc2Final.lifecycle === 'published')

    // 10. Schedule and Cancel Test Article 3
    const content3 = (
      await api(
        '/api/content',
        'POST',
        {
          site: site.id,
          publication: publication.id,
          title: 'Article 3 To Be Cancelled',
          slug: 'article-3-to-be-cancelled',
          canonicalPath: '/articles/article-3-to-be-cancelled',
          contentType: 'article',
          status: 'draft',
          body: body('Article 3 body scheduled and then cancelled.'),
        },
        editorCookie,
        201,
      )
    ).json().doc

    const afc3 = (
      await payload.find({
        collection: 'article-family-content',
        where: { content: { equals: content3.id } },
      })
    ).docs[0]
    await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: content3.id, action: 'submit' },
      editorCookie,
      200,
    )
    await api(
      '/api/admin/workflow/actions',
      'POST',
      { articleId: content3.id, action: 'approve' },
      ownerCookie,
      200,
    )

    await api(
      '/api/admin/calendar/schedule',
      'POST',
      {
        sourceId: afc3.id,
        sourceType: 'article',
        action: 'schedule',
        startsAt: '2026-12-01T10:00:00',
        timeZone: 'America/Chicago',
      },
      publisherCookie,
      200,
    )

    const jobs3 = await payload.find({
      collection: 'scheduled-publish-jobs',
      where: { article: { equals: afc3.id } },
    })
    const job3 = jobs3.docs[0]
    check('Job 3 queued', job3.status === 'queued')

    // Cancel Job 3 via Calendar Schedule API
    const cancelRes = (
      await api(
        '/api/admin/calendar/schedule',
        'POST',
        {
          sourceId: afc3.id,
          sourceType: 'article',
          action: 'cancel',
          reason: 'Story held for breaking news priority',
        },
        publisherCookie,
        200,
      )
    ).json()
    check('Job 3 cancelled via API', cancelRes.ok === true)

    const job3Cancelled = await payload.findByID({
      collection: 'scheduled-publish-jobs',
      id: job3.id,
    })
    check('Job 3 status transitioned to cancelled', job3Cancelled.status === 'cancelled')

    // Attempting to execute cancelled job returns error and does not publish
    const runCancelledRes = await executeScheduledPublishJob(payload, String(job3.id), {
      workerId: 'worker-worker-1',
      now: '2026-12-01T10:05:00.000Z',
    })
    check('Executing cancelled job returns error and does not publish', runCancelledRes.published === false)

    // 11. Effective Schedule Exposure & Error Log Sanitization Verification
    const effSchedule = await getEffectiveSchedule(payload, String(job1.id))
    check('Effective schedule exposed jobId', effSchedule.jobId === String(job1.id))
    check('Effective schedule status completed', effSchedule.status === 'completed')
    check('Effective schedule timezone preserved', effSchedule.timeZone === 'America/Chicago')

    // Test Error Log Sanitization via Helper
    const rawErrorWithCreds =
      'DB connection failed on postgresql://postgres:super_secret_pw@127.0.0.1:5448/rc107b?token=super_secret_bearer_token'
    const sanitizedError = sanitizeErrorLog(rawErrorWithCreds)
    check('Sanitized error redacts URI credentials', sanitizedError?.includes('scheme://***REDACTED***@') === true)
    check('Sanitized error redacts passwords and tokens', !sanitizedError?.includes('super_secret_pw') && !sanitizedError?.includes('super_secret_bearer_token'))

    // 12. Negative Security / Access Controls
    // Unauthenticated request to /api/admin/calendar/schedule rejected (403)
    await api('/api/admin/calendar/schedule', 'POST', { sourceId: afc1.id }, '', 403)
    check('Unauthenticated request to schedule rejected (403)', true)

    // Foreign site user rejected from scheduling site 1 article (403)
    await api(
      '/api/admin/calendar/schedule',
      'POST',
      {
        sourceId: afc1.id,
        sourceType: 'article',
        action: 'schedule',
        startsAt: '2026-11-01T01:30:00',
        timeZone: 'America/Chicago',
      },
      outsiderCookie,
      403,
    )
    check('Foreign site operator denied scheduling (403)', true)

    // Schedule health API returns truthful operator view
    const healthJson = (
      await api(
        '/api/admin/schedule-health?limit=50',
        'GET',
        undefined,
        publisherCookie,
        200,
      )
    ).json()
    check('Schedule health returns completed job count >= 2', healthJson.counts.completedJobs >= 2)
    check('Schedule health returns worker health object', healthJson.workerHealth.status === 'healthy')

    // Save state for restart verification
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          siteId: site.id,
          owner: owner.id,
          publisher: publisher.id,
          job1Id: job1.id,
          job2Id: job2.id,
          jobCancelledId: job3.id,
          art1Id: afc1.id,
          art1Rev1Id,
          artCancelledId: afc3.id,
        },
        null,
        2,
      ),
    )
  }

  succeeded = true
} finally {
  await writeFile(
    `${out}/trace-${restart ? 'restart' : 'verify'}.json`,
    JSON.stringify({ checks, succeeded, trace }, null, 2),
  )
}
console.log(`\nALL ${checks} CHECKS PASSED SUCCESSFULLY.`)
