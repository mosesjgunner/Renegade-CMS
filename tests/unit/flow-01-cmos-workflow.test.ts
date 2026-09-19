import { describe, expect, it } from 'vitest'

import {
  BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
  bulkExecuteWorkflowActions,
  categorizeWorkflowQueues,
  CMoSWorkflowEngine,
  evaluateQueueMembership,
  validateWorkflowTemplate,
  WorkflowPermissionError,
  WorkflowStateError,
  type WorkflowItem,
  type WorkflowTemplate,
} from '../../src/modules/editorial/cmos-workflow'

const authorActor = { id: 'user-author-1', role: 'author' as const }
const editorActor = { id: 'user-editor-1', role: 'editor' as const }
const publisherActor = { id: 'user-publisher-1', role: 'publisher' as const }

const createTestItem = (overrides?: Partial<WorkflowItem>): WorkflowItem => ({
  id: 'item-001',
  siteId: 'site-alpha',
  contentType: 'article',
  status: 'draft',
  templateId: 'template-builtin-simple',
  assignment: {
    ownerId: 'user-author-1',
    editorId: 'user-editor-1',
    reviewerIds: ['user-reviewer-1'],
    dueDate: '2026-09-20T12:00:00Z',
    priority: 'normal',
    watchers: ['user-watcher-1'],
  },
  currentRevisionId: 'rev-001',
  currentRevisionSequence: 1,
  currentRevisionHash: 'hash-001',
  latestPublishedRevisionId: null,
  staleApproval: false,
  staleReason: null,
  reviewDecisions: [],
  auditTrail: [],
  queueMembership: 'assigned',
  updatedAt: '2026-09-15T10:00:00Z',
  ...overrides,
})

describe('FLOW-01 CMoS Workflow Engine & Template Suite', () => {
  describe('1. Workflow Templates & Validation', () => {
    it('validates builtin template successfully', () => {
      const res = validateWorkflowTemplate(BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)
      expect(res.valid).toBe(true)
      expect(res.errors).toHaveLength(0)
    })

    it('detects dead ends when review stage has no eligible decider roles', () => {
      const brokenTemplate: WorkflowTemplate = {
        ...BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
        id: 'broken-dead-end',
        eligibleRoles: {
          'submit-for-review': ['author'],
          'decide-review': [], // Dead end!
        },
      }
      const res = validateWorkflowTemplate(brokenTemplate)
      expect(res.valid).toBe(false)
      expect(res.errors.some((e) => e.includes('Dead End Detected'))).toBe(true)
    })

    it('detects privilege escalation risks when author role alone can emergency override', () => {
      const escalationTemplate: WorkflowTemplate = {
        ...BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
        id: 'escalation-override',
        eligibleRoles: {
          'emergency-override': ['author'], // Risk!
        },
      }
      const res = validateWorkflowTemplate(escalationTemplate)
      expect(res.valid).toBe(false)
      expect(res.errors.some((e) => e.includes('Privilege Escalation Risk'))).toBe(true)
    })
  })

  describe('2. Roles, Permissions, Site Scope & Self-Approval Prevention', () => {
    it('prevents unauthorized role from approving review', () => {
      const item = createTestItem({ status: 'review' })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      expect(() => {
        engine.decideReview(authorActor, 'approved')
      }).toThrow(WorkflowPermissionError)
    })

    it('prevents author self-approval when preventSelfApproval is configured', () => {
      const item = createTestItem({
        status: 'review',
        assignment: { ownerId: 'user-editor-1', editorId: 'user-editor-1', reviewerIds: [], dueDate: null, priority: 'normal', watchers: [] },
      })
      // Editor is also owner of this item
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      expect(() => {
        engine.decideReview(editorActor, 'approved')
      }).toThrow(/Self-approval is forbidden/)
    })

    it('prevents wrong-site actor from making changes when siteScopeGuard is active', () => {
      const item = createTestItem({ status: 'review', siteId: 'site-alpha' })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      expect(() => {
        engine.decideReview(editorActor, 'approved', 'Looks good', { actorSiteId: 'site-beta' })
      }).toThrow(/Cross-site action forbidden/)
    })
  })

  describe('3. Core Lifecycle & Actions: Submit, Decide, Withdraw, Cancel, Reopen, Override', () => {
    it('submits for review and calculates SLA due date', () => {
      const item = createTestItem({
        status: 'draft',
        assignment: { ownerId: 'user-author-1', editorId: null, reviewerIds: [], dueDate: null, priority: 'normal', watchers: [] },
      })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      const updated = engine.submitForReview(authorActor, { now: '2026-09-15T12:00:00Z' })
      expect(updated.status).toBe('review')
      expect(updated.assignment.dueDate).toBe('2026-09-16T12:00:00.000Z') // +24 hours
      expect(updated.auditTrail).toHaveLength(1)
      expect(updated.auditTrail[0].action).toBe('workflow.submitted_for_review')
    })

    it('decides review: approves review and records exact revision metadata', () => {
      const item = createTestItem({ status: 'review', currentRevisionSequence: 3, currentRevisionHash: 'hash-003' })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      const updated = engine.decideReview(editorActor, 'approved', 'Approved for publishing', { now: '2026-09-15T14:00:00Z' })
      expect(updated.status).toBe('approved')
      expect(updated.staleApproval).toBe(false)
      expect(updated.reviewDecisions).toHaveLength(1)
      expect(updated.reviewDecisions[0]).toMatchObject({
        decision: 'approved',
        reviewerId: 'user-editor-1',
        targetRevisionSequence: 3,
        targetRevisionHash: 'hash-003',
      })
    })

    it('decides review: requests changes', () => {
      const item = createTestItem({ status: 'review' })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      const updated = engine.decideReview(editorActor, 'changes-requested', 'Needs citations', { now: '2026-09-15T14:30:00Z' })
      expect(updated.status).toBe('changes-requested')
      expect(updated.reviewDecisions[0].decision).toBe('changes-requested')
    })

    it('withdraws review submission back to draft', () => {
      const item = createTestItem({ status: 'review' })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      const updated = engine.withdraw(authorActor, 'Needs extra section')
      expect(updated.status).toBe('draft')
      expect(updated.auditTrail[0].action).toBe('workflow.withdrawn')
    })

    it('cancels and reopens workflow task', () => {
      const item = createTestItem({ status: 'review' })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      const cancelled = engine.cancel(editorActor, 'Duplicate topic')
      expect(cancelled.status).toBe('cancelled')

      const reopened = engine.reopen(editorActor, 'Re-evaluating topic')
      expect(reopened.status).toBe('draft')
    })

    it('executes emergency override with required justification reason', () => {
      const item = createTestItem({ status: 'draft' })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      expect(() => {
        engine.emergencyOverride(publisherActor, 'approved', '')
      }).toThrow(/Emergency override requires an explicit non-empty justification reason/)

      const overridden = engine.emergencyOverride(publisherActor, 'approved', 'Breaking news launch window requirement')
      expect(overridden.status).toBe('approved')
      expect(overridden.auditTrail[0].action).toBe('workflow.emergency_override')
    })
  })

  describe('4. Stale Approval Protection', () => {
    it('marks approval as STALE when a new draft revision is saved post-approval', () => {
      const item = createTestItem({ status: 'review' })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      // 1. Approve revision 1
      engine.decideReview(editorActor, 'approved', 'Ready to publish', { now: '2026-09-15T15:00:00Z' })
      expect(engine.getItem().status).toBe('approved')
      expect(engine.getItem().staleApproval).toBe(false)

      // 2. Save new draft revision 2 after approval
      const updated = engine.markNewDraftSaved(authorActor, 2, 'hash-002', { now: '2026-09-15T15:30:00Z' })
      expect(updated.status).toBe('updated')
      expect(updated.staleApproval).toBe(true)
      expect(updated.staleReason).toContain('New draft revision (seq #2) created after approval decision')
      expect(updated.auditTrail[0].staleApproval).toBe(true)
    })
  })

  describe('5. Task Reassignment & Audit Trail', () => {
    it('reassigns task editor, reviewers, priority, due date and logs before/after audit', () => {
      const item = createTestItem({ status: 'review' })
      const engine = new CMoSWorkflowEngine(item, BUILTIN_SIMPLE_WORKFLOW_TEMPLATE)

      const reassigned = engine.reassign(
        editorActor,
        {
          editorId: 'user-editor-99',
          priority: 'urgent',
          dueDate: '2026-09-25T18:00:00Z',
        },
        { now: '2026-09-15T16:00:00Z' },
      )

      expect(reassigned.assignment.editorId).toBe('user-editor-99')
      expect(reassigned.assignment.priority).toBe('urgent')
      expect(reassigned.assignment.dueDate).toBe('2026-09-25T18:00:00Z')

      const audit = reassigned.auditTrail[0]
      expect(audit.action).toBe('workflow.reassigned')
      expect(audit.beforeAssignee).toBe('user-editor-1')
      expect(audit.afterAssignee).toBe('user-editor-99')
      expect(audit.beforeDueDate).toBe('2026-09-20T12:00:00Z')
      expect(audit.afterDueDate).toBe('2026-09-25T18:00:00Z')
    })
  })

  describe('6. Queues & Bulk Operations', () => {
    it('categorizes items correctly into Personal and Team queues including overdue & blocked', () => {
      const itemAssigned = createTestItem({ id: 'item-1', status: 'review', assignment: { ownerId: 'u1', editorId: 'u2', reviewerIds: [], dueDate: '2026-09-30T00:00:00Z', priority: 'normal', watchers: [] } })
      const itemOverdue = createTestItem({ id: 'item-2', status: 'review', assignment: { ownerId: 'u1', editorId: 'u2', reviewerIds: [], dueDate: '2026-09-01T00:00:00Z', priority: 'high', watchers: [] } })
      const itemBlocked = createTestItem({
        id: 'item-3',
        status: 'review',
        qualityGateSnapshot: { scanId: 'scan-1', scannedAt: '2026-09-15T00:00:00Z', blockingIssueCount: 2, issues: [] },
        assignment: { ownerId: 'u1', editorId: 'u2', reviewerIds: [], dueDate: '2026-09-30T00:00:00Z', priority: 'normal', watchers: [] },
      })

      const queues = categorizeWorkflowQueues([itemAssigned, itemOverdue, itemBlocked], 'u2', '2026-09-15T12:00:00Z')

      expect(queues.personal.awaitingApproval).toHaveLength(1)
      expect(queues.personal.overdue).toHaveLength(1)
      expect(queues.personal.blocked).toHaveLength(1)
      expect(queues.personal.overdue[0].id).toBe('item-2')
      expect(queues.personal.blocked[0].id).toBe('item-3')
    })

    it('executes bulk actions with partial failure reporting and per-item validation', () => {
      const itemValid = createTestItem({ id: 'item-valid', status: 'review', assignment: { ownerId: 'author-1', editorId: 'editor-1', reviewerIds: [], dueDate: null, priority: 'normal', watchers: [] } })
      const itemInvalidSelfApprove = createTestItem({ id: 'item-invalid', status: 'review', assignment: { ownerId: 'user-editor-1', editorId: 'user-editor-1', reviewerIds: [], dueDate: null, priority: 'normal', watchers: [] } })

      const res = bulkExecuteWorkflowActions([itemValid, itemInvalidSelfApprove], 'approve', editorActor)

      expect(res.totalCount).toBe(2)
      expect(res.succeededCount).toBe(1)
      expect(res.failedCount).toBe(1)
      expect(res.results.find((r) => r.itemId === 'item-valid')?.success).toBe(true)
      expect(res.results.find((r) => r.itemId === 'item-invalid')?.success).toBe(false)
      expect(res.results.find((r) => r.itemId === 'item-invalid')?.error).toContain('Self-approval is forbidden')
    })
  })
})
