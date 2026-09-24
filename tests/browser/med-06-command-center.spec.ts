import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

test('MED-06: Unified Media Command Center UI, operational telemetry, tabs navigation, and honest states', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)

  // 1. Create a dedicated test site and publication
  const site = await payload.create({
    collection: 'sites',
    data: { name: `Command Center Site ${suffix}`, slug: `cc-site-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)

  await payload.create({
    collection: 'publications',
    data: {
      site: site.id,
      name: `Command Center Pub ${suffix}`,
      slug: `cc-pub-${suffix}`,
      canonicalBasePath: '/',
      status: 'active',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)

  // 2. Authenticate as administrative user
  const user = (
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string | number; email?: string }
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

  await context.addCookies([
    { name: 'renegade-passkey', value: session.token, url: 'http://localhost:3110' },
  ])

  // 3. Navigate to Media Command Center with site scoping
  await page.goto(`/admin/media-library?siteId=${site.id}`)

  // 4. Verify Command Center Header and view mode
  await expect(page.getByRole('heading', { name: 'Media Command Center' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(
    page.getByText('Unified operations, storage telemetry, lifecycle governance, and pipelines.'),
  ).toBeVisible()

  // 5. Verify all 6 tabs exist
  const tabs = [
    'Overview & Health',
    'Assets & DAM',
    'Queue & Sessions',
    'Podcast Center',
    'Video Center',
    'Governance & Duplicates',
  ]
  for (const tabName of tabs) {
    await expect(page.getByRole('tab', { name: tabName })).toBeVisible()
  }

  // 6. Inspect Overview & Health Tab
  await expect(page.getByText('Storage Adapter')).toBeVisible()
  await expect(page.getByText('Worker Status')).toBeVisible()
  await expect(page.getByText('Deliverable Footprint')).toBeVisible()

  // Verify Zero Leakage: raw local path / secrets must not appear
  const content = await page.content()
  expect(content).not.toContain('/tmp/renegade-storage')
  expect(content).not.toContain('AWS_SECRET_ACCESS_KEY')
  expect(content).not.toContain('DATABASE_URL')

  // 7. Click through tabs
  // 7.1 Assets & DAM
  await page.getByRole('tab', { name: 'Assets & DAM' }).click()
  await expect(page.getByPlaceholder('Filter assets by title...')).toBeVisible()
  await expect(page.getByText('Batch Actions')).toBeVisible()

  // 7.2 Queue & Sessions
  await page.getByRole('tab', { name: 'Queue & Sessions' }).click()
  await expect(page.getByText('Active Upload Sessions')).toBeVisible()
  await expect(page.getByText('Media Processing Jobs')).toBeVisible()

  // 7.3 Podcast Center
  await page.getByRole('tab', { name: 'Podcast Center' }).click()
  await expect(page.getByText('Podcast Deliverability & Feeds')).toBeVisible()
  await expect(page.getByText('Episode Readiness Checklist')).toBeVisible()

  // 7.4 Video Center
  await page.getByRole('tab', { name: 'Video Center' }).click()
  await expect(page.getByText('Native Video Assets')).toBeVisible()

  // 7.5 Governance & Duplicates
  await page.getByRole('tab', { name: 'Governance & Duplicates' }).click()
  await expect(page.getByText('Content-Addressed Duplicate Clusters')).toBeVisible()
  await expect(page.getByText('Expiring Rights & Governance Alerts')).toBeVisible()

  // 8. Toggle to Legacy View and back
  const legacyToggle = page.getByRole('button', { name: 'Switch to Simple Library' })
  if (await legacyToggle.isVisible()) {
    await legacyToggle.click()
    await expect(page.getByRole('heading', { name: 'Media Library' })).toBeVisible()
    const commandCenterToggle = page.getByRole('button', { name: 'Switch to Command Center' })
    await expect(commandCenterToggle).toBeVisible()
    await commandCenterToggle.click()
    await expect(page.getByRole('heading', { name: 'Media Command Center' })).toBeVisible()
  }
})
