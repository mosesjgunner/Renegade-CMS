import { createHash, randomUUID } from 'node:crypto'

import { hashRichTextDocument, type RichTextDocument } from './contracts'

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
  firstPublishedAt: string | null
  updatedAt: string | null
  revisions: readonly EditorialRevision[]
  citations: readonly EditorialCitation[]
  audit: readonly EditorialAuditEvent[]
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
      firstPublishedAt: null,
      updatedAt: null,
      revisions: [revision],
      citations: [],
      audit: [{ action: 'article.created', actorId: input.author.id, at: now, detail: {} }],
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

  requestReview(actor: EditorialActor, now = new Date().toISOString()): void {
    this.require(actor, 'author')
    if (this.article.status !== 'draft' && this.article.status !== 'updated')
      throw new Error('Only drafts or updates can be reviewed.')
    this.article.status = 'review'
    this.audit('review.requested', actor, now, {})
  }

  decideReview(actor: EditorialActor, approved: boolean, now = new Date().toISOString()): void {
    this.require(actor, 'editor')
    if (this.article.status !== 'review') throw new Error('Only content in review can be decided.')
    this.article.status = approved ? 'approved' : 'rejected'
    this.audit(approved ? 'review.approved' : 'review.rejected', actor, now, {})
  }

  schedule(
    actor: EditorialActor,
    scheduledFor: string,
    timeZone: string,
    key: string,
    now = new Date().toISOString(),
  ): void {
    this.require(actor, 'publisher')
    if (this.article.status !== 'approved')
      throw new Error('Only approved content can be scheduled.')
    if (!Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions().timeZone)
      throw new Error('A valid IANA timezone is required.')
    if (this.acceptedMutations.has(`schedule:${key}`)) return
    this.article.status = 'scheduled'
    this.acceptedMutations.set(`schedule:${key}`, this.article.currentRevisionId)
    this.audit('publication.scheduled', actor, now, { scheduledFor, timeZone, key })
  }

  publishScheduled(actor: EditorialActor, key: string, now = new Date().toISOString()): boolean {
    this.require(actor, 'publisher')
    const marker = `publish:${key}`
    if (this.acceptedMutations.has(marker)) return false
    if (this.article.status !== 'scheduled' && this.article.status !== 'approved')
      throw new Error('Only scheduled or approved content can publish.')
    this.article.status = 'published'
    this.article.firstPublishedAt ??= now
    this.article.updatedAt = now
    this.acceptedMutations.set(marker, this.article.currentRevisionId)
    this.audit('publication.published', actor, now, { key })
    return true
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
