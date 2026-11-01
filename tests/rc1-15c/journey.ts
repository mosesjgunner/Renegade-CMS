/* eslint-disable @typescript-eslint/no-explicit-any -- isolated PostgreSQL and browser acceptance */
import assert from 'node:assert/strict'
import { chromium, expect, type BrowserContext, type APIResponse } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5477/rc115c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/15C'
const base = 'http://localhost:39063'
const restart = process.argv.includes('restart')
const runKey = Date.now().toString(36)
const trace: any[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
const state: any = await readFile('scratch/rc115c/state.json', 'utf8')
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
const save = () => writeFile('scratch/rc115c/state.json', JSON.stringify(state))
try {
  await mkdir('scratch/rc115c', { recursive: true })
  if (!state.alpha) {
    for (const key of ['alpha', 'beta'])
      state[key] = (
        await payload.create({
          collection: 'sites',
          data: { name: `15C ${key}`, slug: `15c-${key}`, lifecycle: 'active' },
        })
      ).id
    for (const role of ['owner', 'staff', 'administrator']) {
      const user = await payload.create({
        collection: 'users',
        data: { email: `${role}@15c.test`, role },
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
        canonicalOriginsBySite: { [state.alpha]: base, [state.beta]: 'http://beta.15c.test' },
        privacy: {
          analyticsEnabled: true,
          consentVersion: '15c-v1',
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
        name: '15C contact',
        publicPath: '/forms/15c-contact',
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
        consentRevision: '15c-v1',
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
      '39063',
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

  const patch = async (path: string, data: any, expected = 200) => {
    const r = await fetch(base + path, {
      method: 'PATCH',
      headers: { cookie: owner, origin: base, 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    assert.equal(r.status, expected, await r.text())
  }
  const publicEvents = async () =>
    (await events()).docs.filter((e: any) => e.eventType.startsWith('experiment_'))
  browser = await chromium.launch({ headless: true })
  if (!restart) {
    await payload.updateGlobal({ slug: 'site-settings', data: { launchState: 'live' } })
    const template = (await import('../../src/modules/experiences/public-experiment'))
      .CANONICAL_PUBLIC_EXPERIMENT
    state.experiment = (
      await api(
        '/api/experiments',
        owner,
        {
          site: state.alpha,
          name: template.name,
          state: 'running',
          assignmentSalt: '15c-stable-salt',
          collectionEnabled: true,
          conversionForm: state.form,
        },
        201,
      )
    ).body.doc.id
    state.variants = []
    for (const [index, v] of template.variants.entries())
      state.variants.push(
        (
          await api(
            '/api/experiment-variants',
            owner,
            {
              site: state.alpha,
              experiment: state.experiment,
              name: v.name,
              isControl: index === 0,
              allocation: 50,
              registeredComponent: v.registeredComponent,
            },
            201,
          )
        ).body.doc.id,
      )
    check(
      'operator admin collection API creates persisted experiment, variants and configured form',
      Boolean(await payload.findByID({ collection: 'experiments', id: state.experiment })),
    )
    const decision = {
      siteId: state.alpha,
      experimentId: state.experiment,
      selectedVariantId: state.variants[1],
      reason: 'Local acceptance review, small sample acknowledged.',
    }
    await api('/api/admin/telemetry/experiment/winner', owner, decision, 409)
    check('configuration without measured outcome cannot approve winner', true)
    await api('/api/admin/telemetry/experiment/winner', foreign, decision, 403)
    await api('/api/admin/telemetry/experiment/winner', '', decision, 403)
    await api('/api/admin/telemetry/experiment/winner', owner, decision, 403, {
      origin: 'http://foreign.invalid',
    })
    await api(
      '/api/experiment-decisions',
      owner,
      {
        site: state.alpha,
        experiment: state.experiment,
        decision: 'winner-selected',
        reason: 'forgery',
        actor: state.owner,
        decidedAt: new Date().toISOString(),
      },
      403,
    )
    check('anonymous, wrong-site, foreign-origin and native decision forgery denied', true)
    const off = await browser.newContext()
    const offpage = await off.newPage()
    await offpage.goto(base, { timeout: 180000 })
    await expect(offpage.getByTestId('public-experiment-container')).toBeVisible({ timeout: 90000 })
    check(
      'consent-off public renderer shows persisted control',
      (await offpage.getByTestId('public-experiment-container').getAttribute('data-variant')) ===
        state.variants[0],
    )
    const offbody = {
      siteId: state.alpha,
      experimentId: state.experiment,
      variantId: state.variants[0],
    }
    await api('/api/experiences/exposure', '', offbody, 204)
    await offpage
      .locator('[data-testid="public-experiment-container"] input[name="email"]')
      .fill('privacy@15c.test')
    await offpage
      .getByTestId('public-experiment-container')
      .getByRole('button', { name: 'Submit', exact: true })
      .click()
    await expect(
      offpage.getByTestId('public-experiment-container').getByRole('status'),
    ).toContainText('submission was received', { timeout: 90000 })
    check(
      'consent-off actual form persists without experiment events',
      (await publicEvents()).length === 0 &&
        (
          await payload.find({
            collection: 'form-submissions',
            where: { form: { equals: state.form } },
          })
        ).totalDocs === 1,
    )
    await off.close()
    const seen = new Set<string>()
    for (let i = 0; i < 20 && seen.size < 2; i++) {
      const context: BrowserContext = await browser.newContext({
        userAgent: 'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36',
      })
      const consentResponse: APIResponse = await context.request.post(
        base + '/api/analytics/consent',
        {
          data: {
            siteId: state.alpha,
            choices: { necessary: true, analytics: true, personalization: true, marketing: false },
          },
          headers: { origin: base },
        },
      )
      assert.equal(consentResponse.status(), 200)
      const active = await (
        await context.request.get(base + `/api/experiences/active?siteId=${state.alpha}`)
      ).json()
      if (seen.has(active.assignedVariant.id)) {
        await context.close()
        continue
      }
      const variant = active.assignedVariant.id
      const page = await context.newPage()
      await page.goto(base, { timeout: 180000 })
      await expect(page.getByTestId('public-experiment-container')).toHaveAttribute(
        'data-variant',
        variant,
        { timeout: 90000 },
      )
      await expect
        .poll(
          async () =>
            (await publicEvents()).filter(
              (e: any) =>
                e.eventType === 'experiment_exposure' && e.properties.variantId === variant,
            ).length,
          { timeout: 120000 },
        )
        .toBe(1)
      check('visitor sees server assigned public variant with persisted exposure ' + variant, true)
      await page.reload()
      await expect(page.getByTestId('public-experiment-container')).toHaveAttribute(
        'data-variant',
        variant,
      )
      const cookies = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
      const claim = { siteId: state.alpha, experimentId: state.experiment, variantId: variant }
      await api('/api/experiences/exposure', cookies, claim, 202)
      await api(
        '/api/experiences/exposure',
        cookies,
        { ...claim, variantId: state.variants.find((v: string) => v !== variant) },
        404,
      )
      await api('/api/experiences/exposure', cookies, { ...claim, siteId: state.beta }, 404)
      check(
        'stable reload, duplicate exposure and forged variant/site claims preserve one exposure',
        (await publicEvents()).filter(
          (e: any) => e.eventType === 'experiment_exposure' && e.properties.variantId === variant,
        ).length === 1,
      )
      await page
        .locator('[data-testid="public-experiment-container"] input[name="email"]')
        .fill(`visitor-${i}@15c.test`)
      await page
        .getByTestId('public-experiment-container')
        .getByRole('button', { name: 'Submit', exact: true })
        .click()
      await expect(
        page.getByTestId('public-experiment-container').getByRole('status'),
      ).toContainText('submission was received', { timeout: 90000 })
      await expect
        .poll(
          async () =>
            (await publicEvents()).filter(
              (e: any) =>
                e.eventType === 'experiment_conversion' && e.properties.variantId === variant,
            ).length,
          { timeout: 120000 },
        )
        .toBe(1)
      const conversion = (await publicEvents()).find(
        (e: any) => e.eventType === 'experiment_conversion' && e.properties.variantId === variant,
      )
      await api(
        '/api/experiences/conversion',
        cookies,
        { ...claim, submissionId: conversion.properties.canonicalOutcomeId },
        202,
      )
      check(
        'actual UI form outcome produces one attributed conversion; retry adds none',
        Boolean(
          await payload.findByID({
            collection: 'form-submissions',
            id: conversion.properties.canonicalOutcomeId,
          }),
        ),
      )
      state.cookies = cookies
      state.lastVariant = variant
      seen.add(variant)
      await context.close()
    }
    check('both public variants observed and measured', seen.size === 2)
    await patch(`/api/experiment-variants/${state.variants[0]}`, { allocation: 100 }, 400)
    await patch(`/api/experiments/${state.experiment}`, { assignmentSalt: 'mutated-salt' }, 400)
    check(
      'measured variant allocation and assignment salt cannot change',
      (await payload.findByID({ collection: 'experiments', id: state.experiment }))
        .assignmentSalt === '15c-stable-salt',
    )
    const unexposed = await api('/api/analytics/consent', '', {
      siteId: state.alpha,
      choices: { necessary: true, analytics: true, personalization: true, marketing: false },
    })
    const fresh = (await api(`/api/experiences/active?siteId=${state.alpha}`, unexposed.cookie))
      .body
    await api(
      '/api/experiences/conversion',
      unexposed.cookie,
      {
        siteId: state.alpha,
        experimentId: state.experiment,
        variantId: fresh.assignedVariant.id,
        submissionId: crypto.randomUUID(),
      },
      409,
    )
    check(
      'conversion without prior exposure is rejected',
      (await publicEvents()).filter((event: any) => event.eventType === 'experiment_conversion')
        .length === 2,
    )

    await api(
      '/api/experiment-events',
      owner,
      {
        site: state.alpha,
        experiment: state.experiment,
        variant: state.variants[0],
        kind: 'conversion',
        dedupeKey: 'forged',
        occurredAt: new Date().toISOString(),
        consentBasis: 'analytics-consent',
      },
      403,
    )
    check('native experiment evidence forgery denied', (await publicEvents()).length === 4)
    const otherOutcome = (await publicEvents()).find(
      (event: any) =>
        event.eventType === 'experiment_conversion' &&
        event.properties.variantId !== state.lastVariant,
    )
    await api(
      '/api/experiences/conversion',
      state.cookies,
      {
        siteId: state.alpha,
        experimentId: state.experiment,
        variantId: state.lastVariant,
        submissionId: otherOutcome.properties.canonicalOutcomeId,
      },
      404,
    )
    await patch(`/api/experiments/${state.experiment}`, { state: 'winner-selected' }, 400)
    check(
      'foreign-subject outcome and native winner state forgery denied',
      (await payload.findByID({ collection: 'experiments', id: state.experiment })).state ===
        'running',
    )
    const dashboard = (await api(`/api/admin/telemetry/dashboard?siteId=${state.alpha}`, owner))
      .body
    check(
      'operator results reconcile actual two exposures and two outcomes',
      dashboard.experiment.variantStats.every((v: any) => v.exposures === 1 && v.conversions === 1),
    )
    const admin = await browser.newContext()
    await admin.addCookies([
      { name: 'renegade-passkey', value: owner.split('=').slice(1).join('='), url: base },
    ])
    const page = await admin.newPage()
    await page.goto(base + '/admin/telemetry', { timeout: 180000 })
    await page.getByRole('button', { name: 'Reject non-essential', exact: true }).click()
    await page.getByLabel('Select Site').selectOption(state.alpha)
    await page.getByRole('button', { name: 'Public Experiment & Winner Approval' }).click()
    await expect(page.getByText('Human Winner Approval Workflow', { exact: true })).toBeVisible({
      timeout: 90000,
    })
    await page
      .locator('textarea')
      .last()
      .fill('Observed local outcomes; tiny sample is not statistical certainty.')
    await page.getByRole('button', { name: 'Approve Winner', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Roll back winner to control' })).toBeVisible({
      timeout: 120000,
    })
    check(
      'human reviews results and approves via actual admin UI',
      (await payload.findByID({ collection: 'experiments', id: state.experiment })).state ===
        'winner-selected',
    )
    await page
      .locator('textarea')
      .last()
      .fill('Rollback acceptance: return control and pause collection.')
    await page.getByRole('button', { name: 'Roll back winner to control' }).click()
    await expect(page.getByText('Human Winner Approval Workflow', { exact: true })).toBeVisible({
      timeout: 120000,
    })
    check(
      'human rollback restores persisted paused state',
      (await payload.findByID({ collection: 'experiments', id: state.experiment })).state ===
        'paused',
    )
    const rolled = (await api(`/api/experiences/active?siteId=${state.alpha}`, state.cookies)).body
    check(
      'rollback removes enforced winner from public output',
      rolled.assignedVariant.id === state.variants[0] && rolled.experiment.winnerDecision === null,
    )
    await patch(`/api/experiments/${state.experiment}`, { state: 'running' })
    await api('/api/admin/telemetry/experiment/winner', owner, {
      ...decision,
      selectedVariantId: state.lastVariant,
    })
    const decisions = await payload.find({
      collection: 'experiment-decisions',
      where: { experiment: { equals: state.experiment } },
      pagination: false,
      limit: 0,
      depth: 0,
    })
    check(
      'approval and rollback audit retains human actor and reasons',
      decisions.docs.length === 3 &&
        decisions.docs.every(
          (row: any) => String(row.actor) === state.owner && row.reason && row.approvedAt,
        ),
    )
    state.count = (await publicEvents()).length
    await save()
    await admin.close()
  } else {
    const active = (await api(`/api/experiences/active?siteId=${state.alpha}`, state.cookies)).body
    check(
      'PostgreSQL/web restart preserves human winner and public output',
      active.experiment.state === 'winner-selected' &&
        active.assignedVariant.id === state.lastVariant,
    )
    check('restart preserves exact measured events', (await publicEvents()).length === state.count)
    const restartedPage = await browser.newPage()
    await restartedPage.goto(base, { timeout: 180000 })
    await expect(restartedPage.getByTestId('public-experiment-container')).toHaveAttribute(
      'data-variant',
      state.lastVariant,
      { timeout: 90000 },
    )
    check('fresh anonymous browser renders persisted approved winner after restart', true)

    await api(
      '/api/experiences/exposure',
      state.cookies,
      { siteId: state.alpha, experimentId: state.experiment, variantId: state.lastVariant },
      404,
    )
    check(
      'winner state stops experiment event collection',
      (await publicEvents()).length === state.count,
    )
    await api('/api/admin/telemetry/experiment/winner', owner, {
      action: 'rollback',
      siteId: state.alpha,
      experimentId: state.experiment,
      selectedVariantId: state.lastVariant,
      reason: 'Restart rollback proof.',
    })
    check(
      'supported rollback works after restart',
      (await api(`/api/experiences/active?siteId=${state.alpha}`, state.cookies)).body
        .assignedVariant.id === state.variants[0],
    )
    await api(
      '/api/admin/telemetry/experiment/winner',
      foreign,
      {
        action: 'rollback',
        siteId: state.alpha,
        experimentId: state.experiment,
        selectedVariantId: state.lastVariant,
        reason: 'forged',
      },
      403,
    )
    check('wrong-site decision remains denied after restart', true)
    await patch(`/api/experiments/${state.experiment}`, { state: 'running' })
    const resumed = (await api(`/api/experiences/active?siteId=${state.alpha}`, state.cookies)).body
    check(
      'resumed experiment retains original visitor assignment after restart',
      resumed.assignedVariant.id === state.lastVariant,
    )
    await api(
      '/api/experiences/exposure',
      state.cookies,
      { siteId: state.alpha, experimentId: state.experiment, variantId: state.lastVariant },
      202,
    )
    check(
      'post-restart exposure retry preserves exact event count',
      (await publicEvents()).length === state.count,
    )
    await patch(`/api/experiments/${state.experiment}`, { state: 'paused' })
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
