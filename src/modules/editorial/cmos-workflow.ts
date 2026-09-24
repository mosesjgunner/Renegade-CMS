import { createHash, randomUUID } from 'node:crypto'

import type {
  QualityGateSnapshot,
  QualityWaiverAuthorization,
  ReviewDecisionRecord,
} from './contracts'
import type { EditorialActor, EditorialRole, WorkflowStatus } from './workflow'
export type { EditorialActor, EditorialRole, WorkflowStatus } from './workflow'

export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type QueueMembership =
  | 'assigned'
  | 'requested-changes'
  | 'awaiting-approval'
  | 'approved'
  | 'scheduled'
  | 'overdue'
  | 'blocked'

export type ApprovalOrder = 'any' | 'sequential'

export interface WorkflowTemplate {
  id: string
  name: string
  siteId: string | null // null = cross-site / default
  contentType: string | null // null = all content types
  requiredStages: readonly WorkflowStatus[]
  eligibleRoles: Record<string, readonly EditorialRole[]>
  requiredApprovalCount: number
  approvalOrder: ApprovalOrder
  optionalQualityGates: readonly string[]
  serviceLevelDueOffsetHours: number
  allowEmergencyOverride: boolean
  preventSelfApproval: boolean
  siteScopeGuard: boolean
}

export const BUILTIN_SIMPLE_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  id: 'template-builtin-simple',
  name: 'Built-in Simple Editorial Workflow',
  siteId: null,
  contentType: null,
  requiredStages: ['draft', 'review', 'approved'],
  eligibleRoles: {
    'save-draft': ['author', 'editor', 'publisher'],
    'submit-for-review': ['author', 'editor'],
    'decide-review': ['editor', 'publisher'],
    'request-changes': ['editor', 'publisher'],
    withdraw: ['author', 'editor'],
    cancel: ['editor', 'publisher'],
    reopen: ['author', 'editor', 'publisher'],
    'emergency-override': ['publisher'],
    reassign: ['editor', 'publisher'],
  },
  requiredApprovalCount: 1,
  approvalOrder: 'any',
  optionalQualityGates: ['zero-blocking-issues'],
  serviceLevelDueOffsetHours: 24,
  allowEmergencyOverride: true,
  preventSelfApproval: true,
  siteScopeGuard: true,
}

export interface WorkflowTemplateValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validates a workflow template against dead ends, unreachable stages, and privilege escalation.
 */
export function validateWorkflowTemplate(
  template: WorkflowTemplate,
): WorkflowTemplateValidationResult {
  const errors: string[] = []

  if (!template.id || template.id.trim() === '') {
    errors.push('Template must have a non-empty ID.')
  }
  if (!template.name || template.name.trim() === '') {
    errors.push('Template must have a non-empty name.')
  }
  if (template.requiredApprovalCount < 1) {
    errors.push('Required approval count must be at least 1.')
  }
  if (template.serviceLevelDueOffsetHours < 0) {
    errors.push('Service level due offset hours cannot be negative.')
  }

  const validStages: WorkflowStatus[] = [
    'draft',
    'review',
    'approved',
    'scheduled',
    'published',
    'updated',
    'archived',
    'rejected',
    'changes-requested',
    'cancelled',
    'failed',
  ]

  for (const stage of template.requiredStages) {
    if (!validStages.includes(stage)) {
      errors.push(`Invalid required stage specified: "${stage}".`)
    }
  }

  // Dead End Validation: Stage 'review' must have eligible roles for 'decide-review'
  if (template.requiredStages.includes('review')) {
    const deciders = template.eligibleRoles['decide-review'] || []
    if (deciders.length === 0) {
      errors.push(
        'Dead End Detected: "review" stage has no eligible roles mapped to "decide-review".',
      )
    }
  }

  // Dead End Validation: Check if approved/published can be reached
  if (!template.requiredStages.includes('approved') && !template.requiredStages.includes('draft')) {
    errors.push('Dead End Detected: Template does not include draft or approved stage.')
  }

  // Privilege Escalation Checks:
  // 1. Author role alone MUST NOT have emergency-override or decide-review unless explicitly allowed in custom non-production roles.
  const overrideRoles = template.eligibleRoles['emergency-override'] || []
  if (overrideRoles.includes('author') && overrideRoles.length === 1) {
    errors.push(
      'Privilege Escalation Risk: Emergency override is exclusively mapped to low-privilege "author" role.',
    )
  }

  const deciderRoles = template.eligibleRoles['decide-review'] || []
  if (
    deciderRoles.includes('author') &&
    !template.preventSelfApproval &&
    deciderRoles.length === 1
  ) {
    errors.push(
      'Privilege Escalation Risk: Only "author" role can decide review while self-approval is allowed.',
    )
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export interface WorkflowTaskAssignment {
  ownerId: string
  editorId: string | null
  reviewerIds: readonly string[]
  dueDate: string | null
  priority: Priority
  watchers: readonly string[]
}

export interface WorkflowAuditEvent {
  id: string
  action: string
  actorId: string
  actorRole: string
  at: string
  beforeState?: string | null
  afterState?: string | null
  beforeAssignee?: string | null
  afterAssignee?: string | null
  beforeDueDate?: string | null
  afterDueDate?: string | null
  targetRevisionSequence?: number | null
  targetRevisionHash?: string | null
  staleApproval?: boolean
  reason?: string | null
  detail?: Record<string, string | number | boolean | null>
}

export interface WorkflowItem {
  id: string
  siteId: string
  contentType: string
  status: WorkflowStatus
  templateId: string
  assignment: WorkflowTaskAssignment
  currentRevisionId: string
  currentRevisionSequence: number
  currentRevisionHash: string
  latestPublishedRevisionId: string | null
  staleApproval: boolean
  staleReason: string | null
  qualityGateSnapshot?: QualityGateSnapshot | null
  qualityWaiver?: QualityWaiverAuthorization | null
  reviewDecisions: readonly ReviewDecisionRecord[]
  auditTrail: readonly WorkflowAuditEvent[]
  queueMembership: QueueMembership
  updatedAt: string
}

export class WorkflowPermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowPermissionError'
  }
}

export class WorkflowStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowStateError'
  }
}

export function evaluateQueueMembership(
  item: WorkflowItem,
  actorUserId?: string | null,
  now: string = new Date().toISOString(),
): QueueMembership {
  // 1. Blocked: quality gate snapshot has blocking issues without a waiver
  if (
    item.qualityGateSnapshot &&
    item.qualityGateSnapshot.blockingIssueCount > 0 &&
    !item.qualityWaiver
  ) {
    return 'blocked'
  }

  // 2. Overdue: status is in review or approved and past due date
  if (
    item.assignment.dueDate &&
    new Date(now).getTime() > new Date(item.assignment.dueDate).getTime() &&
    ['review', 'changes-requested', 'approved', 'draft', 'updated'].includes(item.status)
  ) {
    return 'overdue'
  }

  // 3. Status mappings
  if (item.status === 'scheduled') return 'scheduled'
  if (item.status === 'approved') return 'approved'
  if (item.status === 'changes-requested') return 'requested-changes'
  if (item.status === 'review') return 'awaiting-approval'

  // 4. Default assigned if actor matches
  if (
    actorUserId &&
    (item.assignment.editorId === actorUserId || item.assignment.reviewerIds.includes(actorUserId))
  ) {
    return 'assigned'
  }

  return 'assigned'
}

export class CMoSWorkflowEngine {
  private item: WorkflowItem
  private template: WorkflowTemplate

  constructor(item: WorkflowItem, template: WorkflowTemplate = BUILTIN_SIMPLE_WORKFLOW_TEMPLATE) {
    this.item = { ...item }
    this.template = template
  }

  getItem(): WorkflowItem {
    return { ...this.item }
  }

  getTemplate(): WorkflowTemplate {
    return { ...this.template }
  }

  private checkRolePermission(actor: EditorialActor, action: string) {
    const allowedRoles = this.template.eligibleRoles[action] || []
    if (!allowedRoles.includes(actor.role)) {
      throw new WorkflowPermissionError(
        `Role "${actor.role}" is not authorized to perform action "${action}" under template "${this.template.name}". Allowed roles: ${allowedRoles.join(', ')}.`,
      )
    }
  }

  private checkSiteScope(actorSiteId?: string | null) {
    if (this.template.siteScopeGuard && actorSiteId && actorSiteId !== this.item.siteId) {
      throw new WorkflowPermissionError(
        `Cross-site action forbidden. Actor site "${actorSiteId}" does not match item site "${this.item.siteId}".`,
      )
    }
  }

  private checkSelfApproval(actor: EditorialActor) {
    if (
      this.template.preventSelfApproval &&
      (actor.id === this.item.assignment.ownerId ||
        actor.id ===
          this.item.auditTrail.find((a) => a.action === 'workflow.submitted_for_review')?.actorId)
    ) {
      throw new WorkflowPermissionError(
        `Self-approval is forbidden by template "${this.template.name}". Author "${actor.id}" cannot review/approve their own submission.`,
      )
    }
  }

  /**
   * Submit item for review. Calculates SLA due date if not present.
   */
  submitForReview(
    actor: EditorialActor,
    options?: {
      actorSiteId?: string | null
      qualityGateSnapshot?: QualityGateSnapshot | null
      now?: string
    },
  ): WorkflowItem {
    this.checkRolePermission(actor, 'submit-for-review')
    this.checkSiteScope(options?.actorSiteId)

    if (!['draft', 'updated', 'changes-requested', 'rejected'].includes(this.item.status)) {
      throw new WorkflowStateError(
        `Cannot submit for review from status "${this.item.status}". Only draft, updated, rejected, or changes-requested items can be submitted.`,
      )
    }

    const now = options?.now ?? new Date().toISOString()
    const beforeState = this.item.status

    // Calculate due date based on SLA offset if not already explicitly set
    let dueDate = this.item.assignment.dueDate
    if (!dueDate && this.template.serviceLevelDueOffsetHours > 0) {
      const dueTime = new Date(
        new Date(now).getTime() + this.template.serviceLevelDueOffsetHours * 3600 * 1000,
      )
      dueDate = dueTime.toISOString()
    }

    this.item.status = 'review'
    this.item.assignment = { ...this.item.assignment, dueDate }
    if (options?.qualityGateSnapshot) {
      this.item.qualityGateSnapshot = options.qualityGateSnapshot
    }

    this.item.queueMembership = evaluateQueueMembership(this.item, actor.id, now)
    this.item.updatedAt = now

    this.addAuditEvent({
      action: 'workflow.submitted_for_review',
      actorId: actor.id,
      actorRole: actor.role,
      at: now,
      beforeState,
      afterState: 'review',
      beforeDueDate: this.item.assignment.dueDate,
      afterDueDate: dueDate,
      targetRevisionSequence: this.item.currentRevisionSequence,
      targetRevisionHash: this.item.currentRevisionHash,
      detail: { templateId: this.template.id },
    })

    return this.getItem()
  }

  /**
   * Decide review (Approve, Request Changes, Reject).
   */
  decideReview(
    actor: EditorialActor,
    decision: 'approved' | 'rejected' | 'changes-requested',
    comment?: string | null,
    options?: {
      actorSiteId?: string | null
      qualityWaiver?: QualityWaiverAuthorization | null
      now?: string
    },
  ): WorkflowItem {
    this.checkRolePermission(actor, 'decide-review')
    this.checkSiteScope(options?.actorSiteId)

    if (decision === 'approved') {
      this.checkSelfApproval(actor)
    }

    if (this.item.status !== 'review') {
      throw new WorkflowStateError(
        `Only items in "review" status can be decided. Current status: "${this.item.status}".`,
      )
    }

    const now = options?.now ?? new Date().toISOString()
    const beforeState = this.item.status

    // Check Quality Gates
    if (
      decision === 'approved' &&
      this.item.qualityGateSnapshot &&
      this.item.qualityGateSnapshot.blockingIssueCount > 0
    ) {
      const waiver = options?.qualityWaiver ?? this.item.qualityWaiver
      if (!waiver) {
        throw new WorkflowStateError(
          `Cannot approve item with ${this.item.qualityGateSnapshot.blockingIssueCount} blocking quality issues without an explicit quality waiver authorization.`,
        )
      }
      this.item.qualityWaiver = waiver
    }

    const decisionRecord: ReviewDecisionRecord = {
      id: randomUUID(),
      decision,
      comment: comment ?? null,
      reviewerId: actor.id,
      reviewerRole: actor.role,
      targetRevisionSequence: this.item.currentRevisionSequence,
      targetRevisionHash: this.item.currentRevisionHash,
      createdAt: now,
    }

    this.item.reviewDecisions = [...this.item.reviewDecisions, decisionRecord]

    if (decision === 'approved') {
      this.item.status = 'approved'
      this.item.staleApproval = false
      this.item.staleReason = null
    } else if (decision === 'changes-requested') {
      this.item.status = 'changes-requested'
    } else {
      this.item.status = 'rejected'
    }

    this.item.queueMembership = evaluateQueueMembership(this.item, actor.id, now)
    this.item.updatedAt = now

    this.addAuditEvent({
      action: `workflow.decided_${decision}`,
      actorId: actor.id,
      actorRole: actor.role,
      at: now,
      beforeState,
      afterState: this.item.status,
      targetRevisionSequence: this.item.currentRevisionSequence,
      targetRevisionHash: this.item.currentRevisionHash,
      reason: comment,
    })

    return this.getItem()
  }

  /**
   * Save new draft revision. If called when status is approved/updated, marks approval as STALE.
   */
  markNewDraftSaved(
    actor: EditorialActor,
    newRevisionSequence: number,
    newRevisionHash: string,
    options?: { now?: string },
  ): WorkflowItem {
    this.checkRolePermission(actor, 'save-draft')
    const now = options?.now ?? new Date().toISOString()
    const beforeState = this.item.status
    const wasApproved =
      this.item.status === 'approved' ||
      (this.item.reviewDecisions.some((d) => d.decision === 'approved') && !this.item.staleApproval)

    this.item.currentRevisionSequence = newRevisionSequence
    this.item.currentRevisionHash = newRevisionHash
    this.item.status = 'updated'
    this.item.updatedAt = now

    if (wasApproved) {
      this.item.staleApproval = true
      this.item.staleReason = `New draft revision (seq #${newRevisionSequence}) created after approval decision.`
    }

    this.item.queueMembership = evaluateQueueMembership(this.item, actor.id, now)

    this.addAuditEvent({
      action: 'workflow.draft_saved',
      actorId: actor.id,
      actorRole: actor.role,
      at: now,
      beforeState,
      afterState: 'updated',
      targetRevisionSequence: newRevisionSequence,
      targetRevisionHash: newRevisionHash,
      staleApproval: this.item.staleApproval,
      reason: this.item.staleReason,
    })

    return this.getItem()
  }

  /**
   * Withdraw submission back to draft (by author/editor).
   */
  withdraw(actor: EditorialActor, reason?: string, options?: { now?: string }): WorkflowItem {
    this.checkRolePermission(actor, 'withdraw')
    if (this.item.status !== 'review') {
      throw new WorkflowStateError(
        `Cannot withdraw item in status "${this.item.status}". Only items in "review" can be withdrawn.`,
      )
    }
    const now = options?.now ?? new Date().toISOString()
    const beforeState = this.item.status
    this.item.status = 'draft'
    this.item.updatedAt = now
    this.item.queueMembership = evaluateQueueMembership(this.item, actor.id, now)

    this.addAuditEvent({
      action: 'workflow.withdrawn',
      actorId: actor.id,
      actorRole: actor.role,
      at: now,
      beforeState,
      afterState: 'draft',
      reason,
    })

    return this.getItem()
  }

  /**
   * Cancel workflow task.
   */
  cancel(actor: EditorialActor, reason?: string, options?: { now?: string }): WorkflowItem {
    this.checkRolePermission(actor, 'cancel')
    const now = options?.now ?? new Date().toISOString()
    const beforeState = this.item.status
    this.item.status = 'cancelled'
    this.item.updatedAt = now
    this.item.queueMembership = evaluateQueueMembership(this.item, actor.id, now)

    this.addAuditEvent({
      action: 'workflow.cancelled',
      actorId: actor.id,
      actorRole: actor.role,
      at: now,
      beforeState,
      afterState: 'cancelled',
      reason,
    })

    return this.getItem()
  }

  /**
   * Reopen a cancelled or rejected workflow task.
   */
  reopen(actor: EditorialActor, reason?: string, options?: { now?: string }): WorkflowItem {
    this.checkRolePermission(actor, 'reopen')
    if (!['rejected', 'changes-requested', 'cancelled', 'failed'].includes(this.item.status)) {
      throw new WorkflowStateError(`Cannot reopen item in status "${this.item.status}".`)
    }
    const now = options?.now ?? new Date().toISOString()
    const beforeState = this.item.status
    this.item.status = 'draft'
    this.item.updatedAt = now
    this.item.queueMembership = evaluateQueueMembership(this.item, actor.id, now)

    this.addAuditEvent({
      action: 'workflow.reopened',
      actorId: actor.id,
      actorRole: actor.role,
      at: now,
      beforeState,
      afterState: 'draft',
      reason,
    })

    return this.getItem()
  }

  /**
   * Emergency Override: Allows Admin/Publisher to bypass workflow restrictions with mandatory reason.
   */
  emergencyOverride(
    actor: EditorialActor,
    targetStatus: 'approved' | 'published',
    reason: string,
    options?: { now?: string },
  ): WorkflowItem {
    this.checkRolePermission(actor, 'emergency-override')
    if (!this.template.allowEmergencyOverride) {
      throw new WorkflowPermissionError(
        `Emergency override is disabled for template "${this.template.name}".`,
      )
    }
    if (!reason || reason.trim().length === 0) {
      throw new WorkflowStateError(
        'Emergency override requires an explicit non-empty justification reason.',
      )
    }
    const now = options?.now ?? new Date().toISOString()
    const beforeState = this.item.status
    this.item.status = targetStatus
    this.item.staleApproval = false
    this.item.staleReason = null
    this.item.updatedAt = now
    this.item.queueMembership = evaluateQueueMembership(this.item, actor.id, now)

    this.addAuditEvent({
      action: 'workflow.emergency_override',
      actorId: actor.id,
      actorRole: actor.role,
      at: now,
      beforeState,
      afterState: targetStatus,
      reason,
      detail: { overrideReason: reason },
    })

    return this.getItem()
  }

  /**
   * Reassign task owner, editor, reviewers, priority, due date.
   */
  reassign(
    actor: EditorialActor,
    update: {
      editorId?: string | null
      reviewerIds?: readonly string[]
      dueDate?: string | null
      priority?: Priority
      watchers?: readonly string[]
    },
    options?: { now?: string },
  ): WorkflowItem {
    this.checkRolePermission(actor, 'reassign')
    const now = options?.now ?? new Date().toISOString()
    const beforeAssignee = this.item.assignment.editorId
    const beforeDueDate = this.item.assignment.dueDate

    this.item.assignment = {
      ...this.item.assignment,
      editorId: update.editorId !== undefined ? update.editorId : this.item.assignment.editorId,
      reviewerIds:
        update.reviewerIds !== undefined ? update.reviewerIds : this.item.assignment.reviewerIds,
      dueDate: update.dueDate !== undefined ? update.dueDate : this.item.assignment.dueDate,
      priority: update.priority !== undefined ? update.priority : this.item.assignment.priority,
      watchers: update.watchers !== undefined ? update.watchers : this.item.assignment.watchers,
    }

    this.item.updatedAt = now
    this.item.queueMembership = evaluateQueueMembership(this.item, actor.id, now)

    this.addAuditEvent({
      action: 'workflow.reassigned',
      actorId: actor.id,
      actorRole: actor.role,
      at: now,
      beforeAssignee,
      afterAssignee: this.item.assignment.editorId,
      beforeDueDate,
      afterDueDate: this.item.assignment.dueDate,
    })

    return this.getItem()
  }

  private addAuditEvent(event: Omit<WorkflowAuditEvent, 'id'>) {
    const fullEvent: WorkflowAuditEvent = {
      id: randomUUID(),
      ...event,
    }
    this.item.auditTrail = [fullEvent, ...this.item.auditTrail]
  }
}

/**
 * Bulk Queue Operations engine executing per-item action validation with partial-failure isolation.
 */
export interface BulkOperationResult {
  totalCount: number
  succeededCount: number
  failedCount: number
  results: Array<{
    itemId: string
    success: boolean
    status?: WorkflowStatus
    error?: string
  }>
}

export function bulkExecuteWorkflowActions(
  items: WorkflowItem[],
  action: 'approve' | 'request-changes' | 'withdraw' | 'reassign',
  actor: EditorialActor,
  options?: {
    comment?: string
    update?: { editorId?: string | null; priority?: Priority; dueDate?: string | null }
    templates?: Record<string, WorkflowTemplate>
    now?: string
  },
): BulkOperationResult {
  const results: Array<{
    itemId: string
    success: boolean
    status?: WorkflowStatus
    error?: string
  }> = []
  let succeededCount = 0
  let failedCount = 0

  for (const item of items) {
    try {
      const template = options?.templates?.[item.templateId] || BUILTIN_SIMPLE_WORKFLOW_TEMPLATE
      const engine = new CMoSWorkflowEngine(item, template)

      if (action === 'approve') {
        engine.decideReview(actor, 'approved', options?.comment, { now: options?.now })
      } else if (action === 'request-changes') {
        engine.decideReview(actor, 'changes-requested', options?.comment, { now: options?.now })
      } else if (action === 'withdraw') {
        engine.withdraw(actor, options?.comment, { now: options?.now })
      } else if (action === 'reassign') {
        engine.reassign(actor, options?.update || {}, { now: options?.now })
      }

      const updated = engine.getItem()
      succeededCount++
      results.push({ itemId: item.id, success: true, status: updated.status })
    } catch (err: unknown) {
      failedCount++
      const message = err instanceof Error ? err.message : String(err)
      results.push({ itemId: item.id, success: false, status: item.status, error: message })
    }
  }

  return {
    totalCount: items.length,
    succeededCount,
    failedCount,
    results,
  }
}

/**
 * Groups items into Personal and Team Queue categories.
 */
export function categorizeWorkflowQueues(
  items: WorkflowItem[],
  actorUserId: string,
  now: string = new Date().toISOString(),
) {
  const queues = {
    personal: {
      assigned: [] as WorkflowItem[],
      requestedChanges: [] as WorkflowItem[],
      awaitingApproval: [] as WorkflowItem[],
      approved: [] as WorkflowItem[],
      scheduled: [] as WorkflowItem[],
      overdue: [] as WorkflowItem[],
      blocked: [] as WorkflowItem[],
    },
    team: {
      assigned: [] as WorkflowItem[],
      requestedChanges: [] as WorkflowItem[],
      awaitingApproval: [] as WorkflowItem[],
      approved: [] as WorkflowItem[],
      scheduled: [] as WorkflowItem[],
      overdue: [] as WorkflowItem[],
      blocked: [] as WorkflowItem[],
    },
  }

  for (const item of items) {
    const membership = evaluateQueueMembership(item, actorUserId, now)
    const isPersonal =
      item.assignment.ownerId === actorUserId ||
      item.assignment.editorId === actorUserId ||
      item.assignment.reviewerIds.includes(actorUserId) ||
      item.assignment.watchers.includes(actorUserId)

    // Add to Team queues
    if (membership === 'assigned') queues.team.assigned.push(item)
    if (membership === 'requested-changes') queues.team.requestedChanges.push(item)
    if (membership === 'awaiting-approval') queues.team.awaitingApproval.push(item)
    if (membership === 'approved') queues.team.approved.push(item)
    if (membership === 'scheduled') queues.team.scheduled.push(item)
    if (membership === 'overdue') queues.team.overdue.push(item)
    if (membership === 'blocked') queues.team.blocked.push(item)

    // Add to Personal queues if involved
    if (isPersonal) {
      if (membership === 'assigned') queues.personal.assigned.push(item)
      if (membership === 'requested-changes') queues.personal.requestedChanges.push(item)
      if (membership === 'awaiting-approval') queues.personal.awaitingApproval.push(item)
      if (membership === 'approved') queues.personal.approved.push(item)
      if (membership === 'scheduled') queues.personal.scheduled.push(item)
      if (membership === 'overdue') queues.personal.overdue.push(item)
      if (membership === 'blocked') queues.personal.blocked.push(item)
    }
  }

  return queues
}
