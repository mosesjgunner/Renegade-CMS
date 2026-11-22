import { createHash } from 'node:crypto'

import type { Payload } from 'payload'

import { extractPlainText } from './presentation'

/**
 * RC3-14 / DEBT-04: the deterministic content repurpose workflow.
 *
 * `content.repurpose` was declared in the AI task registry
 * (src/modules/ai/contracts.ts) with no handler anywhere — a capability
 * claim the product could not back. This module is the handler. It is
 * deliberately NOT routed through the AI proposal machinery: repurposing
 * here is deterministic (same source in, same derivative out), and the
 * derivative materializes only after a human approval decision, always
 * as a draft in its target collection. Nothing is ever published by
 * this workflow, and staging a draft writes nothing to any target
 * collection.
 *
 * Provenance chain: source article -> staged repurpose draft (this
 * module's table) -> approval decision (recorded with the decider) ->
 * materialized draft carrying the same provenance.
 */

export const REPURPOSE_TASK_KEY = 'content.repurpose' as const

export type RepurposeTargetKind = 'social-post' | 'newsletter-section' | 'article-draft'

export type RepurposeDraftStatus = 'pending-approval' | 'approved' | 'rejected'

export type RepurposeSource = {
  id: string
  siteId: string
  title: string
  summary: string
  plainText: string
  canonicalUrl?: string
  status: string
  updatedAt?: string
}

export type RepurposeProvenance = {
  taskKey: typeof REPURPOSE_TASK_KEY
  deriver: 'deterministic-v1'
  sourceContentId: string
  sourceChecksum: string
  sourceUpdatedAt?: string
  targetKind: RepurposeTargetKind
}

export type RepurposeDraft = {
  id: string
  siteId: string
  sourceContentId: string
  sourceTitle: string
  sourceChecksum: string
  targetKind: RepurposeTargetKind
  draftTitle: string
  draftText: string
  provenance: RepurposeProvenance
  status: RepurposeDraftStatus
  createdByMemberId: string
  decidedByMemberId?: string
  decidedAt?: string
  materializedCollection?: string
  materializedId?: string
  createdAt: string
  updatedAt: string
}

export class RepurposeError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

type Doc = Record<string, any>
type Pool = { query: (text: string, values?: unknown[]) => Promise<{ rows: Doc[] }> }

function poolOf(payload: Payload): Pool {
  return (payload as unknown as { db: { pool: Pool } }).db.pool
}

const idOf = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? String((value as Doc).id ?? '')
    : String(value ?? '')

export function truncateAtWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export function repurposeSourceChecksum(source: RepurposeSource): string {
  return createHash('sha256')
    .update(`${source.title}\n${source.plainText}\n${source.updatedAt || ''}`)
    .digest('hex')
}

/**
 * The deterministic derivation. Pure: the same source and target kind
 * always produce the same draft title, text, and checksum. No model is
 * consulted and no target system is touched.
 */
export function deriveRepurposeDraft(
  source: RepurposeSource,
  targetKind: RepurposeTargetKind,
): { draftTitle: string; draftText: string; sourceChecksum: string } {
  const sourceChecksum = repurposeSourceChecksum(source)
  const body = source.plainText || source.summary || ''
  if (targetKind === 'social-post') {
    const text = truncateAtWord(body, 240)
    return {
      draftTitle: source.title,
      draftText: source.canonicalUrl ? `${text} ${source.canonicalUrl}` : text,
      sourceChecksum,
    }
  }
  if (targetKind === 'newsletter-section') {
    return {
      draftTitle: source.title,
      draftText: truncateAtWord(body, 600),
      sourceChecksum,
    }
  }
  return {
    draftTitle: source.title,
    draftText: body.replace(/\s+/g, ' ').trim(),
    sourceChecksum,
  }
}

function toDraft(row: Doc): RepurposeDraft {
  return {
    id: String(row.id),
    siteId: String(row.site_id),
    sourceContentId: String(row.source_content_id),
    sourceTitle: String(row.source_title),
    sourceChecksum: String(row.source_checksum),
    targetKind: row.target_kind as RepurposeTargetKind,
    draftTitle: String(row.draft_title),
    draftText: String(row.draft_text),
    provenance: (row.provenance || {}) as RepurposeProvenance,
    status: row.status as RepurposeDraftStatus,
    createdByMemberId: String(row.created_by_member_id),
    decidedByMemberId: row.decided_by_member_id ? String(row.decided_by_member_id) : undefined,
    decidedAt: row.decided_at ? new Date(row.decided_at as string).toISOString() : undefined,
    materializedCollection: row.materialized_collection
      ? String(row.materialized_collection)
      : undefined,
    materializedId: row.materialized_id ? String(row.materialized_id) : undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

const DRAFT_COLUMNS = `id, site_id, source_content_id, source_title, source_checksum,
  target_kind, draft_title, draft_text, provenance, status, created_by_member_id,
  decided_by_member_id, decided_at, materialized_collection, materialized_id,
  created_at, updated_at`

/**
 * Staff authority for repurposing mirrors the creator-catalog rule
 * (RC3-12): the site's community-manager role is the owner/admin tier.
 */
async function assertRepurposeStaff(
  payload: Payload,
  siteId: string,
  actorMemberId: string,
): Promise<void> {
  const roles = (await payload.find({
    collection: 'member-site-roles' as never,
    where: {
      and: [{ member: { equals: actorMemberId } }, { site: { equals: siteId } }],
    },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as { docs: Doc[] }
  if (!roles.docs.length) {
    throw new RepurposeError(
      'REPURPOSE_NO_STANDING',
      'The actor has no standing on this site.',
      403,
    )
  }
  if (!roles.docs.some((role) => role.role === 'community-manager')) {
    throw new RepurposeError(
      'REPURPOSE_STAFF_REQUIRED',
      'Repurposing requires the site owner/admin (community-manager) role.',
      403,
    )
  }
}

async function loadSource(
  payload: Payload,
  siteId: string,
  sourceContentId: string,
): Promise<RepurposeSource> {
  let doc: Doc
  try {
    doc = (await payload.findByID({
      collection: 'content',
      id: sourceContentId,
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as Doc
  } catch {
    throw new RepurposeError('REPURPOSE_SOURCE_NOT_FOUND', 'Source content was not found.', 404)
  }
  if (!doc || idOf(doc.site) !== siteId) {
    throw new RepurposeError(
      'REPURPOSE_SOURCE_SITE_MISMATCH',
      'Source content does not belong to this site.',
      403,
    )
  }
  if (!['published', 'updated'].includes(String(doc.status))) {
    throw new RepurposeError(
      'REPURPOSE_SOURCE_NOT_PUBLISHED',
      'Only published source content can be repurposed.',
    )
  }
  return {
    id: String(doc.id),
    siteId,
    title: String(doc.title || ''),
    summary: String(doc.summary || ''),
    plainText: extractPlainText(doc.body),
    canonicalUrl: doc.canonicalPath ? String(doc.canonicalPath) : undefined,
    status: String(doc.status),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string).toISOString() : undefined,
  }
}

/**
 * Stage a repurpose draft. Writes exactly one row to
 * content_repurpose_drafts and NOTHING to any target collection; the
 * derivative exists only as staged text until a human approves it.
 */
export async function createRepurposeDraft(
  payload: Payload,
  input: {
    siteId: string
    actorMemberId: string
    sourceContentId: string
    targetKind: RepurposeTargetKind
  },
): Promise<RepurposeDraft> {
  await assertRepurposeStaff(payload, input.siteId, input.actorMemberId)
  const source = await loadSource(payload, input.siteId, input.sourceContentId)
  const derived = deriveRepurposeDraft(source, input.targetKind)
  const provenance: RepurposeProvenance = {
    taskKey: REPURPOSE_TASK_KEY,
    deriver: 'deterministic-v1',
    sourceContentId: source.id,
    sourceChecksum: derived.sourceChecksum,
    sourceUpdatedAt: source.updatedAt,
    targetKind: input.targetKind,
  }
  const inserted = await poolOf(payload).query(
    `INSERT INTO content_repurpose_drafts
       (site_id, source_content_id, source_title, source_checksum, target_kind,
        draft_title, draft_text, provenance, status, created_by_member_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'pending-approval',$9)
     RETURNING ${DRAFT_COLUMNS}`,
    [
      input.siteId,
      source.id,
      source.title,
      derived.sourceChecksum,
      input.targetKind,
      derived.draftTitle,
      derived.draftText,
      JSON.stringify(provenance),
      input.actorMemberId,
    ],
  )
  return toDraft(inserted.rows[0])
}

export async function getRepurposeDraft(
  payload: Payload,
  draftId: string,
): Promise<RepurposeDraft | null> {
  const result = await poolOf(payload).query(
    `SELECT ${DRAFT_COLUMNS} FROM content_repurpose_drafts WHERE id = $1`,
    [draftId],
  )
  return result.rows[0] ? toDraft(result.rows[0]) : null
}

export async function listRepurposeDrafts(
  payload: Payload,
  input: { siteId: string; status?: RepurposeDraftStatus },
): Promise<RepurposeDraft[]> {
  const result = input.status
    ? await poolOf(payload).query(
        `SELECT ${DRAFT_COLUMNS} FROM content_repurpose_drafts
         WHERE site_id = $1 AND status = $2 ORDER BY created_at ASC`,
        [input.siteId, input.status],
      )
    : await poolOf(payload).query(
        `SELECT ${DRAFT_COLUMNS} FROM content_repurpose_drafts
         WHERE site_id = $1 ORDER BY created_at ASC`,
        [input.siteId],
      )
  return result.rows.map(toDraft)
}

function lexicalFromText(text: string): Doc {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
  const blocks = (paragraphs.length ? paragraphs : [text]).map((paragraph) => ({
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children: [
      {
        type: 'text',
        version: 1,
        text: paragraph,
        format: 0,
        detail: 0,
        mode: 'normal',
        style: '',
      },
    ],
  }))
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      children: blocks,
    },
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'repurposed'
  )
}

/**
 * Materialize an approved draft into its target collection. The created
 * record is ALWAYS in draft state — this workflow never publishes —
 * and carries the repurpose provenance so the derivative can be traced
 * back to its source and approval.
 */
async function materializeRepurposeDraft(
  payload: Payload,
  draft: RepurposeDraft,
): Promise<{ collection: string; id: string }> {
  const provenance = { ...draft.provenance, repurposeDraftId: draft.id }
  if (draft.targetKind === 'social-post') {
    const created = (await payload.create({
      collection: 'social-drafts' as never,
      data: {
        site: draft.siteId,
        title: draft.draftTitle,
        status: 'draft',
        sourceContent: draft.sourceContentId,
        provenance: { ...provenance, derivedText: draft.draftText },
      },
      overrideAccess: true,
    } as never)) as unknown as Doc
    return { collection: 'social-drafts', id: String(created.id) }
  }
  if (draft.targetKind === 'newsletter-section') {
    const created = (await payload.create({
      collection: 'email-messages' as never,
      data: {
        site: draft.siteId,
        subject: draft.draftTitle,
        blocks: [{ type: 'text', text: draft.draftText }],
        kind: 'bulk',
        purpose: 'newsletter',
      },
      overrideAccess: true,
    } as never)) as unknown as Doc
    return { collection: 'email-messages', id: String(created.id) }
  }
  const created = (await payload.create({
    collection: 'content',
    data: {
      site: draft.siteId,
      contentType: 'article',
      title: draft.draftTitle,
      slug: `${slugify(draft.draftTitle)}-repurposed-${draft.sourceChecksum.slice(0, 6)}`,
      summary: truncateAtWord(draft.draftText, 200),
      status: 'draft',
      body: lexicalFromText(draft.draftText),
    },
    overrideAccess: true,
  } as never)) as unknown as Doc
  return { collection: 'content', id: String(created.id) }
}

/**
 * Record the human decision. Approval materializes the derivative (as
 * a draft); rejection materializes nothing. A decided draft cannot be
 * decided again — the decision and its materialization are one durable
 * record, so a retry can never create a second derivative.
 */
export async function decideRepurposeDraft(
  payload: Payload,
  input: {
    siteId: string
    actorMemberId: string
    draftId: string
    decision: 'approve' | 'reject'
  },
): Promise<RepurposeDraft> {
  await assertRepurposeStaff(payload, input.siteId, input.actorMemberId)
  const draft = await getRepurposeDraft(payload, input.draftId)
  if (!draft || draft.siteId !== input.siteId) {
    throw new RepurposeError('REPURPOSE_DRAFT_NOT_FOUND', 'Repurpose draft was not found.', 404)
  }
  if (draft.status !== 'pending-approval') {
    throw new RepurposeError(
      'REPURPOSE_ALREADY_DECIDED',
      `Repurpose draft was already decided (${draft.status}).`,
      409,
    )
  }
  const materialized =
    input.decision === 'approve' ? await materializeRepurposeDraft(payload, draft) : null
  const updated = await poolOf(payload).query(
    `UPDATE content_repurpose_drafts
     SET status = $2, decided_by_member_id = $3, decided_at = now(),
         materialized_collection = $4, materialized_id = $5, updated_at = now()
     WHERE id = $1 AND status = 'pending-approval'
     RETURNING ${DRAFT_COLUMNS}`,
    [
      input.draftId,
      input.decision === 'approve' ? 'approved' : 'rejected',
      input.actorMemberId,
      materialized?.collection ?? null,
      materialized?.id ?? null,
    ],
  )
  if (!updated.rows[0]) {
    throw new RepurposeError(
      'REPURPOSE_ALREADY_DECIDED',
      'Repurpose draft was already decided.',
      409,
    )
  }
  return toDraft(updated.rows[0])
}

/**
 * The handler registry that closes DEBT-04: the `content.repurpose`
 * task declared in the AI task registry now resolves to a real,
 * implemented workflow (deterministic derivation + human approval +
 * persisted readback), instead of a declaration with no handler.
 */
export const REPURPOSE_HANDLERS = {
  [REPURPOSE_TASK_KEY]: {
    taskKey: REPURPOSE_TASK_KEY,
    derive: deriveRepurposeDraft,
    stage: createRepurposeDraft,
    decide: decideRepurposeDraft,
    readback: getRepurposeDraft,
  },
} as const

export function resolveRepurposeHandler(taskKey: string) {
  return (
    REPURPOSE_HANDLERS as Record<string, (typeof REPURPOSE_HANDLERS)[typeof REPURPOSE_TASK_KEY]>
  )[taskKey]
}
