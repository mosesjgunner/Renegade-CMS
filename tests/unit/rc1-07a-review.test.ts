import { documentInternalLinks } from '../../src/modules/quality/contracts'
import { describe, expect, it } from 'vitest'
import {
  CMoSWorkflowEngine,
  BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
  type WorkflowItem,
} from '../../src/modules/editorial/cmos-workflow'
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

describe('07A peer approval quorum and review rounds', () => {
  const author = { id: 'user-author-1', role: 'author' as const }
  const peer = { id: 'peer', role: 'editor' as const }
  const owner = { id: 'owner', role: 'publisher' as const }
  it('requires distinct reviewers and retains partial approval in review', () => {
    const engine = new CMoSWorkflowEngine(createTestItem(), {
      ...BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
      requiredApprovalCount: 2,
    })
    engine.submitForReview(author)
    expect(engine.decideReview(peer, 'approved').status).toBe('review')
    expect(() => engine.decideReview(peer, 'approved')).toThrow('already approved')
    expect(engine.decideReview(owner, 'approved').status).toBe('approved')
    expect(engine.getItem().reviewDecisions).toHaveLength(2)
  })
  it('does not reuse approvals from a previous submission round', () => {
    const engine = new CMoSWorkflowEngine(createTestItem(), {
      ...BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
      requiredApprovalCount: 2,
    })
    engine.submitForReview(author, { now: '2026-10-18T01:00:00Z' })
    engine.decideReview(peer, 'approved', undefined, { now: '2026-10-18T01:01:00Z' })
    engine.decideReview(owner, 'rejected', 'Fix attribution', { now: '2026-10-18T01:02:00Z' })
    engine.submitForReview(author, { now: '2026-10-18T02:00:00Z' })
    expect(
      engine.decideReview(owner, 'approved', undefined, { now: '2026-10-18T02:01:00Z' }).status,
    ).toBe('review')
    expect(
      engine.decideReview(peer, 'approved', undefined, { now: '2026-10-18T02:02:00Z' }).status,
    ).toBe('approved')
    expect(engine.getItem().reviewDecisions).toHaveLength(4)
  })
})

it('extracts nested Lexical links for canonical QA without scanning external URLs as local paths', () => {
  expect(
    documentInternalLinks({
      root: {
        children: [
          { type: 'link', fields: { url: '/missing-reference' } },
          { href: '/missing-reference' },
          { fields: { url: 'https://example.test/' } },
          { url: '//external.test/' },
        ],
      },
    }),
  ).toEqual(['/missing-reference'])
})
