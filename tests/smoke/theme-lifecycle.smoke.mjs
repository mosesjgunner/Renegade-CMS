import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import pg from 'pg'
import { SignJWT } from 'jose'
import { chromium } from '@playwright/test'
process.loadEnvFile('.env')
const origin = process.env.PRESENTATION_SMOKE_URL ?? 'http://localhost:3120'
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
const sid = randomUUID()
let browser
const evidence = []
const check = (name) => {
  evidence.push(name)
  console.log('PASS:', name)
}
try {
  const {
    rows: [owner],
  } = await db.query("SELECT id,email FROM users WHERE role='owner' LIMIT 1")
  assert(owner, 'Local owner fixture required')
  const {
    rows: [publication],
  } = await db.query(
    "SELECT site_id FROM publications WHERE status='active' AND visibility='public' ORDER BY created_at DESC LIMIT 1",
  )
  assert(publication, 'Public publication required')
  const site = publication.site_id
  const contentFingerprint = async () =>
    (
      await db.query(
        "SELECT md5(string_agg(id::text || document::text, '' ORDER BY id)) AS fingerprint FROM revision_records",
      )
    ).rows[0].fingerprint
  const before = await contentFingerprint()
  await db.query(
    "INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,now()+interval '15 minutes')",
    [sid, owner.id],
  )
  const token = await new SignJWT({ collection: 'users', id: owner.id, email: owner.email, sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(process.env.PAYLOAD_SECRET))
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
  )
  const context = await browser.newContext()
  await context.addCookies([
    { name: 'renegade-passkey', value: token, url: origin, httpOnly: true, sameSite: 'Lax' },
  ])
  const page = await context.newPage()
  await page.goto(origin + '/admin/capabilities', { timeout: 120000 })
  await page.getByLabel('Theme site').waitFor({ timeout: 60000 })
  await page.getByLabel('Theme site').selectOption(site)
  const state = await (await context.request.get(origin + '/api/admin/themes?site=' + site)).json()
  const original = state.state.active
  const baseline = await (await fetch(origin)).text()
  assert.equal((await fetch(origin + '/api/admin/themes')).status, 403)
  check('Anonymous theme administration denied')
  const act = async (label, action) => {
    const responsePromise = page.waitForResponse(
      (r) => r.url().endsWith('/api/admin/themes') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: label, exact: true }).click()
    const response = await responsePromise
    assert(response.ok(), `${action}: ${await response.text()}`)
    await page.getByRole('button', { name: label, exact: true }).waitFor({ state: 'visible' })
    await page.waitForFunction(
      () => !document.querySelector('section[aria-label="Theme lifecycle"] button')?.disabled,
    )
  }
  await page.getByLabel('Draft package').selectOption('neutral-starter@1.1.0')
  await page.getByLabel('Design token overrides').fill('{"color.canvas":"#ffffff"}')
  await act('Save theme draft', 'draft')
  const anonymousDraft = await (await fetch(origin)).text()
  assert.equal(
    /data-theme-version="([^"]+)"/.exec(anonymousDraft)?.[1],
    /data-theme-version="([^"]+)"/.exec(baseline)?.[1],
  )
  check('Draft leaves anonymous version unchanged')
  await act('Start theme preview', 'preview')
  const preview = await context.newPage()
  await preview.goto(origin, { timeout: 120000 })
  assert.equal(await preview.locator('body').getAttribute('data-theme-version'), '1.1.0')
  assert.equal(
    await preview
      .locator('body')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--presentation-canvas').trim()),
    '#ffffff',
  )
  const cookies = await context.cookies()
  const previewCookie = cookies.find((c) => c.name === 'presentation-preview')
  const unauthPreview = await (
    await fetch(origin, { headers: { cookie: `presentation-preview=${previewCookie.value}` } })
  ).text()
  assert.equal(
    /data-theme-version="([^"]+)"/.exec(unauthPreview)?.[1],
    /data-theme-version="([^"]+)"/.exec(baseline)?.[1],
  )
  check(
    'Authenticated browser preview uses draft tokens; stolen preview cookie alone has no effect',
  )
  assert.equal(
    await page
      .locator('body')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--presentation-canvas').trim()),
    '',
  )
  check('Public token variables do not contaminate admin')
  await act('End theme preview', 'end-preview')
  const revoked = await context.request.get(origin, {
    headers: { cookie: `renegade-passkey=${token}; presentation-preview=${previewCookie.value}` },
  })
  assert.equal(
    /data-theme-version="([^"]+)"/.exec(await revoked.text())?.[1],
    /data-theme-version="([^"]+)"/.exec(baseline)?.[1],
  )
  check('Ending preview revokes its stored token, including authenticated replay')
  await act('Activate theme', 'activate')
  const active = await (await fetch(origin)).text()
  assert.match(active, /data-theme-version="1.1.0"/)
  assert.match(active, /--presentation-canvas:#ffffff/)
  check('Browser activation changes public HTTP atomically')
  await act('Roll back theme', 'rollback')
  const rollback = await (await fetch(origin)).text()
  assert.equal(/data-theme-version="([^"]+)"/.exec(rollback)?.[1], original?.version ?? '1.0.0')
  check('Browser rollback restores previous public configuration')
  assert.equal(await contentFingerprint(), before)
  check('Canonical revision documents unchanged')
  await page.screenshot({ path: 'docs/presentation/pre-01-admin.png', fullPage: true })
  const persisted = (
    await db.query('SELECT revision,active FROM presentation_theme_state WHERE site_id=$1', [site])
  ).rows[0]
  writeFileSync(
    'docs/presentation/pre-01-browser-evidence.json',
    JSON.stringify({ checkedAt: new Date().toISOString(), origin, evidence, persisted }, null, 2) +
      '\n',
  )
} finally {
  await browser?.close()
  await db.query('DELETE FROM admin_sessions WHERE id=$1', [sid])
  await db.end()
}
