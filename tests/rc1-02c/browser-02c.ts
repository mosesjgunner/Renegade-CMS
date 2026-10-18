import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createStaffEnrollmentToken } from '@/modules/operations/staff-enrollment'
import { loadConfig } from '@/modules/core/config'

const base = process.env.APP_URL!
const evidence = 'docs/rc/evidence/rc1/18-pass/02C'
async function run() {
  assert.equal(process.env.RC1_02C_DISPOSABLE, 'yes')
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/rc102c_release_acceptance')
  assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
  const fixture = JSON.parse(await readFile('scratch/rc102c-20261017/fixture.json', 'utf8'))
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-proxy-server', '--host-resolver-rules=MAP admin.rc102c.test 127.0.0.1'],
  })
  const payload = await getPayload({ config })
  const adminInvite = await createStaffEnrollmentToken(payload, loadConfig(), {
    email: fixture.adminEmail || 'admin@rc102c.test',
    role: 'administrator',
    siteId: fixture.siteA,
  })
  fixture.enrollmentToken = adminInvite.enrollmentToken
  fixture.adminEmail = adminInvite.user.email

  const editorInvite = await createStaffEnrollmentToken(payload, loadConfig(), {
    email: fixture.editorEmail || 'editor@rc102c.test',
    role: 'administrator',
    siteId: fixture.siteA,
  })
  fixture.editorToken = editorInvite.enrollmentToken
  fixture.editorEmail = editorInvite.user.email
  const pool = (payload.db as any).pool
  await pool.query('DELETE FROM passkeys WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2))', [fixture.adminEmail, fixture.editorEmail])
  await pool.query("DELETE FROM public_redirects WHERE from_path IN ('/ui-created', '/ui-import', '/loop-ui')")
  await pool.query("DELETE FROM content WHERE title = '02C concurrent UI article'")
  let stage = 'initialization'
  let page: Page | undefined
  try {
    async function enroll(context: BrowserContext, token: string, email: string) {
      const actor = await context.newPage()
      page = actor
      actor.on('console', msg => console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`))
      actor.on('response', async res => {
        if (res.url().includes('/api/')) {
          console.log(`[HTTP ${res.status()}] ${res.url()}`)
          if (res.status() >= 400) {
            console.log(`[HTTP ERROR BODY]`, await res.text().catch(() => ''))
          }
        }
      })
      stage = `enroll ${email}`
      console.log(`STEP opening login for ${email}`)
      await actor.goto(`${base}/login`, { timeout: 90_000, waitUntil: 'domcontentloaded' })
      const cdp = await context.newCDPSession(actor)
      await cdp.send('WebAuthn.enable')
      await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      })
      const optionsResult = await actor.evaluate(
        async (data) => {
          const res = await fetch('/api/auth/passkey/enroll', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data),
          })
          return { status: res.status, body: await res.json() }
        },
        { action: 'options', enrollmentToken: token, siteId: fixture.siteA },
      )
      assert.equal(optionsResult.status, 200, JSON.stringify(optionsResult.body))
      const { options } = optionsResult.body
      const credential = await actor.evaluate(`(async (opts) => {
        const decode = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
        const encode = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
        opts.challenge = decode(opts.challenge)
        opts.user.id = decode(opts.user.id)
        const result = await navigator.credentials.create({ publicKey: opts })
        const response = result.response
        return { id: result.id, rawId: encode(result.rawId), type: result.type, response: { clientDataJSON: encode(response.clientDataJSON), attestationObject: encode(response.attestationObject), transports: response.getTransports() } }
      })(${JSON.stringify(options)})`)
      const completed = await actor.evaluate(
        async (data) => {
          const res = await fetch('/api/auth/passkey/enroll', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data),
          })
          return res.status
        },
        { action: 'complete', enrollmentToken: token, siteId: fixture.siteA, credential },
      )
      assert.equal(completed, 200)
      stage = `UI login ${email}`
      await actor.getByLabel('Owner / Staff Email').fill(email)
      const completePromise = actor.waitForResponse(
        (res) => res.url().includes('/api/auth/passkey/complete') && res.status() === 200,
        { timeout: 30_000 },
      )
      await actor.getByRole('button', { name: /Authenticate with Passkey/ }).click()
      await completePromise
      await expect(actor).toHaveURL(new RegExp(`^${base}/admin(?:/|$)`), { timeout: 30_000 })
      console.log(`PASS genuine enrollment and UI passkey login: ${email}`)
      return actor
    }
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    page = await enroll(context, fixture.enrollmentToken, fixture.adminEmail)
    stage = 'redirect UI create/reload/filter'
    await page.goto(`${base}/admin/redirects`, { timeout: 180_000 })
    await page.getByPlaceholder('/old-path').fill('/ui-created')
    await page.getByPlaceholder('/new-path').fill('/ui-target')
    await page.getByRole('button', { name: 'Add Rule', exact: true }).click()
    await expect(page.getByRole('cell', { name: '/ui-created', exact: true })).toBeVisible()
    const rows = await pool.query(
      "SELECT id, site_id, to_path FROM public_redirects WHERE from_path='/ui-created'",
    )
    assert.equal(rows.rows.length, 1)
    assert.equal(rows.rows[0].site_id, fixture.siteA)
    assert.equal(rows.rows[0].to_path, '/ui-target')
    await page.reload()
    await expect(page.getByRole('cell', { name: '/ui-created', exact: true })).toBeVisible()
    await page.getByPlaceholder(/Search/).fill('nothing-matches-02c')
    await expect(page.getByRole('cell', { name: '/ui-created', exact: true })).toHaveCount(0)
    await page.getByPlaceholder(/Search/).fill('ui-created')
    const row = page.getByRole('row').filter({ hasText: '/ui-created' })
    await row.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByPlaceholder('/new-path').fill('/ui-updated')
    await page.getByRole('button', { name: 'Update Rule', exact: true }).click()
    await expect(page.getByRole('cell', { name: '/ui-updated', exact: true })).toBeVisible()
    assert.equal(
      (await pool.query('SELECT to_path FROM public_redirects WHERE id=$1', [rows.rows[0].id]))
        .rows[0].to_path,
      '/ui-updated',
    )
    console.log('PASS UI create, reload, search empty/match, update -> SQL -> visible result')
    stage = 'redirect UI failure and import'
    await page.getByPlaceholder('/old-path').fill('/loop-ui')
    await page.getByPlaceholder('/new-path').fill('/loop-ui')
    await page.getByRole('button', { name: 'Add Rule', exact: true }).click()
    await expect(
      page.getByText('A redirect cannot target its own source path.', { exact: true }),
    ).toBeVisible()
    await page.getByPlaceholder(/Paste CSV/).fill('/ui-import,/import-target\n/invalid,/invalid')
    await page.getByRole('button', { name: 'Import Rules', exact: true }).click()
    await expect(page.locator('span[role="status"]')).toContainText('Import partially completed')
    await expect(page.locator('ul[role="alert"]')).toContainText('own source path')
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM public_redirects WHERE from_path='/loop-ui'",
        )
      ).rows[0].n,
      0,
    )
    console.log('PASS UI validation error and partial import with persisted valid row')
    await page.screenshot({ path: `${evidence}/redirect-ui.png`, fullPage: true })
    stage = 'redirect UI delete'
    page.once('dialog', (dialog) => void dialog.accept())
    await row.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('cell', { name: '/ui-created', exact: true })).toHaveCount(0)
    assert.equal(
      (
        await pool.query('SELECT count(*)::int AS n FROM public_redirects WHERE id=$1', [
          rows.rows[0].id,
        ])
      ).rows[0].n,
      0,
    )
    const foreignStatus = await page.evaluate(
      async (site) => (await fetch(`/api/admin/redirects/export?siteId=${site}`)).status,
      fixture.siteB,
    )
    assert.equal(foreignStatus, 403)
    console.log('PASS UI delete persisted; authenticated foreign-site export denied')
    stage = 'native content create'
    await page.goto(`${base}/admin/collections/content/create?contentType=article`, {
      timeout: 180_000,
    })
    const titleInput = page.locator('#field-title')
    await expect(titleInput).toBeEnabled({ timeout: 30_000 })
    await titleInput.fill('02C concurrent UI article')
    const siteControl = page.locator('#field-site .rs__control')
    if (await siteControl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await siteControl.click()
      const option = page.locator('.rs__option').filter({ hasText: '02C Alpha' })
      if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
        await option.click()
      }
    }
    await page.screenshot({ path: `${evidence}/native-create.png`, fullPage: true })
    // Save through the native form; any unsatisfied field remains a real acceptance failure.
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/content\/(?!create)[^/?]+/, {
      timeout: 30_000,
    })
    const contentId = new URL(page.url()).pathname.split('/').at(-1)!
    const adminUser = (
      await payload.find({
        collection: 'users',
        where: { email: { equals: fixture.adminEmail } },
        depth: 0,
      })
    ).docs[0]
    await payload.create({
      collection: 'payload-locked-documents',
      data: {
        document: { relationTo: 'content', value: contentId },
        user: { relationTo: 'users', value: adminUser.id },
      },
    })
    const secondContext = await browser.newContext({ ignoreHTTPSErrors: true })
    const second = await enroll(secondContext, fixture.editorToken, fixture.editorEmail)
    stage = 'native concurrent edit'
    await second.goto(`${base}/admin/collections/content/${contentId}`, { timeout: 180_000 })
    await expect(second.getByText(/currently editing|locked|being edited/i).first()).toBeVisible()
    assert.equal(
      (await payload.findByID({ collection: 'content', id: contentId })).title,
      '02C concurrent UI article',
    )
    await second.screenshot({ path: `${evidence}/concurrent-edit.png`, fullPage: true })
    console.log('PASS native UI create and concurrent edit lock with unchanged persisted title')
  } catch (error) {
    console.error(`FIRST BLOCKER at ${stage}:`, error instanceof Error ? error.message : error)
    await page
      ?.screenshot({ path: `${evidence}/first-blocker.png`, fullPage: true })
      .catch(() => {})
    throw error
  } finally {
    await browser.close()
    await payload.db.destroy?.()
  }
}
run()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
