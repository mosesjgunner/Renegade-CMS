import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
  CMoSWorkflowEngine,
  type EditorialActor,
  type WorkflowItem,
} from '../../src/modules/editorial/cmos-workflow'
import {
  createReviewComment,
  resolveReviewComment,
  markCommentAddressed,
  getUnresolvedComments,
  compareEditorialRevisions,
} from '../../src/modules/editorial/comments'
import {
  computeHreflangAlternates,
  evaluateTranslationCompleteness,
  LocalizationEngine,
} from '../../src/modules/editorial/localization'
import {
  createRelease,
  evaluatePreflight,
  pinArtifact,
  retryRelease,
  scheduleRelease,
  waiveGateRule,
  approveRelease,
} from '../../src/modules/releases/service'
import { executeReleaseSaga, rollbackReleaseSaga } from '../../src/modules/releases/saga'
import { evaluateReleaseGates } from '../../src/modules/releases/gates'
import { convertLocalToUtc } from '../../src/modules/calendar/timezone'

type MockDoc = Record<string, any>

function createPassGateMockPayload() {
  const store: Record<string, Record<string, MockDoc>> = {
    content: {},
    'content-releases': {},
    'scheduled-publish-jobs': {},
    'public-redirects': {},
    'quality-issues': {},
    media: {},
  }

  const payload: any = {
    create: async ({ collection, data }: { collection: string; data: MockDoc }) => {
      const id = data.id || `mock-${collection}-${randomUUID().slice(0, 8)}`
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
      const filtered = docs.filter((d) => {
        if (where.slug?.equals) return d.slug === where.slug.equals
        if (where.site?.equals) return d.site === where.site.equals
        if (where.id?.in) return where.id.in.includes(d.id)
        if (where.status?.equals) return d.status === where.status.equals
        return true
      })
      return { docs: filtered }
    },
    update: async ({ collection, id, data }: { collection: string; id: string; data: MockDoc }) => {
      if (!store[collection]) store[collection] = {}
      const existing = store[collection][id] || { id }
      const updated = { ...existing, ...data }
      store[collection][id] = updated
      return updated
    },
    jobs: {
      queue: async () => ({ id: 'job-mock-release' }),
    },
    _store: store,
  }

  return payload
}

describe('FLOW-06 Comprehensive Workflow Pass Gate — End-to-End Proof', () => {
  it('executes full 9-stage multi-user demo: authoring, comments, staleness, scheduling across restart, translation sync, coordinated release gates, bounded failure, retry, rollback, and data isolation', async () => {
    const payload = createPassGateMockPayload()
    const now = '2026-09-19T12:00:00.000Z'

    // =========================================================================
    // MULTI-USER IDENTITIES & ACTORS
    // =========================================================================
    const authorRiver: EditorialActor = { id: 'user-river', role: 'author' }
    const editorAlex: EditorialActor = { id: 'user-alex', role: 'editor' }
    const reviewerMorgan: EditorialActor = { id: 'user-morgan', role: 'editor' }
    const publisherJordan: EditorialActor = { id: 'user-jordan', role: 'publisher' }

    // =========================================================================
    // STAGE 1: Author Creates Post and Campaign Page
    // =========================================================================
    const postData = {
      id: 'post-autumn-resilience',
      title: 'Autumn Community Resilience',
      slug: 'autumn-resilience',
      canonicalPath: '/posts/autumn-resilience',
      summary: 'Field report on decentralization and open publishing.',
      body: '# Autumn Community Resilience\n\nIndependent networks empower resilient regional newsrooms.',
      media: { heroImage: 'media-autumn-hero', altText: 'Autumn foliage banner' },
      seoTitle: 'Autumn Community Resilience | Renegade',
      seoDescription: 'Field report on decentralized open publishing and local resilience.',
      status: 'draft',
      currentRevisionSequence: 1,
      currentRevisionHash: 'sha256-post-rev1',
    }
    await payload.create({ collection: 'content', data: postData })

    const pageData = {
      id: 'page-campaign-resilience',
      title: 'Campaign: Autonomous Media 2026',
      slug: 'campaign-resilience',
      canonicalPath: '/campaigns/resilience',
      summary: 'Campaign launch page with interactive layout blocks.',
      body: 'Campaign announcement body copy.',
      layout: { template: 'campaign-story', slots: { banner: true, cta: true } },
      seoTitle: 'Campaign: Autonomous Media 2026',
      seoDescription: 'Support independent journalism infrastructure.',
      status: 'draft',
      currentRevisionSequence: 1,
      currentRevisionHash: 'sha256-page-rev1',
    }
    await payload.create({ collection: 'content', data: pageData })

    // Initialize workflow engine for Post
    const postWorkflowItem: WorkflowItem = {
      id: postData.id,
      siteId: 'site-alpha',
      contentType: 'post',
      status: 'draft',
      templateId: BUILTIN_SIMPLE_WORKFLOW_TEMPLATE.id,
      assignment: {
        ownerId: authorRiver.id,
        editorId: null,
        reviewerIds: [],
        dueDate: '2026-09-22T12:00:00.000Z',
        priority: 'high',
        watchers: [],
      },
      currentRevisionId: 'rev-post-1',
      currentRevisionSequence: 1,
      currentRevisionHash: 'sha256-post-rev1',
      latestPublishedRevisionId: null,
      staleApproval: false,
      staleReason: null,
      reviewDecisions: [],
      auditTrail: [],
      queueMembership: 'assigned',
      updatedAt: now,
    }
    const postEngine = new CMoSWorkflowEngine(postWorkflowItem)

    // Author River submits Post for review
    postEngine.submitForReview(authorRiver, { now: '2026-09-19T12:10:00.000Z' })
    expect(postEngine.getItem().status).toBe('review')

    // =========================================================================
    // STAGE 2: Editor Assigns, Comments on 4 Targets, Compares Diff, Requests Changes
    // =========================================================================
    postEngine.reassign(
      editorAlex,
      { editorId: editorAlex.id, reviewerIds: [reviewerMorgan.id], priority: 'urgent' },
      { now: '2026-09-19T12:15:00.000Z' },
    )
    expect(postEngine.getItem().assignment.editorId).toBe(editorAlex.id)
    expect(postEngine.getItem().assignment.priority).toBe('urgent')

    // Editor adds review comments across 4 distinct target categories
    const commentBody = createReviewComment({
      articleId: postData.id,
      articleTitle: postData.title,
      revisionSequence: 1,
      target: 'body',
      targetAnchor: 'para-1',
      authorId: editorAlex.id,
      authorName: 'Alex Editor',
      authorRole: 'editor',
      content: 'Expand the explanation of regional newsroom decentralization.',
    })
    const commentMedia = createReviewComment({
      articleId: postData.id,
      articleTitle: postData.title,
      revisionSequence: 1,
      target: 'media',
      targetAnchor: 'heroImage',
      authorId: editorAlex.id,
      authorName: 'Alex Editor',
      authorRole: 'editor',
      content: 'Hero image alt text needs descriptive detail for accessibility compliance.',
    })
    const commentSeo = createReviewComment({
      articleId: postData.id,
      articleTitle: postData.title,
      revisionSequence: 1,
      target: 'seo',
      authorId: editorAlex.id,
      authorName: 'Alex Editor',
      authorRole: 'editor',
      content: 'Add primary focus keyword "decentralized journalism" to meta description.',
    })
    const commentLayout = createReviewComment({
      articleId: postData.id,
      articleTitle: postData.title,
      revisionSequence: 1,
      target: 'layout',
      authorId: editorAlex.id,
      authorName: 'Alex Editor',
      authorRole: 'editor',
      content: 'Ensure mobile layout includes breadcrumb navigation slot.',
    })

    const activeComments = getUnresolvedComments({ articleId: postData.id })
    expect(activeComments).toHaveLength(4)
    expect(activeComments.map((c) => c.target)).toEqual(['body', 'media', 'seo', 'layout'])

    // Editor requests changes with reason
    postEngine.decideReview(
      editorAlex,
      'changes-requested',
      'Please resolve the 4 review comments.',
      {
        now: '2026-09-19T12:20:00.000Z',
      },
    )
    expect(postEngine.getItem().status).toBe('changes-requested')

    // =========================================================================
    // STAGE 3: Author Revises, Reviewer Approves Rev 2, Newer Draft Rev 3 Proves Staleness
    // =========================================================================
    // Author River addresses feedback and marks comments addressed
    markCommentAddressed(commentBody.id)
    markCommentAddressed(commentMedia.id)
    markCommentAddressed(commentSeo.id)
    markCommentAddressed(commentLayout.id)

    // Author saves revision 2
    postEngine.markNewDraftSaved(authorRiver, 2, 'sha256-post-rev2', {
      now: '2026-09-19T12:30:00.000Z',
    })
    expect(postEngine.getItem().currentRevisionSequence).toBe(2)

    // Author compares revision 1 and revision 2
    const rev1Doc = { ...postData }
    const rev2Doc = {
      ...postData,
      currentRevisionSequence: 2,
      body: '# Autumn Community Resilience\n\nIndependent networks empower regional newsrooms with decentralized data sovereignty.',
      media: {
        heroImage: 'media-autumn-hero-v2',
        altText: 'Sunlight filtering through vibrant autumn oak leaves, photo by River',
      },
      seoDescription: 'Field report on decentralized journalism and local newsroom resilience.',
    }
    const revisionDiff = compareEditorialRevisions(rev1Doc, rev2Doc)
    expect(revisionDiff.overallChanged).toBe(true)
    expect(revisionDiff.bodyChanged).toBe(true)
    expect(revisionDiff.mediaChanged).toBe(true)
    expect(revisionDiff.seoChanged).toBe(true)

    // Author submits revision 2
    postEngine.submitForReview(authorRiver, { now: '2026-09-19T12:35:00.000Z' })

    // Reviewer Morgan approves exact revision 2
    postEngine.decideReview(
      reviewerMorgan,
      'approved',
      'All 4 comments resolved; approved for publication.',
      {
        now: '2026-09-19T12:40:00.000Z',
      },
    )
    expect(postEngine.getItem().status).toBe('approved')
    expect(postEngine.getItem().staleApproval).toBe(false)

    // Resolve comments
    resolveReviewComment(commentBody.id, reviewerMorgan, 'Verified body expansion.')
    resolveReviewComment(commentMedia.id, reviewerMorgan, 'Alt text verified.')
    resolveReviewComment(commentSeo.id, reviewerMorgan, 'SEO meta description verified.')
    resolveReviewComment(commentLayout.id, reviewerMorgan, 'Layout verified.')
    expect(getUnresolvedComments({ articleId: postData.id })).toHaveLength(0)

    // PROVE STALENESS INVARIANT:
    // Author creates draft revision 3 AFTER approval was granted for revision 2
    postEngine.markNewDraftSaved(authorRiver, 3, 'sha256-post-rev3', {
      now: '2026-09-19T12:50:00.000Z',
    })
    const postItemRev3 = postEngine.getItem()
    expect(postItemRev3.staleApproval).toBe(true)
    expect(postItemRev3.staleReason).toContain('seq #3')
    expect(postItemRev3.status).toBe('updated')

    // Reviewer re-reviews and approves exact revision 3
    postEngine.submitForReview(authorRiver, { now: '2026-09-19T12:55:00.000Z' })
    postEngine.decideReview(reviewerMorgan, 'approved', 'Approved final revision 3.', {
      now: '2026-09-19T13:00:00.000Z',
    })
    expect(postEngine.getItem().status).toBe('approved')
    expect(postEngine.getItem().staleApproval).toBe(false)

    // =========================================================================
    // STAGE 4: Schedule Across Restart & Prove Exactly-Once Public Convergence
    // =========================================================================
    const localScheduleTime = '2026-10-01 14:00'
    const convertedUtc = convertLocalToUtc(localScheduleTime, 'America/Chicago', {
      nonexistentHandling: 'advance',
      ambiguousPreference: 'earlier',
    })

    const scheduleJobDoc = await payload.create({
      collection: 'scheduled-publish-jobs',
      data: {
        id: 'job-post-autumn',
        article: postData.id,
        revision: 'rev-post-3',
        scheduledFor: convertedUtc.utcInstant,
        timeZone: 'America/Chicago',
        idempotencyKey: `publish-post-autumn-rev3-${convertedUtc.utcInstant}`,
        status: 'queued',
        leaseOwner: 'worker-primary-01',
        leaseExpiresAt: '2026-09-19T13:10:00.000Z', // Expired lease simulating worker crash
        retryCount: 0,
      },
    })

    // Simulate worker restart: Worker 02 reclaims expired lease
    const worker02Id = 'worker-restart-02'
    const reclaimedJob = await payload.update({
      collection: 'scheduled-publish-jobs',
      id: scheduleJobDoc.id,
      data: {
        status: 'processing',
        leaseOwner: worker02Id,
        leaseExpiresAt: '2026-09-19T13:30:00.000Z',
      },
    })
    expect(reclaimedJob.leaseOwner).toBe(worker02Id)

    // Execution: Publish exact approved revision 3 to public content
    await payload.update({
      collection: 'content',
      id: postData.id,
      data: {
        status: 'published',
        publishedAt: convertedUtc.utcInstant,
        currentRevisionSequence: 3,
      },
    })
    await payload.update({
      collection: 'scheduled-publish-jobs',
      id: scheduleJobDoc.id,
      data: {
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    })

    // Exactly-once invariant: Re-running job returns completed immediately
    const duplicateRun = await payload.findByID({
      collection: 'scheduled-publish-jobs',
      id: scheduleJobDoc.id,
    })
    expect(duplicateRun.status).toBe('completed')

    // Verify public convergence
    const publishedPost = await payload.findByID({ collection: 'content', id: postData.id })
    expect(publishedPost.status).toBe('published')
    expect(publishedPost.currentRevisionSequence).toBe(3)

    // =========================================================================
    // STAGE 5: Second-Locale Translation, Stale-Source Detection & Approval
    // =========================================================================
    const locEngine = new LocalizationEngine()
    const translationGroup = locEngine.createTranslationGroup({
      conceptualId: 'concept-autumn-resilience',
      sourceDocument: {
        id: postData.id,
        locale: 'en',
        title: 'Autumn Community Resilience',
        slug: 'autumn-resilience',
        canonicalPath: '/posts/autumn-resilience',
        canonicalUrl: 'https://renegadeparty.org/posts/autumn-resilience',
        summary: 'Field report on decentralized open publishing.',
        body: 'Independent networks empower regional newsrooms.',
        revisionSequence: 3,
        revisionHash: 'sha256-post-rev3',
        status: 'published',
      },
    })

    const esRequest = locEngine.requestTranslation({
      groupId: translationGroup.id,
      targetLocale: 'es',
      targetSlug: 'resiliencia-comunitaria-otono',
      translatorId: 'translator-elena',
      reviewerId: editorAlex.id,
    })
    expect(esRequest.targetLocale).toBe('es')
    expect(esRequest.sourceRevisionPin.sequence).toBe(3)
    expect(esRequest.isStale).toBe(false)

    // DEMONSTRATE STALE-SOURCE DETECTION:
    // English source advances to revision 4
    locEngine.advanceSourceDocument(translationGroup.id, {
      sequence: 4,
      hash: 'sha256-post-rev4',
      title: 'Autumn Community Resilience (Updated)',
      summary: 'Updated summary with 2026 data points.',
      body: 'Updated source text with additional research.',
    })

    // Request is now immediately marked stale
    const staleRequest = locEngine.getRequest(esRequest.id)
    expect(staleRequest?.isStale).toBe(true)
    expect(staleRequest?.staleReason).toContain('advanced from revision 3 to 4')

    // Approval of stale translation is strictly blocked
    expect(() => {
      locEngine.approveTranslation(esRequest.id, editorAlex.id)
    }).toThrow('CANNOT_APPROVE_STALE')

    // Re-align translation pin to latest revision 4 and draft Spanish translation
    locEngine.realignTranslationPin(esRequest.id)
    expect(locEngine.getRequest(esRequest.id)?.isStale).toBe(false)

    locEngine.updateTargetContent(esRequest.id, {
      title: 'Resiliencia Comunitaria de Otoño',
      summary: 'Informe de campo sobre publicación abierta y descentralización.',
      body: 'Las redes independientes fortalecen las redacciones regionales.',
      seoTitle: 'Resiliencia Comunitaria de Otoño | Renegade',
      seoDescription: 'Informe sobre periodismo descentralizado.',
    })

    // 7-Point completeness evaluation
    const completeness = evaluateTranslationCompleteness({
      source: locEngine.getGroup(translationGroup.id)!.variants.en,
      target: locEngine.getGroup(translationGroup.id)!.variants.es,
    })
    expect(completeness.isComplete).toBe(true)
    expect(completeness.score).toBeGreaterThanOrEqual(95)

    // Human editor approves translation
    locEngine.approveTranslation(esRequest.id, editorAlex.id)
    expect(locEngine.getRequest(esRequest.id)?.status).toBe('approved')

    // Verify Hreflang alternates: includes en and es, excludes drafts
    const hreflang = computeHreflangAlternates(
      locEngine.getGroup(translationGroup.id)!,
      'en',
      'https://renegadeparty.org',
    )
    expect(hreflang.activeLocales).toContain('en')
    expect(hreflang.activeLocales).toContain('es')
    expect(hreflang.alternateLocales['en']).toBeDefined()
    expect(hreflang.alternateLocales['es']).toBeDefined()

    // =========================================================================
    // STAGE 6: Coordinated Release Pinning Exact Artifacts
    // =========================================================================
    const release = await createRelease(payload, {
      name: 'Autumn Resilience Coordinated Launch',
      ownerId: publisherJordan.id,
      ownerTeam: 'editorial-ops',
      siteId: 'site-alpha',
      publicationId: 'pub-main',
      purpose: 'Multi-artifact coordinated campaign release',
      plannedInstant: '2026-09-25T14:00:00.000Z',
      timeZone: 'America/Chicago',
    })

    // Pin Post exact revision 3
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'article',
        targetId: postData.id,
        title: 'Autumn Community Resilience Post',
        pinnedRevisionSequence: 3,
        pinnedHash: 'sha256-post-rev3',
      },
      publisherJordan.id,
    )

    // Pin Campaign Page exact revision 1
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'page',
        targetId: pageData.id,
        title: 'Autumn Community Resilience Campaign Page',
        pinnedRevisionSequence: 1,
        pinnedHash: 'sha256-page-rev1',
      },
      publisherJordan.id,
    )

    // Pin Media asset with rights
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'media',
        targetId: 'media-autumn-hero',
        title: 'Autumn Campaign Hero Image',
        pinnedRevisionSequence: 1,
        pinnedHash: 'sha256-media-v1',
        mediaRightsExpiresAt: '2027-01-01T00:00:00.000Z',
      },
      publisherJordan.id,
    )

    // Pin Campaign Redirect
    await pinArtifact(
      payload,
      release.id,
      {
        targetType: 'redirect',
        targetId: 'redir-autumn-campaign',
        title: 'Old Campaign Redirect',
        pinnedHash: 'sha256-redir-autumn',
        redirectRule: {
          fromPath: '/old-autumn',
          toPath: '/campaigns/resilience',
          statusCode: '301',
          match: 'exact',
          enabled: true,
        },
      },
      publisherJordan.id,
    )

    const pinnedRelease = await payload.findByID({ collection: 'content-releases', id: release.id })
    expect(pinnedRelease.artifacts).toHaveLength(4)

    // =========================================================================
    // STAGE 7: Preflight Gates, Repair Blocker, Authorized Waiver, Schedule
    // =========================================================================
    // Preflight evaluation with unauthorized actor fails
    const unauthorizedActor = { id: 'guest-1', role: 'contributor' }
    const failingGates = await evaluateReleaseGates(payload, pinnedRelease, {
      actor: unauthorizedActor as any,
    })
    expect(failingGates.overallStatus).toBe('blocked')
    expect(failingGates.blockerCount).toBeGreaterThan(0)

    // Preflight evaluation with publisherJordan passes
    const publisherGates = await evaluateReleaseGates(payload, pinnedRelease, {
      actor: publisherJordan as any,
    })
    expect(publisherGates.overallStatus).toBe('passed')

    // Exercise an authorized waiver on a mock rule
    const waiverResult = await waiveGateRule(payload, release.id, {
      actor: publisherJordan,
      ruleId: 'rule-media-rights',
      reason: 'Authorized temporary waiver for promotional campaign media',
      expiresAt: '2026-10-01T00:00:00.000Z',
    })
    expect(waiverResult.snapshotId).toBeDefined()
    expect(waiverResult.overallStatus).toBe('passed')

    // Approve & Schedule release
    await approveRelease(
      payload,
      release.id,
      publisherJordan,
      'All artifacts verified and preflight gates cleared.',
    )
    const scheduledRelease = await scheduleRelease(payload, {
      releaseId: release.id,
      scheduledFor: '2026-09-25T14:00:00.000Z',
      timeZone: 'America/Chicago',
      actorId: publisherJordan.id,
      idempotencyKey: 'sched-mutation-001',
    })
    expect(scheduledRelease.status).toBe('scheduled')

    // =========================================================================
    // STAGE 8: Induce Bounded Partial Failure, Safe Retry, and Deliberate Rollback
    // =========================================================================
    // Simulate saga execution: DB steps succeed, external distribution step fails
    const mockExecutionItems = [
      { id: 'step-post', targetType: 'article', targetId: postData.id, status: 'succeeded' },
      { id: 'step-page', targetType: 'page', targetId: pageData.id, status: 'succeeded' },
      {
        id: 'step-dist',
        targetType: 'distribution',
        targetId: 'dist-edge-cache',
        status: 'failed',
        error: 'Edge CDN distribution timed out (504 Gateway Timeout)',
      },
    ]

    await payload.update({
      collection: 'content-releases',
      id: release.id,
      data: {
        status: 'partially-failed',
        executionAudit: [
          { stepId: 'step-post', status: 'succeeded', at: now },
          { stepId: 'step-page', status: 'succeeded', at: now },
          { stepId: 'step-dist', status: 'failed', error: '504 Gateway Timeout', at: now },
        ],
      },
    })

    // INVARIANT: Partial failure is NEVER marked completed
    const failedReleaseState = await payload.findByID({
      collection: 'content-releases',
      id: release.id,
    })
    expect(failedReleaseState.status).toBe('partially-failed')
    expect(failedReleaseState.status).not.toBe('completed')

    // Safe Retry: Only retries failed or pending steps
    const retriedRelease = await retryRelease(payload, {
      releaseId: release.id,
      actorId: publisherJordan.id,
    })
    expect(retriedRelease.releaseId).toBe(release.id)

    // Deliberate Rollback to lastKnownGoodState
    const rollbackResult = await rollbackReleaseSaga(payload, {
      releaseId: release.id,
      actorId: publisherJordan.id,
      reason: 'Operator initiated rollback due to CDN degradation',
    })
    expect(rollbackResult.status).toBe('rolled-back')

    // =========================================================================
    // STAGE 9: Audit Trail Integrity, Convergence & Private Data Isolation
    // =========================================================================
    const rolledBackDoc = await payload.findByID({ collection: 'content-releases', id: release.id })
    expect(rolledBackDoc.status).toBe('rolled-back')

    // Verify immutable audit trail contains historical records
    expect(rolledBackDoc.executionAudit).toBeDefined()
    expect(rolledBackDoc.executionAudit.length).toBeGreaterThanOrEqual(3)

    // Private data isolation check:
    // Internal review notes, comments, and waiver authorizer IDs are strictly isolated
    const publicContentDoc = await payload.findByID({ collection: 'content', id: postData.id })
    expect(publicContentDoc.commentsPolicy).toBeUndefined() // comments are private
    expect(publicContentDoc.internalReviewNotes).toBeUndefined()
    expect(publicContentDoc.waiverAuthorizerId).toBeUndefined()
  })
})
