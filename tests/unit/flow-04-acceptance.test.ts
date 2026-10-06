import { describe, expect, it } from 'vitest'

import {
  approveRelease,
  createRelease,
  evaluatePreflight,
  pinArtifact,
  retryRelease,
  scheduleRelease,
  waiveGateRule,
} from '../../src/modules/releases/service'
import { executeReleaseSaga, rollbackReleaseSaga } from '../../src/modules/releases/saga'

import {
  createEditorialArticle,
  decideEditorialReview,
  requestEditorialReview,
} from '../../src/modules/editorial/persistence'

type MockDoc = Record<string, any>

// The services query canonical relationships as well as release gates.
function matchesWhere(doc: MockDoc, where: MockDoc): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'and') return condition.every((entry: MockDoc) => matchesWhere(doc, entry))
    if ('equals' in condition) return doc[field] === condition.equals
    if ('in' in condition) return condition.in.includes(doc[field])
    throw new Error(`Unsupported acceptance query: ${field}`)
  })
}

function createAcceptanceMockPayload() {
  const store: Record<string, Record<string, MockDoc>> = {
    'content-releases': {},
    'article-family-content': {},
    'page-layouts': {},
    'public-redirects': {},
    products: {},
    'quality-issues': {},
    'payload-jobs': {},
  }

  const jobsQueue: any[] = []

  const payload: any = {
    create: async ({ collection, data }: { collection: string; data: MockDoc }) => {
      const id =
        data.id || `mock-${collection}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const doc = structuredClone({ ...data, id })
      if (!store[collection]) store[collection] = {}
      store[collection][id] = doc
      return structuredClone(doc)
    },
    findByID: async ({ collection, id }: { collection: string; id: string }) => {
      const doc = store[collection]?.[id]
      if (!doc) throw new Error(`Missing ${collection} record: ${id}`)
      return structuredClone(doc)
    },
    find: async ({ collection, where }: { collection: string; where?: any }) => {
      const docs = Object.values(store[collection] || {})
      if (!where) return { docs: structuredClone(docs) }

      return { docs: structuredClone(docs.filter((doc) => matchesWhere(doc, where))) }
    },
    update: async ({ collection, id, data }: { collection: string; id: string; data: MockDoc }) => {
      if (!store[collection]) store[collection] = {}
      const existing = store[collection][id]
      if (!existing) throw new Error(`Missing ${collection} record: ${id}`)
      const updated = structuredClone({ ...existing, ...data })
      store[collection][id] = updated
      return structuredClone(updated)
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

describe('FLOW-04 Coordinated Release Workflow End-to-End Acceptance Scenario', () => {
  it('passes complete 8-stage acceptance lifecycle with blocking issue, waiver, scheduling, worker restart, partial failure, safe retry, and rollback', async () => {
    const payload = createAcceptanceMockPayload()

    // -------------------------------------------------------------------------
    // STAGE 1: Seed Initial Database Entities
    // -------------------------------------------------------------------------
    // Create canonical content, companion and immutable revision records through
    // the real persistence service, then obtain an independent editorial approval.
    const articles = []
    for (const [slug, title] of [
      ['spring-launch-2026', 'Spring Launch 2026'],
      ['company-announcement', 'Official Press Release'],
    ]) {
      const created = await createEditorialArticle(payload, {
        siteId: 'site-demo',
        publicationId: 'pub-main',
        ownerId: 'user-author-9',
        title,
        slug,
        canonicalPath: `/articles/${slug}`,
        sourceMarkdown: `# ${title}\n\nApproved campaign announcement.`,
        actor: { id: 'user-author-9', role: 'author' },
        actorUserId: 'user-author-9',
      })
      await requestEditorialReview(payload, {
        articleId: created.article.id,
        actor: { id: 'user-author-9', role: 'author' },
        actorUserId: 'user-author-9',
      })
      articles.push(
        await decideEditorialReview(payload, {
          articleId: created.article.id,
          actor: { id: 'user-editor-2', role: 'editor' },
          actorUserId: 'user-editor-2',
          approved: true,
          comment: 'Reviewed the exact campaign revision for coordinated publication.',
        }),
      )
    }
    const [springArticle, pressArticle] = articles

    await payload.create({
      collection: 'media-blobs',
      data: {
        id: 'blob-spring-hero',
        site: 'site-demo',
        publication: 'pub-main',
        checksum: 'hash-media-sha256',
        storageKey: 'site-demo/spring-hero.jpg',
        storageProvider: 'local',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        state: 'ready',
      },
    })
    await payload.create({
      collection: 'media-assets',
      data: {
        id: 'media-spring-hero',
        site: 'site-demo',
        publication: 'pub-main',
        owner: 'user-author-9',
        title: 'Spring Hero Photography 8K',
        kind: 'image',
        originalBlob: 'blob-spring-hero',
        storageLocation: 'site-demo/spring-hero.jpg',
        storageProvider: 'local',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksum: 'hash-media-sha256',
        altText: 'Spring campaign landscape',
        creatorCredit: 'Campaign photographer',
        rightsStatus: 'approved',
        rightsExpiresAt: '2027-01-01T00:00:00.000Z',
      },
    })
    // Include a real editorial reference so publication exercises the usage graph gate.
    await payload.update({
      collection: 'content',
      id: springArticle.content.id,
      data: { heroMedia: 'media-spring-hero' },
    })

    // Multiple Pages & Global Presentation
    await payload.create({
      collection: 'page-layouts',
      data: {
        id: 'page-spring-overview',
        site: 'site-demo',
        publication: 'pub-main',
        path: '/spring-overview',
        surface: 'page',
        revision: 2,
        publishedRevision: 1,
        status: 'draft',
        blocks: [{ blockType: 'hero', title: 'Spring Overview v2' }],
        revisionHistory: [
          { revision: 1, blocks: [{ blockType: 'hero', title: 'Old Overview v1' }] },
          { revision: 2, blocks: [{ blockType: 'hero', title: 'Spring Overview v2' }] },
        ],
      },
    })
    await payload.create({
      collection: 'page-layouts',
      data: {
        id: 'global-nav-header',
        site: 'site-demo',
        publication: 'pub-main',
        path: '__global__/header',
        surface: 'global',
        slot: 'header',
        revision: 3,
        publishedRevision: 2,
        status: 'published',
        blocks: [{ blockType: 'nav-header', links: ['Home', 'Spring Specials', 'About'] }],
        revisionHistory: [
          { revision: 2, blocks: [{ blockType: 'nav-header', links: ['Home', 'About'] }] },
          {
            revision: 3,
            blocks: [{ blockType: 'nav-header', links: ['Home', 'Spring Specials', 'About'] }],
          },
        ],
      },
    })

    // -------------------------------------------------------------------------
    // STAGE 2: Create Release & Pin Heterogeneous Artifacts
    // -------------------------------------------------------------------------
    const release = await createRelease(payload, {
      name: 'Spring 2026 Coordinated Campaign',
      purpose:
        'Launch multiple articles, new landing page, updated global navigation, media, and redirects',
      ownerId: 'user-publisher-1',
      ownerTeam: 'Marketing & Editorial Ops',
      siteId: 'site-demo',
      publicationId: 'pub-main',
      plannedInstant: '2026-10-25T15:00:00.000Z',
      timeZone: 'America/Chicago',
      campaign: 'spring-2026',
      labels: ['major-release', 'spring-launch', 'p0'],
      dependencies: [
        { releaseId: 'rel-infra-001', releaseName: 'Infrastructure Ready', type: 'co-scheduled' },
      ],
    })

    expect(release.id).toBeDefined()
    expect(release.releaseRevision).toBe(1)
    expect(release.status).toBe('draft')

    // Pin Post 1
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'article',
        targetId: springArticle.article.id,
        title: 'Spring Launch 2026',
        canonicalUrl: '/articles/spring-launch-2026',
        pinnedRevisionId: springArticle.article.currentRevision,
        pinnedRevisionSequence: 1,
        pinnedHash: springArticle.article.documentHash,
      },
      'user-publisher-1',
    )

    // Pin Post 2
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'article',
        targetId: pressArticle.article.id,
        title: 'Official Press Release',
        canonicalUrl: '/articles/company-announcement',
        pinnedRevisionId: pressArticle.article.currentRevision,
        pinnedRevisionSequence: 1,
        pinnedHash: pressArticle.article.documentHash,
      },
      'user-publisher-1',
    )

    // Pin Page Layout
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'page',
        targetId: 'page-spring-overview',
        title: 'Spring Overview Page',
        canonicalUrl: '/spring-overview',
        pinnedRevisionSequence: 2,
        pinnedHash: 'hash-page-2',
      },
      'user-publisher-1',
    )

    // Pin Global Presentation
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'presentation',
        targetId: 'global-nav-header',
        title: 'Global Navigation Header',
        pinnedRevisionSequence: 3,
        pinnedHash: 'hash-header-3',
      },
      'user-publisher-1',
    )

    // Pin Media Asset with rights clearance
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'media',
        targetId: 'media-spring-hero',
        title: 'Spring Hero Photography 8K',
        pinnedHash: 'hash-media-sha256',
        mediaRightsStatus: 'approved',
        mediaRightsExpiresAt: '2027-01-01T00:00:00.000Z',
      },
      'user-publisher-1',
    )

    // Pin Public Redirect
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'redirect',
        targetId: 'red-spring-legacy',
        title: 'Spring Specials Legacy Redirect',
        pinnedHash: 'hash-red-1',
        redirectRule: {
          fromPath: '/spring-2025',
          toPath: '/spring-overview',
          statusCode: '301',
          match: 'exact',
          enabled: true,
        },
      },
      'user-publisher-1',
    )

    const releaseWithArtifacts = await payload.findByID({
      collection: 'content-releases',
      id: release.id,
    })
    expect(releaseWithArtifacts.artifacts).toHaveLength(6)
    expect(releaseWithArtifacts.releaseRevision).toBe(7)

    // -------------------------------------------------------------------------
    // STAGE 3: Introduce a Blocking Issue in Quality Center
    // -------------------------------------------------------------------------
    await payload.create({
      collection: 'quality-issues',
      data: {
        id: 'issue-legal-compliance-01',
        targetId: springArticle.article.id,
        severity: 'publication_blocking',
        status: 'open',
        message:
          'Mandatory environmental sustainability disclosures missing in product claims section.',
      },
    })

    // Evaluate gates: must be BLOCKED
    const blockedSnapshot = await evaluatePreflight(payload, release.id, {
      actor: { id: 'user-publisher-1', role: 'publisher' },
    })

    expect(blockedSnapshot.overallStatus).toBe('blocked')
    expect(blockedSnapshot.blockerCount).toBe(1)
    const qcRule = blockedSnapshot.rules.find((r) => r.ruleId === 'rule-quality-center')
    expect(qcRule?.status).toBe('failed')
    expect(qcRule?.message).toContain('publication-blocking')

    // Prohibit scheduling while blocked
    await expect(
      scheduleRelease(payload, {
        releaseId: release.id,
        scheduledFor: '2026-10-25T15:00:00.000Z',
        timeZone: 'America/Chicago',
        actorId: 'user-publisher-1',
        idempotencyKey: 'mut-spring-1',
      }),
    ).rejects.toThrow(/blocked by unresolved publication-blocking quality or preflight gate issues/)

    // -------------------------------------------------------------------------
    // STAGE 4: Repair / Waive Under Authorized Permission
    // -------------------------------------------------------------------------
    // Low-privilege author cannot waive
    await expect(
      waiveGateRule(payload, release.id, {
        ruleId: 'rule-quality-center',
        reason: 'Author self-waiver',
        expiresAt: '2026-12-31T00:00:00.000Z',
        actor: { id: 'user-author-9', role: 'author' },
      }),
    ).rejects.toThrow(/not authorized to grant release waivers/)

    // Authorized publisher grants waiver
    const waivedSnapshot = await waiveGateRule(payload, release.id, {
      ruleId: 'rule-quality-center',
      reason:
        'Temporary waiver authorized by Chief Compliance Officer for timed press release embargo',
      expiresAt: '2026-11-01T00:00:00.000Z',
      actor: { id: 'user-publisher-1', role: 'publisher' },
    })

    expect(waivedSnapshot.overallStatus).toBe('passed')
    expect(waivedSnapshot.blockerCount).toBe(0)
    const waivedRule = waivedSnapshot.rules.find((r) => r.ruleId === 'rule-quality-center')
    expect(waivedRule?.status).toBe('waived')

    // Approve release
    const approved = await approveRelease(
      payload,
      release.id,
      { id: 'user-publisher-1', role: 'publisher' },
      'Approved after compliance waiver verification',
    )
    expect(approved.status).toBe('approved')

    // -------------------------------------------------------------------------
    // STAGE 5: Schedule Release
    // -------------------------------------------------------------------------
    const scheduled = await scheduleRelease(payload, {
      releaseId: release.id,
      scheduledFor: '2026-10-25T15:00:00.000Z',
      timeZone: 'America/Chicago',
      actorId: 'user-publisher-1',
      idempotencyKey: 'mut-spring-scheduled-key-1',
    })
    expect(scheduled.status).toBe('scheduled')
    expect(scheduled.executionJob).toBeDefined()

    // -------------------------------------------------------------------------
    // STAGE 6: Simulate Worker Restart & Lease Acquisition
    // -------------------------------------------------------------------------
    // Worker 1 crashed, lease expired; Worker 2 restarts and claims lease
    const worker2Id = 'worker-node-2-restarted'

    // -------------------------------------------------------------------------
    // STAGE 7: Partial Failure Injection & Isolation
    // -------------------------------------------------------------------------
    // Inject transient failure on the redirect creation step during the first run
    let redirectAttempts = 0
    const originalCreate = payload.create
    payload.create = async (args: any) => {
      if (args.collection === 'public-redirects') {
        redirectAttempts++
        if (redirectAttempts === 1) {
          throw new Error('Database deadlock on public-redirects table')
        }
      }
      return originalCreate(args)
    }

    const firstRun = await executeReleaseSaga(payload, {
      releaseId: release.id,
      actorId: 'user-publisher-1',
      workerId: worker2Id,
    })

    // Strict invariant: NEVER label partial success complete!
    expect(firstRun.status).toBe('partially-failed')
    expect(firstRun.succeeded).toBe(5)
    expect(firstRun.unresolved).toBe(1)
    expect(firstRun.failedSteps).toHaveLength(1)
    expect(firstRun.failedSteps[0].error).toContain('Database deadlock')

    const intermediateRelease = await payload.findByID({
      collection: 'content-releases',
      id: release.id,
    })
    expect(intermediateRelease.status).toBe('partially-failed')

    // Verify the 5 successful steps are marked succeeded
    const succeededItems = intermediateRelease.artifacts.filter(
      (a: any) => a.status === 'succeeded',
    )
    expect(succeededItems).toHaveLength(5)
    const failedItems = intermediateRelease.artifacts.filter((a: any) => a.status === 'failed')
    expect(failedItems).toHaveLength(1)
    expect(failedItems[0].id).toBe('redirect:red-spring-legacy')

    // -------------------------------------------------------------------------
    // STAGE 8: Safe Retry of Only Failed Steps
    // -------------------------------------------------------------------------
    const retryResult = await retryRelease(payload, {
      releaseId: release.id,
      actorId: 'user-publisher-1',
      workerId: worker2Id,
    })

    expect(retryResult.status).toBe('completed')
    expect(retryResult.succeeded).toBe(6)
    expect(retryResult.unresolved).toBe(0)
    expect(retryResult.failedSteps).toHaveLength(0)

    const finalRelease = await payload.findByID({ collection: 'content-releases', id: release.id })
    expect(finalRelease.status).toBe('completed')

    // Check all artifacts succeeded; succeeded steps were not re-executed
    for (const item of finalRelease.artifacts) {
      expect(item.status).toBe('succeeded')
      if (item.id === 'redirect:red-spring-legacy') {
        expect(item.attempts).toBe(2) // failed once, succeeded on retry
      } else {
        expect(item.attempts).toBe(1) // only executed once!
      }
    }

    // Canonical publication persisted the exact approved revisions and one audit
    // per article, even after failed-only retry. Both articles remain distinct.
    for (const bundle of articles) {
      const article = await payload.findByID({
        collection: 'article-family-content',
        id: bundle.article.id,
      })
      expect(article.latestPublishedRevision).toBe(bundle.article.currentRevision)
      expect(
        article.workflowAudit.filter((event: any) => event.action === 'publication.published'),
      ).toHaveLength(1)
      expect(article.reviewDecisions).toEqual(bundle.article.reviewDecisions)
      const content = await payload.findByID({ collection: 'content', id: bundle.content.id })
      expect(content.status).toBe('published')
      expect(content.site).toBe('site-demo')
      expect(content.publication).toBe('pub-main')
    }
    const usages = await payload.find({
      collection: 'media-usages',
      where: { targetId: { in: [springArticle.content.id] } },
    })
    expect(usages.docs).toHaveLength(1)
    expect(usages.docs[0].media).toBe('media-spring-hero')
    expect(redirectAttempts).toBe(2)

    // Verify resulting public URLs
    expect(finalRelease.resultingUrls).toContain('/articles/spring-launch-2026')
    expect(finalRelease.resultingUrls).toContain('/articles/company-announcement')
    expect(finalRelease.resultingUrls).toContain('/spring-overview')
    expect(finalRelease.resultingUrls).toContain('/spring-2025')

    // -------------------------------------------------------------------------
    // STAGE 9: Rollback Scenario & Audit Trail Verification
    // -------------------------------------------------------------------------
    const rollbackResult = await rollbackReleaseSaga(payload, {
      releaseId: release.id,
      actorId: 'user-publisher-1',
      reason:
        'Urgent recall: embargo broken by competitor, roll back all public surfaces immediately',
    })

    expect(rollbackResult.status).toBe('rolled-back')
    expect(rollbackResult.compensatedCount).toBe(6)

    // Verify database entities were compensated:
    // 1. Articles reverted to draft (or previous status)
    const post1 = await payload.findByID({
      collection: 'article-family-content',
      id: springArticle.article.id,
    })
    expect(post1.latestPublishedRevision).toBeNull()

    const post2 = await payload.findByID({
      collection: 'article-family-content',
      id: pressArticle.article.id,
    })
    expect(post2.latestPublishedRevision).toBeNull()

    // 2. Redirect disabled
    const allRedirects = await payload.find({ collection: 'public-redirects' })
    const springRedirect = allRedirects.docs.find((d: any) => d.fromPath === '/spring-2025')
    expect(springRedirect.enabled).toBe(false)

    // 3. Complete Audit Trail Preserved
    const finalDoc = await payload.findByID({ collection: 'content-releases', id: release.id })
    expect(finalDoc.status).toBe('rolled-back')

    const actionList = finalDoc.executionAudit.map((a: any) => a.action)
    expect(actionList).toContain('release.created')
    expect(actionList).toContain('release.artifact.pinned')
    expect(actionList).toContain('release.gate.evaluated')
    expect(actionList).toContain('release.gate.waived')
    expect(actionList).toContain('release.approved')
    expect(actionList).toContain('release.execution.queued')
    expect(actionList).toContain('release.execution.completed') // initial run
    expect(actionList).toContain('release.execution.retried') // retry run
    expect(actionList).toContain('release.rolled-back') // rollback event

    const rollbackAudit = finalDoc.executionAudit.find(
      (a: any) => a.action === 'release.rolled-back',
    )
    expect(rollbackAudit.details.reason).toContain('embargo broken by competitor')
    expect(rollbackAudit.details.compensatedCount).toBe(6)
    expect(rollbackAudit.details.compensationEvents).toHaveLength(6)
    expect(
      new Set(rollbackAudit.details.compensationEvents.map((event: any) => event.artifactId)).size,
    ).toBe(6)
    expect(finalDoc.artifacts.every((item: any) => item.status === 'compensated')).toBe(true)
    expect(post1.lifecycle).toBe('approved')
    expect(post2.lifecycle).toBe('approved')
  })
})
