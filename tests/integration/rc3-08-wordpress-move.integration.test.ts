import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import {
  activateLegacyMigration,
  dryRunPreflight,
  executeLegacyMigration,
  inspectLegacySite,
  rollbackLegacyMigration,
  verifyLegacyMigration,
} from '../../src/modules/portability/legacy-migration/pipeline'
import { PayloadLegacyMigrationStore } from '../../src/modules/portability/legacy-migration/store'
import { parseWxr } from '../../src/modules/portability/legacy-migration/parser'
import { applyWordpressConversion } from '../../src/modules/portability/legacy-migration/conversion-apply'
import type { LegacySitePackage } from '../../src/modules/portability/legacy-migration/types'
import { readPublishedPresentation } from '../../src/modules/presentation/snapshots'
import { changeTheme, readThemeState, themePool } from '../../src/modules/presentation/lifecycle'
import { discoverThemes } from '../../src/modules/presentation/packages'
import { preflightSiteCompatibility } from '../../src/modules/presentation/compatibility'
import { installStarter, planStarterInstall } from '../../src/modules/starters/service'

/**
 * RC3-08 — the WordPress-move journey end to end on real Postgres:
 * dry-run → execute → verify → activate (publish) → restart reads →
 * editor edit → re-import → conversion re-apply with a conflict →
 * theme switch + incompatible-theme refusal + rollback → a fresh
 * starter site with a newly published page → migration rollback.
 */

const ABOUT_SOURCE = [
  '<!-- wp:paragraph -->',
  '<p>Harbor Light is a two-person restoration studio on Pier 4.</p>',
  '<!-- /wp:paragraph -->',
  '',
  '<!-- wp:quote -->',
  '<blockquote class="wp-block-quote"><p>Measure twice, varnish once.</p><cite>Tom Dock</cite></blockquote>',
  '<!-- /wp:quote -->',
  '',
  '<!-- wp:acme/event-calendar {"month":"2026-04"} -->',
  '<div class="acme-event-calendar" data-month="2026-04">April open-yard days</div>',
  '<!-- /wp:acme/event-calendar -->',
  '',
  '<!-- wp:separator -->',
  '<hr class="wp-block-separator has-alpha-channel-opacity"/>',
  '<!-- /wp:separator -->',
  '',
  '<!-- wp:paragraph -->',
  '<p>Write to us before you haul out; we keep a short waiting list.</p>',
  '<!-- /wp:paragraph -->',
].join('\n')

const ABOUT_SOURCE_EDITED = ABOUT_SOURCE.replace(
  'two-person restoration studio on Pier 4',
  'two-person restoration studio and school on Pier 4',
)

const OPERATOR_EDIT = 'Operator edit — do not overwrite.'

let payload: Payload
let store: PayloadLegacyMigrationStore
let actor: { id: string | number }
let pkg: LegacySitePackage
let pngBuffer: Buffer
let pngSha256: string
const suffix = Date.now()
const siteSlug = `harbor-light-${suffix}`
let siteId: string
let runId: string
let heroMediaId: string

const migrationOptions = () => ({
  actorId: 'rc3-08-operator',
  targetSiteMode: 'new-isolated-site' as const,
  newSiteName: 'Harbor Light Studio',
  newSiteSlug: siteSlug,
  remoteMediaDownloadAllowed: false,
})

beforeAll(async () => {
  payload = await getPayload({ config })
  const createdActor = await payload.create({
    collection: 'users',
    data: { email: `rc308-${suffix}@example.test`, role: 'owner' },
    overrideAccess: true,
  } as never)
  actor = createdActor as { id: string | number }
  store = new PayloadLegacyMigrationStore(payload, actor as never)

  const wxr = await readFile(
    path.resolve(__dirname, '../fixtures/legacy-migration/wordpress-rc308.xml'),
    'utf8',
  )
  pngBuffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#775533' },
  })
    .png()
    .toBuffer()
  pngSha256 = createHash('sha256').update(pngBuffer).digest('hex')
  pkg = {
    wxr,
    mediaFiles: {
      'workshop-hero.png': {
        buffer: pngBuffer,
        fileName: 'workshop-hero.png',
        mimeType: 'image/png',
      },
    },
  }
}, 120_000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('RC3-08 WordPress move (integration)', () => {
  it('dry-runs and executes the move with full accounting', async () => {
    const inspected = inspectLegacySite(pkg)
    expect(inspected.valid).toBe(true)
    expect(inspected.summary).toMatchObject({ posts: 2, pages: 2, authors: 2, media: 2 })

    const dry = await dryRunPreflight(pkg, store, migrationOptions())
    expect(dry.stage).toBe('dry-run')
    expect(dry.reconciliation.created.content).toBe(4)
    expect(dry.reconciliation.created.redirects).toBe(2)

    const executed = await executeLegacyMigration(pkg, store, migrationOptions())
    expect(executed.stage).toBe('imported')
    expect(executed.siteId).toBeTruthy()
    siteId = executed.siteId!
    runId = executed.runId
    heroMediaId = executed.createdEntityIds.mediaIds[0]
    expect(executed.reconciliation.created).toMatchObject({
      content: 4,
      authors: 2,
      categories: 2,
      tags: 2,
      media: 1,
      redirects: 2,
    })
    expect(executed.warnings.some((w) => w.code === 'REMOTE_MEDIA_DOWNLOAD_DISALLOWED')).toBe(true)

    // Redirects are real records with the planned targets and codes.
    const redirects = await payload.find({
      collection: 'public-redirects',
      where: { site: { equals: siteId } },
      overrideAccess: true,
      limit: 20,
    })
    const byFrom = new Map(
      redirects.docs.map((d) => [
        (d as { fromPath: string }).fromPath,
        d as { toPath: string; statusCode: string },
      ]),
    )
    expect(byFrom.get('/2026/03/spring-refit')?.toPath).toBe('/articles/spring-refit')
    expect(byFrom.get('/2026/03/spring-refit')?.statusCode).toBe('308')
    expect(byFrom.get('/2026/03/varnish-note')?.toPath).toBe('/articles/varnish-note')

    // Quarantine persisted: plugin block, comment, shortcode — and no
    // core/image record for the image that was acquired in this run.
    const quarantine = await store.getQuarantineRecords(runId)
    expect(quarantine.map((q) => q.kind).sort()).toEqual(['comment', 'plugin-block', 'shortcode'])
    expect(quarantine.find((q) => q.kind === 'plugin-block')?.name).toBe('acme/event-calendar')

    // The Home page layout references the acquired hero media.
    const layouts = await payload.find({
      collection: 'page-layouts',
      where: { and: [{ site: { equals: siteId } }, { path: { equals: '/' } }] },
      overrideAccess: true,
      limit: 10,
    })
    const homeLayout = layouts.docs.find((d) => (d as { surface?: string }).surface === 'page') as
      | { blocks?: unknown }
      | undefined
    expect(homeLayout).toBeDefined()
    expect(JSON.stringify(homeLayout?.blocks)).toContain('publisher.image')
    expect(JSON.stringify(homeLayout?.blocks)).toContain(heroMediaId)
  }, 180_000)

  it('verifies and activates: layouts publish with readable snapshots', async () => {
    const verified = await verifyLegacyMigration(runId, store)
    expect(verified.stage).toBe('verified')
    expect(verified.acceptanceChecklist.mediaChecksumsVerified).toBe(true)
    expect(verified.acceptanceChecklist.contentCountsMatch).toBe(true)
    expect(verified.acceptanceChecklist.urlsAndRedirectsLoopFree).toBe(true)

    const activated = await activateLegacyMigration(runId, store, 'rc3-08-operator')
    expect(activated.stage).toBe('activated')

    const layouts = await payload.find({
      collection: 'page-layouts',
      where: { site: { equals: siteId } },
      overrideAccess: true,
      limit: 50,
    })
    expect(layouts.docs.length).toBeGreaterThanOrEqual(2)
    for (const layout of layouts.docs as unknown as Array<Record<string, unknown>>) {
      expect(layout.status).toBe('published')
    }
    const homeLayout = (layouts.docs as unknown as Array<Record<string, unknown>>).find(
      (d) => d.path === '/' && d.surface === 'page',
    )
    expect(readPublishedPresentation(homeLayout?.publishedPresentation)).not.toBeNull()
  }, 180_000)

  it('survives a restart: media, author mapping, SEO and draft state intact', async () => {
    // A fresh process is the restart: it reads the persisted rows
    // from the same database and reports what survived (in-process
    // destroy/re-init leaves the drizzle adapter half-built, and a
    // parallel Payload boot can block on the jobs concurrency lock,
    // so the probe reads storage directly — see the helper).
    const tsxCLI = path.resolve('node_modules/tsx/dist/cli.mjs')
    const helper = path.resolve('tests/helpers/rc3-08-restart-probe.ts')
    const { stdout } = await new Promise<{ stdout: string }>((resolvePromise, rejectPromise) => {
      execFile(
        process.execPath,
        [tsxCLI, helper, siteId, heroMediaId],
        { encoding: 'utf8', env: process.env, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout) => (error ? rejectPromise(error) : resolvePromise({ stdout })),
      )
    })
    const resultLine = stdout.match(/RESULT=(\{.*\})/)?.[1]
    expect(resultLine).toBeTruthy()
    const observed = JSON.parse(resultLine!) as {
      postStatus: string
      seoTitle?: string
      heroRef: string | null
      authorRefs: string[]
      anaAuthorId: string | null
      bodyHasSurveyHeading: boolean
      homeBodyHasRelationshipNode: boolean
      homeBodyHasHeroMedia: boolean
      mediaChecksum: string | null
      draftStatus: string
    }
    expect(observed.postStatus).toBe('published')
    expect(observed.seoTitle).toBe('Spring Refit, Week One | Harbor Light Journal')
    expect(observed.heroRef).toBe(heroMediaId)
    expect(observed.bodyHasSurveyHeading).toBe(true)
    // The Home page body carries the acquired hero image as a media
    // relationship node that still resolves after the restart.
    expect(observed.homeBodyHasRelationshipNode).toBe(true)
    expect(observed.homeBodyHasHeroMedia).toBe(true)
    expect(observed.anaAuthorId).toBeTruthy()
    expect(observed.authorRefs).toContain(observed.anaAuthorId)
    expect(observed.mediaChecksum).toBe(pngSha256)
    expect(observed.draftStatus).toBe('draft')
  }, 180_000)

  it('re-import after an editor edit creates nothing and overwrites nothing', async () => {
    const found = await payload.find({
      collection: 'content',
      where: { and: [{ site: { equals: siteId } }, { slug: { equals: 'spring-refit' } }] },
      overrideAccess: true,
      depth: 0,
    })
    const post = found.docs[0] as unknown as { id: string; body: unknown }
    const editedBody = JSON.parse(JSON.stringify(post.body)) as {
      root: { children: Array<Record<string, unknown>> }
    }
    const firstText = (editedBody.root.children[0] as { children: Array<{ text?: string }> })
      .children[0]
    firstText.text = `${firstText.text ?? ''} (bench note)`
    await payload.update({
      collection: 'content',
      id: post.id,
      overrideAccess: true,
      data: { title: 'Spring Refit, Week One (Edited)', body: editedBody },
    } as never)

    const reimported = await executeLegacyMigration(pkg, store, {
      ...migrationOptions(),
      targetSiteMode: 'existing-site',
      targetSiteId: siteId,
    })
    expect(reimported.stage).toBe('imported')
    expect(reimported.reconciliation.created.content).toBe(0)
    expect(reimported.reconciliation.created.media).toBe(0)
    expect(reimported.reconciliation.created.layouts).toBe(0)

    const after = await payload.find({
      collection: 'content',
      where: { site: { equals: siteId } },
      overrideAccess: true,
      limit: 20,
    })
    expect(after.docs.length).toBe(4)
    const edited = after.docs.find(
      (d) => (d as { slug?: string }).slug === 'spring-refit',
    ) as unknown as { title: string; body: unknown }
    expect(edited.title).toBe('Spring Refit, Week One (Edited)')
    expect(JSON.stringify(edited.body)).toContain('(bench note)')

    const rejected = await executeLegacyMigration(pkg, store, {
      ...migrationOptions(),
      targetSiteMode: 'existing-site',
      targetSiteId: siteId,
      rejectDuplicates: true,
    })
    expect(rejected.stage).toBe('failed')
    expect(rejected.errors.some((e) => e.code === 'DUPLICATE_ITEM_REJECTED')).toBe(true)
    const stillThere = await payload.find({
      collection: 'content',
      where: { and: [{ site: { equals: siteId } }, { slug: { equals: 'spring-refit' } }] },
      overrideAccess: true,
    })
    expect((stillThere.docs[0] as unknown as { title: string }).title).toBe(
      'Spring Refit, Week One (Edited)',
    )
  }, 180_000)

  it('conversion re-apply surfaces a conflict and honors keep-local', async () => {
    const applySite = await store.createSite({
      name: 'Harbor Light Apply',
      slug: `harbor-light-apply-${suffix}`,
    })
    const normalized = parseWxr(pkg.wxr)
    const aboutPage = normalized.items.find((i) => i.id === '202')!

    const first = await applyWordpressConversion(payload, {
      siteId: applySite.id,
      sourceId: aboutPage.id,
      path: '/about',
      name: 'About',
      themeId: 'neutral-starter',
      source: ABOUT_SOURCE,
      media: {
        items: normalized.media,
        store,
        localMediaFiles: pkg.mediaFiles,
        remoteMediaDownloadAllowed: false,
      },
    })
    expect(first.applied).toBe(true)
    expect(first.coverage.unaccounted).toBe(0)
    const pluginRegion = first.report.find((r) => r.blockName === 'acme/event-calendar')
    expect(pluginRegion?.outcome).toBe('quarantined')
    // Exactly the bundled hero is acquired; the unbundled remote file
    // is not (the pipeline legs assert its disallowed-download warning
    // — the apply result accounts media by created/reused ids).
    expect(first.media.createdIds.length).toBe(1)
    expect(first.media.errors).toEqual([])

    // Operator edits the first converted block in the stored layout.
    const layouts = await payload.find({
      collection: 'page-layouts',
      where: { and: [{ site: { equals: applySite.id } }, { path: { equals: '/about' } }] },
      overrideAccess: true,
      depth: 0,
    })
    const layout = layouts.docs[0] as unknown as {
      id: string
      blocks: Array<Record<string, unknown>>
    }
    const replaceText = (value: unknown): unknown => {
      if (typeof value === 'string')
        return value.includes('two-person restoration studio') ? OPERATOR_EDIT : value
      if (Array.isArray(value)) return value.map(replaceText)
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, replaceText(v)]),
        )
      return value
    }
    const editedBlocks = replaceText(layout.blocks) as Array<Record<string, unknown>>
    expect(JSON.stringify(editedBlocks)).toContain(OPERATOR_EDIT)
    await payload.update({
      collection: 'page-layouts',
      id: layout.id,
      overrideAccess: true,
      data: { blocks: editedBlocks },
    } as never)

    // Source changes too: the region is now in conflict, and the apply
    // must not overwrite the operator's text.
    const conflicted = await applyWordpressConversion(payload, {
      siteId: applySite.id,
      sourceId: aboutPage.id,
      path: '/about',
      name: 'About',
      themeId: 'neutral-starter',
      source: ABOUT_SOURCE_EDITED,
      media: {
        items: normalized.media,
        store,
        localMediaFiles: pkg.mediaFiles,
        remoteMediaDownloadAllowed: false,
      },
    })
    expect(conflicted.conflicts.length).toBeGreaterThanOrEqual(1)
    const conflict = conflicted.conflicts[0]
    const during = (await payload.findByID({
      collection: 'page-layouts',
      id: layout.id,
      overrideAccess: true,
      depth: 0,
    } as never)) as unknown as { blocks: unknown }
    expect(JSON.stringify(during.blocks)).toContain(OPERATOR_EDIT)

    const resolved = await applyWordpressConversion(payload, {
      siteId: applySite.id,
      sourceId: aboutPage.id,
      path: '/about',
      name: 'About',
      themeId: 'neutral-starter',
      source: ABOUT_SOURCE_EDITED,
      media: {
        items: normalized.media,
        store,
        localMediaFiles: pkg.mediaFiles,
        remoteMediaDownloadAllowed: false,
      },
      resolutions: { [conflict.location]: 'keep-local' },
    })
    // Keep-local resolution: the conflict clears and the merged
    // result equals the stored layout, so no write is needed
    // (applied reports whether a write happened).
    expect(resolved.conflicts).toEqual([])
    expect(resolved.decisions).toContainEqual(
      expect.objectContaining({ location: conflict.location, outcome: 'kept-local' }),
    )
    const after = (await payload.findByID({
      collection: 'page-layouts',
      id: layout.id,
      overrideAccess: true,
      depth: 0,
    } as never)) as unknown as { blocks: unknown }
    expect(JSON.stringify(after.blocks)).toContain(OPERATOR_EDIT)
  }, 300_000)

  it('switches themes, refuses an incompatible one, and rolls back', async () => {
    const pool = themePool(payload)
    const installed = await discoverThemes()
    const party = installed.find((t) => t.package?.id === 'renegade-party' && t.compatible)
    expect(party?.package).toBeTruthy()
    const candidate = {
      id: party!.package!.id,
      version: party!.package!.version,
      digest: party!.digest!,
      renderer: party!.package!.renderer,
      tokens: party!.package!.tokens,
    }

    // The migrated site's published layouts are compatible.
    const report = await preflightSiteCompatibility(payload, siteId, candidate, installed)
    expect(report.blockers).toEqual([])

    const state0 = await readThemeState(pool, siteId)
    const drafted = await changeTheme(
      pool,
      {
        site: siteId,
        actor: String(actor.id),
        revision: state0.revision,
        action: 'draft',
        id: candidate.id,
        version: candidate.version,
      },
      installed,
    )
    expect(drafted.draft?.id).toBe('renegade-party')
    const activated = await changeTheme(
      pool,
      { site: siteId, actor: String(actor.id), revision: drafted.revision, action: 'activate' },
      installed,
    )
    expect(activated.active?.id).toBe('renegade-party')
    expect(activated.previous).not.toBeNull()
    const rolledBack = await changeTheme(
      pool,
      { site: siteId, actor: String(actor.id), revision: activated.revision, action: 'rollback' },
      installed,
    )
    expect(rolledBack.active?.id).toBe(activated.previous?.id)

    // A published layout using a canonical component at a version the
    // candidate cannot render makes the candidate incompatible.
    await payload.create({
      collection: 'page-layouts',
      overrideAccess: true,
      data: {
        site: siteId,
        name: 'Theme Probe',
        path: '/theme-probe',
        surface: 'page',
        status: 'published',
        revision: 1,
        publishedRevision: 1,
        blocks: [
          { id: 'probe-1', component: 'publisher.editorial', componentVersion: 99, props: {} },
        ],
      },
    } as never)
    const blocked = await preflightSiteCompatibility(payload, siteId, candidate, installed)
    expect(blocked.blockers.length).toBeGreaterThanOrEqual(1)
    expect(blocked.blockers[0].component).toBe('publisher.editorial')

    // Remove the probe layout so the migration rollback can delete
    // the site (rollback clears only migration-created records).
    const probeLayouts = await payload.find({
      collection: 'page-layouts',
      where: { and: [{ site: { equals: siteId } }, { path: { equals: '/theme-probe' } }] },
      overrideAccess: true,
    })
    for (const doc of probeLayouts.docs) {
      await payload.delete({ collection: 'page-layouts', id: doc.id, overrideAccess: true })
    }
  }, 180_000)

  it('creates a fresh starter site and publishes a page on it', async () => {
    const starterSite = await store.createSite({
      name: 'Harbor Light Starter',
      slug: `harbor-light-starter-${suffix}`,
    })
    const plan = await planStarterInstall(payload, {
      siteId: starterSite.id,
      starterId: 'publication-community',
    })
    expect(plan.empty).toBe(true)
    expect(plan.additions.content).toBeGreaterThan(0)

    const installed = await installStarter(payload, {
      siteId: starterSite.id,
      starterId: 'publication-community',
      ownerEmail: 'owner@harborlight.example',
    })
    expect(installed.success).toBe(true)

    const starterContent = await payload.find({
      collection: 'content',
      where: { site: { equals: starterSite.id } },
      overrideAccess: true,
      limit: 50,
    })
    expect(starterContent.docs.length).toBeGreaterThan(0)

    const draftPage = await store.createContent({
      siteId: starterSite.id,
      contentType: 'page',
      title: 'Visit the Studio',
      slug: 'visit',
      canonicalPath: '/visit',
      body: '<p>Find us at the north end of the harbor, most Saturdays.</p>',
      status: 'draft',
    })
    await payload.update({
      collection: 'content',
      id: draftPage.id,
      overrideAccess: true,
      data: { status: 'published', publishedAt: new Date().toISOString() },
    } as never)
    const published = (await payload.findByID({
      collection: 'content',
      id: draftPage.id,
      overrideAccess: true,
    } as never)) as unknown as { status: string; canonicalPath: string }
    expect(published.status).toBe('published')
    expect(published.canonicalPath).toBe('/visit')
  }, 300_000)

  it('rolls the migration back cleanly', async () => {
    const rolledBack = await rollbackLegacyMigration(runId, store, 'rc3-08-operator')
    expect(rolledBack.stage).toBe('rolled-back')
    expect(await store.findSite(siteId)).toBeNull()
    const remaining = await payload.find({
      collection: 'content',
      where: { site: { equals: siteId } },
      overrideAccess: true,
    })
    expect(remaining.docs.length).toBe(0)
  }, 180_000)
})
