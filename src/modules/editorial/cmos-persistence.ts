import { sql } from '@payloadcms/db-postgres'
import { createLocalReq } from 'payload'
import { transactionPayload } from '../core/transaction-payload'
import { produceLocalFindings } from '../quality/service'
import type { Payload } from 'payload'
import {
  BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
  categorizeWorkflowQueues,
  CMoSWorkflowEngine,
  evaluateQueueMembership,
  validateWorkflowTemplate,
  WorkflowStateError,
  WorkflowPermissionError,
  type BulkOperationResult,
  type Priority,
  type WorkflowAuditEvent,
  type WorkflowItem,
  type WorkflowTemplate,
} from './cmos-workflow'
import type { EditorialActor } from './workflow'

const canonicalStatus = (status: WorkflowItem['status']) =>
  status === 'changes-requested'
    ? 'rejected'
    : ['cancelled', 'failed'].includes(status)
      ? 'draft'
      : status

// In-memory persistent store for Workflow Templates (seeded with built-in simple template)
const workflowTemplatesStore = new Map<string, WorkflowTemplate>()
workflowTemplatesStore.set(BUILTIN_SIMPLE_WORKFLOW_TEMPLATE.id, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

// In-memory store for Workflow Item extended metadata (keyed by article ID)
const workflowItemsStore = new Map<string, WorkflowItem>()

export function listWorkflowTemplates(): WorkflowTemplate[] {
  return Array.from(workflowTemplatesStore.values())
}

export function getWorkflowTemplate(templateId: string): WorkflowTemplate {
  const t = workflowTemplatesStore.get(templateId)
  if (!t) {
    return BUILTIN_SIMPLE_WORKFLOW_TEMPLATE
  }
  return t
}

export function saveWorkflowTemplate(template: WorkflowTemplate): {
  template: WorkflowTemplate
  validation: { valid: boolean; errors: string[] }
} {
  const validation = validateWorkflowTemplate(template)
  if (!validation.valid) {
    return { template, validation }
  }
  workflowTemplatesStore.set(template.id, template)
  return { template, validation }
}

/**
 * Hydrates or creates a WorkflowItem for a given Payload article document.
 */
export async function getWorkflowItemForArticle(
  payload: Payload,
  articleId: string,
  actorUserId?: string,
): Promise<WorkflowItem> {
  const doc = (await payload.findByID({
    collection: 'content',
    id: articleId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown> | null
  if (!doc) throw new WorkflowStateError('Content record not found.')

  const persisted = (doc?.auditMetadata as { cmosWorkflow?: WorkflowItem } | undefined)
    ?.cmosWorkflow
  let revision: Record<string, unknown> | undefined
  if (doc && payload.find) {
    const companions = await payload.find({
      collection: 'article-family-content' as never,
      where: { content: { equals: articleId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    revision = companions.docs[0] as unknown as Record<string, unknown> | undefined
  }
  if (persisted) {
    const item = {
      ...persisted,
      status: (doc?.status === canonicalStatus(persisted.status)
        ? persisted.status
        : doc?.status || persisted.status) as WorkflowItem['status'],
    }
    if (revision) {
      item.currentRevisionId = String(revision.currentRevision || item.currentRevisionId)
      item.currentRevisionSequence = Number(
        revision.currentRevisionSequence || item.currentRevisionSequence,
      )
      item.currentRevisionHash = String(revision.documentHash || item.currentRevisionHash)
      item.latestPublishedRevisionId = revision.latestPublishedRevision
        ? String(revision.latestPublishedRevision)
        : null
    }
    item.qualityGateSnapshot = (item.qualityGateSnapshot ??
      revision?.qualityGateSnapshot) as WorkflowItem['qualityGateSnapshot']
    if (
      persisted.currentRevisionHash !== item.currentRevisionHash &&
      persisted.reviewDecisions.some((d) => d.decision === 'approved')
    ) {
      item.staleApproval = true
      item.staleReason = 'Content changed after approval; a new review is required.'
    }
    item.queueMembership = evaluateQueueMembership(item, actorUserId)
    workflowItemsStore.set(articleId, item)
    return item
  }

  const siteId =
    typeof doc?.site === 'object' && doc?.site !== null
      ? String((doc.site as Record<string, unknown>).id)
      : (doc?.site as string) || (doc?.siteId as string) || 'default-site'
  let ownerId =
    typeof doc?.owner === 'object' && doc?.owner !== null
      ? String((doc.owner as Record<string, unknown>).id)
      : (doc?.owner as string) || (doc?.ownerId as string) || actorUserId || 'author-default'
  if (doc.owner && payload.find) {
    const users = await payload.find({
      collection: 'users',
      where: { member: { equals: ownerId } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    if (users.docs[0]) ownerId = String(users.docs[0].id)
  }
  const status = (doc?.status as string) || 'draft'
  const currentRevisionId = String(revision?.currentRevision || doc?.currentRevisionId || 'rev-1')

  const newItem: WorkflowItem = {
    id: articleId,
    siteId,
    contentType: String(doc.contentType || 'article'),
    status: status as WorkflowItem['status'],
    templateId: BUILTIN_SIMPLE_WORKFLOW_TEMPLATE.id,
    assignment: {
      ownerId,
      editorId: null,
      reviewerIds: [],
      dueDate: null,
      priority: 'normal',
      watchers: [],
    },
    currentRevisionId,
    currentRevisionSequence: Number(revision?.currentRevisionSequence || 1),
    currentRevisionHash: String(revision?.documentHash || `sha256-v1:${articleId}-rev1`),
    latestPublishedRevisionId: null,
    qualityGateSnapshot: revision?.qualityGateSnapshot as WorkflowItem['qualityGateSnapshot'],
    staleApproval: false,
    staleReason: null,
    reviewDecisions: [],
    auditTrail: [
      {
        id: `init-${articleId}`,
        action: 'workflow.initialized',
        actorId: ownerId,
        actorRole: 'author',
        at: new Date().toISOString(),
        beforeState: null,
        afterState: status,
      },
    ],
    queueMembership: 'assigned',
    updatedAt: new Date().toISOString(),
  }

  newItem.queueMembership = evaluateQueueMembership(newItem, actorUserId)

  workflowItemsStore.set(articleId, newItem)
  return newItem
}

export function saveWorkflowItem(item: WorkflowItem): WorkflowItem {
  workflowItemsStore.set(item.id, item)
  return item
}

async function persistWorkflowItem(payload: Payload, item: WorkflowItem): Promise<void> {
  const doc = await payload.findByID({
    collection: 'content',
    id: item.id,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (!doc) throw new WorkflowStateError('Content record not found.')
  const auditMetadata =
    (doc as unknown as { auditMetadata?: Record<string, unknown> }).auditMetadata || {}
  await payload.update({
    collection: 'content',
    id: item.id,
    data: {
      status: canonicalStatus(item.status),
      auditMetadata: { ...auditMetadata, cmosWorkflow: item },
    },
    overrideAccess: true,
  } as never)
}

async function executeWorkflowActionUnlocked(
  payload: Payload,
  input: {
    articleId: string
    action:
      | 'submit'
      | 'approve'
      | 'reject'
      | 'request-changes'
      | 'withdraw'
      | 'cancel'
      | 'reopen'
      | 'emergency-override'
      | 'reassign'
      | 'save-draft'
    actor: EditorialActor
    actorSiteId?: string | null
    comment?: string | null
    targetStatus?: 'approved' | 'published'
    reason?: string
    update?: {
      editorId?: string | null
      reviewerIds?: readonly string[]
      dueDate?: string | null
      priority?: Priority
      watchers?: readonly string[]
    }
    now?: string
  },
): Promise<WorkflowItem> {
  const item = await getWorkflowItemForArticle(payload, input.articleId, input.actor.id)
  if (['submit', 'approve', 'emergency-override'].includes(input.action)) {
    const companions = await payload.find({
      collection: 'article-family-content',
      where: { content: { equals: item.id } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    if (companions.docs[0]) {
      const findings = await produceLocalFindings(payload, {
        targetType: 'document',
        targetId: String(companions.docs[0].id),
      })
      item.qualityGateSnapshot = {
        scanId: `review:${item.currentRevisionId}`,
        scannedAt: new Date().toISOString(),
        blockingIssueCount: findings.filter((f) => f.severity === 'publication_blocking').length,
        issues: findings.map((f, i) => ({
          id: String(i),
          ruleId: f.rule,
          severity: f.severity,
          message: f.message,
        })),
      }
      // A waiver for an older scan/revision cannot authorize new content.
      item.qualityWaiver = null
    }
  }
  const template = getWorkflowTemplate(item.templateId)
  const engine = new CMoSWorkflowEngine(item, template)

  let updatedItem: WorkflowItem

  switch (input.action) {
    case 'submit':
      updatedItem = engine.submitForReview(input.actor, {
        actorSiteId: input.actorSiteId,
        now: input.now,
      })
      break
    case 'approve':
      updatedItem = engine.decideReview(input.actor, 'approved', input.comment, {
        actorSiteId: input.actorSiteId,
        now: input.now,
      })
      break
    case 'reject':
      updatedItem = engine.decideReview(input.actor, 'rejected', input.comment, {
        actorSiteId: input.actorSiteId,
        now: input.now,
      })
      break
    case 'request-changes':
      updatedItem = engine.decideReview(input.actor, 'changes-requested', input.comment, {
        actorSiteId: input.actorSiteId,
        now: input.now,
      })
      break
    case 'withdraw':
      updatedItem = engine.withdraw(input.actor, input.comment || input.reason, { now: input.now })
      break
    case 'cancel':
      updatedItem = engine.cancel(input.actor, input.comment || input.reason, { now: input.now })
      break
    case 'reopen':
      updatedItem = engine.reopen(input.actor, input.comment || input.reason, { now: input.now })
      break
    case 'emergency-override':
      if (input.actor.role !== 'publisher')
        throw new WorkflowPermissionError(
          'Publisher permission is required for an emergency override.',
        )
      if ((item.qualityGateSnapshot?.blockingIssueCount ?? 0) > 0)
        throw new WorkflowStateError(
          'Blocking QA issues must be repaired before an emergency override.',
        )
      updatedItem = engine.emergencyOverride(
        input.actor,
        input.targetStatus || 'approved',
        input.reason || input.comment || '',
        { now: input.now },
      )
      break
    case 'reassign':
      updatedItem = engine.reassign(input.actor, input.update || {}, { now: input.now })
      break
    case 'save-draft':
      updatedItem = engine.markNewDraftSaved(
        input.actor,
        item.currentRevisionSequence,
        item.currentRevisionHash,
        { now: input.now },
      )
      break
    default:
      throw new WorkflowStateError(`Unsupported action "${input.action}".`)
  }

  // A failed database write must not become a successful process-local transition.
  await persistWorkflowItem(payload, updatedItem)
  saveWorkflowItem(updatedItem)

  return updatedItem
}

/** Lock the canonical row before hydration so competing decisions cannot lose audit events. */
export async function executeWorkflowAction(
  payload: Payload,
  input: Parameters<typeof executeWorkflowActionUnlocked>[1],
): Promise<WorkflowItem> {
  if (!payload.db?.beginTransaction) return executeWorkflowActionUnlocked(payload, input)
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new WorkflowStateError('Workflow transaction unavailable.')
  const req = await createLocalReq(
    {
      user: { id: input.actor.id, collection: 'users' } as never,
      context: { editorialWorkflowAction: true },
    },
    payload,
  )
  req.transactionID = transactionID
  try {
    const db = payload.db as unknown as {
      sessions: Record<string, { db: { execute: (query: unknown) => Promise<unknown> } }>
    }
    await db.sessions[transactionID].db.execute(
      sql`SELECT id FROM content WHERE id = ${input.articleId}::uuid FOR UPDATE`,
    )
    const scoped = transactionPayload(payload, req)
    const locks = await scoped.find({
      collection: 'payload-locked-documents',
      where: {
        and: [
          { 'document.relationTo': { equals: 'content' } },
          { 'document.value': { equals: input.articleId } },
        ],
      },
      depth: 0,
      limit: 1,
      sort: '-updatedAt',
      overrideAccess: true,
    })
    const lock = locks.docs[0]
    const owner = lock?.user?.value
    const ownerId = typeof owner === 'object' ? owner.id : owner
    if (
      lock &&
      String(ownerId) !== input.actor.id &&
      Date.now() - new Date(lock.updatedAt).getTime() < 300000
    ) {
      throw new WorkflowStateError(
        'Content is locked by another editor. Wait for release before changing its workflow.',
      )
    }
    const result = await executeWorkflowActionUnlocked(scoped, input)
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

export async function getWorkflowQueuesForUser(
  payload: Payload,
  input: { userId: string; role: string; siteId?: string | null; now?: string },
) {
  const docsResult = await payload.find({
    collection: 'content',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    ...(input.siteId ? { where: { site: { equals: input.siteId } } } : {}),
  } as never)
  const filtered = await Promise.all(
    docsResult.docs.map((doc) => getWorkflowItemForArticle(payload, String(doc.id), input.userId)),
  )

  return categorizeWorkflowQueues(filtered, input.userId, input.now)
}

export async function bulkExecuteWorkflowItems(
  payload: Payload,
  input: {
    articleIds: string[]
    action: 'approve' | 'request-changes' | 'withdraw' | 'reassign'
    actor: EditorialActor
    comment?: string
    update?: { editorId?: string | null; priority?: Priority; dueDate?: string | null }
    now?: string
  },
): Promise<BulkOperationResult> {
  const result: BulkOperationResult = {
    totalCount: input.articleIds.length,
    succeededCount: 0,
    failedCount: 0,
    results: [],
  }
  for (const articleId of input.articleIds) {
    try {
      const updatedItem = await executeWorkflowAction(payload, { ...input, articleId })
      result.results.push({
        itemId: articleId,
        success: true,
        status: updatedItem.status,
        updatedItem,
      })
      result.succeededCount++
    } catch (error) {
      result.results.push({
        itemId: articleId,
        success: false,
        error: error instanceof Error ? error.message : 'Workflow persistence failed.',
      })
      result.failedCount++
    }
  }

  return result
}

export async function getWorkflowAuditHistory(
  payload: Payload,
  articleId: string,
): Promise<readonly WorkflowAuditEvent[]> {
  const item = await getWorkflowItemForArticle(payload, articleId)
  return item.auditTrail
}
