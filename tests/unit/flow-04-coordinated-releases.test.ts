import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import type {
  CoordinatedRelease,
  PinArtifactInput,
  ReleaseArtifactItem,
  ReleaseStatus,
} from '../../src/modules/releases/contracts'
import {
  computeReleaseFingerprint,
  evaluateReleaseGates,
  isGateSnapshotValid,
} from '../../src/modules/releases/gates'
import {
  approveRelease,
  cancelRelease,
  createRelease,
  evaluatePreflight,
  pinArtifact,
  retryRelease,
  scheduleRelease,
  submitReleaseForReview,
  unpinArtifact,
  waiveGateRule,
} from '../../src/modules/releases/service'
import { executeReleaseSaga, rollbackReleaseSaga } from '../../src/modules/releases/saga'

type MockDoc = Record<string, any>

function createMockPayload(initialDocs: Record<string, Record<string, MockDoc>> = {}) {
  const store: Record<string, Record<string, MockDoc>> = {
    'content-releases': {},
    'article-family-content': {},
    'page-layouts': {},
    'public-redirects': {},
    'products': {},
    'quality-issues': {},
    'payload-jobs': {},
    ...initialDocs,
  }

  const jobsQueue: any[] = []

  const payload: any = {
    create: async ({ collection, data }: { collection: string; data: MockDoc }) => {
      const id = data.id || `mock-${collection}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const doc = { ...data, id }
      if (!store[collection]) store[collection] = {}
      store[collection][id] = doc
      return doc
    },
    findByID: async ({ collection, id }: { collection: string; id: string }) => {
      return store[collection]?.[id] || null
    },
    find: async ({ collection, where }: { collection: string; where?: any }) => {
      const docs = Object.values(store[collection] || {})
      if (!where) return { docs }

      // Basic where filter evaluator
      const filtered = docs.filter((d) => {
        if (where.slug?.equals) return d.slug === where.slug.equals
        if (where.site?.equals) return d.site === where.site.equals
        if (where.fromPath?.equals) return d.fromPath === where.fromPath.equals
        if (where.and) {
          return where.and.every((cond: any) => {
            if (cond.site?.equals) return d.site === cond.site.equals
            if (cond.fromPath?.equals) return d.fromPath === cond.fromPath.equals
            if (cond.targetId?.in) return cond.targetId.in.includes(d.targetId)
            if (cond.severity?.equals) return d.severity === cond.severity.equals
            if (cond.status?.in) return cond.status.in.includes(d.status)
            return true
          })
        }
        return true
      })
      return { docs: filtered }
    },
    update: async ({
      collection,
      id,
      data,
    }: {
      collection: string
      id: string
      data: MockDoc
    }) => {
      if (!store[collection]) store[collection] = {}
      const existing = store[collection][id] || { id }
      const updated = { ...existing, ...data }
      store[collection][id] = updated
      return updated
    },
    jobs: {
      queue: async ({ task, input, waitUntil }: any) => {
        const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const job = { id, task, input, waitUntil, status: 'queued' }
        jobsQueue.push(job)
        if (!store['payload-jobs']) store['payload-jobs'] = {}
        store['payload-jobs'][id] = job
        return job
      },
    },
    _store: store,
    _jobsQueue: jobsQueue,
  }

  return payload
}

describe('FLOW-04 Coordinated Releases Comprehensive Unit Suite', () => {
  describe('1. Release Creation with Complete Metadata & Purpose', () => {
    it('creates a coordinated release with metadata, timezone, dependencies, and audit log', async () => {
      const payload = createMockPayload()
      const release = await createRelease(payload, {
        name: 'Fall 2026 Brand Refresh',
        purpose: 'Major site redesign, product launch, updated privacy policies, and redirect cleanup',
        ownerId: 'user-publisher-1',
        ownerTeam: 'Design & Editorial Ops',
        siteId: 'site-primary',
        publicationId: 'pub-main',
        plannedInstant: '2026-10-15T14:00:00.000Z',
        timeZone: 'America/New_York',
        campaign: 'fall-brand-refresh',
        labels: ['q4-launch', 'redesign', 'priority-p0'],
        dependencies: [
          { releaseId: 'rel-prereq-001', releaseName: 'Infrastructure Cutover', type: 'must-succeed-before' },
        ],
      })

      expect(release.id).toBeDefined()
      expect(release.name).toBe('Fall 2026 Brand Refresh')
      expect(release.purpose).toContain('Major site redesign')
      expect(release.ownerTeam).toBe('Design & Editorial Ops')
      expect(release.status).toBe('draft')
      expect(release.releaseRevision).toBe(1)
      expect(release.timeZone).toBe('America/New_York')
      expect(release.dependencies).toHaveLength(1)
      expect(release.dependencies[0].type).toBe('must-succeed-before')
      expect(release.executionAudit).toHaveLength(1)
      expect(release.executionAudit[0].action).toBe('release.created')
    })
  })

  describe('2. Pinning Heterogeneous Approved Artifacts & Automatic Invalidation', () => {
    it('pins approved pages, posts, presentation templates, media, and redirects', async () => {
      const payload = createMockPayload()
      const release = await createRelease(payload, {
        name: 'Multi-Artifact Release',
        purpose: 'Coordinate pages, posts, layout, media, and redirects',
        ownerId: 'user-pub',
        ownerTeam: 'Editorial',
        siteId: 'site-1',
        plannedInstant: '2026-10-20T10:00:00.000Z',
      })

      // 1. Pin approved article / post
      const afterArticle = await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'article',
          targetId: 'art-101',
          title: 'Introducing the New Platform',
          canonicalUrl: '/articles/introducing-new-platform',
          pinnedRevisionId: 'rev-art-101-v3',
          pinnedRevisionSequence: 3,
          pinnedHash: 'hash-article-v3',
        },
        'user-pub',
      )
      expect(afterArticle.artifacts).toHaveLength(1)
      expect(afterArticle.releaseRevision).toBe(2)

      // 2. Pin approved page layout
      const afterPage = await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'page',
          targetId: 'layout-landing-page',
          title: 'New Landing Page',
          canonicalUrl: '/new-experience',
          pinnedRevisionSequence: 4,
          pinnedHash: 'hash-landing-v4',
          pinnedSnapshot: { blocks: [{ blockType: 'hero', headline: 'Welcome to Tomorrow' }] },
        },
        'user-pub',
      )
      expect(afterPage.artifacts).toHaveLength(2)
      expect(afterPage.releaseRevision).toBe(3)

      // 3. Pin global presentation (header / navigation)
      const afterPres = await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'presentation',
          targetId: 'layout-global-header',
          title: 'Global Header 2026',
          pinnedRevisionSequence: 2,
          pinnedHash: 'hash-header-v2',
          pinnedSnapshot: { blocks: [{ blockType: 'nav-header', items: ['Home', 'Stories', 'Shop'] }] },
        },
        'user-pub',
      )
      expect(afterPres.artifacts).toHaveLength(3)

      // 4. Pin media with verified rights
      const afterMedia = await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'media',
          targetId: 'media-hero-banner',
          title: 'Hero Banner 4K',
          pinnedHash: 'hash-media-sha256',
          mediaRightsStatus: 'approved',
          mediaRightsExpiresAt: '2027-01-01T00:00:00.000Z',
        },
        'user-pub',
      )
      expect(afterMedia.artifacts).toHaveLength(4)

      // 5. Pin public redirect
      const afterRedirect = await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'redirect',
          targetId: 'redirect-legacy-home',
          title: 'Legacy Home Redirect',
          pinnedHash: 'hash-redirect-v1',
          redirectRule: {
            fromPath: '/legacy-home',
            toPath: '/new-experience',
            statusCode: '301',
            match: 'exact',
            enabled: true,
          },
        },
        'user-pub',
      )
      expect(afterRedirect.artifacts).toHaveLength(5)
    })

    it('automatically invalidates gate snapshot and requires reapproval when pinned inputs change', async () => {
      const payload = createMockPayload()
      const release = await createRelease(payload, {
        name: 'Staleness Test Release',
        purpose: 'Test gate invalidation on input modification',
        ownerId: 'user-pub',
        ownerTeam: 'Editorial',
        siteId: 'site-1',
        plannedInstant: '2026-10-20T10:00:00.000Z',
      })

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'article',
          targetId: 'art-201',
          title: 'Article V1',
          pinnedRevisionId: 'rev-1',
          pinnedHash: 'hash-1',
        },
        'user-pub',
      )

      // Evaluate gates and obtain snapshot
      const snapshot = await evaluatePreflight(payload, release.id, {
        actor: { id: 'user-pub', role: 'publisher' },
      })
      expect(snapshot.isValid).toBe(true)

      // Approve release
      const approved = await approveRelease(
        payload,
        release.id,
        { id: 'user-pub', role: 'publisher' },
        'Approved initial bundle',
      )
      expect(approved.status).toBe('approved')

      // Now author changes the pinned artifact (e.g. revisions update)
      const modified = await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'article',
          targetId: 'art-201',
          title: 'Article V2 Draft',
          pinnedRevisionId: 'rev-2',
          pinnedHash: 'hash-2',
        },
        'user-pub',
      )

      // Release must automatically drop out of approved back to draft!
      expect(modified.status).toBe('draft')
      expect(modified.gateSnapshot).toBeNull()

      // Validating original snapshot against modified release must reject
      const check = isGateSnapshotValid(modified, snapshot)
      expect(check.valid).toBe(false)
      expect(check.reason).toContain('changed')
    })
  })

  describe('3. Preflight Gates & 10 Comprehensive Rules', () => {
    it('evaluates preflight gates: blocks unapproved items and detects route collisions', async () => {
      const payload = createMockPayload()
      const release = await createRelease(payload, {
        name: 'Preflight Gate Checks',
        purpose: 'Verify 10 preflight rules',
        ownerId: 'user-pub',
        ownerTeam: 'Editorial',
        siteId: 'site-1',
        plannedInstant: '2026-10-25T12:00:00.000Z',
      })

      // Pin item 1 with path /announcement
      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'article',
          targetId: 'art-301',
          title: 'Announcement Post',
          canonicalUrl: '/announcement',
          pinnedRevisionId: 'rev-1',
          pinnedHash: 'h1',
        },
        'user-pub',
      )

      // Pin item 2 with conflicting canonicalUrl /announcement
      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'page',
          targetId: 'page-302',
          title: 'Announcement Page (Duplicate!)',
          canonicalUrl: '/announcement', // Collision!
          pinnedRevisionSequence: 1,
          pinnedHash: 'h2',
        },
        'user-pub',
      )

      const snapshot = await evaluatePreflight(payload, release.id, {
        actor: { id: 'user-pub', role: 'publisher' },
      })

      expect(snapshot.blockerCount).toBeGreaterThan(0)
      const conflictRule = snapshot.rules.find((r) => r.ruleId === 'rule-url-canonical-conflicts')
      expect(conflictRule).toBeDefined()
      expect(conflictRule?.status).toBe('failed')
      expect(conflictRule?.message).toContain('Collision')
    })

    it('blocks on media rights expiration prior to scheduled release instant', async () => {
      const payload = createMockPayload()
      const release = await createRelease(payload, {
        name: 'Media Rights Gate Test',
        purpose: 'Verify media rights expiration blocker',
        ownerId: 'user-pub',
        ownerTeam: 'Editorial',
        siteId: 'site-1',
        plannedInstant: '2026-11-01T12:00:00.000Z',
      })

      // Media rights expire October 15, but release is scheduled for November 01!
      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'media',
          targetId: 'media-expired-rights',
          title: 'Stock Photo',
          pinnedHash: 'hash-stock',
          mediaRightsStatus: 'approved',
          mediaRightsExpiresAt: '2026-10-15T00:00:00.000Z', // Expired!
        },
        'user-pub',
      )

      const snapshot = await evaluatePreflight(payload, release.id, {
        actor: { id: 'user-pub', role: 'publisher' },
      })

      const mediaRule = snapshot.rules.find((r) => r.ruleId === 'rule-media-readiness')
      expect(mediaRule?.status).toBe('failed')
      expect(mediaRule?.message).toContain('expire')
    })
  })

  describe('4. Quality Center Severity Thresholds & Authorized Waivers', () => {
    it('blocks on publication-blocking quality issues and unblocks under authorized waiver', async () => {
      const payload = createMockPayload()
      const release = await createRelease(payload, {
        name: 'Quality Gate & Waiver Test',
        purpose: 'Verify Quality Center blocker and waiver flow',
        ownerId: 'user-pub',
        ownerTeam: 'Editorial',
        siteId: 'site-1',
        plannedInstant: '2026-10-25T12:00:00.000Z',
      })

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'article',
          targetId: 'art-blocked',
          title: 'Article With Severe Broken Legal Disclaimer',
          pinnedRevisionId: 'rev-blocked-v1',
          pinnedHash: 'h-blocked',
        },
        'user-pub',
      )

      // Seed publication-blocking issue in quality-issues collection
      await payload.create({
        collection: 'quality-issues',
        data: {
          id: 'issue-legal-01',
          targetId: 'art-blocked',
          severity: 'publication_blocking',
          status: 'open',
          message: 'Missing mandatory legal disclaimer',
        },
      })

      // Evaluate preflight
      const blockedSnapshot = await evaluatePreflight(payload, release.id, {
        actor: { id: 'user-pub', role: 'publisher' },
      })

      expect(blockedSnapshot.overallStatus).toBe('blocked')
      const qcRule = blockedSnapshot.rules.find((r) => r.ruleId === 'rule-quality-center')
      expect(qcRule?.status).toBe('failed')
      expect(qcRule?.message).toContain('publication-blocking')

      // Attempting to approve must throw
      await expect(
        approveRelease(payload, release.id, { id: 'user-pub', role: 'publisher' }),
      ).rejects.toThrow(/preflight gate issue/)

      // Authorized staff waives the issue with mandatory reason and future expiration
      const waivedSnapshot = await waiveGateRule(payload, release.id, {
        ruleId: 'rule-quality-center',
        reason: 'Legal disclaimer waived by General Counsel for initial embargoed press preview',
        expiresAt: '2026-12-31T23:59:59.000Z',
        actor: { id: 'user-pub', role: 'publisher' },
      })

      expect(waivedSnapshot.overallStatus).toBe('passed')
      const waivedRule = waivedSnapshot.rules.find((r) => r.ruleId === 'rule-quality-center')
      expect(waivedRule?.status).toBe('waived')
      expect(waivedRule?.waiver?.reason).toContain('General Counsel')

      // Now approval succeeds
      const approved = await approveRelease(
        payload,
        release.id,
        { id: 'user-pub', role: 'publisher' },
        'Approved with GC waiver',
      )
      expect(approved.status).toBe('approved')
    })
  })

  describe('5. Scheduling & Idempotent Execution Saga', () => {
    it('schedules release into Operations Queue and executes all heterogeneous artifacts', async () => {
      const payload = createMockPayload({
        'article-family-content': {
          'art-401': {
            id: 'art-401',
            slug: 'major-features',
            lifecycle: 'approved',
            latestPublishedRevision: null,
          },
        },
        'page-layouts': {
          'page-layout-1': {
            id: 'page-layout-1',
            path: '/features',
            revision: 2,
            publishedRevision: 1,
            status: 'draft',
            blocks: [{ blockType: 'feature-grid' }],
          },
          'global-header-1': {
            id: 'global-header-1',
            path: '__global__/header',
            surface: 'global',
            slot: 'header',
            revision: 1,
            status: 'published',
            blocks: [{ blockType: 'nav-header' }],
          },
        },
      })

      const release = await createRelease(payload, {
        name: 'Coordinated Launch Execution',
        purpose: 'Full coordinated rollout of article, page, header, and redirect',
        ownerId: 'user-pub',
        ownerTeam: 'Core Ops',
        siteId: 'site-alpha',
        plannedInstant: '2026-11-10T15:00:00.000Z',
      })

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'article',
          targetId: 'art-401',
          title: 'Major Features Article',
          canonicalUrl: '/articles/major-features',
          pinnedRevisionId: 'rev-401-v2',
          pinnedHash: 'h-401',
        },
        'user-pub',
      )

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'page',
          targetId: 'page-layout-1',
          title: 'Features Page Layout',
          canonicalUrl: '/features',
          pinnedRevisionSequence: 2,
          pinnedHash: 'h-layout-1',
        },
        'user-pub',
      )

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'presentation',
          targetId: 'global-header-1',
          title: 'Global Header Update',
          pinnedRevisionSequence: 2,
          pinnedHash: 'h-gh-1',
          pinnedSnapshot: { blocks: [{ blockType: 'nav-header-v2' }] },
        },
        'user-pub',
      )

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'redirect',
          targetId: 'red-legacy',
          title: 'Legacy Features Redirect',
          pinnedHash: 'h-red',
          redirectRule: {
            fromPath: '/old-features',
            toPath: '/features',
            statusCode: '308',
            match: 'exact',
            enabled: true,
          },
        },
        'user-pub',
      )

      // Preflight & approve
      await evaluatePreflight(payload, release.id, { actor: { id: 'user-pub', role: 'publisher' } })
      await approveRelease(payload, release.id, { id: 'user-pub', role: 'publisher' })

      // Schedule release
      const scheduled = await scheduleRelease(payload, {
        releaseId: release.id,
        scheduledFor: '2026-11-10T15:00:00.000Z',
        timeZone: 'UTC',
        actorId: 'user-pub',
        idempotencyKey: 'mut-sched-001',
      })
      expect(scheduled.status).toBe('scheduled')
      expect(payload._jobsQueue).toHaveLength(1)

      // Execute release saga
      const result = await executeReleaseSaga(payload, {
        releaseId: release.id,
        actorId: 'user-pub',
        workerId: 'worker-node-1',
      })

      expect(result.status).toBe('completed')
      expect(result.succeeded).toBe(4)
      expect(result.unresolved).toBe(0)
      expect(result.resultingUrls).toContain('/articles/major-features')
      expect(result.resultingUrls).toContain('/features')
      expect(result.resultingUrls).toContain('/old-features')

      // Check persisted artifacts status
      const updatedRelease = await payload.findByID({ collection: 'content-releases', id: release.id })
      expect(updatedRelease.status).toBe('completed')
      for (const item of updatedRelease.artifacts) {
        expect(item.status).toBe('succeeded')
        expect(item.attempts).toBe(1)
        expect(item.lastKnownGoodState).toBeDefined()
      }

      // Check DB documents were updated
      const publishedArticle = await payload.findByID({ collection: 'article-family-content', id: 'art-401' })
      expect(publishedArticle.status).toBe('published')
      expect(publishedArticle.latestPublishedRevision).toBe('rev-401-v2')

      const publishedPage = await payload.findByID({ collection: 'page-layouts', id: 'page-layout-1' })
      expect(publishedPage.status).toBe('published')
    })
  })

  describe('6. Partial Failure & Safe Resumption', () => {
    it('isolates failed step, labels status partially-failed (NEVER completed), and retries only failed step', async () => {
      let productAttemptCount = 0
      const payload = createMockPayload({
        products: {
          'prod-fail-first': {
            id: 'prod-fail-first',
            state: 'approved',
            slug: 'flaky-digital-product',
          },
        },
        'article-family-content': {
          'art-good': {
            id: 'art-good',
            slug: 'good-article',
            status: 'draft',
          },
        },
      })

      // Custom interceptor: product throws on attempt 1, succeeds on attempt 2
      const originalUpdate = payload.update
      payload.update = async (args: any) => {
        if (args.collection === 'products' && args.id === 'prod-fail-first') {
          productAttemptCount++
          if (productAttemptCount === 1) {
            throw new Error('Transient commerce gateway timeout')
          }
        }
        return originalUpdate(args)
      }

      const release = await createRelease(payload, {
        name: 'Partial Failure Release',
        purpose: 'Test partial failure and safe retry',
        ownerId: 'user-pub',
        ownerTeam: 'Editorial',
        siteId: 'site-1',
      })

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'article',
          targetId: 'art-good',
          title: 'Good Article',
          pinnedRevisionId: 'rev-good-1',
          pinnedHash: 'h-good',
        },
        'user-pub',
      )

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'product',
          targetId: 'prod-fail-first',
          title: 'Flaky Digital Product',
          pinnedHash: 'h-prod',
        },
        'user-pub',
      )

      // First run: 1 step succeeds, 1 step fails
      const firstRun = await executeReleaseSaga(payload, {
        releaseId: release.id,
        actorId: 'user-pub',
      })

      // Strict requirement: Never label partial success complete!
      expect(firstRun.status).toBe('partially-failed')
      expect(firstRun.succeeded).toBe(1)
      expect(firstRun.unresolved).toBe(1)
      expect(firstRun.failedSteps).toHaveLength(1)
      expect(firstRun.failedSteps[0].error).toContain('Transient commerce gateway timeout')

      const intermediateDoc = await payload.findByID({ collection: 'content-releases', id: release.id })
      expect(intermediateDoc.status).toBe('partially-failed')
      expect(intermediateDoc.artifacts[0].status).toBe('succeeded')
      expect(intermediateDoc.artifacts[1].status).toBe('failed')

      // Second run via retry: Succeeded step (article) is skipped; failed product is retried
      const retryResult = await retryRelease(payload, {
        releaseId: release.id,
        actorId: 'user-pub',
      })

      expect(retryResult.status).toBe('completed')
      expect(retryResult.succeeded).toBe(2)
      expect(retryResult.unresolved).toBe(0)

      const finalDoc = await payload.findByID({ collection: 'content-releases', id: release.id })
      expect(finalDoc.status).toBe('completed')
      // Article was only attempted once!
      expect(finalDoc.artifacts[0].attempts).toBe(1)
      // Product was attempted twice (1 fail + 1 success)!
      expect(finalDoc.artifacts[1].attempts).toBe(2)
      expect(finalDoc.artifacts[1].status).toBe('succeeded')
    })
  })

  describe('7. Rollback Scenario & Audit Trail Preservation', () => {
    it('executes rollback by restoring last-known-good state, creating deliberate new public revisions, and never erasing audit history', async () => {
      const payload = createMockPayload({
        'page-layouts': {
          'layout-page-specials': {
            id: 'layout-page-specials',
            path: '/specials',
            revision: 3,
            publishedRevision: 2,
            status: 'published',
            blocks: [{ blockType: 'specials-v2' }],
            revisionHistory: [
              { revision: 2, blocks: [{ blockType: 'specials-v2' }] },
              { revision: 3, blocks: [{ blockType: 'specials-v3-draft' }] },
            ],
          },
        },
        'article-family-content': {
          'art-rollback-test': {
            id: 'art-rollback-test',
            slug: 'rollback-story',
            status: 'published',
            lifecycle: 'published',
            latestPublishedRevision: 'rev-story-v1',
          },
        },
      })

      const release = await createRelease(payload, {
        name: 'Rollback Target Release',
        purpose: 'Demonstrate deterministic rollback and audit trail preservation',
        ownerId: 'user-pub',
        ownerTeam: 'Editorial',
        siteId: 'site-1',
      })

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'article',
          targetId: 'art-rollback-test',
          title: 'Rollback Story V2',
          canonicalUrl: '/articles/rollback-story',
          pinnedRevisionId: 'rev-story-v2',
          pinnedHash: 'h-v2',
        },
        'user-pub',
      )

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'page',
          targetId: 'layout-page-specials',
          title: 'Specials Page',
          canonicalUrl: '/specials',
          pinnedRevisionSequence: 3,
          pinnedHash: 'h-specials-v3',
        },
        'user-pub',
      )

      await pinArtifact(
        payload,
        release.id,
        {
          targetType: 'redirect',
          targetId: 'red-temp',
          title: 'Temporary Redirect',
          pinnedHash: 'h-red-temp',
          redirectRule: {
            fromPath: '/temp-promo',
            toPath: '/specials',
            statusCode: '302',
            match: 'exact',
            enabled: true,
          },
        },
        'user-pub',
      )

      // Execute release to completion
      const exec = await executeReleaseSaga(payload, {
        releaseId: release.id,
        actorId: 'user-pub',
      })
      expect(exec.status).toBe('completed')

      // Verify published state prior to rollback
      const artAfterExec = await payload.findByID({ collection: 'article-family-content', id: 'art-rollback-test' })
      expect(artAfterExec.latestPublishedRevision).toBe('rev-story-v2')

      // Operator triggers rollback
      const rollbackResult = await rollbackReleaseSaga(payload, {
        releaseId: release.id,
        actorId: 'user-admin',
        reason: 'Critical pricing defect reported on specials page; rolling back entire coordinated release',
      })

      expect(rollbackResult.status).toBe('rolled-back')
      expect(rollbackResult.compensatedCount).toBe(3)

      // Verify Article state was rolled back to last-known-good revision (rev-story-v1)
      const artAfterRollback = await payload.findByID({ collection: 'article-family-content', id: 'art-rollback-test' })
      expect(artAfterRollback.latestPublishedRevision).toBe('rev-story-v1')

      // Verify Redirect was disabled
      const allRedirects = await payload.find({ collection: 'public-redirects' })
      const tempRedirect = allRedirects.docs.find((d: any) => d.fromPath === '/temp-promo')
      expect(tempRedirect.enabled).toBe(false)

      // Verify Release document and audit trail
      const rolledBackRelease = await payload.findByID({ collection: 'content-releases', id: release.id })
      expect(rolledBackRelease.status).toBe('rolled-back')
      for (const item of rolledBackRelease.artifacts) {
        expect(item.status).toBe('compensated')
      }

      // Crucial: Audit history is NEVER erased! All historical actions remain intact
      const actions = rolledBackRelease.executionAudit.map((a: any) => a.action)
      expect(actions).toContain('release.created')
      expect(actions).toContain('release.artifact.pinned')
      expect(actions).toContain('release.execution.completed')
      expect(actions).toContain('release.rolled-back')

      const rollbackEvent = rolledBackRelease.executionAudit.find((a: any) => a.action === 'release.rolled-back')
      expect(rollbackEvent.details.reason).toContain('pricing defect')
    })
  })
})
