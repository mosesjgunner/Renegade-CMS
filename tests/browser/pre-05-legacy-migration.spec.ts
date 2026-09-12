import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import {
  executeLegacyMigration,
  PayloadLegacyMigrationStore,
} from '@/modules/portability/legacy-migration'
import { rollbackLegacyMigration } from '@/modules/portability/legacy-migration/pipeline'

test('PRE-05: Legacy Site Migration & Presentation Reconstruction review UI, side-by-side reconciliation, quarantine viewer, verify, and deliberate activation', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000)
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)

  // 1. Setup admin passkey auth session
  const user = (
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string | number; email?: string }
  expect(user).toBeTruthy()

  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
        [sessionId, user.id, expiresAt],
      )
    },
  )

  await context.addCookies([
    { name: 'renegade-passkey', value: session.token, url: 'http://localhost:3110' },
  ])

  // 2. Load fixture and run migration pipeline up to execution stage
  const fixturePath = join(process.cwd(), 'tests/fixtures/legacy-migration/wordpress-fixture.xml')
  const themeMappingPath = join(process.cwd(), 'tests/fixtures/legacy-migration/theme-mapping.json')
  const wxrContent = readFileSync(fixturePath, 'utf8')
  const themeMapping = JSON.parse(readFileSync(themeMappingPath, 'utf8'))

  const store = new PayloadLegacyMigrationStore(payload)
  const executed = await executeLegacyMigration(
    {
      wxr: wxrContent,
      themeMapping,
    },
    store,
    {
      targetSiteMode: 'new-isolated-site',
      newSiteName: `Browser Review Site ${suffix}`,
      newSiteSlug: `browser-review-${suffix}`,
      remoteMediaDownloadAllowed: false,
    },
  )

  const runId = executed.runId
  expect(runId).toBeDefined()

  try {
    // 3. Navigate to the Legacy Migration Review page
    await page.goto(`/admin/migration?runId=${runId}`)

    // 4. Verify Header, Run ID, and Initial Stage
    await expect(page.getByText('Legacy Site Migration Review')).toBeVisible()
    await expect(page.getByText(`Run ID: ${runId}`)).toBeVisible()
    await expect(page.getByText('executed', { exact: false })).toBeVisible()

    // 5. Verify Metrics Bar
    await expect(page.getByText('Posts & Pages')).toBeVisible()
    await expect(page.getByText('Taxonomy')).toBeVisible()
    await expect(page.getByText('Quarantined')).toBeVisible()

    // 6. Verify Acceptance Checklist section
    await expect(page.getByText('Acceptance Checklist')).toBeVisible()
    await expect(page.getByText('Content counts & checksums reconciled')).toBeVisible()
    await expect(page.getByText('URLs & redirects loop-free')).toBeVisible()
    await expect(page.getByText('Templates use registered components only')).toBeVisible()
    await expect(page.getByText('No arbitrary PHP / scripts / styles execution')).toBeVisible()

    // 7. Verify Side-by-Side Reconciliation Table
    await expect(page.getByText('Source & Renegade Reconciliation')).toBeVisible()
    await expect(
      page.getByText('Investigating Algorithmic Censorship in Digital Platforms'),
    ).toBeVisible()
    await expect(page.getByText('About Renegade Tribune')).toBeVisible()

    // 8. Test Presentation Tab
    await page.getByRole('button', { name: /presentation/i }).click()
    await expect(page.getByText('Derived Design Tokens')).toBeVisible()
    await expect(page.getByText('Serif Editorial')).toBeVisible()
    await expect(page.getByText('Reconstructed Templates')).toBeVisible()
    await expect(page.getByText('Page Template')).toBeVisible()
    await expect(page.getByText('Post Template')).toBeVisible()

    // 9. Test Redirects Tab
    await page.getByRole('button', { name: /redirects/i }).click()
    await expect(page.getByText('Preserved URLs & Redirect Plan')).toBeVisible()
    await expect(page.getByText('/2026/08/investigating-algorithmic-censorship')).toBeVisible()
    await expect(page.getByText('/articles/investigating-algorithmic-censorship')).toBeVisible()
    await expect(page.getByText('308', { exact: false })).toBeVisible()

    // 10. Test Quarantined Artifacts Tab
    await page.getByRole('button', { name: /quarantined/i }).click()
    await expect(page.getByText('Quarantined Artifacts Viewer')).toBeVisible()
    await expect(page.getByText('wpforms', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('woocommerce', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Arbitrary PHP code execution is disabled', { exact: false })).toBeVisible()

    // 11. Trigger "Verify Reconciliation"
    const verifyBtn = page.getByRole('button', { name: /verify reconciliation/i })
    await expect(verifyBtn).toBeVisible()
    await verifyBtn.click()

    // Wait for stage to update to 'verified'
    await expect(page.getByText('verified', { exact: false }).first()).toBeVisible()

    // 12. Trigger "Activate Migration" (Deliberate human activation)
    const activateBtn = page.getByRole('button', { name: /activate migration/i })
    await expect(activateBtn).toBeVisible()
    await activateBtn.click()

    // Wait for stage to update to 'activated'
    await expect(page.getByText('activated', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Activated & Live')).toBeVisible()
  } finally {
    // 13. Rollback and cleanup created site and admin session
    await rollbackLegacyMigration(runId, store, 'lead-editor@renegade.dev').catch(() => {})
    await payload.db.pool.query('DELETE FROM admin_sessions WHERE id = $1', [session.sessionId]).catch(() => {})
  }
})
