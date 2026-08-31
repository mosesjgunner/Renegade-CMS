import { expect, test } from '@playwright/test'

const banner = () => ({ name: 'Privacy choices' })
test.beforeEach(async ({ context, page }) => {
  await context.clearCookies()
  await page.goto('/events')
})

test('first visit has no analytics request, identifier cookie, or browser storage', async ({
  page,
  context,
}) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await expect(page.getByRole('region', banner())).toBeVisible()
  expect(requests.filter((url) => url.includes('/api/analytics/collect'))).toEqual([])
  expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain('renegade-aid')
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
})

test('reject, selected acceptance, returning visit, and withdrawal have exact collection/storage effects', async ({
  page,
  context,
}) => {
  const collected: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/analytics/collect')) collected.push(request.url())
  })
  await page.getByRole('button', { name: 'Reject non-essential' }).click()
  await expect
    .poll(() => context.cookies())
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'renegade-consent', httpOnly: true }),
      ]),
    )
  expect(collected).toEqual([])
  expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain('renegade-aid')
  await page.getByRole('button', { name: 'Privacy choices' }).click()
  await page.getByLabel('Analytics').check()
  await page.getByRole('button', { name: 'Save choices' }).click()
  await expect.poll(() => collected.length).toBeGreaterThan(0)
  expect((await context.cookies()).map((cookie) => cookie.name)).toEqual(
    expect.arrayContaining(['renegade-consent', 'renegade-aid', 'renegade-sid']),
  )
  await page.reload()
  await expect.poll(() => collected.length).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Privacy choices' }).click()
  await page.getByRole('button', { name: 'Reject non-essential' }).click()
  await expect
    .poll(async () => (await context.cookies()).map((cookie) => cookie.name))
    .not.toContain('renegade-aid')
})

test('Do Not Track suppresses collection after analytics consent', async ({ page }) => {
  await page.setExtraHTTPHeaders({ DNT: '1' })
  const collected: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/analytics/collect')) collected.push(request.url())
  })
  await page
    .getByRole('button', { name: 'Privacy choices' })
    .click()
    .catch(() => undefined)
  await page.getByLabel('Analytics').check()
  await page.getByRole('button', { name: 'Save choices' }).click()
  await page.waitForTimeout(500)
  expect(collected).toEqual([])
})
