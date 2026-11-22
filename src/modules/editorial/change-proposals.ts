/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload'

import type { RichTextDocument } from './contracts'
import { loadBundleByArticleId, saveEditorialDraft } from './persistence'
import { diffParagraphs, paragraphTexts, type ParagraphDiffEntry } from './text-segments'
import type { EditorialActor } from './workflow'

/**
 * RC3-17 — the bounded git-like slice for area #20.
 *
 * The ledger is explicit that the full git-like core (content
 * branches, three-way merge workflow) does not exist, and this pass
 * does not pretend otherwise. What is built and proven here is the
 * bounded editorial slice:
 *
 * - A change proposal is a full proposed document pinned to the
 *   revision it was authored against, with a persisted
 *   paragraph-level diff a reviewer can read.
 * - Conflict detection is real: if the article's current revision no
 *   longer equals the proposal's base at decision time, the proposal
 *   lands 'conflicted' and is never applied.
 * - Application is fast-forward only, through the normal draft-save
 *   path: an accepted proposal becomes a new DRAFT revision. It
 *   never publishes, never bypasses review, and a second decision on
 *   the same proposal is refused.
 *
 * Not built (named, not implied): content branches, three-way merge,
 * per-line diffs, a merge UI.
 */

type Doc = Record<string, any>
type Pool = { query: (text: string, values?: unknown[]) => Promise<{ rows: Doc[] }> }

function poolOf(payload: Payload): Pool {
  return (payload as unknown as { db: { pool: Pool } }).db.pool
}

const idOf = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? String((value as Doc).id ?? '')
    : String(value ?? '')

export class ChangeProposalError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export type ChangeSetStatus = 'proposed' | 'accepted' | 'rejected' | 'conflicted'

export type ChangeSet = {
  id: string
  siteId: string
  articleId: string
  baseRevisionId: string
  baseDocumentHash: string
  proposedDocument: RichTextDocument
  diff: ParagraphDiffEntry[]
  status: ChangeSetStatus
  createdBy: string
  decidedBy?: string
  decidedAt?: string
  appliedRevisionId?: string
  createdAt: string
  updatedAt: string
}

const CHANGE_SET_COLUMNS = `id, site_id, article_id, base_revision_id,
  base_document_hash, proposed_document, diff, status, created_by,
  decided_by, decided_at, applied_revision_id, created_at, updated_at`

function toChangeSet(row: Doc): ChangeSet {
  return {
    id: String(row.id),
    siteId: String(row.site_id),
    articleId: String(row.article_id),
    baseRevisionId: String(row.base_revision_id),
    baseDocumentHash: String(row.base_document_hash),
    proposedDocument: row.proposed_document as RichTextDocument,
    diff: (row.diff || []) as ParagraphDiffEntry[],
    status: row.status as ChangeSetStatus,
    createdBy: String(row.created_by),
    decidedBy: row.decided_by ? String(row.decided_by) : undefined,
    decidedAt: row.decided_at ? new Date(row.decided_at as string).toISOString() : undefined,
    appliedRevisionId: row.applied_revision_id ? String(row.applied_revision_id) : undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

const ROLE_ORDER = { author: 1, editor: 2, publisher: 3 } as const

function requireRole(actor: EditorialActor, minimum: keyof typeof ROLE_ORDER): void {
  if (ROLE_ORDER[actor.role] < ROLE_ORDER[minimum])
    throw new ChangeProposalError('CHANGE_SET_FORBIDDEN', `${minimum} permission is required.`, 403)
}

export async function createChangeProposal(
  payload: Payload,
  input: {
    articleId: string
    actor: EditorialActor
    proposedDocument: RichTextDocument
  },
): Promise<ChangeSet> {
  requireRole(input.actor, 'author')
  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const baseDocument = bundle.article.document as RichTextDocument
  const diff = diffParagraphs(paragraphTexts(baseDocument), paragraphTexts(input.proposedDocument))
  const inserted = await poolOf(payload).query(
    `INSERT INTO editorial_change_sets
       (site_id, article_id, base_revision_id, base_document_hash,
        proposed_document, diff, status, created_by)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,'proposed',$7)
     RETURNING ${CHANGE_SET_COLUMNS}`,
    [
      idOf(bundle.content.site),
      input.articleId,
      idOf(bundle.article.currentRevision),
      String(bundle.article.documentHash),
      JSON.stringify(input.proposedDocument),
      JSON.stringify(diff),
      input.actor.id,
    ],
  )
  return toChangeSet(inserted.rows[0])
}

export async function getChangeProposal(
  payload: Payload,
  proposalId: string,
): Promise<ChangeSet | null> {
  const result = await poolOf(payload).query(
    `SELECT ${CHANGE_SET_COLUMNS} FROM editorial_change_sets WHERE id = $1`,
    [proposalId],
  )
  return result.rows[0] ? toChangeSet(result.rows[0]) : null
}

export async function listChangeProposals(
  payload: Payload,
  articleId: string,
): Promise<ChangeSet[]> {
  const result = await poolOf(payload).query(
    `SELECT ${CHANGE_SET_COLUMNS} FROM editorial_change_sets
     WHERE article_id = $1 ORDER BY created_at ASC`,
    [articleId],
  )
  return result.rows.map(toChangeSet)
}

/**
 * Decide a proposal. Rejection records the decision and writes
 * nothing. Acceptance is fast-forward only: a moved base marks the
 * proposal 'conflicted' instead of applying; a clean base applies
 * the proposed document as a new draft revision through the normal
 * save path (publication state is untouched).
 */
export async function decideChangeProposal(
  payload: Payload,
  input: {
    proposalId: string
    decision: 'accepted' | 'rejected'
    actor: EditorialActor
    actorUserId?: string | null
    now?: string
  },
): Promise<ChangeSet> {
  requireRole(input.actor, 'editor')
  const current = await getChangeProposal(payload, input.proposalId)
  if (!current)
    throw new ChangeProposalError('CHANGE_SET_NOT_FOUND', 'Change proposal was not found.', 404)
  if (current.status !== 'proposed')
    throw new ChangeProposalError(
      'CHANGE_SET_ALREADY_DECIDED',
      `Change proposal is already ${current.status}.`,
    )

  if (input.decision === 'rejected') {
    await poolOf(payload).query(
      `UPDATE editorial_change_sets
         SET status = 'rejected', decided_by = $2, decided_at = now(), updated_at = now()
       WHERE id = $1`,
      [input.proposalId, input.actor.id],
    )
    return (await getChangeProposal(payload, input.proposalId)) as ChangeSet
  }

  const bundle = await loadBundleByArticleId(payload, current.articleId)
  const currentRevisionId = idOf(bundle.article.currentRevision)
  if (currentRevisionId !== current.baseRevisionId) {
    await poolOf(payload).query(
      `UPDATE editorial_change_sets
         SET status = 'conflicted', decided_by = $2, decided_at = now(), updated_at = now()
       WHERE id = $1`,
      [input.proposalId, input.actor.id],
    )
    return (await getChangeProposal(payload, input.proposalId)) as ChangeSet
  }

  await saveEditorialDraft(payload, {
    articleId: current.articleId,
    actor: input.actor,
    actorUserId: input.actorUserId ?? null,
    document: current.proposedDocument,
    baseRevisionId: current.baseRevisionId,
    mutationId: `change-set:${current.id}`,
    now: input.now,
  })
  const after = await loadBundleByArticleId(payload, current.articleId)
  await poolOf(payload).query(
    `UPDATE editorial_change_sets
       SET status = 'accepted', decided_by = $2, decided_at = now(),
           applied_revision_id = $3, updated_at = now()
     WHERE id = $1`,
    [input.proposalId, input.actor.id, idOf(after.article.currentRevision)],
  )
  return (await getChangeProposal(payload, input.proposalId)) as ChangeSet
}
