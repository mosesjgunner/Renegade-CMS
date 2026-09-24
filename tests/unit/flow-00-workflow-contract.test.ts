import { describe, expect, it } from 'vitest'

import {
  hashRichTextDocument,
  type QualityGateSnapshot,
  type QualityWaiverAuthorization,
  type RichTextDocument,
} from '../../src/modules/editorial/contracts'
import {
  EditorialConflictError,
  EditorialPermissionError,
  EditorialWorkflow,
} from '../../src/modules/editorial/workflow'

const doc = (text: string): RichTextDocument => {
  const document = { root: { children: [{ text, type: 'paragraph' }], type: 'root' } }
  return {
    format: 'payload-lexical',
    schemaVersion: 1,
    document,
    canonicalHash: hashRichTextDocument(document),
    plainTextProjection: text,
    unknownNodePolicy: 'preserve',
  }
}

const author = { id: 'author-1', role: 'author' as const }
const editor = { id: 'editor-1', role: 'editor' as const }
const publisher = { id: 'publisher-1', role: 'publisher' as const }

describe('FLOW-00 workflow contract & state machine', () => {
  it('executes canonical happy path: draft -> review -> approved -> scheduled -> published -> archived', () => {
    const flow = new EditorialWorkflow({
      document: doc('Canonical Content'),
      author,
      now: '2026-09-15T10:00:00Z',
    })

    expect(flow.article.status).toBe('draft')
    expect(flow.article.currentRevisionId).toBeTruthy()

    flow.requestReview(author, { now: '2026-09-15T10:05:00Z' })
    expect(flow.article.status).toBe('review')

    flow.decideReview(editor, 'approved', 'Looks good to publish', { now: '2026-09-15T10:10:00Z' })
    expect(flow.article.status).toBe('approved')
    expect(flow.article.reviewDecisions).toHaveLength(1)
    expect(flow.article.reviewDecisions![0]).toMatchObject({
      decision: 'approved',
      comment: 'Looks good to publish',
      reviewerId: 'editor-1',
    })

    flow.schedule(publisher, '2026-09-16T12:00:00Z', 'America/Chicago', 'job-flow-00-1', {
      now: '2026-09-15T10:15:00Z',
    })
    expect(flow.article.status).toBe('scheduled')

    const pubSuccess = flow.publishScheduled(publisher, 'job-flow-00-1', '2026-09-16T12:00:00Z')
    expect(pubSuccess).toBe(true)
    expect(flow.article.status).toBe('published')
    expect(flow.article.latestPublishedRevisionId).toBe(flow.article.currentRevisionId)

    flow.archive(publisher, 'End of editorial lifecycle', '2026-09-20T00:00:00Z')
    expect(flow.article.status).toBe('archived')
  })

  it('handles explicit exception states: changes-requested, rejected, cancelled, failed, unpublish', () => {
    // 1. Changes requested
    const flow1 = new EditorialWorkflow({ document: doc('Draft 1'), author })
    flow1.requestReview(author)
    flow1.requestChanges(editor, 'Please add citations', '2026-09-15T11:00:00Z')
    expect(flow1.article.status).toBe('changes-requested')
    expect(flow1.article.reviewDecisions![0].decision).toBe('changes-requested')

    // 2. Rejected
    const flow2 = new EditorialWorkflow({ document: doc('Draft 2'), author })
    flow2.requestReview(author)
    flow2.decideReview(editor, 'rejected', 'Off topic', { now: '2026-09-15T11:05:00Z' })
    expect(flow2.article.status).toBe('rejected')

    // 3. Cancel schedule
    const flow3 = new EditorialWorkflow({ document: doc('Draft 3'), author })
    flow3.requestReview(author)
    flow3.decideReview(editor, 'approved')
    flow3.schedule(publisher, '2026-09-16T12:00:00Z', 'UTC', 'job-cancel-1')
    flow3.cancelSchedule(publisher, 'job-cancel-1', 'Breaking news hold')
    expect(flow3.article.status).toBe('cancelled')

    // 4. Fail schedule
    const flow4 = new EditorialWorkflow({ document: doc('Draft 4'), author })
    flow4.requestReview(author)
    flow4.decideReview(editor, 'approved')
    flow4.schedule(publisher, '2026-09-16T12:00:00Z', 'UTC', 'job-fail-1')
    flow4.failSchedule(publisher, 'job-fail-1', 'Worker timeout')
    expect(flow4.article.status).toBe('failed')

    // 5. Unpublish
    const flow5 = new EditorialWorkflow({ document: doc('Draft 5'), author })
    flow5.requestReview(author)
    flow5.decideReview(editor, 'approved')
    flow5.schedule(publisher, '2026-09-16T12:00:00Z', 'UTC', 'job-unpub-1')
    flow5.publishScheduled(publisher, 'job-unpub-1')
    expect(flow5.article.status).toBe('published')
    flow5.unpublish(publisher, 'Retracted for review')
    expect(flow5.article.status).toBe('draft')
  })

  it('enforces role permission boundaries across all transitions', () => {
    const flow = new EditorialWorkflow({ document: doc('Permission Test'), author })

    // Author cannot decide review
    flow.requestReview(author)
    expect(() => flow.decideReview(author, 'approved')).toThrow(EditorialPermissionError)

    // Author cannot schedule
    flow.decideReview(editor, 'approved')
    expect(() => flow.schedule(author, '2026-09-16T12:00:00Z', 'UTC', 'key-1')).toThrow(
      EditorialPermissionError,
    )

    // Editor cannot publish
    flow.schedule(publisher, '2026-09-16T12:00:00Z', 'UTC', 'key-1')
    expect(() => flow.publishScheduled(editor, 'key-1')).toThrow(EditorialPermissionError)

    // Author cannot unpublish
    flow.publishScheduled(publisher, 'key-1')
    expect(() => flow.unpublish(author)).toThrow(EditorialPermissionError)
  })

  it('evaluates quality gate snapshots and waiver overrides', () => {
    const flow = new EditorialWorkflow({ document: doc('Quality Gate Content'), author })

    const snapshotWithIssues: QualityGateSnapshot = {
      scanId: 'scan-1',
      scannedAt: '2026-09-15T12:00:00Z',
      blockingIssueCount: 2,
      issues: [
        { id: 'iss-1', ruleId: 'DISC-RULE-01', severity: 'error', message: 'Title missing' },
        { id: 'iss-2', ruleId: 'DISC-RULE-02', severity: 'error', message: 'Alt text missing' },
      ],
    }

    flow.requestReview(author, { qualityGateSnapshot: snapshotWithIssues })
    expect(flow.article.qualityGateSnapshot?.blockingIssueCount).toBe(2)

    // Approving without a waiver must fail
    expect(() => flow.decideReview(editor, 'approved')).toThrow(/Quality gate failed/)

    // Approving with a valid waiver succeeds
    const waiver: QualityWaiverAuthorization = {
      waivedByUserId: 'editor-1',
      waivedByUserRole: 'editor',
      reason: 'Approved for urgent breaking release',
      waivedAt: '2026-09-15T12:05:00Z',
    }
    flow.decideReview(editor, 'approved', 'Overriding quality gate', { qualityWaiver: waiver })
    expect(flow.article.status).toBe('approved')
    expect(flow.article.qualityWaiver?.reason).toBe('Approved for urgent breaking release')
  })

  it('maintains last-public-revision protection when drafts are saved post-publication', () => {
    const flow = new EditorialWorkflow({ document: doc('Initial Published Revision'), author })
    const rev1Id = flow.article.currentRevisionId

    flow.requestReview(author)
    flow.decideReview(editor, 'approved')
    flow.schedule(publisher, '2026-09-16T12:00:00Z', 'UTC', 'job-pub-1')
    flow.publishScheduled(publisher, 'job-pub-1')

    expect(flow.article.latestPublishedRevisionId).toBe(rev1Id)

    // Save a new draft after publication
    const rev2 = flow.saveDraft({
      actor: author,
      document: doc('Post-publication draft modification'),
      baseRevisionId: rev1Id,
      mutationId: 'post-pub-mutation',
    })

    expect(flow.article.status).toBe('updated')
    expect(flow.article.currentRevisionId).toBe(rev2.id)
    // Immutable last public revision remains unchanged!
    expect(flow.article.latestPublishedRevisionId).toBe(rev1Id)
  })

  it('supports unified transition() method execution', () => {
    const flow = new EditorialWorkflow({ document: doc('Transition Unified'), author })

    flow.transition({ action: 'request-review', actor: author })
    expect(flow.article.status).toBe('review')

    flow.transition({
      action: 'decide-review',
      actor: editor,
      comment: 'Approved via unified transition',
    })
    expect(flow.article.status).toBe('approved')

    flow.transition({
      action: 'schedule',
      actor: publisher,
      scheduledFor: '2026-09-16T12:00:00Z',
      timeZone: 'UTC',
      idempotencyKey: 'unified-sched-1',
    })
    expect(flow.article.status).toBe('scheduled')

    flow.transition({ action: 'publish', actor: publisher, idempotencyKey: 'unified-sched-1' })
    expect(flow.article.status).toBe('published')
  })
})
