/* eslint-disable @typescript-eslint/no-explicit-any -- isolated PostgreSQL and browser acceptance */
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { analyticsSubjectHash, readConsent } from '../../src/modules/analytics/privacy'
import { analyticsRetentionTask } from '../../src/modules/analytics/tasks'
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5475/rc115a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/15A'
const base = 'http://localhost:39061'
const restart = process.argv.includes('restart')
const runKey = Date.now().toString(36)
const trace: any[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
const state: any = await readFile('scratch/rc115a/state.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
let web: ChildProcess | undefined
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
async function session(id: string) {
  const user = await payload.findByID({ collection: 'users', id })
  const value = await createPasskeySession(
    user,
    process.env.PAYLOAD_SECRET!,
    async (sid, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sid, id, expires],
      )
    },
  )
  return `renegade-passkey=${value.token}`
}
async function api(
  path: string,
  cookie = '',
  data?: any,
  expected: number | number[] = 200,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${base}${path}`, {
    method: data ? 'POST' : 'GET',
    headers: {
      cookie,
      origin: base,
      'content-type': 'application/json',
      'user-agent': 'RC1 ordinary API browser',
      ...headers,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  const text = await response.text()
  assert.ok(
    (Array.isArray(expected) ? expected : [expected]).includes(response.status),
    `${path} ${response.status}: ${text.slice(0, 500)}`,
  )
  return {
    body: text ? JSON.parse(text) : null,
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie,
  }
}
const events = () =>
  payload.find({
    collection: 'analytics-events',
    where: { site: { equals: state.alpha } },
    limit: 100,
    depth: 0,
  })
const save = () => writeFile('scratch/rc115a/state.json', JSON.stringify(state))
try {
  await mkdir('scratch/rc115a', { recursive: true })
  if (!state.alpha) {
    for (const key of ['alpha', 'beta'])
      state[key] = (
        await payload.create({
          collection: 'sites',
          data: { name: `15A ${key}`, slug: `15a-${key}`, lifecycle: 'active' },
        })
      ).id
    for (const role of ['owner', 'staff', 'administrator']) {
      const user = await payload.create({
        collection: 'users',
        data: { email: `${role}@15a.test`, role },
      })
      state[role] = user.id
      await payload.create({
        collection: 'member-site-roles',
        data: {
          member: typeof user.member === 'object' ? user.member.id : user.member,
          site: role === 'administrator' ? state.beta : state.alpha,
          role: 'contributor',
        },
      })
    }
    const ownerRow = await payload.findByID({ collection: 'users', id: state.owner })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof ownerRow.member === 'object' ? ownerRow.member.id : ownerRow.member,
        site: state.beta,
        role: 'contributor',
      },
    })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [state.alpha]: base, [state.beta]: 'http://beta.15a.test' },
        privacy: {
          analyticsEnabled: true,
          consentVersion: '15a-v1',
          respectDoNotTrack: true,
          respectGlobalPrivacyControl: true,
          rawEventRetentionDays: 90,
          rollupRetentionDays: 730,
        },
      },
    })
    const form = await payload.create({
      collection: 'form-definitions',
      data: {
        site: state.alpha,
        name: '15A contact',
        publicPath: '/forms/15a-contact',
        visibility: 'public',
        actions: [],
      },
    })
    const schema = await payload.create({
      collection: 'form-schemas',
      data: {
        form: form.id,
        version: 1,
        state: 'published',
        locale: 'en',
        consentText: 'Contact me about this request.',
        consentRevision: '15a-v1',
        schema: { fields: [{ key: 'email', type: 'email', label: 'Email', required: true }] },
      },
    })
    await payload.update({
      collection: 'form-definitions',
      id: form.id,
      data: { activeSchema: schema.id },
    })
    state.form = form.id
    await save()
  }
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39061',
    ],
    {
      env: { ...process.env, NODE_ENV: 'development' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const log = createWriteStream(`${out}/${restart ? 'restart-' : ''}web.log`)
  web.stdout!.pipe(log)
  web.stderr!.pipe(log)
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const r = await fetch(`${base}/api/analytics/consent`, { signal: AbortSignal.timeout(5000) })
      if (r.status === 200) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  check('Next product API booted with test routes and test auth disabled', ready)
  const owner = await session(state.owner)
  const staff = await session(state.staff)
  const foreign = await session(state.administrator)
  if (!restart) {
    const observation = {
      siteId: state.alpha,
      id: 'anonymous-view',
      eventType: 'page_view',
      path: '/events',
    }
    const rejected = await api('/api/analytics/collect', '', observation, 202)
    check(
      'unconsented anonymous browsing rejected with inspectable reason',
      rejected.body.reason === 'consent-required' && (await events()).totalDocs === 0,
    )
    const anonForm = await api(
      `/api/forms/${state.form}`,
      '',
      {
        values: { email: 'anonymous@15a.test' },
        idempotencyKey: `15a-anonymous-form-0001-${runKey}`,
      },
      201,
    )
    check(
      'anonymous real form conversion persists without analytics identity or event',
      Boolean(anonForm.body.submissionId) && (await events()).totalDocs === 0,
    )
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()
    const beaconResponses: number[] = []
    page.on('response', (r) => {
      if (r.url().includes('/api/analytics/collect')) beaconResponses.push(r.status())
    })
    await page.goto(`${base}/events`, { timeout: 180000 })
    await expect(page.getByRole('region', { name: 'Privacy choices' })).toBeVisible({
      timeout: 90000,
    })
    check(
      'anonymous browser shows consent choices and emits no beacon or identifier',
      beaconResponses.length === 0 &&
        !(await context.cookies()).some((c) => c.name === 'renegade-aid'),
    )
    await page.route('**/api/analytics/consent', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        : route.continue(),
    )
    await page.getByLabel('Analytics', { exact: true }).check()
    await page.getByRole('button', { name: 'Save choices', exact: true }).click()
    await expect(
      page.getByRole('region', { name: 'Privacy choices' }).getByRole('alert'),
    ).toContainText('could not be saved')
    check(
      'failed consent save stays visibly unsaved and emits no analytics',
      beaconResponses.length === 0 &&
        !(await context.cookies()).some((c) => c.name === 'renegade-aid'),
    )
    await page.unroute('**/api/analytics/consent')
    await page.getByRole('button', { name: 'Save choices', exact: true }).click()
    await expect.poll(() => beaconResponses.includes(201), { timeout: 90000 }).toBe(true)
    state.oldConsent = (await context.cookies())
      .filter((c) => c.name === 'renegade-consent')
      .map((c) => `${c.name}=${c.value}`)
      .join(';')
    check(
      'ordinary opted-in browser page view reaches PostgreSQL',
      (await events()).docs.some(
        (e: any) => e.eventType === 'page_view' && e.context.path === '/events',
      ),
    )
    const conversion = await api(
      `/api/forms/${state.form}`,
      state.oldConsent,
      {
        values: { email: 'consented@15a.test' },
        idempotencyKey: `15a-consented-form-0001-${runKey}`,
      },
      201,
    )
    state.submission = conversion.body.submissionId
    check(
      'opted-in conversion has persisted canonical form outcome',
      (await payload.findByID({ collection: 'form-submissions', id: state.submission })).values
        .email === 'consented@15a.test',
    )
    const converted = (await events()).docs.find((e: any) => e.eventType === 'form_submit')
    check(
      'conversion provenance resolves exact saved submission and shares consent identity',
      converted?.properties.canonicalOutcomeId === state.submission &&
        converted.trusted &&
        converted.anonymousHash ===
          (await events()).docs.find((e: any) => e.eventType === 'page_view').anonymousHash,
    )
    await api(
      `/api/forms/${state.form}`,
      state.oldConsent,
      {
        values: { email: 'consented@15a.test' },
        idempotencyKey: `15a-consented-form-0001-${runKey}`,
      },
      200,
    )
    check(
      'canonical form retry does not inflate conversion count',
      (await events()).docs.filter((e: any) => e.eventType === 'form_submit').length === 1,
    )
    const experiment = await payload.create({
      collection: 'experiments',
      data: {
        site: state.alpha,
        name: `15A ${runKey}`,
        state: 'running',
        assignmentSalt: '15a-local-fixture',
        collectionEnabled: true,
      },
    })
    const variant = await payload.create({
      collection: 'experiment-variants',
      data: {
        site: state.alpha,
        experiment: experiment.id,
        name: 'control',
        allocation: 100,
        isControl: true,
        registeredComponent: 'publisher.cta',
      },
    })
    const experimentInput = {
      siteId: state.alpha,
      experimentId: experiment.id,
      variantId: variant.id,
    }
    await api('/api/experiences/exposure', state.oldConsent, experimentInput, 201)
    await api('/api/experiences/exposure', state.oldConsent, experimentInput, 202)
    check(
      'experiment exposure retry has one canonical analytics record',
      (await events()).docs.filter((e: any) => e.eventType === 'experiment_exposure').length === 1,
    )
    await api('/api/experiences/conversion', state.oldConsent, experimentInput, 400)
    await api(
      '/api/experiences/conversion',
      state.oldConsent,
      { ...experimentInput, submissionId: anonForm.body.submissionId },
      404,
    )
    check('unproven or unrelated experiment conversion denied', true)
    await api(
      '/api/experiences/conversion',
      state.oldConsent,
      { ...experimentInput, submissionId: state.submission },
      201,
    )
    await api(
      '/api/experiences/conversion',
      state.oldConsent,
      { ...experimentInput, submissionId: state.submission },
      202,
    )
    check(
      'experiment conversion requires consent-linked canonical form outcome and deduplicates',
      (await events()).docs.filter((e: any) => e.eventType === 'experiment_conversion').length ===
        1,
    )
    await api(
      '/api/experiences/exposure',
      state.oldConsent,
      { ...experimentInput, siteId: state.beta },
      404,
    )
    check('cross-site experiment event cannot leak or inflate data', true)
    await api(
      '/api/analytics-events',
      owner,
      { site: state.alpha, eventId: 'forged', eventType: 'payment_completed' },
      403,
    )
    await api(
      '/api/analytics-consent-records',
      owner,
      { site: state.alpha, subjectHash: 'forged' },
      403,
    )
    check('native operator mutation cannot forge analytics or consent evidence', true)
    const retry = {
      ...observation,
      id: 'concurrent-retry',
      path: '/events?email=private#fragment',
      anonymousId: 'forged-other-visitor',
    }
    const duplicates = await Promise.all(
      Array.from({ length: 5 }, () =>
        api('/api/analytics/collect', state.oldConsent, retry, [201, 202]),
      ),
    )
    // Concurrent responses may be 201 or 202; inspect directly below instead of fixed response status.
    check(
      'concurrent duplicate creates one persisted event',
      (await events()).docs.filter((e: any) => e.context.sourceEventId === 'concurrent-retry')
        .length === 1,
    )
    const stored = (await events()).docs.find(
      (e: any) => e.context.sourceEventId === 'concurrent-retry',
    )
    await api(`/api/analytics-events/${stored.id}`, foreign, undefined, 404)
    check('native wrong-site lookup conceals event provenance', true)
    check(
      'path query and fragment discarded and caller identity ignored',
      stored.context.path === '/events' && stored.anonymousHash === converted.anonymousHash,
    )
    check(
      'every concurrent duplicate returns a successful deduplication outcome',
      duplicates.filter((r) => r.body.accepted).length === 1 &&
        duplicates.filter((r) => r.body.deduplicated).length === 4,
    )
    for (const headers of [
      { DNT: '1' },
      { 'sec-gpc': '1' },
      { 'user-agent': 'Googlebot' },
      { 'x-renegade-internal': '1' },
    ]) {
      const r = await api(
        '/api/analytics/collect',
        state.oldConsent,
        { ...retry, id: crypto.randomUUID() },
        202,
        Object.fromEntries(
          Object.entries(headers).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        ),
      )
      check(`privacy or bot exclusion ${JSON.stringify(headers)}`, r.body.accepted === false)
    }
    await api(
      '/api/analytics/collect',
      `${state.oldConsent}; ${owner}`,
      { ...retry, id: 'internal-operator' },
      202,
    )
    check(
      'authenticated operator activity excluded from audience events',
      !(await events()).docs.some((e: any) => e.context.sourceEventId === 'internal-operator'),
    )
    await api('/api/analytics/collect', state.oldConsent, { ...retry, siteId: state.beta }, 404)
    check(
      'wrong-site event rejected without foreign-site records',
      (
        await payload.find({
          collection: 'analytics-events',
          where: { site: { equals: state.beta } },
        })
      ).totalDocs === 0,
    )
    await api(
      '/api/analytics/collect',
      state.oldConsent,
      { ...retry, eventType: 'payment_completed' },
      400,
    )
    await api(
      '/api/analytics/collect',
      state.oldConsent,
      { ...retry, eventType: 'form_submit' },
      400,
    )
    check(
      'browser cannot manufacture paid or form conversion events',
      (await events()).docs.filter((e: any) => e.eventType === 'form_submit').length === 1,
    )
    await api(
      '/api/analytics/collect',
      state.oldConsent,
      { ...retry, id: 'bad-time', occurredAt: '2020-01-01T00:00:00Z' },
      400,
    )
    await api('/api/analytics/collect', state.oldConsent, retry, 403, {
      origin: 'https://evil.test',
    })
    check('late-event and foreign-origin inputs rejected', true)
    await api(`/api/analytics/report?siteId=${state.alpha}`, '', undefined, 403)
    await api(`/api/analytics/report?siteId=${state.alpha}`, foreign, undefined, 403)
    check('anonymous and wrong-site operator report denied', true)
    const report = await api(`/api/analytics/report?siteId=${state.alpha}`, staff)
    check(
      'authorized operator sees exact persisted count and provenance',
      report.body.eventCount === (await events()).totalDocs &&
        report.body.recentEvents.some(
          (e: any) => e.provenance?.canonicalOutcomeId === state.submission,
        ),
    )
    await payload.create({
      collection: 'analytics-rollups',
      data: {
        site: state.alpha,
        metric: 'page_view',
        definition: 'Disposable stale aggregate',
        grain: 'daily',
        windowStart: new Date().toISOString(),
        windowEnd: new Date().toISOString(),
        value: '99',
      },
    })
    await page.getByRole('button', { name: 'Privacy choices', exact: true }).click()
    await page.getByRole('button', { name: 'Reject non-essential', exact: true }).click()
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name === 'renegade-aid'), {
        timeout: 90000,
      })
      .toBe(false)
    await expect(page.getByRole('button', { name: 'Privacy choices', exact: true })).toBeVisible({
      timeout: 90000,
    })
    await expect.poll(async () => (await events()).totalDocs, { timeout: 90000 }).toBe(0)
    check(
      'UI withdrawal removes identifiers and linked raw events',
      (await events()).totalDocs === 0,
    )
    check(
      'withdrawal invalidates derived site aggregates but preserves canonical form outcome',
      (
        await payload.find({
          collection: 'analytics-rollups',
          where: { site: { equals: state.alpha } },
        })
      ).totalDocs === 0 &&
        Boolean(await payload.findByID({ collection: 'form-submissions', id: state.submission })),
    )
    await api(
      '/api/analytics/collect',
      state.oldConsent,
      { ...retry, id: 'old-cookie-replay' },
      202,
    )
    check('signed pre-withdrawal cookie cannot restore tracking', (await events()).totalDocs === 0)
    const returned = await api('/api/analytics/consent', state.oldConsent)
    check(
      'returning stale cookie receives withdrawn choices',
      returned.body.choices.analytics === false,
    )
    const finalReport = await api(`/api/analytics/report?siteId=${state.alpha}`, owner)
    check(
      'withdrawn event count and provenance absent from operator report',
      finalReport.body.eventCount === 0 && finalReport.body.recentEvents.length === 0,
    )
    const funnel = await api(`/api/admin/telemetry/funnel?siteId=${state.alpha}`, owner)
    check(
      'funnel returns observed empty counts and unknown attribution',
      funnel.body.funnelSteps.every((s: any) => s.eventsCount === 0) &&
        funnel.body.attributionComparison.firstTouch === null,
    )
    const fresh = await api('/api/analytics/consent', '', {
      siteId: state.alpha,
      choices: { analytics: true },
    })
    state.activeConsent = fresh.cookie
    state.activeEvent = {
      siteId: state.alpha,
      id: 'restart-stable',
      eventType: 'page_view',
      path: '/events',
    }
    await api('/api/analytics/collect', state.activeConsent, state.activeEvent, 201)
    state.activeHash = analyticsSubjectHash(
      readConsent(state.activeConsent, process.env.PAYLOAD_SECRET!)!,
      state.alpha,
      process.env.PAYLOAD_SECRET!,
    )
    // Expired fixture is created through the canonical store, never by flipping status rows.
    const { PayloadAnalyticsEventStore } = await import('../../src/modules/analytics/service')
    const now = new Date().toISOString()
    await new PayloadAnalyticsEventStore(payload).record(
      {
        id: 'expired-retention',
        eventType: 'page_view',
        occurredAt: now,
        receivedAt: now,
        identity: {},
        context: { siteId: state.alpha },
        consentBasis: 'analytics-consent',
        schemaVersion: 1,
        trusted: false,
        dedupeKey: '',
      },
      0,
    )
    check(
      'expired raw event excluded from supported report before worker cleanup',
      (await api(`/api/analytics/report?siteId=${state.alpha}`, owner)).body.eventCount === 1,
    )
    const task: any = analyticsRetentionTask.handler
    const cleaned = await task({ req: { payload } })
    check(
      'retention worker deletes only expired raw event',
      cleaned.output.deleted === 1 && (await events()).totalDocs === 1,
    )
    await api('/api/globals/site-settings', staff, { privacy: { analyticsEnabled: false } }, 403)
    check('one-site operator cannot disable installation-wide analytics', true)
    await api('/api/globals/site-settings', owner, { privacy: { analyticsEnabled: false } })
    check(
      'operator analytics-off setting removes existing events from reporting',
      (await api(`/api/analytics/report?siteId=${state.alpha}`, owner)).body.eventCount === 0,
    )
    await api(
      '/api/analytics/collect',
      state.activeConsent,
      { ...state.activeEvent, id: 'policy-disabled' },
      202,
    )
    check('operator analytics-off setting blocks new collection', (await events()).totalDocs === 1)
    await api('/api/globals/site-settings', owner, {
      privacy: { analyticsEnabled: true, consentVersion: '15a-v2' },
    })
    await api(
      '/api/analytics/collect',
      state.activeConsent,
      { ...state.activeEvent, id: 'stale-version' },
      202,
    )
    check(
      'new policy version makes old grants ineligible for collection and reporting',
      (await api(`/api/analytics/report?siteId=${state.alpha}`, owner)).body.eventCount === 0 &&
        (await events()).totalDocs === 1,
    )
    await api('/api/globals/site-settings', owner, { privacy: { consentVersion: '15a-v1' } })
    await save()
    await browser.close()
    browser = undefined
  } else {
    check(
      'PostgreSQL restart retains only nonwithdrawn event',
      (await events()).totalDocs === 1 &&
        (await events()).docs[0].anonymousHash === state.activeHash,
    )
    await api('/api/analytics/collect', state.activeConsent, state.activeEvent, 202)
    check(
      'duplicate retry after web and database restart adds no event',
      (await events()).totalDocs === 1,
    )
    await api(
      '/api/analytics/collect',
      state.oldConsent,
      { ...state.activeEvent, id: 'withdrawn-after-restart' },
      202,
    )
    check('persisted withdrawal blocks old cookie after restart', (await events()).totalDocs === 1)
    check(
      'canonical opted-in form submission survives withdrawal and restart',
      Boolean(await payload.findByID({ collection: 'form-submissions', id: state.submission })),
    )
    const report = await api(`/api/analytics/report?siteId=${state.alpha}`, staff)
    check(
      'authorized report reconciles exact retained event count after restart',
      report.body.eventCount === 1,
    )
    await api(`/api/analytics/report?siteId=${state.alpha}`, foreign, undefined, 403)
    check('foreign operator remains denied after restart', true)
  }
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify({ passed: trace.length, failed: 0, skipped: 0, trace }, null, 2),
  )
} finally {
  await browser?.close()
  if (web?.pid)
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(web!.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('exit', () => resolve())
    })
  const pool = payload.db.pool
  const idle = new Set(pool._idle.map((entry: any) => entry.client))
  for (const client of [...pool._clients]) {
    if (!idle.has(client)) {
      assert.ok(!client.activeQuery, 'No active database work during teardown')
      client.release(true)
    }
  }
  await pool.end()
  await payload.destroy()
}
