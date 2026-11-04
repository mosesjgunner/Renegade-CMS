import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

async function run() {
  assert.equal(process.env.RC1R03A_DISPOSABLE, 'yes')
  assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
  const f = JSON.parse(await readFile('scratch/rc1r03a/fixture.json', 'utf8'))
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-proxy-server',
      // Browser-level bypass for the local self-signed certificate: the
      // context's ignoreHTTPSErrors alone proved insufficient for the
      // cross-host navigation in this sandbox (ERR_CERT_AUTHORITY_INVALID
      // on the beta host after same-host navigations succeeded). Assertions
      // (headings, breadcrumb, body text, 404 status) are unchanged.
      '--ignore-certificate-errors',
      '--host-resolver-rules=MAP alpha.rc1-03a.test 127.0.0.1,MAP beta.rc1-03a.test 127.0.0.1',
    ],
  })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const page = await context.newPage()
    await page.goto('https://alpha.rc1-03a.test:38758/browse')
    await expect(page.getByRole('heading', { name: '03A Alpha', exact: true })).toBeVisible()
    for (const label of [
      'Knowledge',
      'Engineering',
      'Database Practice',
      'Field Guides',
      'PostgreSQL Field Guide Revised',
    ]) {
      await page.getByRole('main').getByRole('link', { name: label, exact: true }).click()
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
      console.log(`PASS public UI click → persisted ${label} → heading visible`)
    }
    const trail = page.getByRole('navigation', { name: 'Hierarchy breadcrumb' })
    await expect(trail).toHaveText(
      '03A Alpha/Knowledge/Engineering/Database Practice/Field Guides/PostgreSQL Field Guide Revised',
    )
    await expect(page.getByText('03A persisted article body.', { exact: true })).toBeVisible()
    await page.screenshot({
      path: 'docs/rc/evidence/rc1/repairs/R-03A/hierarchy-browser.png',
      fullPage: true,
    })
    await trail.getByRole('link', { name: 'Database Practice', exact: true }).click()
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Direct Category Article', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('HIDDEN PRIVATE 03A', { exact: true })).toHaveCount(0)
    await page.goto(`https://alpha.rc1-03a.test:38758${f.publicPaths[1]}`)
    await page
      .getByRole('navigation', { name: 'Hierarchy breadcrumb' })
      .getByRole('link', { name: '03A Alpha', exact: true })
      .click()
    await page.getByRole('main').getByRole('link', { name: 'Start Here', exact: true }).click()
    await expect(page.getByText('No hierarchy entries yet.', { exact: true })).toBeVisible()
    const response = await page.goto(`https://beta.rc1-03a.test:38758${f.publicPaths[5]}`)
    assert.equal(response?.status(), 404)
    await context.close()
    console.log(
      'PASS browser breadcrumb backtracking, legacy direct-category listing, private exclusion, empty branch and foreign-site 404',
    )
    console.log(
      'TOTAL passed=6 failed=0 skipped=0; fresh unauthenticated browser, no test authentication',
    )
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
