import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3110'

test('admin role and site-route matrix uses real passkey sessions', async ({ browser }) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)
  const [allowedSite, otherSite] = await Promise.all(
    ['allowed', 'other'].map((name) =>
      payload.create({
        collection: 'sites',
        data: { name: `${name} ${suffix}`, slug: `${name}-${suffix}`, lifecycle: 'active' },
        overrideAccess: true,
      } as never),
    ),
  )
  const users = await Promise.all(
    (['owner', 'administrator', 'staff'] as const).map((role) =>
      payload.create({
        collection: 'users',
        data: { email: `${role}-${suffix}@example.test`, role, ...(role === 'staff' ? { adminSites: [allowedSite.id] } : {}) },
        overrideAccess: true,
      } as never),
    ),
  )
  const sessionFor = async (user: { id: string; email?: string }) =>
    createPasskeySession({ id: String(user.id), email: String(user.email) }, loadConfig().payloadSecret, async (id, expiresAt) => {
      await payload.db.pool.query('INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)', [id, user.id, expiresAt])
    })
  for (const [role, user] of ['owner', 'administrator', 'staff'].map((role, index) => [role, users[index]!] as const)) {
    const context = await browser.newContext()
    const session = await sessionFor(user as { id: string; email?: string })
    await context.addCookies([{ name: 'renegade-passkey', value: session.token, url: appUrl }])
    const page = await context.newPage()
    await page.goto(`${appUrl}/admin/ai${role === 'staff' ? `?siteId=${allowedSite.id}` : ''}`)
    await expect(page.locator(`[data-admin-role="${role}"]`)).toBeVisible()
    await page.goto(`${appUrl}/admin/telemetry`)
    if (role === 'owner') await expect(page.locator('[data-admin-role="owner"]')).toBeVisible()
    else await expect(page).toHaveURL(new RegExp('/admin$'))
    await page.goto(`${appUrl}/admin/commerce?siteId=${allowedSite.id}`)
    await expect(page.locator(`[data-admin-role="${role}"]`)).toBeVisible()
    if (role === 'staff') {
      await page.goto(`${appUrl}/admin/commerce?siteId=${otherSite.id}`)
      await expect(page.locator('body')).toContainText(/not found|404/i)
    }
    await context.close()
  }
  const anonymous = await browser.newPage()
  await anonymous.goto(`${appUrl}/admin/ai`)
  await expect(anonymous).toHaveURL(new RegExp('/admin/login'))
})
