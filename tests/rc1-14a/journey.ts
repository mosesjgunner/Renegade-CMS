/* eslint-disable @typescript-eslint/no-explicit-any -- isolated acceptance harness */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { connectionCredential } from '../../src/modules/ai/connections'

assert.equal(process.env.RC1_14A_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5471/rc114a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const out = 'docs/rc/evidence/rc1/18-pass/14A'
const base = 'http://localhost:39037'
const endpoint = 'http://127.0.0.1:39038'
const restart = process.argv.includes('restart')
const resume = process.argv.includes('resume')
const trace: string[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}
const payload: any = await getPayload({ config })
let web: ChildProcess | undefined
const browser = await chromium.launch({ headless: true })
let mode = 'healthy'
let calls = 0
let authRejections = 0
const state: any = restart
  ? JSON.parse(await readFile('scratch/rc114a/state.json', 'utf8'))
  : { secret: `adapter-${randomUUID()}` }
// Local protocol harness only: not a running Ollama engine or model-quality proof.
const provider = createServer(async (req, res) => {
  calls++
  res.setHeader('Content-Type', 'application/json')
  if (req.headers.authorization !== `Bearer ${state.secret}`) {
    authRejections++
    res
      .writeHead(401)
      .end(JSON.stringify({ error: `Rejected credential ${req.headers.authorization}` }))
    return
  }
  if (mode === 'down') {
    res.writeHead(503).end(JSON.stringify({ error: `upstream ${state.secret}` }))
    return
  }
  if (req.url === '/api/tags') {
    res.end(JSON.stringify({ models: [{ name: '14a-model' }] }))
    return
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw)
  assert.equal(req.url, '/api/generate')
  assert.equal(body.stream, false)
  res.end(
    JSON.stringify({
      response:
        body.format === 'json'
          ? mode === 'text-only'
            ? 'plain text'
            : '{"ok":true}'
          : 'Local adapter proposal',
      prompt_eval_count: 5,
      eval_count: 4,
    }),
  )
})
await new Promise<void>((r) => provider.listen(39038, '127.0.0.1', r))
const row = (id: string) =>
  payload.findByID({ collection: 'ai-connections', id, depth: 0, overrideAccess: true })
const credentials = (id: string) =>
  payload.find({
    collection: 'ai-credentials',
    where: { connection: { equals: id } },
    depth: 0,
    overrideAccess: true,
  })
async function api(cookie: string, method = 'GET', data?: any, expected = 200, query = '') {
  const response = await fetch(`${base}/api/admin/ai/connections${query}`, {
    method,
    headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(180000),
  })
  const text = await response.text()
  assert.equal(response.status, expected, `${method} ${response.status}: ${text.slice(0, 500)}`)
  assert.ok(!text.includes(state.secret), 'API secret redaction')
  return JSON.parse(text)
}
async function session(user: any) {
  const value = await createPasskeySession(
    user,
    process.env.PAYLOAD_SECRET!,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  return `renegade-passkey=${value.token}`
}
async function stopWeb() {
  if (!web?.pid) return
  await new Promise<void>((r) => {
    const p = spawn('taskkill', ['/pid', String(web!.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    p.on('exit', () => r())
  })
  web = undefined
}
try {
  if (resume) {
    const one = async (collection: string, field: string, value: string) => {
      const result = await payload.find({
        collection,
        where: { [field]: { equals: value } },
        limit: 1,
        overrideAccess: true,
      })
      assert.equal(result.totalDocs, 1)
      return result.docs[0].id
    }
    state.alpha = await one('sites', 'slug', 'alpha14a')
    state.beta = await one('sites', 'slug', 'beta14a')
    for (const role of ['owner', 'administrator', 'staff'])
      state[role] = await one('users', 'email', `${role}@14a.test`)
    state.betaAdmin = await one('users', 'email', 'beta-admin@14a.test')
  } else if (!restart) {
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '14A Alpha', slug: 'alpha14a', lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '14A Beta', slug: 'beta14a', lifecycle: 'active' },
    })
    state.alpha = alpha.id
    state.beta = beta.id
    for (const role of ['owner', 'administrator', 'staff']) {
      const user = await payload.create({
        collection: 'users',
        data: { email: `${role}@14a.test`, role },
      })
      await payload.create({
        collection: 'member-site-roles',
        data: {
          member: String(user.member?.id ?? user.member),
          site: alpha.id,
          role: 'contributor',
        },
      })
      state[role] = user.id
    }
    const betaAdmin = await payload.create({
      collection: 'users',
      data: { email: 'beta-admin@14a.test', role: 'administrator' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: String(betaAdmin.member?.id ?? betaAdmin.member),
        site: beta.id,
        role: 'contributor',
      },
    })
    state.betaAdmin = betaAdmin.id
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: 'http://127.0.0.1:39037' },
        launchState: 'live',
      },
    })
  }
  const owner = await session(await payload.findByID({ collection: 'users', id: state.owner }))
  const admin = await session(
    await payload.findByID({ collection: 'users', id: state.administrator }),
  )
  const staff = await session(await payload.findByID({ collection: 'users', id: state.staff }))
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39037',
    ],
    { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${restart ? 'restart-' : ''}web.log`)
  web.stdout!.pipe(log, { end: false })
  web.stderr!.pipe(log, { end: false })
  const deadline = Date.now() + 240000
  let ready = false
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/api/admin/ai/sites`)).status < 500) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  assert.ok(ready, 'web readiness')
  const ctx = await browser.newContext()
  ctx.setDefaultTimeout(90000)
  await ctx.addCookies([{ name: 'renegade-passkey', value: owner.split('=')[1], url: base }])
  const page = await ctx.newPage()
  await page.goto(`${base}/admin/ai`, { timeout: 180000 })
  const health = page.getByRole('region', { name: 'Connection health' })
  if (!restart) {
    await health.getByText('No provider configured.', { exact: false }).waitFor()
    check('owner UI shows safe no-provider state', true)
    await page.getByLabel('Adapter', { exact: true }).selectOption('ai.ollama')
    for (const [name, value] of Object.entries({
      label: '14A owner local adapter',
      endpoint,
      model: '14a-model',
      apiKey: state.secret,
    }))
      await page.getByLabel(name, { exact: true }).fill(String(value))
    await page.getByRole('button', { name: 'Discover models', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Advertised models: 14a-model' }).waitFor()
    check(
      'ordinary discovery advertises model without persisting or inventing capabilities',
      (await api(owner, 'GET', undefined, 200, `?siteId=${state.alpha}`)).connections.length === 0,
    )
    await page.getByRole('button', { name: 'Save and test connection' }).click()
    await page.getByRole('status').filter({ hasText: 'Connection saved as active' }).waitFor()
    const saved = (await api(owner, 'GET', undefined, 200, `?siteId=${state.alpha}`)).connections[0]
    state.connection = saved.id
    check(
      'ordinary owner UI saved model discovery and text/JSON capability probes',
      saved.status === 'active' &&
        saved.models.includes('14a-model') &&
        saved.capabilities.length === 2 &&
        calls === 4,
    )
    check('actual database connection matches UI', (await row(saved.id)).status === 'active')
    const encrypted = await credentials(saved.id)
    check(
      'credential encrypted at rest and decryptable only by server',
      encrypted.totalDocs === 1 &&
        !JSON.stringify(encrypted.docs).includes(state.secret) &&
        (await connectionCredential(payload, saved.id)) === state.secret,
    )
    check(
      'UI clears API key after saving',
      (await page.getByLabel('apiKey', { exact: true }).inputValue()) === '',
    )
    const input = {
      siteId: state.alpha,
      label: '14A rejected credentials',
      providerKey: 'ai.ollama',
      endpoint,
      model: '14a-model',
      apiKey: 'wrong-14a-key',
      allowedTasks: ['editor.improve-selection'],
      perTaskUsd: 1,
      monthlyUsd: 10,
      maxInputTokens: 1000,
      maxOutputTokens: 100,
      inputUsdPer1k: 0,
      outputUsdPer1k: 0,
    }
    const rejected = (await api(owner, 'POST', input, 201)).connection
    state.rejected = rejected.id
    check(
      'upstream rejected credentials persist degraded state without capability claims',
      authRejections === 1 &&
        rejected.status === 'degraded' &&
        !rejected.capabilities.length &&
        (await row(rejected.id)).lastError ===
          'Connection test failed. Check endpoint, credentials, model, and provider health.',
    )
    const betaCookie = await session(
      await payload.findByID({ collection: 'users', id: state.betaAdmin }),
    )
    const betaConnection = (
      await api(
        betaCookie,
        'POST',
        { ...input, siteId: state.beta, label: '14A Beta connection', apiKey: state.secret },
        201,
      )
    ).connection
    const before = calls
    await api(owner, 'GET', undefined, 403, `?siteId=${state.beta}`)
    await api(admin, 'POST', { ...input, siteId: state.beta }, 403)
    await api(owner, 'PATCH', { id: saved.id, siteId: state.beta, action: 'test' }, 403)
    await api(staff, 'POST', input, 403)
    await api(
      owner,
      'PATCH',
      { id: betaConnection.id, siteId: state.alpha, action: 'disconnect' },
      403,
    )
    await api('', 'GET', undefined, 403, `?siteId=${state.alpha}`)
    check(
      'wrong-site owner/admin, staff mutation and anonymous denied before provider I/O',
      calls === before,
    )
    check(
      'foreign object substitution denied without deleting its credential',
      (await credentials(betaConnection.id)).totalDocs === 1 &&
        (await row(betaConnection.id)).status === 'active',
    )
    const cross = await fetch(`${base}/api/admin/ai/connections`, {
      method: 'PATCH',
      headers: {
        cookie: owner,
        origin: 'https://foreign.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: saved.id, siteId: state.alpha, action: 'disconnect' }),
    })
    check(
      'cross-origin mutation denied and saved state unchanged',
      cross.status === 403 && (await row(saved.id)).status === 'active',
    )
    for (const collection of ['ai-credentials', 'ai-connections']) {
      const response = await fetch(`${base}/api/${collection}`, { headers: { cookie: owner } })
      const text = await response.text()
      check(
        `native ${collection} cannot expose saved records`,
        [200, 403].includes(response.status) &&
          !text.includes(state.secret) &&
          !text.includes(saved.id),
      )
    }
    mode = 'text-only'
    const textOnly = (
      await api(owner, 'PATCH', { id: saved.id, siteId: state.alpha, action: 'test' })
    ).connection
    check(
      'successful text does not invent structured compatibility',
      textOnly.status === 'active' && textOnly.capabilities.join() === 'ai.text.rewrite',
    )
    mode = 'down'
    const down = (await api(owner, 'PATCH', { id: saved.id, siteId: state.alpha, action: 'test' }))
      .connection
    check(
      'provider failure clears capabilities and persists redacted error',
      down.status === 'degraded' &&
        !down.capabilities.length &&
        (await row(saved.id)).status === 'degraded',
    )
    mode = 'healthy'
    await api(owner, 'PATCH', { id: saved.id, siteId: state.alpha, action: 'test' })
    check(
      'retry after real provider recovery restores probed capabilities',
      (await row(saved.id)).capabilities.length === 2,
    )
    await page.reload()
    await health.getByText('14A rejected credentials', { exact: true }).waitFor()
    await page.screenshot({ path: `${out}/journey.png`, fullPage: true })
    await writeFile('scratch/rc114a/state.json', JSON.stringify(state))
  } else {
    await health.getByText('14A owner local adapter', { exact: true }).waitFor()
    check(
      'fresh browser after PostgreSQL/web restart shows persisted active model and capabilities',
      (await health.innerText()).includes('ai.text.structured') &&
        (await row(state.connection)).status === 'active',
    )
    check(
      'encrypted secret remains usable after process/database restart',
      (await connectionCredential(payload, state.connection)) === state.secret,
    )
    check(
      'rejected credential error survives restart',
      (await row(state.rejected)).status === 'degraded' &&
        (await health.innerText()).includes('Connection test failed'),
    )
    const card = health
      .locator('div.rounded.border.p-3')
      .filter({ has: page.getByText('14A owner local adapter', { exact: true }) })
    await card.getByRole('button', { name: 'Test connection', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '14A owner local adapter: active' }).waitFor()
    check(
      'ordinary UI test connection succeeds after restart using saved encrypted key',
      calls === 3,
    )
    await card.getByRole('button', { name: 'Disable', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'disabled' }).waitFor()
    check(
      'ordinary disable persists unavailable state retaining encrypted reconnect key',
      (await row(state.connection)).status === 'disabled' &&
        (await credentials(state.connection)).totalDocs === 1,
    )
    await card
      .getByRole('button', { name: 'Disconnect and remove credentials', exact: true })
      .click()
    await card.getByText('Credentials removed.', { exact: false }).waitFor()
    check(
      'ordinary UI disconnect removes saved credential and capabilities transactionally',
      (await row(state.connection)).status === 'disconnected' &&
        !(await row(state.connection)).capabilities.length &&
        (await credentials(state.connection)).totalDocs === 0,
    )
    const before = calls
    await api(owner, 'PATCH', { id: state.connection, siteId: state.alpha, action: 'test' }, 400)
    check(
      'disconnected connection cannot be retested or silently reenabled',
      calls === before && (await row(state.connection)).status === 'disconnected',
    )
    await page.reload()
    await health.getByText('Credentials removed.', { exact: false }).waitFor()
    await page.screenshot({ path: `${out}/restart.png`, fullPage: true })
    check(
      'UI reload observes durable disconnect',
      (await health.innerText()).includes('disconnected'),
    )
  }
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}.json`,
    JSON.stringify(
      {
        passed: trace.length,
        failed: 0,
        skipped: 0,
        provider:
          'loopback Ollama HTTP protocol harness; optional bearer auth; no real model inference',
        checks: trace,
      },
      null,
      2,
    ),
  )
} catch (error) {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .at(-1)
  if (page)
    console.log(
      'UI diagnostic:',
      await page
        .locator('body')
        .innerText()
        .catch(() => 'unavailable'),
    )
  throw error
} finally {
  await stopWeb()
  await browser.close()
  await new Promise<void>((r) => provider.close(() => r()))
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
