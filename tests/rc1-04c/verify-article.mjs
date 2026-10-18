import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'
const out = 'docs/rc/evidence/rc1/18-pass/04C'
const state = JSON.parse(readFileSync(`${out}/state.json`, 'utf8'))
assert.match(state.path, /^\/articles\/04c-neighbors-/)
const browser = await chromium.launch()
const checks = []
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('https://localhost:38921' + state.path, { waitUntil: 'networkidle' })
    await expect(page.locator('main')).toHaveCount(1)
    checks.push(`${width}px article has one main landmark`)
    await expect(page.locator('main')).toContainText('04C report persisted body')
    checks.push(`${width}px persisted article body still renders`)
    await expect(page.getByText('Checking sign-in status...', { exact: true })).toBeHidden({
      timeout: 20000,
    })
    await expect(page.getByRole('region', { name: 'Article discussion' })).toContainText(/Sign in/i)
    checks.push(`${width}px anonymous sign-in loading resolves`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    checks.push(`${width}px article has no horizontal overflow`)
    await page.screenshot({
      path: `${out}/${width === 390 ? 'mobile' : 'desktop'}-article.png`,
      fullPage: true,
    })
  }
  writeFileSync(
    `${out}/article-checks.json`,
    JSON.stringify({ passed: checks.length, failed: 0, skipped: 0, checks }, null, 2),
  )
  checks.forEach((check) => console.log(`PASS ${check}`))
} finally {
  await browser.close()
}
