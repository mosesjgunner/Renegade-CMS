import { beforeAll, describe, expect, it, vi } from 'vitest'
import { type Payload } from 'payload'

import {
  executeWorkflowAction,
  bulkExecuteWorkflowItems,
  getWorkflowAuditHistory,
  getWorkflowItemForArticle,
  getWorkflowQueuesForUser,
  listWorkflowTemplates,
  saveWorkflowTemplate,
} from '../../src/modules/editorial/cmos-persistence'
import {
  BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
  type WorkflowTemplate,
} from '../../src/modules/editorial/cmos-workflow'

describe('FLOW-01 Workflow Integration & API Layer', () => {
  let payload: Payload
  const articleId = `art-test-${Date.now()}`

  const documents = new Map<string, Record<string, unknown>>()
  beforeAll(async () => {
    documents.set(articleId, {
      id: articleId,
      site: 'test-site',
      owner: 'user-author-10',
      status: 'draft',
      auditMetadata: {},
    })
    payload = {
      update: vi.fn(async ({ id, data }) => {
        const doc = documents.get(id)
        if (!doc) throw new Error('Not found')
        const updated = { ...doc, ...data }
        documents.set(id, updated)
        return updated
      }),
      find: vi.fn(async ({ collection }) => ({
        docs: collection === 'content' ? [...documents.values()] : [],
      })),
      findByID: vi.fn(async ({ id }) => documents.get(id) ?? null),
    } as unknown as Payload
  })

  it('1. retrieves builtin workflow template and validates custom templates', () => {
    const templates = listWorkflowTemplates()
    expect(templates.length).toBeGreaterThanOrEqual(1)
    expect(templates[0].id).toBe(BUILTIN_SIMPLE_WORKFLOW_TEMPLATE.id)

    // Valid Custom Template
    const customValid: WorkflowTemplate = {
      ...BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
      id: 'template-custom-2step',
      name: 'Custom Two Step Review',
    }
    const saveRes = saveWorkflowTemplate(customValid)
    expect(saveRes.validation.valid).toBe(true)

    // Invalid Dead End Template
    const customInvalid: WorkflowTemplate = {
      ...BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
      id: 'template-invalid-dead-end',
      name: 'Dead End Workflow',
      eligibleRoles: {
        'decide-review': [], // Dead end
      },
    }
    const invalidRes = saveWorkflowTemplate(customInvalid)
    expect(invalidRes.validation.valid).toBe(false)
    expect(invalidRes.validation.errors.some((e) => e.includes('Dead End'))).toBe(true)
  })

  it('2. executes full workflow action flow: submit -> decide review -> save draft -> stale approval protection', async () => {
    // 1. Get initial item
    const item0 = await getWorkflowItemForArticle(payload, articleId)
    expect(item0.status).toBe('draft')

    // 2. Submit for review as author
    const itemSubmitted = await executeWorkflowAction(payload, {
      articleId,
      action: 'submit',
      actor: { id: 'user-author-10', role: 'author' },
      now: '2026-09-15T10:00:00Z',
    })
    expect(itemSubmitted.status).toBe('review')
    expect(itemSubmitted.assignment.dueDate).toBeTruthy()

    // 3. Approve as editor
    const itemApproved = await executeWorkflowAction(payload, {
      articleId,
      action: 'approve',
      actor: { id: 'user-editor-20', role: 'editor' },
      comment: 'Approved for publishing',
      now: '2026-09-15T11:00:00Z',
    })
    expect(itemApproved.status).toBe('approved')
    expect(itemApproved.staleApproval).toBe(false)
    expect(itemApproved.reviewDecisions).toHaveLength(1)

    // 4. Author edits and saves new draft post-approval -> stale approval activated
    const itemStale = await executeWorkflowAction(payload, {
      articleId,
      action: 'save-draft',
      actor: { id: 'user-author-10', role: 'author' },
      now: '2026-09-15T12:00:00Z',
    })
    expect(itemStale.status).toBe('updated')
    expect(itemStale.staleApproval).toBe(true)
    expect(itemStale.staleReason).toContain('created after approval decision')
  })

  it('3. retrieves queues and audit history for item', async () => {
    const queues = await getWorkflowQueuesForUser(payload, {
      userId: 'user-author-10',
      role: 'author',
    })
    expect(queues.personal).toBeDefined()
    expect(queues.team).toBeDefined()

    const auditTrail = await getWorkflowAuditHistory(payload, articleId)
    expect(auditTrail.length).toBeGreaterThanOrEqual(3)
    expect(auditTrail.some((a) => a.action === 'workflow.submitted_for_review')).toBe(true)
    expect(auditTrail.some((a) => a.action === 'workflow.decided_approved')).toBe(true)
    expect(auditTrail.some((a) => a.action === 'workflow.draft_saved')).toBe(true)
  })
  it('4. rejects missing records and failed writes without inventing workflow state', async () => {
    await expect(getWorkflowItemForArticle(payload, 'missing-content')).rejects.toThrow(
      'Content record not found',
    )
    const id = articleId + '-failure'
    documents.set(id, {
      id,
      site: 'test-site',
      owner: 'author-failure',
      status: 'draft',
      auditMetadata: {},
    })
    vi.mocked(payload.update).mockRejectedValueOnce(new Error('database write failed'))
    await expect(
      executeWorkflowAction(payload, {
        articleId: id,
        action: 'submit',
        actor: { id: 'author-failure', role: 'author' },
      }),
    ).rejects.toThrow('database write failed')
    expect((await getWorkflowItemForArticle(payload, id)).status).toBe('draft')
    expect(documents.get(id)?.status).toBe('draft')
  })

  it('5. reports failed bulk persistence as failure and preserves successful writes', async () => {
    const ids = [articleId + '-bulk-fail', articleId + '-bulk-ok']
    for (const id of ids)
      documents.set(id, {
        id,
        site: 'test-site',
        owner: 'bulk-author',
        status: 'draft',
        auditMetadata: {},
      })
    vi.mocked(payload.update).mockRejectedValueOnce(new Error('bulk database write failed'))
    const result = await bulkExecuteWorkflowItems(payload, {
      articleIds: ids,
      action: 'reassign',
      actor: { id: 'bulk-editor', role: 'publisher' },
      update: { priority: 'high' },
    })
    expect(result.succeededCount).toBe(1)
    expect(result.failedCount).toBe(1)
    expect(result.results[0]).toMatchObject({ success: false, error: 'bulk database write failed' })
    expect(
      (documents.get(ids[0])?.auditMetadata as Record<string, unknown>).cmosWorkflow,
    ).toBeUndefined()
    expect((await getWorkflowItemForArticle(payload, ids[1])).assignment.priority).toBe('high')
  })
})
