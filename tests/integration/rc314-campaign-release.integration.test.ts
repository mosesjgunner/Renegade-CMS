/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { createEditorialArticle } from '../../src/modules/editorial/persistence'
import { executeWorkflowAction } from '../../src/modules/editorial/cmos-persistence'
import {
  approveRelease,
  cancelRelease,
  createRelease,
  evaluatePreflight,
  executeRelease,
  getReleaseDetail,
  pinArtifact,
  retryRelease,
  scheduleRelease,
  submitReleaseForReview,
} from '../../src/modules/releases/service'
import { socialHash } from '../../src/modules/social/contracts'
import { encryptSecret } from '../../src/modules/social/security'
import {
  assertFixtureSafeDatabase,
  buildRc2World,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

const FIXTURE = 'http://127.0.0.1:13160'

async function fixtureUp(): Promise<boolean> {
  try {
    const res = await fetch(`${FIXTURE}/state`)
    return res.ok
  } catch {
    return false
  }
}

/**
 * RC3-14 campaign orchestration (ledger #25, D-04) and coordinated
 * release re-proof (ledger #23, D-01): ONE canonical campaign release
 * pins an approved article, a source-linked social draft, and a
 * newsletter. The newsletter channel is deliberately not release-ready,
 * so the first execution must land partially-failed — article published,
 * social delivered exactly once, newsletter failed — with the failure
 * visible per item. After the channel is fixed, retry completes the
 * release by executing ONLY the failed item: the acknowledged social
 * delivery is never repeated and the article is never re-published.
 * Execution state is durable in Postgres, so the retry resumes from
 * persisted state (the restart-recovery half of D-01).
 */
describe('RC3-14: campaign release with single-channel failure and idempotent retry', () => {
  let payload: Payload
  let world: Rc2World
  let fixtureProc: ChildProcess | null = null
  const originalAllowedOrigins = process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS
  const suffix = randomUUID().slice(0, 8)

  let releaseId: string
  let scheduleMutationId: string
  let emailId: string
  let variantId: string
  let contentId: string

  async function releaseQueueItems() {
    const result = await (payload as any).db.pool.query(
      `SELECT id, status, idempotency_key FROM social_queue_items WHERE idempotency_key LIKE $1`,
      [`release:${releaseId}:%`],
    )
    return result.rows as any[]
  }

  function itemStates(detail: any) {
    const items = detail.artifacts || detail.executionItems || []
    return Object.fromEntries(
      items.map((item: any) => [item.targetType, { status: item.status, attempts: item.attempts }]),
    )
  }

  beforeAll(async () => {
    process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS = FIXTURE
    assertFixtureSafeDatabase(process.env.DATABASE_URL)
    if (await fixtureUp()) throw new Error('RC314 fixture port is already occupied')
    fixtureProc = spawn('node', ['tests/rc03/provider-fixture.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      env: { ...process.env, SOCIAL_FIXTURE_PORT: '13160' },
    })
    const t0 = Date.now()
    while (!(await fixtureUp())) {
      if (Date.now() - t0 > 30_000) throw new Error('provider fixture did not start')
      await new Promise((r) => setTimeout(r, 500))
    }
    payload = await getPayload({ config })
    world = await buildRc2World(payload)

    const siteId = world.siteA.siteId
    const publicationId = world.siteA.blogPublicationId
    const authorUserId = String(world.siteA.owner.userId)
    const editorUserId = String(world.siteA.editor.userId)

    // 1. The canonical article, taken through editorial review to approved.
    const bundle = await createEditorialArticle(payload, {
      siteId,
      publicationId,
      title: `Campaign Story ${suffix}`,
      slug: `campaign-story-${suffix}`,
      canonicalPath: `/articles/campaign-story-${suffix}`,
      summary: 'The campaign launch story.',
      sourceMarkdown: '# Campaign Launch\n\nOne story, every channel, one release.',
      actor: { id: authorUserId, role: 'author' },
      actorUserId: authorUserId,
    })
    contentId = String(bundle.content.id)
    const articleId = String(bundle.article.id)
    await executeWorkflowAction(payload, {
      articleId: contentId,
      action: 'submit',
      actor: { id: authorUserId, role: 'author' },
      actorSiteId: siteId,
      comment: 'Ready for campaign review.',
    })
    const approved = await executeWorkflowAction(payload, {
      articleId: contentId,
      action: 'approve',
      actor: { id: editorUserId, role: 'editor' },
      actorSiteId: siteId,
      comment: 'Approved for the campaign release.',
    })
    expect(approved.status).toBe('approved')

    // 2. The source-linked social draft with one approved Bluesky variant,
    //    delivered through the local provider fixture (no live network).
    const account = (await payload.create({
      collection: 'social-accounts' as never,
      data: {
        site: siteId,
        network: 'bluesky',
        actorType: 'site',
        displayName: `Campaign Account ${suffix}`,
        externalAccountId: `campaign-${suffix}`,
        credentialHealth: 'healthy',
        connectionReference: `enc:${encryptSecret(
          JSON.stringify({ identifier: `campaign-${suffix}`, appPassword: 'pw', service: FIXTURE }),
        )}`,
      },
      overrideAccess: true,
    } as never)) as any
    const linkUrl = `https://a.rc2-a04.test/articles/campaign-story-${suffix}`
    const draft = (await payload.create({
      collection: 'social-drafts' as never,
      data: {
        site: siteId,
        title: `Campaign Announcement ${suffix}`,
        status: 'approved',
        canonicalUrl: linkUrl,
        sourceContent: contentId,
      },
      overrideAccess: true,
    } as never)) as any
    const text = `Our campaign story is live: ${suffix}`
    const variant = (await payload.create({
      collection: 'social-network-variants' as never,
      data: {
        draft: String(draft.id),
        account: String(account.id),
        network: 'bluesky',
        label: 'Bluesky',
        text,
        linkUrl,
        status: 'approved',
        approvalHash: socialHash({ network: 'bluesky', text, linkUrl, attachments: [] }),
        idempotencyKey: `campaign-variant-${suffix}`,
      },
      overrideAccess: true,
    } as never)) as any
    variantId = String(variant.id)

    // 3. The newsletter — deliberately left in draft (not release-ready):
    //    this is the single injected channel failure.
    const email = (await payload.create({
      collection: 'email-messages' as never,
      data: {
        site: siteId,
        subject: `Campaign Newsletter ${suffix}`,
        blocks: [{ type: 'text', text: 'The campaign story, in your inbox.' }],
        kind: 'bulk',
      },
      overrideAccess: true,
    } as never)) as any
    emailId = String(email.id)
    expect(email.status).toBe('draft')

    // 4. One coordinated campaign release pinning all three artifacts.
    //    The approved planned instant and the schedule instant must match.
    const plannedInstant = new Date().toISOString()
    const release = await createRelease(payload, {
      name: `Campaign Release ${suffix}`,
      purpose: 'Coordinated article + social + newsletter campaign launch',
      ownerId: world.siteA.owner.memberId,
      ownerTeam: 'Editorial & Growth',
      siteId,
      publicationId,
      campaign: `campaign-${suffix}`,
      plannedInstant,
      timeZone: 'UTC',
      labels: ['campaign', 'rc3-14'],
    })
    releaseId = String(release.id)
    await pinArtifact(
      payload,
      releaseId,
      {
        targetType: 'article',
        targetId: articleId,
        title: `Campaign Story ${suffix}`,
        canonicalUrl: linkUrl,
        pinnedRevisionId: String(bundle.revisions[0]?.id || 'rev-1'),
        pinnedRevisionSequence: 1,
        pinnedHash: 'sha256:rc314-article',
      },
      editorUserId,
    )
    await pinArtifact(
      payload,
      releaseId,
      {
        targetType: 'distribution',
        targetId: String(draft.id),
        distributionDraftId: String(draft.id),
        title: `Campaign Announcement ${suffix}`,
        pinnedHash: 'sha256:rc314-distribution',
      },
      editorUserId,
    )
    await pinArtifact(
      payload,
      releaseId,
      {
        targetType: 'newsletter',
        targetId: emailId,
        title: `Campaign Newsletter ${suffix}`,
        pinnedHash: 'sha256:rc314-newsletter',
      },
      editorUserId,
    )
    await submitReleaseForReview(payload, releaseId, editorUserId)
    // Release authorization is a publisher-tier gate (rule-permissions);
    // the preflight must be clean before approval is attempted.
    const publisher = { id: String(world.siteA.owner.userId), role: 'publisher' }
    const snapshot = await evaluatePreflight(payload, releaseId, { actor: publisher })
    expect(snapshot.blockerCount).toBe(0)
    await approveRelease(payload, releaseId, publisher)
    const scheduled = (await scheduleRelease(payload, {
      releaseId,
      scheduledFor: plannedInstant,
      timeZone: 'UTC',
      actorId: editorUserId,
      idempotencyKey: `campaign-schedule-${suffix}`,
    })) as any
    scheduleMutationId = String(scheduled.lastScheduleMutationId)
    expect(scheduleMutationId).toBeTruthy()
  }, 240_000)

  afterAll(async () => {
    if (payload && world) await teardownRc2World(payload, world)
    fixtureProc?.kill()
    if (originalAllowedOrigins === undefined) delete process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS
    else process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS = originalAllowedOrigins
  })

  it('executes to partially-failed: article and social succeed, newsletter fails visibly', async () => {
    const result = await executeRelease(payload, {
      releaseId,
      scheduleMutationId,
      actorId: String(world.siteA.editor.userId),
    })
    expect(result.status).toBe('partially-failed')
    expect(result.failedSteps.map((step) => step.artifactId)).toEqual([
      expect.stringContaining('newsletter'),
    ])

    const detail = await getReleaseDetail(payload, releaseId)
    const states = itemStates(detail)
    expect(states.article.status).toBe('succeeded')
    expect(states.distribution.status).toBe('succeeded')
    expect(states.newsletter.status).toBe('failed')

    const content = (await payload.findByID({
      collection: 'content',
      id: contentId,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(content.status).toBe('published')

    const queueItems = await releaseQueueItems()
    expect(queueItems).toHaveLength(1)
    expect(queueItems[0].status).toBe('published')
    expect(queueItems[0].idempotency_key.startsWith(`release:${releaseId}:`)).toBe(true)
    expect(queueItems[0].idempotency_key.endsWith(`:${variantId}`)).toBe(true)
  })

  it('retry after fixing the channel completes the release without repeating acknowledged work', async () => {
    // Restart recovery: the partial state above is durable — a fresh
    // read (what a restarted worker would see) carries it intact.
    const persisted = await getReleaseDetail(payload, releaseId)
    expect(persisted.status).toBe('partially-failed')
    expect(itemStates(persisted).newsletter.status).toBe('failed')

    // Fix the failing channel: the newsletter enters review.
    await payload.update({
      collection: 'email-messages' as never,
      id: emailId,
      data: { status: 'review' },
      overrideAccess: true,
    } as never)

    const retried = await retryRelease(payload, {
      releaseId,
      actorId: String(world.siteA.editor.userId),
    })
    expect(retried.status).toBe('completed')

    const detail = await getReleaseDetail(payload, releaseId)
    const states = itemStates(detail)
    expect(states.newsletter.status).toBe('succeeded')
    // Succeeded steps were never re-executed.
    expect(states.article.attempts).toBe(1)
    expect(states.distribution.attempts).toBe(1)
    // The acknowledged social delivery was not repeated.
    const queueItems = await releaseQueueItems()
    expect(queueItems).toHaveLength(1)
    expect(queueItems[0].status).toBe('published')

    const email = (await payload.findByID({
      collection: 'email-messages' as never,
      id: emailId,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(['scheduled', 'queued', 'sending', 'sent']).toContain(email.status)
  })

  it('a scheduled release can be cancelled before execution and then executes nothing', async () => {
    const siteId = world.siteA.siteId
    const publicationId = world.siteA.blogPublicationId
    const authorUserId = String(world.siteA.owner.userId)
    const publisher = { id: authorUserId, role: 'publisher' }
    const plannedInstant = new Date().toISOString()
    const bundle = await createEditorialArticle(payload, {
      siteId,
      publicationId,
      title: `Cancelled Story ${suffix}`,
      slug: `cancelled-story-${suffix}`,
      canonicalPath: `/articles/cancelled-story-${suffix}`,
      summary: 'A story whose release is cancelled.',
      sourceMarkdown: '# Cancelled\n\nThis release never ships.',
      actor: { id: authorUserId, role: 'author' },
      actorUserId: authorUserId,
    })
    const release = await createRelease(payload, {
      name: `Cancelled Release ${suffix}`,
      purpose: 'Cancellation path proof',
      ownerId: world.siteA.owner.memberId,
      ownerTeam: 'Editorial & Growth',
      siteId,
      publicationId,
      plannedInstant,
      timeZone: 'UTC',
      labels: ['campaign', 'rc3-14', 'cancelled'],
    })
    const cancelledReleaseId = String(release.id)
    await pinArtifact(
      payload,
      cancelledReleaseId,
      {
        targetType: 'article',
        targetId: String(bundle.article.id),
        title: `Cancelled Story ${suffix}`,
        canonicalUrl: `https://a.rc2-a04.test/articles/cancelled-story-${suffix}`,
        pinnedRevisionId: String(bundle.revisions[0]?.id || 'rev-1'),
        pinnedRevisionSequence: 1,
        pinnedHash: 'sha256:rc314-cancelled',
      },
      authorUserId,
    )
    await submitReleaseForReview(payload, cancelledReleaseId, authorUserId)
    await approveRelease(payload, cancelledReleaseId, publisher)
    const scheduled = (await scheduleRelease(payload, {
      releaseId: cancelledReleaseId,
      scheduledFor: plannedInstant,
      timeZone: 'UTC',
      actorId: authorUserId,
      idempotencyKey: `cancelled-schedule-${suffix}`,
    })) as any

    const cancelled = (await cancelRelease(
      payload,
      cancelledReleaseId,
      authorUserId,
      'Campaign called off by the operator.',
    )) as any
    expect(cancelled.status).toBe('cancelled')

    const result = await executeRelease(payload, {
      releaseId: cancelledReleaseId,
      scheduleMutationId: String(scheduled.lastScheduleMutationId),
      actorId: authorUserId,
    })
    expect(result.status).toBe('cancelled')
    const content = (await payload.findByID({
      collection: 'content',
      id: String(bundle.content.id),
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(content.status).not.toBe('published')
  })
})
