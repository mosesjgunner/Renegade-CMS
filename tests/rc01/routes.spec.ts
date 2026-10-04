import fs from 'node:fs'
import { expect, test } from '@playwright/test'

const inventory = JSON.parse(
  fs.readFileSync('docs/rc/evidence/rc-01/admin-Standard-all.json', 'utf8'),
) as {
  views: { key: string; path: string }[]
  links: { href: string; label: string }[]
  collections: { href: string; hidden: boolean | string }[]
  globals: { href: string; hidden: boolean | string }[]
}
const routes = [
  ...new Set([
    ...inventory.views.map((view) => (view.path === '/' ? '/admin' : `/admin${view.path}`)),
    ...inventory.links.map((link) => link.href),
    ...inventory.collections.filter((item) => item.hidden !== true).map((item) => item.href),
    ...inventory.globals.filter((item) => item.hidden !== true).map((item) => item.href),
  ]),
].filter((route) => route !== '/')

test.describe('ordinary owner navigation', () => {
  test.use({ storageState: 'scratch/rc01-owner.json' })
  test('rendered navigation is covered by the configuration inventory', async ({
    page,
  }, testInfo) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    const links = await page.locator('nav a[href]').evaluateAll((elements) =>
      elements.map((element) => ({
        href: element.getAttribute('href'),
        text: element.textContent?.trim(),
      })),
    )
    await testInfo.attach('rendered-navigation', {
      body: JSON.stringify(links, null, 2),
      contentType: 'application/json',
    })
    fs.writeFileSync(
      'docs/rc/evidence/rc-01/rendered-owner-navigation.json',
      JSON.stringify(links, null, 2),
    )
    for (const link of links) {
      if (
        link.href?.startsWith('/admin') &&
        !['/admin/logout', '/admin/account'].includes(link.href)
      ) {
        expect(routes, `Uninventoried visible link: ${link.text}`).toContain(link.href)
      }
    }
  })
  for (const route of routes) {
    test(`owner loads ${route}`, async ({ page }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
      })
      const response = await page.goto(route)
      await page.waitForLoadState('networkidle')
      await testInfo.attach('errors', {
        body: JSON.stringify(errors),
        contentType: 'application/json',
      })
      expect(response?.status()).toBeLessThan(400)
      await expect(page.locator('body')).not.toContainText('Internal Server Error')
      await expect(page.locator('body')).not.toContainText('This page could not be found')
      expect(errors).toEqual([])
      await page.screenshot({
        path: `docs/rc/evidence/rc-01/${route.replaceAll('/', '_')}.png`,
        fullPage: true,
      })
    })
  }
})

test.describe('unauthenticated admin boundary', () => {
  for (const route of routes) {
    test(`anonymous cannot mount ${route}`, async ({ page }) => {
      const response = await page.goto(route)
      expect(response?.status() === 403 || /\/(login|setup)/.test(page.url())).toBeTruthy()
    })
  }
  test('anonymous cannot mutate content', async ({ request }) => {
    const response = await request.post('/api/content', { data: { title: 'Unauthorized RC-01' } })
    expect([401, 403]).toContain(response.status())
  })
})

for (const role of ['administrator', 'staff']) {
  test.describe(`${role} authorization fixture`, () => {
    test.use({ storageState: `scratch/rc01-${role}.json` })
    for (const route of routes) {
      test(`${role} loads or receives explicit denial at ${route}`, async ({ page }) => {
        const privilegedCalls: string[] = []
        page.on('request', (request) => {
          if (request.url().includes('/api/admin/') && request.method() !== 'GET')
            privilegedCalls.push(request.url())
        })
        const response = await page.goto(route)
        expect(response?.status()).toBeLessThan(500)
        await expect(page.locator('body')).not.toContainText('This page could not be found')
        if (
          /access (required|denied)|not authorized/i.test(await page.locator('body').innerText())
        ) {
          expect(privilegedCalls).toEqual([])
        }
      })
    }
    test(`${role} cannot create administrator accounts`, async ({ request }) => {
      const response = await request.post('/api/users', {
        data: { email: `${role}-forbidden@rc01.test`, role: 'owner' },
      })
      expect([401, 403]).toContain(response.status())
    })
  })
}
