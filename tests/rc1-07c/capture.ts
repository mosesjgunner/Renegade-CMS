/* eslint-disable @typescript-eslint/no-explicit-any -- isolated browser evidence */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
assert.equal(process.env.RC1_07C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5451/rc107c_release_acceptance',
)
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/07C'
const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
const session = await createPasskeySession(
  await payload.findByID({ collection: 'users', id: state.owner }),
  loadConfig().payloadSecret,
  async (id, expires) => {
    await payload.db.pool.query(
      'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
      [id, state.owner, expires],
    )
  },
)
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(180000)
  await page.context().addCookies([
    { name: 'renegade-passkey', value: session.token, url: 'http://localhost:38985' },
    { name: 'renegade-active-site', value: state.site, url: 'http://localhost:38985' },
  ])
  await page.goto('http://localhost:38985/admin/releases', { timeout: 180000 })
  const consent = page.getByRole('button', { name: 'Reject non-essential', exact: true })
  await consent.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await consent.isVisible()) await consent.click()
  await page.getByText(state.name, { exact: true }).first().click()
  await page.getByText('COMPLETED', { exact: true }).waitFor({ state: 'visible' })
  assert.equal(await page.getByRole('cell', { name: 'SUCCEEDED', exact: true }).count(), 6)
  await page.screenshot({ path: `${out}/completed.png`, fullPage: true })
  await writeFile(
    `${out}/screenshot-trace.json`,
    JSON.stringify(
      {
        passed: 2,
        failed: 0,
        skipped: 0,
        releaseId: state.release,
        checks: [
          'Completed release is visible after detail hydration',
          'All six action rows visibly succeeded',
        ],
      },
      null,
      2,
    ),
  )
  console.log('07C completed browser capture: 2 passed')
} finally {
  await browser.close()
  await payload.db.destroy()
}
process.exit(0)
