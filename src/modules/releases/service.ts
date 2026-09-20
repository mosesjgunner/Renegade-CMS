/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import { assertIanaTimeZone } from '../calendar/contracts'
import { OPERATIONS_QUEUE } from '../operations/tasks'
import type {
  CoordinatedRelease,
  CreateReleaseInput,
  PinArtifactInput,
  ReleaseApproval,
  ReleaseArtifactItem,
  ReleaseAuditEvent,
  ReleaseExecutionResult,
  ReleaseGateRuleWaiver,
  ReleaseGateSnapshot,
  ReleaseStatus,
} from './contracts'
import { computeReleaseFingerprint, evaluateReleaseGates, isGateSnapshotValid } from './gates'
import { executeReleaseSaga, rollbackReleaseSaga } from './saga'

type Doc = Record<string, any>

const idOf = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : String((value as Doc)?.id ?? (value as Doc)?.value ?? '')

const list = (value: unknown): any[] => (Array.isArray(value) ? value : [])

const appendAudit = (release: Doc, event: ReleaseAuditEvent) => [
  ...(Array.isArray(release.executionAudit) ? release.executionAudit : []),
  event,
]

/**
 * 1. Create a release with name, purpose, owner/team, target site/publication,
 * planned instant/timezone, labels/campaign, dependencies, and explicit artifacts.
 */
export async function createRelease(
  payload: Payload,
  input: CreateReleaseInput,
): Promise<CoordinatedRelease> {
  const timeZone = input.timeZone || 'UTC'
  assertIanaTimeZone(timeZone)

  const plannedInstant = input.plannedInstant || input.scheduledFor || new Date().toISOString()
  if (Number.isNaN(new Date(plannedInstant).getTime())) {
    throw new Error('Release plannedInstant must be a valid ISO instant.')
  }

  const data: Record<string, any> = {
    title: input.name,
    name: input.name,
    purpose: input.purpose,
    ownerTeam: input.ownerTeam,
    owner: input.ownerId,
    site: input.siteId,
    publication: input.publicationId,
    plannedInstant,
    scheduledFor: plannedInstant,
    timeZone,
    labels: input.labels || [],
    campaign: input.campaign,
    dependencies: input.dependencies || [],
    releaseRevision: 1,
    status: 'draft',
    artifacts: [],
    executionItems: [],
    gateSnapshot: null,
    approvals: [],
    sagaSteps: [],
    resultingUrls: [],
    scheduleAudit: [],
    executionAudit: [
      {
        action: 'release.created',
        actorId: input.ownerId,
        at: new Date().toISOString(),
        details: { name: input.name, purpose: input.purpose },
      },
    ],
  }

  const created = (await payload.create({
    collection: 'content-releases' as never,
    data,
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  return created
}

/**
 * 2. Pin exact approved content revisions, presentation revisions/templates/globals,
 * media versions/rights state, redirects, and later distribution draft IDs.
 * Once approved/scheduled, changes require a visible release revision increment or reapproval.
 */
export async function pinArtifact(
  payload: Payload,
  releaseId: string,
  input: PinArtifactInput,
  actorId: string,
): Promise<CoordinatedRelease> {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc

  const artifacts: ReleaseArtifactItem[] = [...(release.artifacts || release.executionItems || [])]

  const artifactKey = `${input.targetType}:${input.targetId}`
  const existingIdx = artifacts.findIndex((a) => a.id === artifactKey)

  const item: ReleaseArtifactItem = {
    id: artifactKey,
    targetType: input.targetType,
    targetId: input.targetId,
    title: input.title,
    canonicalUrl: input.canonicalUrl,
    pinnedRevisionId: input.pinnedRevisionId,
    pinnedRevisionSequence: input.pinnedRevisionSequence,
    pinnedSnapshot: input.pinnedSnapshot,
    pinnedHash: input.pinnedHash,
    mediaRightsStatus: input.mediaRightsStatus,
    mediaRightsExpiresAt: input.mediaRightsExpiresAt,
    redirectRule: input.redirectRule,
    distributionDraftId: input.distributionDraftId,
    locale: input.locale,
    translationGroupId: input.translationGroupId,
    isMachineDraft: input.isMachineDraft,
    humanReviewed: input.humanReviewed,
    translationStale: input.translationStale,
    completenessScore: input.completenessScore,
    status: 'pending',
    attempts: 0,
    updatedAt: new Date().toISOString(),
  }

  if (existingIdx >= 0) {
    artifacts[existingIdx] = item
  } else {
    artifacts.push(item)
  }

  // Increment releaseRevision and invalidate any existing gate snapshot
  const nextRevision = Number(release.releaseRevision || 1) + 1
  let nextStatus: ReleaseStatus = release.status
  if (['approved', 'scheduled'].includes(release.status)) {
    // Pinned input change invalidates approval/schedule
    nextStatus = 'draft'
  }

  const updated = (await payload.update({
    collection: 'content-releases' as never,
    id: releaseId,
    data: {
      artifacts,
      executionItems: artifacts,
      releaseRevision: nextRevision,
      status: nextStatus,
      gateSnapshot: null, // automatically invalidated
      executionAudit: appendAudit(release, {
        action: 'release.artifact.pinned',
        actorId,
        at: new Date().toISOString(),
        details: {
          artifactId: item.id,
          targetType: item.targetType,
          pinnedHash: item.pinnedHash,
          releaseRevision: nextRevision,
        },
      }),
    },
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  return updated
}

/**
 * Unpins an artifact from a release.
 */
export async function unpinArtifact(
  payload: Payload,
  releaseId: string,
  artifactId: string,
  actorId: string,
): Promise<CoordinatedRelease> {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc

  const artifacts: ReleaseArtifactItem[] = (
    release.artifacts ||
    release.executionItems ||
    []
  ).filter((a: ReleaseArtifactItem) => a.id !== artifactId)

  const nextRevision = Number(release.releaseRevision || 1) + 1
  let nextStatus: ReleaseStatus = release.status
  if (['approved', 'scheduled'].includes(release.status)) {
    nextStatus = 'draft'
  }

  const updated = (await payload.update({
    collection: 'content-releases' as never,
    id: releaseId,
    data: {
      artifacts,
      executionItems: artifacts,
      releaseRevision: nextRevision,
      status: nextStatus,
      gateSnapshot: null,
      executionAudit: appendAudit(release, {
        action: 'release.artifact.unpinned',
        actorId,
        at: new Date().toISOString(),
        details: { artifactId, releaseRevision: nextRevision },
      }),
    },
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  return updated
}

/**
 * 3. & 4. Preflight gates snapshot evaluation and waiver application.
 */
export async function evaluatePreflight(
  payload: Payload,
  releaseId: string,
  options: {
    actor?: { id: string; role: string }
    now?: string
    existingWaivers?: Record<string, ReleaseGateRuleWaiver>
    workerHealthy?: boolean
    allowMigrations?: boolean
    mockQualityBlockers?: Array<{ id: string; targetId: string; message: string }>
  } = {},
): Promise<ReleaseGateSnapshot> {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  const snapshot = await evaluateReleaseGates(payload, release, options)

  await payload.update({
    collection: 'content-releases' as never,
    id: releaseId,
    data: {
      gateSnapshot: snapshot,
      executionAudit: appendAudit(release as Doc, {
        action: 'release.gate.evaluated',
        actorId: options.actor?.id || 'system',
        at: new Date().toISOString(),
        details: {
          overallStatus: snapshot.overallStatus,
          blockerCount: snapshot.blockerCount,
          warningCount: snapshot.warningCount,
          snapshotId: snapshot.snapshotId,
        },
      }),
    },
    overrideAccess: true,
  } as never)

  return snapshot
}

/**
 * Authorized staff waiver application for a specific rule with mandatory reason and expiry.
 */
export async function waiveGateRule(
  payload: Payload,
  releaseId: string,
  input: {
    ruleId: string
    reason: string
    expiresAt: string
    actor: { id: string; role: string }
  },
): Promise<ReleaseGateSnapshot> {
  const allowed = ['owner', 'administrator', 'publisher', 'staff']
  if (!allowed.includes(input.actor.role)) {
    throw new Error(`Role '${input.actor.role}' is not authorized to grant release waivers.`)
  }
  if (!input.reason || !input.reason.trim()) {
    throw new Error('A waiver reason is strictly required.')
  }
  if (new Date(input.expiresAt) <= new Date()) {
    throw new Error('Waiver expiry must be a future instant.')
  }

  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  const waiver: ReleaseGateRuleWaiver = {
    waivedByUserId: input.actor.id,
    waivedByUserRole: input.actor.role,
    reason: input.reason,
    waivedAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
  }

  const existingWaivers: Record<string, ReleaseGateRuleWaiver> = {}
  if (release.gateSnapshot?.rules) {
    for (const r of release.gateSnapshot.rules) {
      if (r.waiver) existingWaivers[r.ruleId] = r.waiver
    }
  }
  existingWaivers[input.ruleId] = waiver

  // Re-evaluate with waiver
  const nextSnapshot = await evaluateReleaseGates(payload, release, {
    actor: input.actor,
    existingWaivers,
  })

  await payload.update({
    collection: 'content-releases' as never,
    id: releaseId,
    data: {
      gateSnapshot: nextSnapshot,
      executionAudit: appendAudit(release as Doc, {
        action: 'release.gate.waived',
        actorId: input.actor.id,
        at: new Date().toISOString(),
        details: {
          ruleId: input.ruleId,
          reason: input.reason,
          expiresAt: input.expiresAt,
        },
      }),
    },
    overrideAccess: true,
  } as never)

  return nextSnapshot
}

/**
 * Submits release for editorial review.
 */
export async function submitReleaseForReview(
  payload: Payload,
  releaseId: string,
  actorId: string,
): Promise<CoordinatedRelease> {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc

  const artifacts = release.artifacts || release.executionItems || []
  if (artifacts.length === 0) {
    throw new Error('Cannot submit an empty release for review.')
  }

  const updated = (await payload.update({
    collection: 'content-releases' as never,
    id: releaseId,
    data: {
      status: 'in-review',
      executionAudit: appendAudit(release, {
        action: 'release.review.requested',
        actorId,
        at: new Date().toISOString(),
      }),
    },
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  return updated
}

/**
 * Approves a release. Enforces gate snapshot validity.
 */
export async function approveRelease(
  payload: Payload,
  releaseId: string,
  actor: { id: string; role: string },
  comment?: string,
): Promise<CoordinatedRelease> {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  // Evaluate gates if no snapshot
  let snapshot = release.gateSnapshot
  const gateValidity = isGateSnapshotValid(release, snapshot)
  if (!gateValidity.valid || !snapshot) {
    snapshot = await evaluateReleaseGates(payload, release, { actor })
  }

  if (snapshot.blockerCount > 0) {
    throw new Error(
      `Cannot approve release: ${snapshot.blockerCount} blocking preflight gate issue(s) remain un-waived.`,
    )
  }

  const approval: ReleaseApproval = {
    id: randomUUID(),
    actorId: actor.id,
    actorRole: actor.role,
    decision: 'approved',
    comment,
    releaseRevision: release.releaseRevision,
    gateSnapshotFingerprint: snapshot.evaluatedFingerprint,
    decidedAt: new Date().toISOString(),
  }

  const approvals = [...(release.approvals || []), approval]

  const updated = (await payload.update({
    collection: 'content-releases' as never,
    id: releaseId,
    data: {
      status: 'approved',
      gateSnapshot: snapshot,
      approvals,
      executionAudit: appendAudit(release as Doc, {
        action: 'release.approved',
        actorId: actor.id,
        at: new Date().toISOString(),
        details: { approvalId: approval.id, comment },
      }),
    },
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  return updated
}

/**
 * 5. Schedule a coordinated release.
 * Enforces gate validity, verifies approvals, and schedules Payload worker job.
 */
export async function scheduleRelease(
  payload: Payload,
  input: {
    releaseId: string
    scheduledFor: string
    timeZone: string
    actorId: string
    idempotencyKey: string
  },
): Promise<CoordinatedRelease> {
  assertIanaTimeZone(input.timeZone)
  if (Number.isNaN(new Date(input.scheduledFor).getTime())) {
    throw new Error('ContentRelease schedule must be a valid instant.')
  }

  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: input.releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc

  if (release.lastScheduleMutationId === input.idempotencyKey && release.executionJob) {
    return release as unknown as CoordinatedRelease
  }

  // Preflight validation
  let snapshot = release.gateSnapshot as ReleaseGateSnapshot | null
  const validity = isGateSnapshotValid(release as CoordinatedRelease, snapshot)
  if (!validity.valid || !snapshot) {
    snapshot = await evaluateReleaseGates(payload, release as CoordinatedRelease, {
      actor: { id: input.actorId, role: 'publisher' },
    })
  }

  if (snapshot.blockerCount > 0) {
    throw new Error(
      `ContentRelease is blocked by unresolved publication-blocking quality or preflight gate issues (${snapshot.blockerCount} blocker(s)).`,
    )
  }

  const artifacts = release.artifacts || release.executionItems || []
  if (artifacts.length === 0) {
    // If empty, try legacy releaseTargets
    const legacyItems = await releaseTargets(payload, release)
    release.artifacts = legacyItems
    release.executionItems = legacyItems
  }

  const queued = (await payload.jobs.queue({
    task: 'content-release-execute',
    input: {
      releaseId: input.releaseId,
      scheduleMutationId: input.idempotencyKey,
      actorId: input.actorId,
    },
    queue: OPERATIONS_QUEUE,
    waitUntil: new Date(input.scheduledFor),
  } as never)) as Doc

  const before = { scheduledFor: release.scheduledFor ?? null, timeZone: release.timeZone ?? null }

  const updated = (await payload.update({
    collection: 'content-releases' as never,
    id: input.releaseId,
    data: {
      scheduledFor: input.scheduledFor,
      plannedInstant: input.scheduledFor,
      timeZone: input.timeZone,
      status: 'scheduled',
      lastScheduleMutationId: input.idempotencyKey,
      executionJob: queued.id,
      artifacts: release.artifacts,
      executionItems: release.artifacts,
      gateSnapshot: snapshot,
      scheduleAudit: [
        ...(Array.isArray(release.scheduleAudit) ? release.scheduleAudit : []),
        {
          action: 'release.scheduled',
          actorId: input.actorId,
          at: new Date().toISOString(),
          before,
          after: { scheduledFor: input.scheduledFor, timeZone: input.timeZone },
          jobId: queued.id,
        },
      ],
      executionAudit: appendAudit(release, {
        action: 'release.execution.queued',
        actorId: input.actorId,
        at: new Date().toISOString(),
        jobId: queued.id,
      }),
    },
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  return updated
}

/**
 * 6. & 7. Execute release with saga outbox pattern.
 * Never labels partial success complete.
 */
export async function executeRelease(
  payload: Payload,
  input: {
    releaseId: string
    scheduleMutationId?: string
    actorId: string
    workerId?: string
  },
): Promise<ReleaseExecutionResult> {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: input.releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc

  // Reschedule idempotency check
  if (
    input.scheduleMutationId &&
    release.lastScheduleMutationId &&
    release.lastScheduleMutationId !== input.scheduleMutationId
  ) {
    return {
      releaseId: input.releaseId,
      status: String(release.status) as ReleaseStatus,
      succeeded: 0,
      unresolved: 0,
      failedSteps: [],
      resultingUrls: [],
    }
  }

  // Already terminal check
  if (['cancelled', 'completed', 'released'].includes(release.status)) {
    const succeeded = list(release.artifacts || release.executionItems).filter(
      (i) => i.status === 'succeeded',
    ).length
    return {
      releaseId: input.releaseId,
      status: String(release.status) as ReleaseStatus,
      succeeded,
      unresolved: 0,
      failedSteps: [],
      resultingUrls: release.resultingUrls || [],
    }
  }

  return executeReleaseSaga(payload, {
    releaseId: input.releaseId,
    actorId: input.actorId,
    workerId: input.workerId,
  })
}

/**
 * 7. Operator retry affordance: retries ONLY failed or blocked steps.
 * Succeeded steps are NEVER re-executed!
 */
export async function retryRelease(
  payload: Payload,
  input: {
    releaseId: string
    actorId: string
    workerId?: string
  },
): Promise<ReleaseExecutionResult> {
  return executeReleaseSaga(payload, {
    releaseId: input.releaseId,
    actorId: input.actorId,
    workerId: input.workerId,
    isRetry: true,
  })
}

/**
 * Cancels a scheduled release prior to completion.
 */
export async function cancelRelease(
  payload: Payload,
  releaseId: string,
  actorId: string,
  reason?: string,
): Promise<CoordinatedRelease> {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc

  if (['completed', 'released', 'executing'].includes(release.status)) {
    throw new Error(`Cannot cancel a release that is '${release.status}'. Use rollback instead.`)
  }

  const updated = (await payload.update({
    collection: 'content-releases' as never,
    id: releaseId,
    data: {
      status: 'cancelled',
      executionAudit: appendAudit(release, {
        action: 'release.cancelled',
        actorId,
        at: new Date().toISOString(),
        details: { reason },
      }),
    },
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  return updated
}

/**
 * 7. Rollback scenario: creates deliberate new public revisions or restores
 * last-known-good presentation/cache state. Never erases the released audit trail.
 */
export async function rollbackRelease(
  payload: Payload,
  input: {
    releaseId: string
    actorId: string
    reason: string
  },
): Promise<{ releaseId: string; status: ReleaseStatus; compensatedCount: number }> {
  return rollbackReleaseSaga(payload, input)
}

/**
 * 8. Query full release details, timeline, diffs, gates, approvals, and resulting URLs.
 */
export async function getReleaseDetail(
  payload: Payload,
  releaseId: string,
): Promise<CoordinatedRelease> {
  const doc = (await payload.findByID({
    collection: 'content-releases' as never,
    id: releaseId,
    depth: 1,
    overrideAccess: true,
  } as never)) as unknown as CoordinatedRelease

  return doc
}

/**
 * Helper to build legacy release targets when migrating from early content-release schema.
 */
async function releaseTargets(payload: Payload, release: Doc): Promise<ReleaseArtifactItem[]> {
  const targets = new Map<string, ReleaseArtifactItem>()

  const addArticle = async (articleId: string) => {
    const article = (await payload.findByID({
      collection: 'article-family-content' as never,
      id: articleId,
      depth: 0,
      overrideAccess: true,
    } as never)) as Doc

    const revId = idOf(article.currentRevision)
    targets.set(`article:${article.id}`, {
      id: `article:${article.id}`,
      targetType: 'article',
      targetId: String(article.id),
      title: String(article.title || 'Article'),
      canonicalUrl: article.canonicalPath ? String(article.canonicalPath) : undefined,
      pinnedRevisionId: revId,
      pinnedHash: createHash('sha256').update(revId).digest('hex'),
      status: 'pending',
      attempts: 0,
      updatedAt: new Date().toISOString(),
    })
  }

  if (release.article) await addArticle(idOf(release.article))
  if (release.content) {
    if (payload.find) {
      const artRes = (await payload.find({
        collection: 'article-family-content' as never,
        where: { content: { equals: idOf(release.content) } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      } as never)) as { docs: Doc[] }
      if (artRes.docs[0]) await addArticle(String(artRes.docs[0].id))
    }
  }
  if (release.product) {
    const productId = idOf(release.product)
    targets.set(`product:${productId}`, {
      id: `product:${productId}`,
      targetType: 'product',
      targetId: productId,
      title: 'Storefront Product',
      pinnedRevisionId: release.productRevision ? String(release.productRevision) : undefined,
      pinnedHash: release.productRevision
        ? createHash('sha256').update(String(release.productRevision)).digest('hex')
        : 'prod-hash',
      status: 'pending',
      attempts: 0,
      updatedAt: new Date().toISOString(),
    })
  }

  return [...targets.values()]
}

/* ========================================================================= */
/* Backwards-compatibility facades for existing tests and task runners       */
/* ========================================================================= */

/** Backwards-compatible facade for scheduleContentRelease */
export async function scheduleContentRelease(
  payload: Payload,
  input: {
    releaseId: string
    scheduledFor: string
    timeZone: string
    actorId: string
    idempotencyKey: string
  },
) {
  return scheduleRelease(payload, input)
}

/** Backwards-compatible facade for executeContentRelease */
export async function executeContentRelease(
  payload: Payload,
  input: { releaseId: string; scheduleMutationId: string; actorId: string },
) {
  const result = await executeRelease(payload, input)

  // Map status for legacy expectations: 'completed' -> 'released', 'partially-failed' -> 'partial-failure'
  const legacyStatus =
    result.status === 'completed'
      ? 'released'
      : result.status === 'partially-failed'
        ? 'partial-failure'
        : result.status

  return {
    releaseId: result.releaseId,
    status: legacyStatus,
    succeeded: result.succeeded,
    unresolved: result.unresolved,
  }
}

/** Backwards-compatible facade for retryContentRelease */
export async function retryContentRelease(
  payload: Payload,
  input: { releaseId: string; actorId: string },
) {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: input.releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc

  if (!release.lastScheduleMutationId) {
    throw new Error('Only a scheduled release can be retried.')
  }

  const items = list(release.artifacts || release.executionItems)
  const unresolved = items.filter((item) => !['succeeded', 'skipped'].includes(item.status))
  if (!unresolved.length) return release

  const queued = (await payload.jobs.queue({
    task: 'content-release-execute',
    input: {
      releaseId: String(release.id),
      scheduleMutationId: String(release.lastScheduleMutationId),
      actorId: input.actorId,
    },
    queue: OPERATIONS_QUEUE,
    waitUntil: new Date(),
  } as never)) as Doc

  return payload.update({
    collection: 'content-releases' as never,
    id: release.id,
    data: {
      status: 'scheduled',
      executionJob: queued.id,
      executionAudit: appendAudit(release, {
        action: 'release.execution.retry-queued',
        actorId: input.actorId,
        at: new Date().toISOString(),
        jobId: queued.id,
        retryId: randomUUID(),
        details: { unresolved: unresolved.map((item) => item.key || item.id) },
      }),
    },
    overrideAccess: true,
  } as never)
}
