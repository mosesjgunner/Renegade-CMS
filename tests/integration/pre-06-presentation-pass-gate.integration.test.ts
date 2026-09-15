import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  changeTheme,
  createThemePreview,
  readThemeState,
  resolveConfiguration,
  themePool,
  type ThemePool,
} from '../../src/modules/presentation/lifecycle'
import {
  checkLayoutDeletionSafeguards,
  createPageFromTemplate,
  createPattern,
  createTemplate,
  instantiatePattern,
  rollbackLayout,
} from '../../src/modules/presentation/composition'
import type { LayoutBlock } from '../../src/modules/public/page-builder'
import {
  inspectLegacySite,
  dryRunPreflight,
  executeLegacyMigration,
  activateLegacyMigration,
  rollbackLegacyMigration,
} from '../../src/modules/portability/legacy-migration/pipeline'
import { PayloadLegacyMigrationStore } from '../../src/modules/portability/legacy-migration/store'
import { ensureRenegadePartyDemo, type DemoEnvironment } from '../helpers/renegadeparty-demo'

let payload: Payload
let pool: ThemePool
let demo: DemoEnvironment

beforeAll(async () => {
  payload = await getPayload({ config })
  pool = themePool(payload)
  demo = await ensureRenegadePartyDemo(payload)
}, 120_000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('PRE-06 Presentation Pass Gate — PostgreSQL Integration Suite', () => {
  describe('1. Theme lifecycle, preview isolation, atomic activation, upgrade, and rollback', () => {
    it('exercises complete theme lifecycle: draft, preview isolation, atomic activation, upgrade, and rollback', async () => {
      const siteId = demo.siteId

      // 1. Reset theme state to clean neutral-starter without custom tokens before test
      const initial = await readThemeState(pool, siteId)
      const resetDraft = await changeTheme(pool, {
        site: siteId,
        actor: demo.userId,
        revision: initial.revision,
        action: 'draft',
        id: 'neutral-starter',
        version: '1.0.0',
        tokens: {},
      })
      const cleanState = await changeTheme(pool, {
        site: siteId,
        actor: demo.userId,
        revision: resetDraft.revision,
        action: 'activate',
      })
      expect(cleanState.revision).toBeGreaterThanOrEqual(0)
      expect(cleanState.active?.tokens['color.accent']).toBeUndefined()

      // 2. Save theme draft with custom validated tokens
      const draftState = await changeTheme(pool, {
        site: siteId,
        actor: demo.userId,
        revision: cleanState.revision,
        action: 'draft',
        id: 'renegade-party',
        version: '1.0.0',
        tokens: {
          'color.canvas': '#f8f6f0',
          'color.accent': '#b91c1c',
          'radii.normal': '0.75rem',
        },
      })
      expect(draftState.draft?.id).toBe('renegade-party')
      expect(draftState.draft?.tokens['color.accent']).toBe('#b91c1c')

      // 3. Create authenticated preview token
      const previewToken = await createThemePreview(pool, siteId, demo.userId, draftState.revision)
      expect(previewToken).toBeTruthy()

      // 4. Resolve configuration: preview sees draft tokens, anonymous sees active
      const previewConfig = await resolveConfiguration(pool, siteId, {
        actor: demo.userId,
        token: previewToken,
      })
      expect(previewConfig?.id).toBe('renegade-party')
      expect(previewConfig?.tokens['color.accent']).toBe('#b91c1c')

      const anonymousConfig = await resolveConfiguration(pool, siteId)
      expect(anonymousConfig?.tokens['color.accent']).toBeUndefined()

      // Unauthenticated visitor with stolen preview token cannot see preview
      const intruderConfig = await resolveConfiguration(pool, siteId, {
        actor: 'intruder-id',
        token: previewToken,
      })
      expect(intruderConfig?.tokens['color.accent']).toBeUndefined()

      // 5. Atomic activation
      const activatedState = await changeTheme(pool, {
        site: siteId,
        actor: demo.userId,
        revision: draftState.revision,
        action: 'activate',
      })
      expect(activatedState.active?.id).toBe('renegade-party')
      expect(activatedState.active?.tokens['color.accent']).toBe('#b91c1c')

      // Verify audit trail recorded in presentation_theme_audit
      const auditResult = await pool.query(
        'SELECT * FROM presentation_theme_audit WHERE site_id = $1 ORDER BY created_at DESC LIMIT 5',
        [siteId],
      )
      expect(auditResult.rows.length).toBeGreaterThan(0)
      const latestAudit = auditResult.rows[0]
      expect(latestAudit.action).toBe('activate')
      const auditConfig =
        typeof latestAudit.configuration === 'string'
          ? JSON.parse(latestAudit.configuration)
          : latestAudit.configuration
      expect(auditConfig.id).toBe('renegade-party')

      // 6. Theme upgrade and rollback
      const upgradeDraft = await changeTheme(pool, {
        site: siteId,
        actor: demo.userId,
        revision: activatedState.revision,
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
      expect(upgradedState.active?.id).toBe('neutral-starter')
      expect(upgradedState.active?.version).toBe('1.1.0')

      // Rollback to previous
      const rolledBackState = await changeTheme(pool, {
        site: siteId,
        actor: demo.userId,
        revision: upgradedState.revision,
        action: 'rollback',
      })
      expect(rolledBackState.active?.id).toBe('renegade-party')
    })
  })

  describe('2. Reusable visual composition: templates, patterns, globals, safeguards, and draft isolation', () => {
    const heroBlock: LayoutBlock = {
      id: `hero-${randomUUID().slice(0, 6)}`,
      component: 'publisher.hero',
      componentVersion: 1,
      props: {
        title: 'Campaign 2026: Liberty & Decentralization',
        body: 'Autonomous publishing for free communities.',
        alignment: 'center',
        spacing: 'normal',
        width: 'standard',
        background: 'canvas',
        emphasis: 'bold',
      },
      visible: { desktop: true, tablet: true, mobile: true },
    }

    const featureGridBlock: LayoutBlock = {
      id: `fg-${randomUUID().slice(0, 6)}`,
      component: 'publisher.feature-grid',
      componentVersion: 1,
      props: {
        title: 'Key Movement Initiatives',
        body: 'Decentralized records, citizen sovereignty, transparent elections.',
        alignment: 'left',
        spacing: 'normal',
        width: 'standard',
        background: 'surface',
        emphasis: 'normal',
      },
      visible: { desktop: true, tablet: true, mobile: true },
    }

    const ctaBlock: LayoutBlock = {
      id: `cta-${randomUUID().slice(0, 6)}`,
      component: 'publisher.cta',
      componentVersion: 1,
      props: {
        title: 'Join the Movement',
        body: 'Become a delegate in your local precinct assembly.',
        alignment: 'center',
        spacing: 'compact',
        width: 'wide',
        background: 'brand',
        emphasis: 'bold',
      },
      visible: { desktop: true, tablet: true, mobile: true },
    }

    it('creates reusable template, pattern, and instantiates into layout', async () => {
      const siteId = demo.siteId

      // 1. Create reusable template
      const template = await createTemplate(payload, {
        siteId,
        name: 'Campaign Landing Template',
        themeId: 'renegade-party',
        category: 'Campaigns',
        blocks: [heroBlock, featureGridBlock, ctaBlock],
      })
      expect(template.id).toBeTruthy()
      expect(template.surface).toBe('template')
      expect(template.blocks.length).toBe(3)

      // 2. Create reusable pattern
      const pattern = await createPattern(payload, {
        siteId,
        name: 'Movement Action Section',
        themeId: 'renegade-party',
        blocks: [ctaBlock],
      })
      expect(pattern.id).toBeTruthy()
      expect(pattern.surface).toBe('pattern')

      // 3. Instantiate pattern snapshot into new blocks
      const snapshotBlocks = instantiatePattern(pattern, 'snapshot')
      expect(snapshotBlocks.length).toBe(1)
      expect(snapshotBlocks[0].component).toBe('publisher.cta')
      expect(snapshotBlocks[0].id).not.toBe(ctaBlock.id)

      // 4. Instantiate pattern linked reference
      const linkedBlocks = instantiatePattern(pattern, 'linked')
      expect(linkedBlocks.length).toBe(1)
      expect(linkedBlocks[0].component).toBe('publisher.pattern')
      expect(linkedBlocks[0].props.patternId).toBe(pattern.id)

      // 5. Create page from template
      const rallyPath = `/rally-${randomUUID().slice(0, 6)}`
      const pageLayout = await createPageFromTemplate(payload, {
        siteId,
        path: rallyPath,
        name: 'Rally 2026',
        templateId: template.id,
      })
      expect(pageLayout.path).toBe(rallyPath)
      expect(pageLayout.templateId).toBe(template.id)
      expect(pageLayout.templateMode).toBe('inherited')
      expect(pageLayout.blocks.length).toBe(3)

      // 6. Deletion safeguard: attempting to delete template while in use by rally page is blocked
      const checkResult = await checkLayoutDeletionSafeguards(payload, template.id)
      expect(checkResult.safe).toBe(false)
      expect(checkResult.reason).toBeTruthy()
      expect(checkResult.referencingPages?.length).toBeGreaterThanOrEqual(1)
    })

    it('creates global announcement region and exercises versioned rollback', async () => {
      const siteId = demo.siteId
      const announcementPath = `/global/announcement-${randomUUID().slice(0, 6)}`
      const v1Blocks = [
        {
          id: 'banner-v1',
          component: 'publisher.cta',
          componentVersion: 1,
          props: {
            title: 'National Assembly Registration Open',
            body: 'Early credentialing ends Friday.',
          },
        },
      ]
      const v2Blocks = [
        {
          id: 'banner-v2',
          component: 'publisher.cta',
          componentVersion: 1,
          props: {
            title: 'National Assembly Registration Closed',
            body: 'Credentials distributed at door.',
          },
        },
      ]

      // 1. Create global announcement region
      const globalDoc = (await payload.create({
        collection: 'page-layouts',
        data: {
          site: siteId,
          path: announcementPath,
          name: 'Movement Alert Banner',
          surface: 'global',
          slot: 'announcement',
          themeId: 'renegade-party',
          status: 'published',
          blocks: v1Blocks,
          revision: 1,
          publishedRevision: 1,
          revisionHistory: [
            {
              revision: 1,
              blocks: v1Blocks,
              savedAt: new Date().toISOString(),
            },
          ],
        },
        overrideAccess: true,
      } as never)) as unknown as { id: string }

      // 2. Update to Revision 2
      await payload.update({
        collection: 'page-layouts',
        id: globalDoc.id,
        data: {
          blocks: v2Blocks,
          revision: 2,
          publishedRevision: 2,
          revisionHistory: [
            {
              revision: 1,
              blocks: v1Blocks,
              savedAt: new Date().toISOString(),
            },
            {
              revision: 2,
              blocks: v2Blocks,
              savedAt: new Date().toISOString(),
            },
          ],
        },
        overrideAccess: true,
      } as never)

      // 3. Rollback to Revision 1
      const rolledBack = await rollbackLayout(payload, {
        layoutId: globalDoc.id,
        targetRevision: 1,
      })
      expect(rolledBack.revision).toBe(3) // new revision created containing restored v1 state
      expect(rolledBack.blocks[0].id).toBe('banner-v1')
    })
  })

  describe('3. Legacy site migration end-to-end integration and quarantine boundary', () => {
    it('executes preflight, imports into isolated site, verifies database, activates, and rolls back cleanly', async () => {
      const store = new PayloadLegacyMigrationStore(payload)
      const fixtureDir = path.resolve(__dirname, '../fixtures/legacy-migration')
      const wxr = readFileSync(path.join(fixtureDir, 'wordpress-fixture.xml'), 'utf8')
      const themeMapping = JSON.parse(
        readFileSync(path.join(fixtureDir, 'theme-mapping.json'), 'utf8'),
      )
      const pkg = { wxr, themeMapping }

      // 1. Inspect
      const inspectResult = inspectLegacySite(pkg)
      expect(inspectResult.valid).toBe(true)

      // 2. Preflight Dry-Run
      const options = {
        actorId: demo.userId,
        targetSiteMode: 'new-isolated-site' as const,
        newSiteName: `Isolated Tribune Test ${Date.now()}`,
        newSiteSlug: `tribune-iso-${Date.now()}`,
        remoteMediaDownloadAllowed: false,
      }
      const preflight = await dryRunPreflight(pkg, store, options)
      expect(preflight.stage).toBe('dry-run')
      expect(preflight.acceptanceChecklist.renderedTemplatesValid).toBe(true)
      expect(preflight.acceptanceChecklist.themeSafeNoArbitraryExec).toBe(true)
      expect(preflight.acceptanceChecklist.unsupportedQuarantined).toBe(true)

      // 3. Execute migration
      const executed = await executeLegacyMigration(pkg, store, options)
      expect(executed.stage).toBe('imported')
      expect(executed.siteId).toBeTruthy()
      const importedSiteId = executed.siteId!

      // Verify PostgreSQL records in legacy_migration_runs and legacy_migration_quarantine
      const savedRun = await store.getMigrationRun(executed.runId)
      expect(savedRun?.runId).toBe(executed.runId)
      expect(savedRun?.stage).toBe('imported')

      const quarantine = await store.getQuarantineRecords(executed.runId)
      expect(quarantine.length).toBeGreaterThanOrEqual(6)
      expect(quarantine.some((q) => q.kind === 'php-code')).toBe(true)
      expect(quarantine.some((q) => q.kind === 'script')).toBe(true)

      // 4. Deliberate Activation
      const activated = await activateLegacyMigration(executed.runId, store, 'test-actor-gate')
      expect(activated.stage).toBe('activated')

      // 5. Clean Rollback (Cascade deletion of isolated site and dependent records)
      const rolledBack = await rollbackLegacyMigration(executed.runId, store, 'test-actor-gate')
      expect(rolledBack.stage).toBe('rolled-back')

      // Verify site was deleted from PostgreSQL
      const siteCheck = await payload.find({
        collection: 'sites',
        where: { id: { equals: importedSiteId } },
        overrideAccess: true,
      } as never)
      expect(siteCheck.docs.length).toBe(0)
    })
  })
})
