import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { chromium } from '@playwright/test'

const evidence = path.resolve('docs/rc/evidence/rc-06-pass2')
mkdirSync(evidence, { recursive: true })
const readEnv = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=')
        return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, '')]
      }),
  )
const fixture = readEnv('.env.rc02')
const database = new URL(fixture.DATABASE_URL)
const template = database.pathname.slice(1)
assert.match(template, /^renegade_rc02_\d+_release_acceptance$/)
const adminUrl = new URL(readEnv('.env').DATABASE_URL)
adminUrl.pathname = '/postgres'
const admin = new Client({ connectionString: adminUrl.href })
const name = `renegade_rc06_${Date.now()}_release_acceptance`
await admin.connect()
try {
  await admin.query(
    `CREATE DATABASE "${name}" WITH TEMPLATE "${template}" OWNER "${database.username}"`,
  )
} finally {
  await admin.end()
}
database.pathname = `/${name}`
const env = {
  ...process.env,
  ...fixture,
  DATABASE_URL: database.href,
  PAYLOAD_SECRET: randomBytes(48).toString('hex'),
  NODE_ENV: 'production',
  APP_URL: 'https://security.rc06.test',
  PORT: '3146',
  HOSTNAME: '127.0.0.1',
  PROXY_MODE: 'trusted',
  TRUSTED_PROXY_HOPS: '1',
  LOCAL_E2E_TEST_MODE: 'false',
  ENABLE_TEST_ROUTES: 'false',
  NETWORK_ALLOW_PRIVATE_DEVELOPMENT: 'false',
  EMAIL_MODE: 'disabled',
  MEDIA_DIR: path.resolve('scratch/rc06-media'),
}
delete env.NODE_OPTIONS
const secrets = Object.entries(env)
  .filter(([key, value]) => /SECRET|PASSWORD|API_KEY|TOKEN/.test(key) && value && value.length >= 8)
  .map(([, value]) => value)
secrets.push(database.password, database.href)
const redact = (text) => secrets.reduce((safe, value) => safe.split(value).join('[REDACTED]'), text)
const observations = []
const client = new Client({ connectionString: database.href })
let child
try {
  await client.connect()
  const migration = spawn(process.execPath, ['node_modules/payload/bin.js', 'migrate'], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [migration.stdout, migration.stderr])
    stream.on('data', (chunk) =>
      appendFileSync(path.join(evidence, 'operational-migrations.txt'), redact(chunk.toString())),
    )
  const migrationExit = await new Promise((resolve) => migration.once('exit', resolve))
  assert.equal(migrationExit, 0, 'isolated fixture migration')
  child = spawn(process.execPath, ['.next/standalone/server.js'], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) =>
      appendFileSync(path.join(evidence, 'standalone.txt'), redact(chunk.toString())),
    )
  const base = 'http://127.0.0.1:3146'
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${base}/health/live`)
      if (response.ok) break
    } catch {}
    assert.ok(child.exitCode === null, 'standalone exited before readiness')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  async function check(label, route, expectedStatus, expectedBody) {
    const response = await fetch(base + route, { redirect: 'manual' })
    const raw = await response.text()
    assert.equal(
      secrets.some((secret) => raw.includes(secret)),
      false,
      `${label}: secret disclosure`,
    )
    const body = JSON.parse(raw)
    observations.push({ label, route, status: response.status, body })
    assert.equal(response.status, expectedStatus, label)
    if (expectedBody) assert.deepEqual(body, expectedBody, label)
    return body
  }
  await check('liveness', '/health/live', 200, { status: 'live' })
  await check('baseline', '/health/ready', 200)
  const removed = await client.query(
    'DELETE FROM payload_migrations WHERE id = (SELECT id FROM payload_migrations ORDER BY id DESC LIMIT 1) RETURNING *',
  )
  try {
    await check('pending migration fails closed', '/health/ready', 503, {
      status: 'not_ready',
      checks: { database: 'ok', migrations: 'pending' },
    })
  } finally {
    await client.query(
      'INSERT INTO payload_migrations SELECT * FROM json_populate_record(NULL::payload_migrations, $1::json)',
      [JSON.stringify(removed.rows[0])],
    )
  }
  await client.query(
    'ALTER TABLE events RENAME COLUMN required_entitlement TO rc06_hidden_entitlement',
  )
  try {
    await check('critical schema fails closed', '/health/ready', 503, {
      status: 'not_ready',
      checks: { database: 'ok', schema: 'corrupted' },
    })
  } finally {
    await client.query(
      'ALTER TABLE events RENAME COLUMN rc06_hidden_entitlement TO required_entitlement',
    )
  }
  await check('restored', '/health/ready', 200)
  for (const route of [
    '/api/admin/commerce/dashboard',
    '/api/admin/ai/connections',
    '/api/admin/social/accounts',
  ]) {
    const response = await fetch(base + route, { redirect: 'manual' })
    const raw = await response.text()
    assert.equal(
      secrets.some((secret) => raw.includes(secret)),
      false,
    )
    observations.push({ label: 'anonymous privileged API denial', route, status: response.status })
    assert.ok([401, 403].includes(response.status), `${route}: unexpected ${response.status}`)
  }
  await check('anonymous member session denied', '/api/member-auth/me', 401)
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const browserErrors = []
    page.on('pageerror', (error) => browserErrors.push(redact(error.message)))
    await page.goto(base + '/login', { waitUntil: 'networkidle' })
    assert.equal(
      secrets.some((secret) => page.url().includes(secret)),
      false,
    )
    const html = await page.content()
    assert.equal(
      secrets.some((secret) => html.includes(secret)),
      false,
      'rendered login secret disclosure',
    )
    await page.screenshot({ path: path.join(evidence, 'anonymous-login.png'), fullPage: true })
    observations.push({
      label: 'real Chromium rendered login',
      status: 'rendered',
      secretMatches: 0,
      browserErrors,
    })
    await page.goto(base + '/connections', { waitUntil: 'networkidle' })
    assert.equal(new URL(page.url()).pathname, '/login', 'anonymous connections page denial')
    observations.push({ label: 'anonymous provider page denial', destination: '/login' })
    assert.equal(browserErrors.length, 0, 'browser page errors')
  } finally {
    await browser.close()
  }
  writeFileSync(
    path.join(evidence, 'operational-results.json'),
    JSON.stringify(
      {
        success: true,
        database: name,
        template,
        production: true,
        testBypasses: false,
        observations,
      },
      null,
      2,
    ),
  )
  console.log(
    `Production operational acceptance passed: ${observations.length} observations on ${name}`,
  )
} catch (error) {
  writeFileSync(
    path.join(evidence, 'operational-results.json'),
    JSON.stringify(
      { success: false, database: name, template, observations, error: redact(error.message) },
      null,
      2,
    ),
  )
  throw new Error(redact(error.message))
} finally {
  await client.end()
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve))
    child.kill()
    await exited
  }
}
