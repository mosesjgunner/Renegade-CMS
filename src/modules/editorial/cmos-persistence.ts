import type { Payload } from 'payload'
import {
  BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
  bulkExecuteWorkflowActions,
  categorizeWorkflowQueues,
  CMoSWorkflowEngine,
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

export function saveWorkflowTemplate(template: WorkflowTemplate): { template: WorkflowTemplate; validation: { valid: boolean; errors: string[] } } {
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
  if (existing) {
    return existing
  }

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

  const siteId = (doc?.site as string) || (doc?.siteId as string) || 'default-site'
  const ownerId = (doc?.owner as string) || (doc?.ownerId as string) || actorUserId || 'author-default'
  const status = (doc?.status as string) || 'draft'
  const currentRevisionId = (doc?.currentRevisionId as string) || 'rev-1'

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
    currentRevisionSequence: 1,
    currentRevisionHash: `sha256-v1:${articleId}-rev1`,
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
        item.currentRevisionSequence + 1,
        `sha256-v1:${item.id}-rev${item.currentRevisionSequence + 1}`,
        { now: input.now },
      )
      break
    default:
      throw new WorkflowStateError(`Unsupported action "${input.action}".`)
  }

  saveWorkflowItem(updatedItem)

  // Sync back to Payload DB if available
  try {
    await payload.update({
      collection: 'content',
      id: input.articleId,
      data: {
        status: updatedItem.status,
      },
      overrideAccess: true,
    } as never)
  } catch {
    // Safe ignore if database is in mock or article is virtual
  }

  return updatedItem
}

export async function getWorkflowQueuesForUser(
  payload: Payload,
  input: { userId: string; role: string; siteId?: string | null; now?: string },
) {
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
    if (res.success) {
      const item = workflowItemsStore.get(res.itemId)
      if (item && res.status) {
        item.status = res.status
        saveWorkflowItem(item)
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
