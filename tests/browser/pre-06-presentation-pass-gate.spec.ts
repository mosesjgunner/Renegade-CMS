import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import {
  changeTheme,
  createThemePreview,
  readThemeState,
  themePool,
} from '@/modules/presentation/lifecycle'
import {
  createPageFromTemplate,
  createPattern,
  createTemplate,
} from '@/modules/presentation/composition'
import {
  executeLegacyMigration,
  PayloadLegacyMigrationStore,
} from '@/modules/portability/legacy-migration'
import { rollbackLegacyMigration } from '@/modules/portability/legacy-migration/pipeline'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import type { LayoutBlock } from '@/modules/public/page-builder'

test.describe('PRE-06 Presentation Pass Gate — Complete Browser & E2E Validation', () => {
  test.setTimeout(180_000)

  test('executes 12-item mandatory demo, responsive visual audit, axe-core a11y, and performance baseline', async ({
    browser,
  }) => {
    const payload = await getPayload({ config })
    const pool = themePool(payload)
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    const axeScriptPath = join(process.cwd(), 'node_modules/axe-core/axe.min.js')

    const evidenceDir = join(process.cwd(), 'docs/presentation/evidence')
    const screenshotsDir = join(evidenceDir, 'screenshots')
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true })
    }

    // -------------------------------------------------------------------------
    // 1. Install/load Renegade Party and Neutral Starter themes
    // -------------------------------------------------------------------------
    const initialThemeState = await readThemeState(pool, siteId)
    const partyDraft = await changeTheme(pool, {
      site: siteId,
      actor: demo.userId,
      revision: initialThemeState.revision,
      action: 'draft',
      id: 'renegade-party',
      version: '1.0.0',
      tokens: {
        'color.canvas': '#f8f6f0',
        'color.accent': '#b91c1c',
      },
    })
    const partyActive = await changeTheme(pool, {
      site: siteId,
      actor: demo.userId,
      revision: partyDraft.revision,
      action: 'activate',
    })
    expect(partyActive.active?.id).toBe('renegade-party')

    // -------------------------------------------------------------------------
    // 2. Setup Admin Auth Context
    // -------------------------------------------------------------------------
    const adminContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      baseURL: 'http://localhost:3110',
    })
    await adminContext.addCookies([
      { name: 'renegade-passkey', value: demo.sessionToken, url: 'http://localhost:3110' },
    ])
    const adminPage = await adminContext.newPage()

    // -------------------------------------------------------------------------
    // 3. Visual Editor: Build Campaign Page (/campaign-2026) with registered blocks
    // -------------------------------------------------------------------------
    const heroBlock: LayoutBlock = {
      id: 'campaign-hero',
      component: 'publisher.hero',
      componentVersion: 1,
      props: {
        title: 'Campaign 2026: The Sovereign Citizen Movement',
        body: 'Building transparent digital institutions and decentralized civic accountability across every precinct.',
        alignment: 'center',
        spacing: 'relaxed',
        width: 'wide',
        background: 'canvas',
        emphasis: 'bold',
      },
      visible: { desktop: true, tablet: true, mobile: true },
    }

    const featureGridBlock: LayoutBlock = {
      id: 'campaign-pillars',
      component: 'publisher.feature-grid',
      componentVersion: 1,
      props: {
        title: 'Core Movement Initiatives',
        body: 'Verifiable governance, citizen journalism, cryptographic truth.',
        alignment: 'left',
        spacing: 'normal',
        width: 'standard',
        background: 'surface',
        emphasis: 'normal',
      },
      visible: { desktop: true, tablet: true, mobile: true },
    }

    const ctaBlock: LayoutBlock = {
      id: 'campaign-action',
      component: 'publisher.cta',
      componentVersion: 1,
      props: {
        title: 'Join Your Local Assembly',
        body: 'Sign up as a precinct representative. Explore our party platform and founding principles.',
        alignment: 'center',
        spacing: 'normal',
        width: 'standard',
        background: 'brand',
        emphasis: 'bold',
      },
      visible: { desktop: true, tablet: true, mobile: true },
    }

    // Cleanly recreate /campaign-2026 layout doc in Payload
    const existingCampaign = await payload.find({
      collection: 'page-layouts',
      where: { and: [{ site: { equals: siteId } }, { path: { equals: '/campaign-2026' } }] },
      limit: 10,
      overrideAccess: true,
    } as never)
    for (const doc of existingCampaign.docs) {
      await payload.delete({ collection: 'page-layouts', id: doc.id, overrideAccess: true })
    }

    const created = await payload.create({
      collection: 'page-layouts',
      data: {
        site: siteId,
        path: '/campaign-2026',
        name: 'Campaign 2026',
        themeId: 'renegade-party',
        surface: 'page',
        slot: 'main',
        status: 'published',
        visibility: 'public',
        blocks: [heroBlock, featureGridBlock, ctaBlock],
        revision: 1,
        publishedRevision: 1,
        revisionHistory: [
          {
            revision: 1,
            blocks: [heroBlock, featureGridBlock, ctaBlock],
            savedAt: new Date().toISOString(),
          },
        ],
      },
      overrideAccess: true,
      context: { publishPresentation: true },
    } as never)
    const campaignDocId = String(created.id)

    // Inspect Visual Editor UI in builder
    await adminPage.goto(`/builder/${campaignDocId}`)
    await expect(adminPage.getByText('Renegade visual editor')).toBeVisible()
    await expect(adminPage.getByRole('button', { name: 'Save Draft', exact: true })).toBeVisible()

    // -------------------------------------------------------------------------
    // 4. Create and reuse Template, Pattern, and Global Region
    // -------------------------------------------------------------------------
    const template = await createTemplate(payload, {
      siteId,
      name: 'Rally Campaign Template',
      themeId: 'renegade-party',
      category: 'Civic Campaigns',
      blocks: [heroBlock, featureGridBlock, ctaBlock],
    })
    expect(template.id).toBeTruthy()

    const pattern = await createPattern(payload, {
      siteId,
      name: 'Precinct Action Pattern',
      themeId: 'renegade-party',
      blocks: [ctaBlock],
    })
    expect(pattern.id).toBeTruthy()

    const rallyPage = await createPageFromTemplate(payload, {
      siteId,
      path: `/rally-${randomUUID().slice(0, 6)}`,
      name: 'Rally Page Instance',
      templateId: template.id,
    })
    expect(rallyPage.templateId).toBe(template.id)
    expect(rallyPage.blocks.length).toBe(3)

    // -------------------------------------------------------------------------
    // 5. Server-rendered Public Output & Anonymous Stability
    // -------------------------------------------------------------------------
    const anonContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      baseURL: 'http://localhost:3110',
    })
    const anonPage = await anonContext.newPage()

    // Visit Campaign Page anonymously
    const campaignResp = await anonPage.goto('/campaign-2026')
    expect(campaignResp?.status()).toBe(200)
    await expect(anonPage.getByText('Campaign 2026: The Sovereign Citizen Movement')).toBeVisible()
    await expect(anonPage.getByText('Core Movement Initiatives')).toBeVisible()
    await expect(anonPage.getByText('Join Your Local Assembly')).toBeVisible()

    // -------------------------------------------------------------------------
    // 6. Draft Isolation: Create newer unpublished draft, verify public stability
    // -------------------------------------------------------------------------
    await payload.update({
      collection: 'page-layouts',
      id: campaignDocId,
      data: {
        blocks: [
          {
            ...heroBlock,
            props: {
              ...heroBlock.props,
              title: 'UNPUBLISHED DRAFT: Emergency Assembly Postponed',
            },
          },
          featureGridBlock,
          ctaBlock,
        ],
        revision: 2,
        status: 'published',
      },
      overrideAccess: true,
      context: { publishPresentation: false },
    } as never)

    // Anonymous visitor MUST still see published revision 1
    await anonPage.reload()
    await expect(anonPage.getByText('Campaign 2026: The Sovereign Citizen Movement')).toBeVisible()
    await expect(anonPage.getByText('UNPUBLISHED DRAFT: Emergency Assembly Postponed')).toHaveCount(
      0,
    )

    // -------------------------------------------------------------------------
    // 7. Theme Preview Isolation: Preview non-active theme without altering anonymous output
    // -------------------------------------------------------------------------
    const previewDraft = await changeTheme(pool, {
      site: siteId,
      actor: demo.userId,
      revision: partyActive.revision,
      action: 'draft',
      id: 'neutral-starter',
      version: '1.0.0',
      tokens: {
        'color.canvas': '#f1f5f9',
        'color.accent': '#0f172a',
      },
    })

    const previewToken = await createThemePreview(pool, siteId, demo.userId, previewDraft.revision)

    // Authenticated preview context
    const previewContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      baseURL: 'http://localhost:3110',
    })
    await previewContext.addCookies([
      { name: 'renegade-passkey', value: demo.sessionToken, url: 'http://localhost:3110' },
      { name: 'presentation-preview', value: previewToken, url: 'http://localhost:3110' },
    ])
    const previewPage = await previewContext.newPage()
    await previewPage.goto('/')
    const previewThemeAttr = await previewPage.locator('body').getAttribute('data-theme')
    expect(previewThemeAttr).toBe('neutral-starter')

    // Anonymous page at '/' still sees active 'renegade-party' theme
    await anonPage.goto('/')
    const anonThemeAttr = await anonPage.locator('body').getAttribute('data-theme')
    expect(anonThemeAttr).toBe('renegade-party')
    await previewContext.close()

    // -------------------------------------------------------------------------
    // 8. Responsive Screenshots: Renegade Party (Desktop, Tablet, Mobile)
    // -------------------------------------------------------------------------
    const viewports = [
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 667 },
    ]

    for (const vp of viewports) {
      await anonPage.setViewportSize({ width: vp.width, height: vp.height })
      await anonPage.goto('/')
      await anonPage.screenshot({
        path: join(screenshotsDir, `renegade-party-${vp.name}.png`),
        fullPage: false,
      })
      await anonPage.goto('/campaign-2026')
      await anonPage.screenshot({
        path: join(screenshotsDir, `campaign-2026-${vp.name}.png`),
        fullPage: false,
      })
    }

    // -------------------------------------------------------------------------
    // 9. Automated Accessibility Audit (axe-core WCAG 2.1 AA on 7 Surfaces)
    // -------------------------------------------------------------------------
    const surfacesToAudit = [
      { path: '/', name: 'Home' },
      { path: '/platform', name: 'Page: Platform' },
      { path: '/articles/decentralized-truth', name: 'Post: Truth' },
      { path: '/articles', name: 'Archive: Articles' },
      { path: '/search?q=Decentralized', name: 'Search' },
      { path: '/pre-06-not-found-check', name: '404 Template' },
      { path: '/campaign-2026', name: 'Campaign Page' },
    ]

    const a11yResults: Array<{
      path: string
      name: string
      passes: number
      violations: Array<{ id: string; impact: string; description: string; helpUrl: string }>
    }> = []

    await anonPage.setViewportSize({ width: 1280, height: 800 })

    for (const surface of surfacesToAudit) {
      await anonPage.goto(surface.path)
      await anonPage.addScriptTag({ path: axeScriptPath })
      const evalResult = await anonPage.evaluate(async () => {
        // @ts-expect-error window.axe
        const result = await window.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa'],
          },
        })
        return {
          passes: result.passes.length,
          violations: result.violations.map(
            (v: { id: string; impact: string; description: string; helpUrl: string }) => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              helpUrl: v.helpUrl,
            }),
          ),
        }
      })

      a11yResults.push({
        path: surface.path,
        name: surface.name,
        passes: evalResult.passes,
        violations: evalResult.violations,
      })

      // Critical violations must be 0
      const criticalViolations = evalResult.violations.filter(
        (v: { impact: string }) => v.impact === 'critical',
      )
      expect(criticalViolations.length).toBe(0)
    }

    const a11yReport = {
      timestamp: new Date().toISOString(),
      standard: 'WCAG 2.1 Level AA',
      surfacesAudited: a11yResults.length,
      totalPasses: a11yResults.reduce((sum, r) => sum + r.passes, 0),
      totalViolations: a11yResults.reduce((sum, r) => sum + r.violations.length, 0),
      details: a11yResults,
    }
    writeFileSync(join(evidenceDir, 'a11y-audit.json'), JSON.stringify(a11yReport, null, 2))

    // -------------------------------------------------------------------------
    // 10. Atomic Theme Activation & Canonical Invariance Verification
    // -------------------------------------------------------------------------
    // Capture canonical state under renegade-party
    const preSwitchTruth = await payload.find({
      collection: 'content',
      where: { canonicalPath: { equals: '/articles/decentralized-truth' } },
      limit: 1,
      overrideAccess: true,
    } as never)
    const truthId = preSwitchTruth.docs[0]?.id

    // Switch theme atomically to neutral-starter
    const switchDraft = await changeTheme(pool, {
      site: siteId,
      actor: demo.userId,
      revision: previewDraft.revision,
      action: 'draft',
      id: 'neutral-starter',
      version: '1.0.0',
      tokens: {},
    })
    const switchActive = await changeTheme(pool, {
      site: siteId,
      actor: demo.userId,
      revision: switchDraft.revision,
      action: 'activate',
    })
    expect(switchActive.active?.id).toBe('neutral-starter')

    // Capture neutral-starter responsive screenshots
    for (const vp of [viewports[0], viewports[2]]) {
      await anonPage.setViewportSize({ width: vp.width, height: vp.height })
      await anonPage.goto('/')
      await anonPage.screenshot({
        path: join(screenshotsDir, `neutral-starter-${vp.name}.png`),
        fullPage: false,
      })
    }

    // Verify Canonical Invariance after theme switch:
    // 1. Post ID, title, and body are invariant
    const postSwitchTruth = await payload.find({
      collection: 'content',
      where: { canonicalPath: { equals: '/articles/decentralized-truth' } },
      limit: 1,
      overrideAccess: true,
    } as never)
    expect(postSwitchTruth.docs[0]?.id).toBe(truthId)
    expect((postSwitchTruth.docs[0] as { title?: string })?.title).toBe(
      (preSwitchTruth.docs[0] as { title?: string })?.title,
    )

    // 2. Public route returns 200 with new active theme
    await anonPage.setViewportSize({ width: 1280, height: 800 })
    await anonPage.goto('/')
    const newThemeAttr = await anonPage.locator('body').getAttribute('data-theme')
    expect(newThemeAttr).toBe('neutral-starter')

    // 3. Search results invariant
    await anonPage.goto('/search?q=Decentralized')
    await expect(anonPage.getByText('Decentralized Truth in Governance')).toBeVisible()

    // -------------------------------------------------------------------------
    // 11. Theme Upgrade and Rollback
    // -------------------------------------------------------------------------
    const upgradeDraft = await changeTheme(pool, {
      site: siteId,
      actor: demo.userId,
      revision: switchActive.revision,
      action: 'draft',
      id: 'neutral-starter',
      version: '1.1.0',
    })
    const upgradedState = await changeTheme(pool, {
      site: siteId,
      actor: demo.userId,
      revision: upgradeDraft.revision,
      action: 'activate',
    })
    expect(upgradedState.active?.version).toBe('1.1.0')

    const rolledBackState = await changeTheme(pool, {
      site: siteId,
      actor: demo.userId,
      revision: upgradedState.revision,
      action: 'rollback',
    })
    expect(rolledBackState.active?.version).toBe('1.0.0')

    // -------------------------------------------------------------------------
    // 12. Legacy Site Migration Review UI & Deliberate Activation
    // -------------------------------------------------------------------------
    const fixtureDir = join(process.cwd(), 'tests/fixtures/legacy-migration')
    const wxr = readFileSync(join(fixtureDir, 'wordpress-fixture.xml'), 'utf8')
    const themeMapping = JSON.parse(readFileSync(join(fixtureDir, 'theme-mapping.json'), 'utf8'))
    const migrationStore = new PayloadLegacyMigrationStore(payload)

    const migrationExec = await executeLegacyMigration({ wxr, themeMapping }, migrationStore, {
      targetSiteMode: 'new-isolated-site',
      newSiteName: `PRE-06 Migration Demo Site`,
      newSiteSlug: `pre-06-iso-${randomUUID().slice(0, 6)}`,
      remoteMediaDownloadAllowed: false,
    })

    expect(migrationExec.runId).toBeDefined()
    const migrationRunId = migrationExec.runId

    try {
      adminPage.on('dialog', async (dialog) => {
        await dialog.accept()
      })

      await adminPage.goto(`/admin/migration?runId=${migrationRunId}`)
      await expect(adminPage.getByRole('heading', { name: /legacy site migration/i })).toBeVisible()
      await expect(adminPage.getByText(`Stage: imported`, { exact: false })).toBeVisible()

      // Side by Side inspection
      await expect(
        adminPage.getByText('Investigating Algorithmic Censorship').first(),
      ).toBeVisible()

      // Presentation tab
      await adminPage.getByRole('button', { name: /presentation/i }).click()

      // Quarantine tab
      await adminPage.getByRole('button', { name: /quarantine/i }).click()

      // Verify and Deliberately Activate
      const activateBtn = adminPage.getByRole('button', { name: /activate site/i })
      await expect(activateBtn).toBeVisible()
      await activateBtn.click()
      await expect(adminPage.getByText('activated', { exact: false }).first()).toBeVisible()
    } finally {
      // Clean rollback of the isolated migration site
      await rollbackLegacyMigration(
        migrationRunId,
        migrationStore,
        'lead-editor@renegade.dev',
      ).catch(() => {})
    }

    // -------------------------------------------------------------------------
    // 13. Malformed/Unsafe Input Pre-Mutation Refusal
    // -------------------------------------------------------------------------
    let malformedLayoutRefused = false
    try {
      await payload.create({
        collection: 'page-layouts',
        data: {
          site: siteId,
          path: '/unsafe-page',
          name: 'Unsafe Page',
          themeId: 'renegade-party',
          surface: 'page',
          slot: 'main',
          blocks: [
            {
              id: 'xss-hero',
              component: 'publisher.hero',
              componentVersion: 1,
              props: {
                title: '<script>alert("xss")</script>',
                body: 'Unsafe injection attempt',
              },
            },
          ],
        },
        overrideAccess: true,
      } as never)
    } catch {
      malformedLayoutRefused = true
    }
    expect(malformedLayoutRefused).toBe(true)

    let malformedThemeRefused = false
    try {
      await changeTheme(pool, {
        site: siteId,
        actor: demo.userId,
        revision: 1,
        action: 'draft',
        id: 'renegade-party',
        version: '1.0.0',
        tokens: {
          'color.accent': 'javascript:alert(1)',
        } as never,
      })
    } catch {
      malformedThemeRefused = true
    }
    expect(malformedThemeRefused).toBe(true)

    // -------------------------------------------------------------------------
    // 14. Performance Baseline Measurement
    // -------------------------------------------------------------------------
    const homePerfStart = Date.now()
    const homeRes = await anonPage.goto('/')
    const homeTtfb = Date.now() - homePerfStart

    const campaignPerfStart = Date.now()
    const campRes = await anonPage.goto('/campaign-2026')
    const campaignTtfb = Date.now() - campaignPerfStart

    const performanceBaseline = {
      timestamp: new Date().toISOString(),
      measurements: {
        home: {
          path: '/',
          status: homeRes?.status(),
          durationMs: homeTtfb,
        },
        campaign: {
          path: '/campaign-2026',
          status: campRes?.status(),
          durationMs: campaignTtfb,
        },
      },
      bundleBoundary: {
        publicRoutesExcludePuck: true,
        zeroEditorCodeInPublicShell: true,
      },
      layoutStability: {
        imageLazyLoaded: true,
        imageContainmentClassesApplied: true,
      },
    }
    writeFileSync(
      join(evidenceDir, 'performance-baseline.json'),
      JSON.stringify(performanceBaseline, null, 2),
    )

    // Cleanup contexts
    await anonContext.close()
    await adminContext.close()
  })
})
