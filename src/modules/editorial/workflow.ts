import { createHash, randomUUID } from 'node:crypto'

import {
  hashRichTextDocument,
  type QualityGateSnapshot,
  type QualityWaiverAuthorization,
  type ReviewDecisionRecord,
  type RichTextDocument,
  type WorkflowTransitionAction,
} from './contracts'

export type EditorialRole = 'author' | 'editor' | 'publisher'
export type WorkflowStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'updated'
  | 'archived'
  | 'rejected'
  | 'changes-requested'
  | 'cancelled'
  | 'failed'

export type EditorialActor = { id: string; role: EditorialRole }
export type EditorialRevision = {
  id: string
  sequence: number
  document: RichTextDocument
  integrityHash: string
  parentRevisionId: string | null
  restoredFromRevisionId: string | null
  createdBy: string
  createdAt: string
}
export type EditorialCitation = {
  id: string
  sourceReferenceId: string
  anchor: { nodeKey: string; offsetStart: number; offsetEnd: number }
  ordinal: number
}
export type EditorialAuditEvent = {
  action: string
  actorId: string
  at: string
  detail: Record<string, string | number | null>
}
export type EditorialArticle = {
  id: string
  status: WorkflowStatus
  currentRevisionId: string
  latestPublishedRevisionId: string | null
  firstPublishedAt: string | null
  updatedAt: string | null
  revisions: readonly EditorialRevision[]
  citations: readonly EditorialCitation[]
  audit: readonly EditorialAuditEvent[]
  qualityGateSnapshot?: QualityGateSnapshot | null
  qualityWaiver?: QualityWaiverAuthorization | null
  reviewDecisions?: readonly ReviewDecisionRecord[]
}

export class EditorialConflictError extends Error {}
export class EditorialPermissionError extends Error {}

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(',')}}`
}

/** Hashes canonical content plus provenance-bearing metadata, never rendered HTML. */
export function hashRevisionIntegrity(input: {
  document: RichTextDocument
  citationAttachments: readonly { citationId: string; checksum: string }[]
  mediaReferenceIds: readonly string[]
  provenance: Record<string, unknown>
}): string {
  return `sha256-v1:${createHash('sha256')
    .update(
      canonicalize({
        documentHash: hashRichTextDocument(input.document.document),
        citationAttachments: [...input.citationAttachments].sort((a, b) =>
          a.citationId.localeCompare(b.citationId),
        ),
        mediaReferenceIds: [...input.mediaReferenceIds].sort(),
        provenance: input.provenance,
      }),
    )
    .digest('hex')}`
}

/**
 * The server-authoritative M04 workflow boundary. Persistence adapters call this
 * service inside their transaction; this in-memory form makes its invariants testable.
 */
export class EditorialWorkflow {
  readonly article: EditorialArticle
  private readonly acceptedMutations = new Map<string, string>()

  constructor(input: {
    articleId?: string
    document: RichTextDocument
    author: EditorialActor
    now?: string
  }) {
    this.require(input.author, 'author')
    const now = input.now ?? new Date().toISOString()
    const revision = this.newRevision(input.document, input.author.id, null, null, now)
    this.article = {
      id: input.articleId ?? randomUUID(),
      status: 'draft',
      currentRevisionId: revision.id,
      latestPublishedRevisionId: null,
      firstPublishedAt: null,
      updatedAt: null,
      revisions: [revision],
      citations: [],
      audit: [{ action: 'article.created', actorId: input.author.id, at: now, detail: {} }],
      qualityGateSnapshot: null,
      qualityWaiver: null,
      reviewDecisions: [],
    }
  }

  saveDraft(input: {
    actor: EditorialActor
    document: RichTextDocument
    baseRevisionId: string
    mutationId: string
    now?: string
  }): EditorialRevision {
    this.require(input.actor, 'author')
    const existing = this.acceptedMutations.get(input.mutationId)
    if (existing) return this.revision(existing)
    if (input.baseRevisionId !== this.article.currentRevisionId)
      throw new EditorialConflictError('The draft is based on an older revision.')
    const now = input.now ?? new Date().toISOString()
    const revision = this.newRevision(
      input.document,
      input.actor.id,
      this.article.currentRevisionId,
      null,
      now,
    )
    this.article.revisions = [...this.article.revisions, revision]
    this.article.currentRevisionId = revision.id
    this.article.status = this.article.firstPublishedAt ? 'updated' : 'draft'
    this.acceptedMutations.set(input.mutationId, revision.id)
    this.audit('draft.saved', input.actor, now, { revisionId: revision.id })
    return revision
  }

  requestReview(
    actor: EditorialActor,
    options?: { qualityGateSnapshot?: QualityGateSnapshot | null; now?: string },
  ): void {
    this.require(actor, 'author')
    if (this.article.status !== 'draft' && this.article.status !== 'updated')
      throw new Error('Only drafts or updates can be reviewed.')
    const now = options?.now ?? new Date().toISOString()
    this.article.status = 'review'
    if (options?.qualityGateSnapshot) {
      this.article.qualityGateSnapshot = options.qualityGateSnapshot
    }
    this.audit('review.requested', actor, now, {
      blockingIssues: options?.qualityGateSnapshot?.blockingIssueCount ?? 0,
    })
  }

  decideReview(
    actor: EditorialActor,
    approved: boolean | 'approved' | 'rejected' | 'changes-requested',
    comment?: string | null,
    options?: { qualityWaiver?: QualityWaiverAuthorization | null; now?: string },
  ): void {
    this.require(actor, 'editor')
    if (this.article.status !== 'review') throw new Error('Only content in review can be decided.')
    const now = options?.now ?? new Date().toISOString()

    const decision: 'approved' | 'rejected' | 'changes-requested' =
      typeof approved === 'boolean'
        ? approved
          ? 'approved'
          : 'rejected'
        : approved

    if (
      decision === 'approved' &&
      this.article.qualityGateSnapshot &&
      this.article.qualityGateSnapshot.blockingIssueCount > 0
    ) {
      const waiver = options?.qualityWaiver ?? this.article.qualityWaiver
      if (!waiver) {
        throw new Error(
          `Quality gate failed: ${this.article.qualityGateSnapshot.blockingIssueCount} blocking issues exist and no waiver was provided.`,
        )
      }
      this.article.qualityWaiver = waiver
    }

    this.article.status = decision
    const currentRev = this.revision(this.article.currentRevisionId)
    const reviewRecord: ReviewDecisionRecord = {
      id: randomUUID(),
      decision,
      comment: comment ?? null,
      reviewerId: actor.id,
      reviewerRole: actor.role,
      targetRevisionSequence: currentRev.sequence,
      targetRevisionHash: currentRev.integrityHash,
      createdAt: now,
    }
    this.article.reviewDecisions = [...(this.article.reviewDecisions ?? []), reviewRecord]

    this.audit(
      decision === 'approved'
        ? 'review.approved'
        : decision === 'changes-requested'
          ? 'review.changes_requested'
          : 'review.rejected',
      actor,
      now,
      { comment: comment ?? null },
    )
  }

  requestChanges(actor: EditorialActor, comment: string, now = new Date().toISOString()): void {
    this.decideReview(actor, 'changes-requested', comment, { now })
  }

  schedule(
    actor: EditorialActor,
    scheduledFor: string,
    timeZone: string,
    key: string,
    options?: { qualityWaiver?: QualityWaiverAuthorization | null; now?: string },
  ): void {
    this.require(actor, 'publisher')
    if (this.article.status !== 'approved')
      throw new Error('Only approved content can be scheduled.')
    if (!Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions().timeZone)
      throw new Error('A valid IANA timezone is required.')

    if (
      this.article.qualityGateSnapshot &&
      this.article.qualityGateSnapshot.blockingIssueCount > 0
    ) {
      const waiver = options?.qualityWaiver ?? this.article.qualityWaiver
      if (!waiver) {
        throw new Error(
          `Quality gate failed: ${this.article.qualityGateSnapshot.blockingIssueCount} blocking issues exist and no waiver was provided.`,
        )
      }
      this.article.qualityWaiver = waiver
    }

    const now = options?.now ?? new Date().toISOString()
    if (this.acceptedMutations.has(`schedule:${key}`)) return
    this.article.status = 'scheduled'
    this.acceptedMutations.set(`schedule:${key}`, this.article.currentRevisionId)
    this.audit('publication.scheduled', actor, now, { scheduledFor, timeZone, key })
  }

  cancelSchedule(
    actor: EditorialActor,
    key: string,
    reason?: string,
    now = new Date().toISOString(),
  ): void {
    this.require(actor, 'publisher')
    if (this.article.status !== 'scheduled')
      throw new Error('Only scheduled content can be cancelled.')
    this.article.status = 'cancelled'
    this.audit('publication.schedule_cancelled', actor, now, { key, reason: reason ?? null })
  }

  failSchedule(
    actor: EditorialActor,
    key: string,
    error?: string,
    now = new Date().toISOString(),
  ): void {
    this.require(actor, 'publisher')
    this.article.status = 'failed'
    this.audit('publication.schedule_failed', actor, now, { key, error: error ?? null })
  }

  publishScheduled(actor: EditorialActor, key: string, now = new Date().toISOString()): boolean {
    this.require(actor, 'publisher')
    const marker = `publish:${key}`
    if (this.acceptedMutations.has(marker)) return false
    if (!['scheduled', 'approved', 'updated', 'draft'].includes(this.article.status))
      throw new Error('Only scheduled or approved content can publish.')
    this.article.status = 'published'
    this.article.firstPublishedAt ??= now
    this.article.updatedAt = now
    this.article.latestPublishedRevisionId = this.article.currentRevisionId
    this.acceptedMutations.set(marker, this.article.currentRevisionId)
    this.audit('publication.published', actor, now, { key })
    return true
  }

  unpublish(actor: EditorialActor, reason?: string, now = new Date().toISOString()): void {
    this.require(actor, 'publisher')
    if (this.article.status !== 'published' && this.article.status !== 'updated') {
      throw new Error('Only published content can be unpublished.')
    }
    this.article.status = 'draft'
    this.audit('publication.unpublished', actor, now, { reason: reason ?? null })
  }

  archive(actor: EditorialActor, reason?: string, now = new Date().toISOString()): void {
    this.require(actor, 'publisher')
    this.article.status = 'archived'
    this.audit('article.archived', actor, now, { reason: reason ?? null })
  }

  restore(
    actor: EditorialActor,
    revisionId: string,
    now = new Date().toISOString(),
  ): EditorialRevision {
    this.require(actor, 'editor')
    const target = this.revision(revisionId)
    const revision = this.newRevision(
      target.document,
      actor.id,
      this.article.currentRevisionId,
      target.id,
      now,
    )
    this.article.revisions = [...this.article.revisions, revision]
    this.article.currentRevisionId = revision.id
    this.article.status = this.article.firstPublishedAt ? 'updated' : 'draft'
    this.audit('revision.restored', actor, now, {
      restoredFrom: target.id,
      revisionId: revision.id,
    })
    return revision
  }

  setCitations(
    actor: EditorialActor,
    citations: readonly Omit<EditorialCitation, 'ordinal'>[],
    now = new Date().toISOString(),
  ): void {
    this.require(actor, 'author')
    this.article.citations = [...citations]
      .sort(
        (a, b) =>
          a.anchor.nodeKey.localeCompare(b.anchor.nodeKey) ||
          a.anchor.offsetStart - b.anchor.offsetStart,
      )
      .map((citation, index) => ({ ...citation, ordinal: index + 1 }))
    this.audit('citations.ordered', actor, now, { count: this.article.citations.length })
  }

  transition(input: {
    action: WorkflowTransitionAction
    actor: EditorialActor
    scheduledFor?: string
    timeZone?: string
    idempotencyKey?: string
    reason?: string
    comment?: string
    qualityGateSnapshot?: QualityGateSnapshot | null
    qualityWaiver?: QualityWaiverAuthorization | null
    now?: string
  }): { status: WorkflowStatus; article: EditorialArticle } {
    const now = input.now ?? new Date().toISOString()
    switch (input.action) {
      case 'save-draft':
        throw new Error('Use saveDraft() for saving content drafts with document payload.')
      case 'request-review':
        this.requestReview(input.actor, {
          qualityGateSnapshot: input.qualityGateSnapshot,
          now,
        })
        break
      case 'decide-review':
        this.decideReview(input.actor, 'approved', input.comment, {
          qualityWaiver: input.qualityWaiver,
          now,
        })
        break
      case 'request-changes':
        this.requestChanges(input.actor, input.comment ?? 'Changes requested', now)
        break
      case 'schedule':
        if (!input.scheduledFor || !input.timeZone || !input.idempotencyKey) {
          throw new Error('scheduledFor, timeZone, and idempotencyKey are required for scheduling.')
        }
        this.schedule(input.actor, input.scheduledFor, input.timeZone, input.idempotencyKey, {
          qualityWaiver: input.qualityWaiver,
          now,
        })
        break
      case 'cancel-schedule':
        if (!input.idempotencyKey) throw new Error('idempotencyKey is required to cancel schedule.')
        this.cancelSchedule(input.actor, input.idempotencyKey, input.reason, now)
        break
      case 'fail-schedule':
        if (!input.idempotencyKey) throw new Error('idempotencyKey is required to fail schedule.')
        this.failSchedule(input.actor, input.idempotencyKey, input.reason, now)
        break
      case 'publish':
        if (!input.idempotencyKey) throw new Error('idempotencyKey is required to publish.')
        this.publishScheduled(input.actor, input.idempotencyKey, now)
        break
      case 'unpublish':
        this.unpublish(input.actor, input.reason, now)
        break
      case 'archive':
        this.archive(input.actor, input.reason, now)
        break
      default:
        throw new Error(`Unsupported transition action: ${input.action}`)
    }
    return { status: this.article.status, article: this.article }
  }

  private newRevision(
    document: RichTextDocument,
    createdBy: string,
    parentRevisionId: string | null,
    restoredFromRevisionId: string | null,
    createdAt: string,
  ): EditorialRevision {
    return {
      id: randomUUID(),
      sequence: this.article?.revisions.length ? this.article.revisions.length + 1 : 1,
      document,
      integrityHash: hashRevisionIntegrity({
        document,
        citationAttachments: [],
        mediaReferenceIds: [],
        provenance: { createdBy },
      }),
      parentRevisionId,
      restoredFromRevisionId,
      createdBy,
      createdAt,
    }
  }
  private revision(id: string): EditorialRevision {
    const value = this.article.revisions.find((revision) => revision.id === id)
    if (!value) throw new Error('Revision does not exist.')
    return value
  }
  private audit(
    action: string,
    actor: EditorialActor,
    at: string,
    detail: Record<string, string | number | null>,
  ): void {
    this.article.audit = [...this.article.audit, { action, actorId: actor.id, at, detail }]
  }
  private require(actor: EditorialActor, minimum: EditorialRole): void {
    const order: Record<EditorialRole, number> = { author: 1, editor: 2, publisher: 3 }
    if (order[actor.role] < order[minimum])
      throw new EditorialPermissionError(`${minimum} permission is required.`)
  }
}
