import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ baseURL: 'http://localhost:3110' })
const email = `browser-donor-${Date.now()}@example.test`
try {
  await page.goto('/donate')
  await page.getByRole('link', { name: 'Local test giving' }).last().click()
  await page.getByLabel('Custom amount').fill('5.00')
  await page.getByLabel('Email for your receipt').fill(email)
  await page.getByRole('button', { name: 'Continue to secure checkout' }).click()
  await page.waitForURL(/\/checkout\/test\/det_cs_/, { timeout: 20_000 })
  await page.getByRole('heading', { name: 'Local test checkout' }).waitFor()
  await page.getByRole('button', { name: 'Confirm test payment' }).click()
  await page.waitForURL(/\/checkout\/return\?session=/, { timeout: 20_000 })
  await page.getByRole('heading', { name: 'Payment confirmed' }).waitFor({ timeout: 30_000 })
  const receipt = await page.locator('section[aria-live="polite"]').innerText()
  await page.screenshot({ path: 'scratch/shop08-donation-proof.png', fullPage: true })
  process.stdout.write(JSON.stringify({ ok: true, email, url: page.url(), receipt }) + '\n')
  if (process.env.WAIT_FOR_RESTART === 'true') {
    process.stdout.write('READY_FOR_RESTART\n')
    await new Promise((resolve) => process.stdin.once('data', resolve))
    await page.reload()
    await page.getByRole('heading', { name: 'Payment confirmed' }).waitFor({ timeout: 30_000 })
    process.stdout.write(JSON.stringify({ persistedAfterRestart: true, url: page.url() }) + '\n')
  }
} catch (error) {
  await page.screenshot({ path: 'scratch/shop08-donation-failure.png', fullPage: true })
  process.stderr.write(
    JSON.stringify({
      ok: false,
      url: page.url(),
      text: (await page.locator('body').innerText()).slice(0, 1600),
    }) + '\n',
  )
  throw error
} finally {
  await browser.close()
}
