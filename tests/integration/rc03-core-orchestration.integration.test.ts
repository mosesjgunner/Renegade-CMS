/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import {
  createEditorialArticle,
  scheduleEditorialPublication,
} from '../../src/modules/editorial/persistence'
import {
  executeWorkflowAction,
  getWorkflowAuditHistory,
  getWorkflowItemForArticle,
  getWorkflowQueuesForUser,
  bulkExecuteWorkflowItems,
} from '../../src/modules/editorial/cmos-persistence'
import {
  executeScheduledPublishJob,
  reconcileScheduleWorkerJobs,
} from '../../src/modules/editorial/scheduler'
import {
  createRelease,
  pinArtifact,
  approveRelease,
  executeRelease,
} from '../../src/modules/releases/service'
import {
  socialProviderAdapters,
  socialProviderFor,
} from '../../src/modules/social/provider-runtime'

let payload: Payload

const findOne = async (collection: string, slug: string) => {
  const result = await payload.find({
    collection: collection as never,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  expect(result.docs[0]).toBeTruthy()
  return result.docs[0] as any
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
})

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('RC-03 Core Orchestration Pass 1 End-to-End Suite', () => {
  it('1. Editorial Workflow: draft -> request review -> reject -> revise -> approve with permission boundaries & audit trail', async () => {
    const site = await findOne('sites', 'demo-publication')
    const publication = await findOne('publications', 'main')
    const suffix = randomUUID().slice(0, 8)

    const usersResult = await payload.find({ collection: 'users', limit: 2, overrideAccess: true })
    const authorUser = usersResult.docs[0]
    const editorUser = usersResult.docs[1] || authorUser
    const authorId = String(authorUser.id)
    const editorId = String(editorUser.id)

    // A. Normal API creation of editorial article draft
    const bundle = await createEditorialArticle(payload, {
      siteId: site.id,
      publicationId: publication.id,
      title: `Orchestration Article ${suffix}`,
      slug: `orch-art-${suffix}`,
      canonicalPath: `/articles/orch-art-${suffix}`,
      summary: 'Testing RC-03 core orchestration editorial workflow path.',
      sourceMarkdown: '# Orchestration Heading\n\nInitial draft copy.',
      actor: { id: authorId, role: 'author' },
      actorUserId: authorId,
    })

    const articleId = String(bundle.content.id)
    expect(articleId).toBeTruthy()

    // Verify initial item state
    const initialItem = await getWorkflowItemForArticle(payload, articleId, authorId)
    expect(initialItem.status).toBe('draft')

    // B. Author requests review (submit)
    const submittedItem = await executeWorkflowAction(payload, {
      articleId,
      action: 'submit',
      actor: { id: authorId, role: 'author' },
      actorSiteId: site.id,
      comment: 'Ready for editorial review',
    })
    expect(submittedItem.status).toBe('review')

    // C. Permission boundary: Author cannot approve their own review
    await expect(
      executeWorkflowAction(payload, {
        articleId,
        action: 'approve',
        actor: { id: authorId, role: 'author' },
        actorSiteId: site.id,
        comment: 'Self-approval should fail',
      }),
    ).rejects.toThrow()

    // D. Reviewer rejects / requests changes
    const rejectedItem = await executeWorkflowAction(payload, {
      articleId,
      action: 'reject',
      actor: { id: editorId, role: 'editor' },
      actorSiteId: site.id,
      comment: 'Please expand on the orchestration architecture section.',
    })
    expect(rejectedItem.status).toBe('rejected')

    // E. Author saves updated draft after review
    const revisedItem = await executeWorkflowAction(payload, {
      articleId,
      action: 'save-draft',
      actor: { id: authorId, role: 'author' },
      actorSiteId: site.id,
      comment: 'Revised draft with expanded architecture details.',
    })
    expect(['draft', 'updated']).toContain(revisedItem.status)

    // F. Author resubmits for review
    const resubmittedItem = await executeWorkflowAction(payload, {
      articleId,
      action: 'submit',
      actor: { id: authorId, role: 'author' },
      actorSiteId: site.id,
      comment: 'Resubmitted with requested revisions.',
    })
    expect(resubmittedItem.status).toBe('review')

    // G. Editor approves review
    const approvedItem = await executeWorkflowAction(payload, {
      articleId,
      action: 'approve',
      actor: { id: editorId, role: 'editor' },
      actorSiteId: site.id,
      comment: 'All criteria met. Approved.',
    })
    expect(approvedItem.status).toBe('approved')

    // H. Audit trail verification: tracks complete journey without direct DB modification
    const auditTrail = await getWorkflowAuditHistory(payload, articleId)
    expect(auditTrail.length).toBeGreaterThanOrEqual(5)
    expect(auditTrail.some((e) => e.action === 'workflow.initialized')).toBe(true)
    expect(auditTrail.some((e) => e.action === 'workflow.submitted_for_review')).toBe(true)
    expect(auditTrail.some((e) => e.action === 'workflow.decided_rejected')).toBe(true)
    expect(auditTrail.some((e) => e.action === 'workflow.draft_saved')).toBe(true)
    expect(auditTrail.some((e) => e.action === 'workflow.decided_approved')).toBe(true)

    // I. Operator queue visibility
    const queues = await getWorkflowQueuesForUser(payload, {
      userId: editorId,
      role: 'editor',
      siteId: site.id,
    })
    const isApprovedInQueue =
      queues.team.approved.some((item) => item.id === articleId) ||
      queues.personal.approved.some((item) => item.id === articleId)
    expect(isApprovedInQueue).toBe(true)

    // J. Bulk queue action verification
    const bulkRes = await bulkExecuteWorkflowItems(payload, {
      articleIds: [articleId],
      action: 'reassign',
      actor: { id: editorId, role: 'editor' },
      update: { priority: 'urgent' },
      comment: 'Bulk reassign priority to urgent',
    })
    expect(bulkRes.succeededCount).toBe(1)
    expect(bulkRes.results[0].success).toBe(true)

    const updatedWorkflowItem = await getWorkflowItemForArticle(payload, articleId)
    expect(updatedWorkflowItem.assignment.priority).toBe('urgent')
  })

  it('2. Scheduled Publication: timezone-aware future scheduling, worker execution, lease locking & idempotency', async () => {
    const site = await findOne('sites', 'demo-publication')
    const publication = await findOne('publications', 'main')
    const suffix = randomUUID().slice(0, 8)

    const usersResult = await payload.find({ collection: 'users', limit: 2, overrideAccess: true })
    const authorUser = usersResult.docs[0]
    const editorUser = usersResult.docs[1] || authorUser
    const authorId = String(authorUser.id)
    const editorId = String(editorUser.id)

    const bundle = await createEditorialArticle(payload, {
      siteId: site.id,
      publicationId: publication.id,
      title: `Scheduled Article ${suffix}`,
      slug: `sched-art-${suffix}`,
      canonicalPath: `/articles/sched-art-${suffix}`,
      summary: 'Testing timezone scheduling and worker execution.',
      sourceMarkdown: '# Future Publication\n\nContent to be released.',
      actor: { id: authorId, role: 'author' },
      actorUserId: authorId,
    })

    const articleId = String(bundle.article.id)

    // Progress through review to approved
    await executeWorkflowAction(payload, {
      articleId,
      action: 'submit',
      actor: { id: authorId, role: 'author' },
    })
    await executeWorkflowAction(payload, {
      articleId,
      action: 'approve',
      actor: { id: editorId, role: 'editor' },
    })

    // Test timezone-aware scheduling across a DST boundary (e.g. 2026-11-01 Chicago fall-back edge)
    const scheduledFor = '2026-11-01T06:30:00.000Z' // 1:30 AM CDT
    const idempotencyKey = `orch-sched-${suffix}`
    const scheduledBundle = await scheduleEditorialPublication(payload, {
      articleId,
      scheduledFor,
      timeZone: 'America/Chicago',
      actor: { id: editorId, role: 'publisher' },
      idempotencyKey,
    })

    expect(scheduledBundle.article.lifecycle).toBe('scheduled')

    const jobs = await payload.find({
      collection: 'scheduled-publish-jobs',
      where: { idempotencyKey: { equals: idempotencyKey } },
      overrideAccess: true,
    })
    expect(jobs.docs).toHaveLength(1)
    const jobId = String(jobs.docs[0].id)
    expect(jobs.docs[0].timeZone).toBe('America/Chicago')

    // Worker execution with lease protection
    const execResult = await executeScheduledPublishJob(payload, jobId, {
      workerId: `worker-${suffix}`,
      now: scheduledFor,
    })
    expect(execResult.published).toBe(true)
    expect(execResult.success).toBe(true)

    // Verify idempotency: running again should return safely without error
    const idempotentResult = await executeScheduledPublishJob(payload, jobId, {
      workerId: `worker-${suffix}-retry`,
      now: scheduledFor,
    })
    expect(idempotentResult.success).toBe(true)
  })

  it('3. Coordinated Release: coordinates article, media, product, social distribution, and newsletter artifacts with pinned revisions', async () => {
    const site = await findOne('sites', 'demo-publication')
    const publication = await findOne('publications', 'main')
    const suffix = randomUUID().slice(0, 8)

    const usersResult = await payload.find({ collection: 'users', limit: 2, overrideAccess: true })
    const authorUser = usersResult.docs[0]
    const editorUser = usersResult.docs[1] || authorUser
    const authorId = String(authorUser.id)
    const editorId = String(editorUser.id)

    // 1. Article Artifact
    const articleBundle = await createEditorialArticle(payload, {
      siteId: site.id,
      publicationId: publication.id,
      title: `Coordinated Story ${suffix}`,
      slug: `coord-story-${suffix}`,
      canonicalPath: `/articles/coord-story-${suffix}`,
      summary: 'Story coordinated as part of spring campaign release.',
      sourceMarkdown: '# Coordinated Release Campaign\n\nMulti-channel story.',
      actor: { id: authorId, role: 'author' },
      actorUserId: authorId,
    })

    // 2. Product Artifact
    const merchant = (await payload.create({
      collection: 'merchant-connections' as never,
      data: {
        site: site.id,
        publication: publication.id,
        label: `Merchant ${suffix}`,
        providerKey: 'development-stripe',
        merchantCountry: 'US',
      },
      overrideAccess: true,
    } as never)) as any

    const product = (await payload.create({
      collection: 'products' as never,
      data: {
        site: site.id,
        publication: publication.id,
        merchantConnection: merchant.id,
        name: `Campaign Edition Product ${suffix}`,
        slug: `product-${suffix}`,
        canonicalPath: `/store/product-${suffix}`,
        kind: 'physical',
        state: 'approved',
        releaseRevision: `rev-prod-${suffix}`,
        productCapabilities: ['shippable'],
        variants: [
          {
            sku: `CAMPAIGN-${suffix}`,
            title: 'Limited Campaign Box',
            optionValues: {},
            status: 'active',
            weightGrams: 200,
            dimensionsMm: { length: 150, width: 150, height: 25 },
            inventoryPolicy: 'untracked',
          },
        ],
        offers: [
          {
            id: `offer-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: `CAMPAIGN-${suffix}`,
            amountMinor: '3500',
            currency: 'USD',
            taxDisplay: 'exclusive',
          },
        ],
      },
      overrideAccess: true,
    } as never)) as any

    // 3. Create Coordinated Release
    const plannedInstant = new Date().toISOString()
    const release = await createRelease(payload, {
      name: `Spring 2026 Sovereign Campaign ${suffix}`,
      purpose: 'Multi-artifact synchronized product launch and announcement',
      ownerId: editorId,
      ownerTeam: 'Editorial & Growth',
      siteId: site.id,
      publicationId: publication.id,
      plannedInstant,
      timeZone: 'UTC',
      labels: ['campaign', 'spring-2026', 'product-launch'],
    })

    expect(release.id).toBeTruthy()
    expect(release.status).toBe('draft')

    // Pin each of the 5 artifacts
    await pinArtifact(payload, release.id, {
      targetType: 'article',
      targetId: String(articleBundle.content.id),
      title: `Coordinated Story ${suffix}`,
      canonicalUrl: `https://renegadeparty.org/articles/coord-story-${suffix}`,
      pinnedRevisionId: String(articleBundle.revisions[0]?.id || 'rev-1'),
      pinnedRevisionSequence: 1,
      pinnedHash: 'sha256:art-hash-1',
    }, editorId)

    await pinArtifact(payload, release.id, {
      targetType: 'product',
      targetId: String(product.id),
      title: `Campaign Edition Product ${suffix}`,
      canonicalUrl: `https://renegadeparty.org/store/product-${suffix}`,
      pinnedRevisionId: `rev-prod-${suffix}`,
      pinnedHash: 'sha256:prod-hash-1',
    }, editorId)

    await pinArtifact(payload, release.id, {
      targetType: 'media',
      targetId: `media-hero-${suffix}`,
      title: 'Hero Key Visual Artwork',
      pinnedHash: 'sha256:media-hash-1',
    }, editorId)

    await pinArtifact(payload, release.id, {
      targetType: 'distribution',
      targetId: `dist-social-${suffix}`,
      distributionDraftId: `draft-social-${suffix}`,
      title: 'Announcement Social Dispatch',
      pinnedHash: 'sha256:dist-hash-1',
    }, editorId)

    const pinnedRelease = await pinArtifact(payload, release.id, {
      targetType: 'newsletter',
      targetId: `newsletter-msg-${suffix}`,
      title: 'Subscriber Announcement Dispatch',
      pinnedHash: 'sha256:news-hash-1',
    }, editorId)

    expect(pinnedRelease.artifacts.length).toBe(5)

    // 4. Approval requirements
    const approvedRelease = await approveRelease(
      payload,
      release.id,
      { id: editorId, role: 'publisher' },
      'Campaign bundle verified. Approved for immediate execution.',
    )
    expect(approvedRelease.status).toBe('approved')

    // 5. Execute Coordinated Release Saga
    const executionResult = await executeRelease(payload, {
      releaseId: release.id,
      actorId: editorId,
    })

    expect(executionResult.status).toBe('completed')
    expect(executionResult.succeeded).toBe(5)
    expect(executionResult.failedSteps).toHaveLength(0)
    expect(executionResult.resultingUrls.length).toBeGreaterThanOrEqual(1)

    // Pinned revision proof: Product state is published
    const updatedProduct = (await payload.findByID({
      collection: 'products' as never,
      id: product.id,
      overrideAccess: true,
    } as never)) as any
    expect(updatedProduct.state).toBe('published')
  })

  it('4. Distribution Truth: verifies provider runtime boundaries (Bluesky live vs manual handoff vs unavailable)', () => {
    // A. Verify full provider adapter roster
    expect(socialProviderAdapters.length).toBeGreaterThanOrEqual(9)

    // B. Truth requirement: Bluesky is the sole native live-post provider
    const liveAdapters = socialProviderAdapters.filter((a) => a.mode === 'live')
    expect(liveAdapters.length).toBe(1)
    expect(liveAdapters[0].network).toBe('bluesky')

    // C. Commercial walled gardens are strictly manual-handoff
    const manualNetworks = ['x', 'threads', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'manual']
    for (const network of manualNetworks) {
      const adapter = socialProviderFor(network as any)
      expect(adapter.mode).toBe('manual-handoff')
    }

    // D. Federation / ActivityPub is strictly unavailable
    const apAdapter = socialProviderFor('activitypub' as any)
    expect(apAdapter.mode).toBe('unavailable')

    // E. Unregistered networks fall back to unavailable
    const unknownAdapter = socialProviderFor('unknown-network' as any)
    expect(unknownAdapter.mode).toBe('unavailable')
  })
})
