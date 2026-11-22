import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  dryRunPreflight,
  executeLegacyMigration,
  inspectLegacySite,
  planLegacyMigration,
  verifyLegacyMigration,
} from '../../src/modules/portability/legacy-migration/pipeline'
import { MemoryLegacyMigrationStore } from '../../src/modules/portability/legacy-migration/store'
import type { LegacySitePackage } from '../../src/modules/portability/legacy-migration/types'

/**
 * RC3-08 — WordPress move journey at the pipeline level (memory store).
 *
 * The fixture is a representative small-business WordPress export:
 * two authors, hierarchical categories, posts with dated permalinks,
 * pages built from common blocks, one bundled media file, one remote
 * media file that is NOT bundled (downloads disallowed), a comment, a
 * shortcode, and one unsupported plugin block.
 */

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XcAAAAASUVORK5CYII='

let pkg: LegacySitePackage

beforeAll(async () => {
  const wxr = await readFile(
    path.resolve(__dirname, '../fixtures/legacy-migration/wordpress-rc308.xml'),
    'utf8',
  )
  pkg = {
    wxr,
    mediaFiles: {
      'workshop-hero.png': {
        buffer: Buffer.from(PNG_1PX, 'base64'),
        fileName: 'workshop-hero.png',
        mimeType: 'image/png',
      },
    },
  }
})

const options = {
  actorId: 'rc3-08-operator',
  targetSiteMode: 'new-isolated-site' as const,
  newSiteName: 'Harbor Light Studio',
  newSiteSlug: 'harbor-light-studio',
  remoteMediaDownloadAllowed: false,
}

describe('RC3-08 WordPress move — plan accounting', () => {
  it('inspects the export with exact source counts', () => {
    const inspected = inspectLegacySite(pkg)
    expect(inspected.valid).toBe(true)
    expect(inspected.summary).toMatchObject({
      posts: 2,
      pages: 2,
      authors: 2,
      categories: 2,
      tags: 2,
      menus: 1,
      media: 2,
    })
    expect(inspected.detectedUnsupportedCount).toBe(3)
  })

  it('accounts for every converted region and plans URLs honestly', () => {
    const plan = planLegacyMigration(pkg, options)
    const byPath = new Map(plan.urlPlan.plan.map((entry) => [entry.legacyPath, entry]))
    expect(byPath.get('/')?.status).toBe('compatible-direct')
    expect(byPath.get('/about')?.status).toBe('compatible-direct')
    expect(byPath.get('/2026/03/spring-refit')?.status).toBe('needs-redirect')
    expect(byPath.get('/2026/03/spring-refit')?.canonicalPath).toBe('/articles/spring-refit')
    expect(plan.urlPlan.hasLoops).toBe(false)
    expect(plan.urlPlan.hasCollisions).toBe(false)

    // Every source region of every page carries exactly one outcome.
    expect(plan.presentation.conversionReports.length).toBe(2)
    for (const report of plan.presentation.conversionReports) {
      const coverage = report.coverage
      expect(coverage.unaccounted).toBe(0)
      expect(
        coverage.converted +
          coverage.approximated +
          coverage.omitted +
          coverage.quarantined +
          coverage.droppedEmpty,
      ).toBe(coverage.regions)
      expect(coverage.regions).toBe(report.report.length)
    }

    // At plan time no media exists yet, so the Home page image is
    // quarantined with its reason — the plan never pretends otherwise.
    const home = plan.presentation.conversionReports.find((r) => r.path === '/')
    const imageRegion = home?.report.find((r) => r.blockName === 'core/image')
    expect(imageRegion?.outcome).toBe('quarantined')
    expect(imageRegion?.reason).toContain('not acquired')

    // Parser-level unsupported artifacts: plugin block, comment, shortcode.
    const kinds = plan.itemQuarantineRecords.map((q) => `${q.kind}:${q.name}`).sort()
    expect(kinds).toEqual([
      'comment:wordpress-comments',
      'plugin-block:acme/event-calendar',
      'shortcode:gallery',
    ])
  })

  it('dry-runs with a complete reconciliation and checklist', async () => {
    const dry = await dryRunPreflight(pkg, new MemoryLegacyMigrationStore(), options)
    expect(dry.stage).toBe('dry-run')
    expect(dry.reconciliation.created).toMatchObject({
      content: 4,
      authors: 2,
      categories: 2,
      tags: 2,
      redirects: 2,
      layouts: 2,
    })
    expect(dry.acceptanceChecklist.urlsAndRedirectsLoopFree).toBe(true)
    expect(dry.acceptanceChecklist.unsupportedQuarantined).toBe(true)
  })
})

describe('RC3-08 WordPress move — execute settles media before page conversion', () => {
  it('converts the bundled page image instead of quarantining it, and verifies', async () => {
    const store = new MemoryLegacyMigrationStore()
    const executed = await executeLegacyMigration(pkg, store, options)
    expect(executed.stage).toBe('imported')
    expect(executed.reconciliation.created).toMatchObject({
      content: 4,
      authors: 2,
      categories: 2,
      tags: 2,
      media: 1,
      redirects: 2,
    })
    // Layout records include the two page layouts plus the
    // reconstructed templates, pattern and global regions.
    expect(executed.reconciliation.created.layouts).toBeGreaterThanOrEqual(2)

    // The unbundled remote file is skipped with a reason, not dropped.
    const remoteWarning = executed.warnings.find((w) => w.sourceId === '102')
    expect(remoteWarning?.code).toBe('REMOTE_MEDIA_DOWNLOAD_DISALLOWED')
    expect(Object.keys(executed.checksums.media)).toEqual(['101'])

    // Quarantine holds exactly the three parser-level artifacts. The
    // page image whose media WAS acquired in this same run must not be
    // quarantined as unacquired.
    const quarantine = await store.getQuarantineRecords(executed.runId)
    expect(quarantine.map((q) => q.kind).sort()).toEqual(['comment', 'plugin-block', 'shortcode'])
    expect(quarantine.some((q) => q.name === 'core/image')).toBe(false)

    // The Home layout carries a real image block bound to the acquired
    // media asset of this site.
    const mediaId = executed.createdEntityIds.mediaIds[0]
    expect(mediaId).toBeTruthy()
    const homeLayout = [...store.layouts.values()].find(
      (layout) => (layout as { path?: string }).path === '/',
    ) as { blocks?: Array<{ component: string; props: unknown }> } | undefined
    expect(homeLayout).toBeDefined()
    const imageBlock = homeLayout?.blocks?.find((b) => b.component === 'publisher.image')
    expect(imageBlock).toBeDefined()
    expect(JSON.stringify(imageBlock?.props)).toContain(mediaId)

    // Verification passes even though one source attachment was
    // legitimately skipped: checksums verify the acquired set.
    const verified = await verifyLegacyMigration(executed.runId, store)
    expect(verified.stage).toBe('verified')
    expect(verified.acceptanceChecklist.mediaChecksumsVerified).toBe(true)
    expect(verified.acceptanceChecklist.contentCountsMatch).toBe(true)
  })

  it('re-import into the same site creates no duplicates', async () => {
    const store = new MemoryLegacyMigrationStore()
    const first = await executeLegacyMigration(pkg, store, options)
    expect(first.stage).toBe('imported')
    const second = await executeLegacyMigration(pkg, store, {
      ...options,
      targetSiteMode: 'existing-site',
      targetSiteId: first.siteId,
    })
    expect(second.stage).toBe('imported')
    expect(second.reconciliation.created.content).toBe(0)
    expect(second.reconciliation.created.media).toBe(0)
    // Templates, patterns, globals and page layouts are found by
    // their stable path identities — never duplicated on re-import.
    expect(second.reconciliation.created.layouts).toBe(0)
    expect(store.content.size).toBe(4)
    const layoutPaths = [...store.layouts.values()].map(
      (layout) => (layout as { path?: string }).path,
    )
    expect(new Set(layoutPaths).size).toBe(layoutPaths.length)
  })
})
