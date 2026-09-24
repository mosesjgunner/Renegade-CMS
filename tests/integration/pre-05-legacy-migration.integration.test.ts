import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import {
  inspectLegacySite,
  dryRunPreflight,
  executeLegacyMigration,
  verifyLegacyMigration,
  activateLegacyMigration,
  rollbackLegacyMigration,
} from '../../src/modules/portability/legacy-migration/pipeline'
import { PayloadLegacyMigrationStore } from '../../src/modules/portability/legacy-migration/store'
import type {
  LegacySitePackage,
  LegacyThemeMapping,
} from '../../src/modules/portability/legacy-migration/types'

let payload: Payload
let store: PayloadLegacyMigrationStore
let fixturePackage: LegacySitePackage

beforeAll(async () => {
  payload = await getPayload({ config })
  store = new PayloadLegacyMigrationStore(payload)

  const fixtureDir = path.resolve(__dirname, '../fixtures/legacy-migration')
  const wxr = await readFile(path.join(fixtureDir, 'wordpress-fixture.xml'), 'utf8')
  const mappingRaw = await readFile(path.join(fixtureDir, 'theme-mapping.json'), 'utf8')
  const themeMapping = JSON.parse(mappingRaw) as LegacyThemeMapping

  fixturePackage = {
    wxr,
    themeMapping,
  }
}, 120000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('PRE-05 Legacy Site Migration Integration Tests', () => {
  it('executes end-to-end migration into isolated site, verifies database records, activates, and cleanly rolls back', async () => {
    // 1. Stage 1: Inspect legacy site package
    const inspectResult = inspectLegacySite(fixturePackage)
    expect(inspectResult.valid).toBe(true)
    expect(inspectResult.sourceChecksum).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(inspectResult.summary.posts).toBeGreaterThanOrEqual(3)
    expect(inspectResult.summary.pages).toBeGreaterThanOrEqual(3)
    expect(inspectResult.summary.authors).toBeGreaterThanOrEqual(2)
    expect(inspectResult.summary.categories).toBeGreaterThanOrEqual(3)
    expect(inspectResult.summary.tags).toBeGreaterThanOrEqual(3)
    expect(inspectResult.detectedUnsupportedCount).toBeGreaterThanOrEqual(6)

    // 2. Stage 2: Dry Run / Preflight
    const options = {
      actorId: 'operator-integration-test',
      targetSiteMode: 'new-isolated-site' as const,
      newSiteName: 'Integration Tribune Test Site',
      newSiteSlug: `tribune-int-${Date.now()}`,
      remoteMediaDownloadAllowed: false,
    }
    const preflight = await dryRunPreflight(fixturePackage, store, options)
    expect(preflight.stage).toBe('dry-run')
    expect(preflight.reconciliation.created.content).toBeGreaterThanOrEqual(6)
    expect(preflight.quarantine.length).toBeGreaterThanOrEqual(6)
    expect(preflight.redirectPlan.length).toBeGreaterThanOrEqual(6)
    expect(preflight.acceptanceChecklist.urlsAndRedirectsLoopFree).toBe(true)

    // 3. Stage 3: Execute migration into real PostgreSQL and Payload CMS collections
    const executed = await executeLegacyMigration(fixturePackage, store, options)
    expect(executed.stage).toBe('imported')
    expect(executed.siteId).toBeDefined()
    const siteId = executed.siteId!

    // Verify Run saved in PostgreSQL legacy_migration_runs table
    const savedRun = await store.getMigrationRun(executed.runId)
    expect(savedRun).toBeDefined()
    expect(savedRun?.runId).toBe(executed.runId)
    expect(savedRun?.stage).toBe('imported')

    // Verify Quarantine persisted in PostgreSQL legacy_migration_quarantine table
    const quarantineRecords = await store.getQuarantineRecords(executed.runId)
    expect(quarantineRecords.length).toBeGreaterThanOrEqual(6)
    const phpQuarantine = quarantineRecords.find((q) => q.kind === 'php-code')
    expect(phpQuarantine).toBeDefined()
    expect(phpQuarantine?.rawSource).toContain('echo "Legacy PHP query execution"')
    const scriptQuarantine = quarantineRecords.find((q) => q.kind === 'script')
    expect(scriptQuarantine).toBeDefined()

    // Verify isolated site created in 'sites' collection
    const createdSite = await payload.findByID({
      collection: 'sites',
      id: siteId,
      overrideAccess: true,
    })
    expect(createdSite).toBeDefined()
    expect(createdSite.name).toBe(options.newSiteName)

    // Verify authors created in 'authors' collection
    const authorsResult = await payload.find({
      collection: 'authors',
      where: { slug: { in: ['chief-editor', 'sarah-scribe'] } },
      overrideAccess: true,
    })
    expect(authorsResult.docs.length).toBeGreaterThanOrEqual(2)
    const editor = authorsResult.docs.find(
      (a) => (a as unknown as { displayName?: string }).displayName === 'Marcus Vance',
    )
    expect(editor).toBeDefined()

    // Verify categories and tags created
    const categoriesResult = await payload.find({
      collection: 'categories',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    expect(categoriesResult.docs.length).toBeGreaterThanOrEqual(3)

    const tagsResult = await payload.find({
      collection: 'tags',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    expect(tagsResult.docs.length).toBeGreaterThanOrEqual(3)

    // Verify content (posts & pages) created with Lexical body and SEO metadata
    const contentResult = await payload.find({
      collection: 'content',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    expect(contentResult.docs.length).toBeGreaterThanOrEqual(6)

    // Verify SEO metadata on post
    const censorshipPost = contentResult.docs.find(
      (c) => (c as unknown as { slug?: string }).slug === 'investigating-algorithmic-censorship',
    ) as unknown as Record<string, unknown> | undefined
    expect(censorshipPost).toBeDefined()
    expect(censorshipPost?.seoTitle).toBe('Investigating Algorithmic Censorship | Special Report')
    expect(censorshipPost?.seoDescription).toContain('automated systems altering public discourse')

    // Verify public redirects created with 308 status
    const redirectsResult = await payload.find({
      collection: 'public-redirects',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    expect(redirectsResult.docs.length).toBeGreaterThanOrEqual(1)
    const postRedirect = redirectsResult.docs.find(
      (r) =>
        (r as unknown as { fromPath?: string }).fromPath ===
        '/2026/08/investigating-algorithmic-censorship',
    ) as unknown as Record<string, unknown> | undefined
    expect(postRedirect).toBeDefined()
    expect(postRedirect?.toPath).toBe('/articles/investigating-algorithmic-censorship')
    expect(postRedirect?.statusCode).toBe('308')

    // Verify page layouts reconstructed in DRAFT status
    const layoutsResult = await payload.find({
      collection: 'page-layouts',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    expect(layoutsResult.docs.length).toBeGreaterThanOrEqual(3)
    for (const layout of layoutsResult.docs as unknown as Array<Record<string, unknown>>) {
      expect(layout.status).toBe('draft') // Deliberately DRAFT!
      expect(layout.themeId).toBe('neutral-starter')
    }

    // 4. Stage 4: Verify Reconciliation
    const verified = await verifyLegacyMigration(executed.runId, store)
    expect(verified.stage).toBe('verified')
    expect(verified.acceptanceChecklist.contentCountsMatch).toBe(true)
    expect(verified.acceptanceChecklist.urlsAndRedirectsLoopFree).toBe(true)
    expect(verified.acceptanceChecklist.renderedTemplatesValid).toBe(true)
    expect(verified.acceptanceChecklist.themeSafeNoArbitraryExec).toBe(true)

    // 5. Stage 5: Deliberate Human Activation Action
    const activated = await activateLegacyMigration(
      executed.runId,
      store,
      'lead-editor@renegade.dev',
    )
    expect(activated.stage).toBe('activated')
    expect(activated.activatedAt).toBeDefined()

    // Verify all layouts are now PUBLISHED
    const publishedLayouts = await payload.find({
      collection: 'page-layouts',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    for (const layout of publishedLayouts.docs as unknown as Array<Record<string, unknown>>) {
      expect(layout.status).toBe('published')
    }

    // 6. Stage 6: Rollback and clean deletion
    const rolledBack = await rollbackLegacyMigration(
      executed.runId,
      store,
      'lead-editor@renegade.dev',
    )
    expect(rolledBack.stage).toBe('rolled-back')

    // Verify site is deleted
    const siteAfterRollback = await store.findSite(siteId)
    expect(siteAfterRollback).toBeNull()

    // Verify content and layouts cleaned up
    const remainingContent = await payload.find({
      collection: 'content',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    expect(remainingContent.docs.length).toBe(0)

    const remainingLayouts = await payload.find({
      collection: 'page-layouts',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    expect(remainingLayouts.docs.length).toBe(0)
  }, 180000)
})
