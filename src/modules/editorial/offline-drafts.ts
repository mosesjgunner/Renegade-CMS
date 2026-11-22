/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload'

import type { ClientMutation, OfflineDraft, RichTextDocument } from './contracts'
import { loadBundleByArticleId, requestEditorialReview, saveEditorialDraft } from './persistence'
import { EditorialConflictError, type EditorialActor } from './workflow'

/**
 * RC3-17 / DEBT-03 — offline authoring sync (area #22).
 *
 * The contract types (OfflineDraft, ClientMutation) existed with zero
 * consumers. This service is the server half of the offline protocol:
 *
 * - A client working offline holds a draft locally, captured against
 *   the revision it started from (baseRevisionId + baseDocumentHash).
 *   On reconnect it registers that draft; the row is the durable
 *   re-open point — the draft survives server restarts and can be
 *   read back exactly as captured.
 * - Submission is a ClientMutation carrying an idempotency key.
 *   Replaying the same key returns the recorded outcome and never
 *   applies twice (the editorial workflow's own mutation ledger is
 *   the second line of defense).
 * - If the server draft moved while the client was offline, the
 *   mutation lands 'conflicted' and NOTHING is overwritten. The
 *   editor resolves explicitly: keep-mine re-bases the local document
 *   onto the current revision as a new draft revision; take-server
 *   discards the local document.
 * - Accepted mutations land as draft revisions (or a review request)
 *   through the normal editorial workflow. Publication state is never
 *   touched by a re-sync: approval and publication boundaries are
 *   preserved exactly as if the edit had been made online.
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

export class OfflineDraftError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

const DRAFT_COLUMNS = `id, site_id, article_id, device_id, base_revision_id,
  base_document_hash, document, status, created_by, created_at, updated_at`

const MUTATION_COLUMNS = `id, site_id, article_id, offline_draft_id,
  idempotency_key, base_document_hash, mutation_type, status,
  result_revision_id, created_by, created_at`

function toDraft(row: Doc): OfflineDraft {
  return {
    id: String(row.id) as OfflineDraft['id'],
    articleId: String(row.article_id) as OfflineDraft['articleId'],
    deviceId: String(row.device_id),
    baseRevisionId: row.base_revision_id
      ? (String(row.base_revision_id) as OfflineDraft['baseRevisionId'])
      : null,
    baseDocumentHash: String(row.base_document_hash),
    document: row.document as RichTextDocument,
    status: row.status as OfflineDraft['status'],
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

function toMutation(row: Doc): ClientMutation {
  return {
    id: String(row.id) as ClientMutation['id'],
    articleId: String(row.article_id) as ClientMutation['articleId'],
    offlineDraftId: row.offline_draft_id
      ? (String(row.offline_draft_id) as ClientMutation['offlineDraftId'])
      : null,
    idempotencyKey: String(row.idempotency_key),
    baseDocumentHash: String(row.base_document_hash),
    mutationType: row.mutation_type as ClientMutation['mutationType'],
    status: row.status as ClientMutation['status'],
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

async function loadDraftRow(payload: Payload, draftId: string): Promise<Doc> {
  const result = await poolOf(payload).query(
    `SELECT ${DRAFT_COLUMNS} FROM offline_drafts WHERE id = $1`,
    [draftId],
  )
  if (!result.rows[0])
    throw new OfflineDraftError('OFFLINE_DRAFT_NOT_FOUND', 'Offline draft was not found.', 404)
  return result.rows[0]
}

/**
 * Register a locally captured draft. The base is read from the
 * article's current server state unless the client reports the base
 * it actually started from (the normal offline case: the client was
 * offline before the server state it last saw, so its reported base
 * is the only honest one).
 */
export async function registerOfflineDraft(
  payload: Payload,
  input: {
    articleId: string
    deviceId: string
    actor: EditorialActor
    document: RichTextDocument
    baseRevisionId?: string | null
    baseDocumentHash?: string
  },
): Promise<OfflineDraft> {
  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const siteId = idOf(bundle.content.site)
  const baseRevisionId = input.baseRevisionId ?? (idOf(bundle.article.currentRevision) || null)
  const baseDocumentHash = input.baseDocumentHash ?? String(bundle.article.documentHash)
  const inserted = await poolOf(payload).query(
    `INSERT INTO offline_drafts
       (site_id, article_id, device_id, base_revision_id, base_document_hash,
        document, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,'local-only',$7)
     RETURNING ${DRAFT_COLUMNS}`,
    [
      siteId,
      input.articleId,
      input.deviceId,
      baseRevisionId,
      baseDocumentHash,
      JSON.stringify(input.document),
      input.actor.id,
    ],
  )
  return toDraft(inserted.rows[0])
}

export async function getOfflineDraft(
  payload: Payload,
  draftId: string,
): Promise<OfflineDraft | null> {
  const result = await poolOf(payload).query(
    `SELECT ${DRAFT_COLUMNS} FROM offline_drafts WHERE id = $1`,
    [draftId],
  )
  return result.rows[0] ? toDraft(result.rows[0]) : null
}

export async function listOfflineDrafts(
  payload: Payload,
  articleId: string,
): Promise<OfflineDraft[]> {
  const result = await poolOf(payload).query(
    `SELECT ${DRAFT_COLUMNS} FROM offline_drafts
     WHERE article_id = $1 ORDER BY created_at ASC`,
    [articleId],
  )
  return result.rows.map(toDraft)
}

async function recordMutation(
  payload: Payload,
  input: {
    siteId: string
    articleId: string
    draftId: string
    idempotencyKey: string
    baseDocumentHash: string
    mutationType: ClientMutation['mutationType']
    status: ClientMutation['status']
    resultRevisionId?: string | null
    actorId: string
  },
): Promise<ClientMutation> {
  const inserted = await poolOf(payload).query(
    `INSERT INTO client_mutations
       (site_id, article_id, offline_draft_id, idempotency_key,
        base_document_hash, mutation_type, status, result_revision_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING ${MUTATION_COLUMNS}`,
    [
      input.siteId,
      input.articleId,
      input.draftId,
      input.idempotencyKey,
      input.baseDocumentHash,
      input.mutationType,
      input.status,
      input.resultRevisionId ?? null,
      input.actorId,
    ],
  )
  return toMutation(inserted.rows[0])
}

async function findMutationByKey(
  payload: Payload,
  idempotencyKey: string,
): Promise<ClientMutation | null> {
  const result = await poolOf(payload).query(
    `SELECT ${MUTATION_COLUMNS} FROM client_mutations WHERE idempotency_key = $1`,
    [idempotencyKey],
  )
  return result.rows[0] ? toMutation(result.rows[0]) : null
}

async function setDraftState(
  payload: Payload,
  draftId: string,
  status: OfflineDraft['status'],
  patch?: { baseRevisionId?: string; baseDocumentHash?: string; document?: RichTextDocument },
): Promise<void> {
  await poolOf(payload).query(
    `UPDATE offline_drafts
       SET status = $2,
           base_revision_id = COALESCE($3, base_revision_id),
           base_document_hash = COALESCE($4, base_document_hash),
           document = COALESCE($5::jsonb, document),
           updated_at = now()
     WHERE id = $1`,
    [
      draftId,
      status,
      patch?.baseRevisionId ?? null,
      patch?.baseDocumentHash ?? null,
      patch?.document ? JSON.stringify(patch.document) : null,
    ],
  )
}

/**
 * Submit a queued client mutation. Idempotent by key: a replay
 * returns the recorded mutation without re-applying. A base mismatch
 * (the server moved while the client was offline) records a
 * 'conflicted' mutation and leaves server content untouched.
 */
export async function submitOfflineMutation(
  payload: Payload,
  input: {
    draftId: string
    mutationType: 'save-draft' | 'submit-review'
    idempotencyKey: string
    actor: EditorialActor
    actorUserId?: string | null
    now?: string
  },
): Promise<ClientMutation> {
  if (!input.idempotencyKey)
    throw new OfflineDraftError(
      'OFFLINE_IDEMPOTENCY_KEY_REQUIRED',
      'An idempotency key is required to submit a mutation.',
    )
  const existing = await findMutationByKey(payload, input.idempotencyKey)
  if (existing) return existing

  const draftRow = await loadDraftRow(payload, input.draftId)
  const draft = toDraft(draftRow)
  if (draft.status === 'discarded')
    throw new OfflineDraftError(
      'OFFLINE_DRAFT_DISCARDED',
      'A discarded offline draft cannot be submitted.',
    )
  const bundle = await loadBundleByArticleId(payload, String(draft.articleId))
  const siteId = idOf(bundle.content.site)
  const currentRevisionId = idOf(bundle.article.currentRevision)

  if ((draft.baseRevisionId ?? null) !== (currentRevisionId || null)) {
    await setDraftState(payload, input.draftId, 'conflicted')
    return recordMutation(payload, {
      siteId,
      articleId: String(draft.articleId),
      draftId: input.draftId,
      idempotencyKey: input.idempotencyKey,
      baseDocumentHash: draft.baseDocumentHash,
      mutationType: input.mutationType,
      status: 'conflicted',
      actorId: input.actor.id,
    })
  }

  try {
    await saveEditorialDraft(payload, {
      articleId: String(draft.articleId),
      actor: input.actor,
      actorUserId: input.actorUserId ?? null,
      document: draft.document,
      baseRevisionId: currentRevisionId,
      mutationId: input.idempotencyKey,
      now: input.now,
    })
    if (input.mutationType === 'submit-review') {
      await requestEditorialReview(payload, {
        articleId: String(draft.articleId),
        actor: input.actor,
        actorUserId: input.actorUserId ?? null,
        now: input.now,
      })
    }
  } catch (error) {
    if (error instanceof EditorialConflictError) {
      await setDraftState(payload, input.draftId, 'conflicted')
      return recordMutation(payload, {
        siteId,
        articleId: String(draft.articleId),
        draftId: input.draftId,
        idempotencyKey: input.idempotencyKey,
        baseDocumentHash: draft.baseDocumentHash,
        mutationType: input.mutationType,
        status: 'conflicted',
        actorId: input.actor.id,
      })
    }
    throw error
  }

  const after = await loadBundleByArticleId(payload, String(draft.articleId))
  const newRevisionId = idOf(after.article.currentRevision)
  await setDraftState(payload, input.draftId, 'submitted', {
    baseRevisionId: newRevisionId,
    baseDocumentHash: String(after.article.documentHash),
  })
  return recordMutation(payload, {
    siteId,
    articleId: String(draft.articleId),
    draftId: input.draftId,
    idempotencyKey: input.idempotencyKey,
    baseDocumentHash: draft.baseDocumentHash,
    mutationType: input.mutationType,
    status: 'accepted',
    resultRevisionId: newRevisionId,
    actorId: input.actor.id,
  })
}

/**
 * Resolve a conflicted draft. 'keep-mine' re-bases the local document
 * onto the current server revision and saves it as a new draft
 * revision (recorded as a 'resolve-conflict' mutation);
 * 'take-server' discards the local document and re-bases the draft
 * onto the server's current document.
 */
export async function resolveOfflineConflict(
  payload: Payload,
  input: {
    draftId: string
    strategy: 'keep-mine' | 'take-server'
    idempotencyKey: string
    actor: EditorialActor
    actorUserId?: string | null
    now?: string
  },
): Promise<ClientMutation> {
  if (!input.idempotencyKey)
    throw new OfflineDraftError(
      'OFFLINE_IDEMPOTENCY_KEY_REQUIRED',
      'An idempotency key is required to resolve a conflict.',
    )
  const existing = await findMutationByKey(payload, input.idempotencyKey)
  if (existing) return existing

  const draftRow = await loadDraftRow(payload, input.draftId)
  const draft = toDraft(draftRow)
  if (draft.status !== 'conflicted')
    throw new OfflineDraftError(
      'OFFLINE_DRAFT_NOT_CONFLICTED',
      'Only a conflicted offline draft can be resolved.',
    )
  const bundle = await loadBundleByArticleId(payload, String(draft.articleId))
  const siteId = idOf(bundle.content.site)
  const currentRevisionId = idOf(bundle.article.currentRevision)

  if (input.strategy === 'take-server') {
    await setDraftState(payload, input.draftId, 'discarded', {
      baseRevisionId: currentRevisionId,
      baseDocumentHash: String(bundle.article.documentHash),
      document: bundle.article.document as RichTextDocument,
    })
    return recordMutation(payload, {
      siteId,
      articleId: String(draft.articleId),
      draftId: input.draftId,
      idempotencyKey: input.idempotencyKey,
      baseDocumentHash: draft.baseDocumentHash,
      mutationType: 'resolve-conflict',
      status: 'accepted',
      resultRevisionId: currentRevisionId,
      actorId: input.actor.id,
    })
  }

  await saveEditorialDraft(payload, {
    articleId: String(draft.articleId),
    actor: input.actor,
    actorUserId: input.actorUserId ?? null,
    document: draft.document,
    baseRevisionId: currentRevisionId,
    mutationId: input.idempotencyKey,
    now: input.now,
  })
  const after = await loadBundleByArticleId(payload, String(draft.articleId))
  const newRevisionId = idOf(after.article.currentRevision)
  await setDraftState(payload, input.draftId, 'submitted', {
    baseRevisionId: newRevisionId,
    baseDocumentHash: String(after.article.documentHash),
  })
  return recordMutation(payload, {
    siteId,
    articleId: String(draft.articleId),
    draftId: input.draftId,
    idempotencyKey: input.idempotencyKey,
    baseDocumentHash: draft.baseDocumentHash,
    mutationType: 'resolve-conflict',
    status: 'accepted',
    resultRevisionId: newRevisionId,
    actorId: input.actor.id,
  })
}

export async function discardOfflineDraft(
  payload: Payload,
  draftId: string,
): Promise<OfflineDraft> {
  await loadDraftRow(payload, draftId)
  await setDraftState(payload, draftId, 'discarded')
  return (await getOfflineDraft(payload, draftId)) as OfflineDraft
}
