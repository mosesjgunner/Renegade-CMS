import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

test('DISC-05: Redirect Manager & Rendered Quality Command Center browser acceptance', async ({
  page,
  context,
  baseURL: fixtureBaseURL,
}) => {
  const payload = await getPayload({ config })
  const user = (
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string; email?: string }
  expect(user).toBeTruthy()

  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sessionId, user.id, expiresAt],
      )
    },
  )
  const baseURL = process.env.DISC05_BASE_URL || fixtureBaseURL || 'http://localhost:3110'
  await context.addCookies([{ name: 'renegade-passkey', value: session.token, url: baseURL }])

  // 1. Verify Redirect Manager Admin View
  await page.goto(`${baseURL}/admin/redirects`)
  await expect(page.getByText('Redirect Manager')).toBeVisible()
  await expect(page.getByText('Create New Redirect Rule')).toBeVisible()
  await expect(page.getByText('Bulk CSV / JSON Import & Export')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Rule' })).toBeVisible()

  // Verify Export Links
  const exportCsv = await page.request.get(`${baseURL}/api/admin/redirects/export?format=csv`)
  expect(exportCsv.status()).toBe(200)
  const csvText = await exportCsv.text()
  expect(csvText).toContain('fromPath,toPath,statusCode')

  const exportJson = await page.request.get(`${baseURL}/api/admin/redirects/export?format=json`)
  expect(exportJson.status()).toBe(200)

  // 2. Verify Rendered Quality Command Center Admin View
  await page.goto(`${baseURL}/admin/rendered-quality`)
  await expect(
    page.getByText('Rendered Quality & Discovery Command Center — DISC-05'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run Rendered Audit' })).toBeVisible()
  await expect(page.getByText(/Sitemap \/ Feed \/ Robots/).first()).toBeVisible()
  await expect(page.getByText(/Cannibalization Review/).first()).toBeVisible()
  await expect(page.getByText(/AI Proposals/).first()).toBeVisible()

  // 3. Test Direct API execution of Rendered Audit with Cross-Checks & AI Proposals
  const auditRes = await page.request.post(`${baseURL}/api/admin/discovery/audit`, {
    data: { concurrency: 2 },
  })
  expect(auditRes.status()).toBe(200)
  const auditData = await auditRes.json()
  expect(auditData).toHaveProperty('pages')
  expect(auditData).toHaveProperty('crossChecks')
  expect(auditData).toHaveProperty('cannibalization')
  expect(auditData).toHaveProperty('aiSuggestions')
  expect(auditData).toHaveProperty('lifecycle')
})
