import type { Payload } from 'payload'
import {
  BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
  bulkExecuteWorkflowActions,
  categorizeWorkflowQueues,
  CMoSWorkflowEngine,
  evaluateQueueMembership,
  validateWorkflowTemplate,
  WorkflowPermissionError,
  WorkflowStateError,
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
  // Check if item exists in store
  const existing = workflowItemsStore.get(articleId)

  // Fetch article from Payload DB if available
  let doc: Record<string, unknown> | null = null
  try {
    doc = (await payload.findByID({
      collection: 'content',
      id: articleId,
      overrideAccess: true,
    } as never)) as unknown as Record<string, unknown>
  } catch {
    // Fallback if not found in DB
  }

  if (!doc && existing) return existing
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
    item.queueMembership = evaluateQueueMembership(item, actorUserId)
    workflowItemsStore.set(articleId, item)
    return item
  }

  const siteId =
    typeof doc?.site === 'object' && doc?.site !== null
      ? String((doc.site as Record<string, unknown>).id)
      : (doc?.site as string) || (doc?.siteId as string) || 'default-site'
  const ownerId =
    typeof doc?.owner === 'object' && doc?.owner !== null
      ? String((doc.owner as Record<string, unknown>).id)
      : (doc?.owner as string) || (doc?.ownerId as string) || actorUserId || 'author-default'
  const status = (doc?.status as string) || 'draft'
  const currentRevisionId = String(revision?.currentRevision || doc?.currentRevisionId || 'rev-1')

  const newItem: WorkflowItem = {
    id: articleId,
    siteId,
    contentType: 'article',
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

export async function executeWorkflowAction(
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
      updatedItem = engine.emergencyOverride(
        input.actor,
        input.targetStatus || 'approved',
        input.reason || input.comment || 'Emergency override request',
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

  // Persist before returning success. Canonical content hooks synchronize its editorial companion.
  const doc = await payload.findByID({
    collection: 'content',
    id: input.articleId,
    depth: 0,
    overrideAccess: true,
  } as never)
  const auditMetadata =
    (doc as unknown as { auditMetadata?: Record<string, unknown> } | null)?.auditMetadata || {}
  await payload.update({
    collection: 'content',
    id: input.articleId,
    data: {
      status: canonicalStatus(updatedItem.status),
      auditMetadata: { ...auditMetadata, cmosWorkflow: updatedItem },
    },
    overrideAccess: true,
  } as never)
  saveWorkflowItem(updatedItem)

  return updatedItem
}

export async function getWorkflowQueuesForUser(
  payload: Payload,
  input: { userId: string; role: string; siteId?: string | null; now?: string },
) {
  // Hydrate from DB if articles exist
  try {
    const docsResult = await payload.find({
      collection: 'content',
      limit: 100,
      overrideAccess: true,
      ...(input.siteId ? { where: { site: { equals: input.siteId } } } : {}),
    } as never)
    if (docsResult && Array.isArray(docsResult.docs)) {
      for (const doc of docsResult.docs) {
        const id = String((doc as unknown as { id: unknown }).id)
        await getWorkflowItemForArticle(payload, id, input.userId)
      }
    }
  } catch {
    // Fall back to memory store
  }

  // Return all items in store
  const allItems = Array.from(workflowItemsStore.values())
  const filtered = input.siteId ? allItems.filter((i) => i.siteId === input.siteId) : allItems

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
  const items: WorkflowItem[] = []
  for (const id of input.articleIds) {
    items.push(await getWorkflowItemForArticle(payload, id))
  }

  const result = bulkExecuteWorkflowActions(items, input.action, input.actor, {
    comment: input.comment,
    update: input.update,
    now: input.now,
  })

  // Save succeeded items
  for (const res of result.results) {
    if (res.success && res.updatedItem) {
      try {
        const doc = await payload.findByID({
          collection: 'content',
          id: res.itemId,
          depth: 0,
          overrideAccess: true,
        } as never)
        const auditMetadata =
          (doc as unknown as { auditMetadata?: Record<string, unknown> } | null)?.auditMetadata ||
          {}
        await payload.update({
          collection: 'content',
          id: res.itemId,
          data: {
            status: canonicalStatus(res.updatedItem.status),
            auditMetadata: { ...auditMetadata, cmosWorkflow: res.updatedItem },
          },
          overrideAccess: true,
        } as never)
        saveWorkflowItem(res.updatedItem)
      } catch (error) {
        res.success = false
        res.error = error instanceof Error ? error.message : 'Workflow persistence failed.'
        result.succeededCount--
        result.failedCount++
      }
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
