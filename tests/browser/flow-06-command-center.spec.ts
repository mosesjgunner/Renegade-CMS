import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

test('FLOW-06: Unified Workflow Command Center Browser & Multi-User Governance Proof', async ({
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
  const baseURL = process.env.FLOW06_BASE_URL || fixtureBaseURL || 'http://localhost:3110'
  await context.addCookies([{ name: 'renegade-passkey', value: session.token, url: baseURL }])

  // 1. Verify Command Center API
  const apiRes = await page.request.get(`${baseURL}/api/admin/workflow/command-center`)
  expect(apiRes.status()).toBe(200)
  const ccData = await apiRes.json()
  expect(ccData.currentUser).toBeDefined()
  expect(ccData.myWork).toBeDefined()
  expect(ccData.teamQueues).toBeDefined()
  expect(ccData.unresolvedComments).toBeDefined()
  expect(ccData.dueOverdue).toBeDefined()
  expect(ccData.calendar).toBeDefined()
  expect(ccData.scheduledJobs).toBeDefined()
  expect(ccData.translations).toBeDefined()
  expect(ccData.releases).toBeDefined()

  // 2. Navigate to Unified Workflow Command Center Admin Page
  await page.goto(`${baseURL}/admin/workflow`)
  await expect(page.getByText('Workflow Command Center')).toBeVisible()
  await expect(page.getByText('Renegade CMoS FLOW-06')).toBeVisible()

  // 3. Verify KPI Metric Cards
  await expect(page.getByText('My Work', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('In Review', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Comments', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Overdue', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Blockers', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Stale Locales', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Worker', { exact: true }).first()).toBeVisible()

  // 4. Test Tab Navigation across sections
  // Team Queues
  await page.getByRole('button', { name: 'Team Queues' }).click()
  await expect(page.getByText('Category:')).toBeVisible()

  // Comments
  await page.getByRole('button', { name: /Comments/ }).click()
  await expect(page.getByRole('heading', { name: /Unresolved Review Comments/ })).toBeVisible()

  // Due / Overdue
  await page.getByRole('button', { name: /Due \/ Overdue/ }).click()
  await expect(page.getByText('SLA & Deadline Tracking')).toBeVisible()

  // Calendar
  await page.getByRole('button', { name: 'Calendar' }).click()
  await expect(page.getByText('Editorial & Release Calendar')).toBeVisible()

  // Jobs & Health
  await page.getByRole('button', { name: 'Jobs & Health' }).click()
  await expect(page.getByText('Worker Status')).toBeVisible()
  await expect(page.getByText('Active Lease Locks')).toBeVisible()

  // Translations
  await page.getByRole('button', { name: /Translations/ }).click()
  await expect(page.getByText('Translation Groups & Quality Gates')).toBeVisible()

  // Releases
  await page.getByRole('button', { name: /Releases/ }).click()
  await expect(page.getByRole('heading', { name: 'Coordinated Releases' })).toBeVisible()

  // Blockers & Quality
  await page.getByRole('button', { name: /Blockers & Quality/ }).click()
  await expect(page.getByText('Deterministic Quality Center & Rights Blockers')).toBeVisible()

  // Outbox Failures
  await page.getByRole('button', { name: 'Outbox Failures' }).click()
  await expect(page.getByText('Durable Notification Outbox Failures')).toBeVisible()

  // Audit Trail
  await page.getByRole('button', { name: 'Audit Trail' }).click()
  await expect(page.getByText('Unified Immutable Audit Stream')).toBeVisible()
})
