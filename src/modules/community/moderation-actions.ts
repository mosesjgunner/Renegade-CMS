import type { Payload } from 'payload'

export const moderationActions = ['no_action', 'warn', 'quarantine', 'remove', 'lock_thread', 'suspend_posting', 'ban_member'] as const
export const moderationScopes = ['object', 'space', 'site_global'] as const
export type ModerationAction = typeof moderationActions[number]
export type ModerationScope = typeof moderationScopes[number]
type Query = <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>
type Client = { query: Query; release?: () => void }
type DbPayload = Payload & { db: { pool?: { connect?: () => Promise<Client> } } }

export class ModerationActionError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message) }
}

async function transaction<T>(payload: Payload, work: (query: Query) => Promise<T>) {
  const client = await (payload as DbPayload).db.pool?.connect?.()
  if (!client) throw new ModerationActionError('Moderation requires transactional database access.', 503, 'MODERATION_DB_UNAVAILABLE')
  try { await client.query('BEGIN'); const result = await work(client.query.bind(client)); await client.query('COMMIT'); return result }
  catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release?.() }
}

type Input = { siteId: string; caseId: string; actorMemberId: string; targetType: string; targetId: string; action: ModerationAction; scope: ModerationScope; scopeId?: string | null; reason: string; expiresAt?: string | null; details?: Record<string, unknown> }
type Target = { authorId?: string; spaceId?: string; threadId?: string }
type StoredAction = { id: string; siteId: string; caseId: string; actorMemberId: string | null; targetType: string; targetId: string; action: ModerationAction; scope: ModerationScope; scopeId: string | null; expiresAt: string | null; reason: string; details: Record<string, unknown> }
async function audit(query: Query, siteId: string, eventType: string, eventPayload: Record<string, unknown>) {
  // The DB trigger serializes writers and derives both hashes; callers can never supply a chain link.
  await query('INSERT INTO community_audit_log (site_id,event_type,event_payload,record_hash) VALUES ($1,$2,$3::jsonb,$4)', [siteId, eventType, JSON.stringify(eventPayload), 'trigger-derived'])
}

/** Database-side verification avoids JSON serialization drift between PostgreSQL jsonb and Node. */
export async function verifyCommunityAuditChain(payload: Payload, siteId: string) {
  const pool = (payload as DbPayload).db.pool
  const query = pool?.query?.bind(pool) as Query | undefined
  if (!query) throw new ModerationActionError('Audit verification requires database access.', 503, 'MODERATION_DB_UNAVAILABLE')
  const result = await query<{ valid: boolean }>(`WITH ordered AS (
    SELECT *, lag(record_hash) OVER (ORDER BY created_at, id) AS expected_previous
    FROM community_audit_log WHERE site_id=$1
  ) SELECT NOT EXISTS (SELECT 1 FROM ordered WHERE previous_hash IS DISTINCT FROM expected_previous
    OR record_hash <> encode(digest(coalesce(previous_hash, '') || event_type || event_payload::text, 'sha256'), 'hex')) AS valid`, [siteId])
  return Boolean(result.rows[0]?.valid)
}
async function target(query: Query, input: Input): Promise<Target> {
  const sql: Record<string, string> = {
    comment: 'SELECT c.author_id AS "authorId", c.thread_id AS "threadId" FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE c.id=$1 AND t.site_id=$2',
    forum_post: 'SELECT p.author_id AS "authorId", t.space_id AS "spaceId" FROM forum_posts p JOIN forum_topics t ON t.id=p.topic_id WHERE p.id=$1 AND t.site_id=$2',
    forum_topic: 'SELECT author_id AS "authorId", space_id AS "spaceId" FROM forum_topics WHERE id=$1 AND site_id=$2',
    member_profile: 'SELECT p.member_id AS "authorId" FROM profiles p JOIN member_site_roles r ON r.member_id=p.member_id WHERE p.id=$1 AND r.site_id=$2',
  }
  const row = sql[input.targetType] ? (await query<Target>(sql[input.targetType], [input.targetId, input.siteId])).rows[0] : undefined
  if (!row) throw new ModerationActionError('Moderation target not found.', 404, 'MODERATION_TARGET_NOT_FOUND')
  return row
}
function validate(input: Input) {
  if (!moderationActions.includes(input.action)) throw new ModerationActionError('Unsupported moderation action.', 422, 'INVALID_MODERATION_ACTION')
  if (!moderationScopes.includes(input.scope)) throw new ModerationActionError('Unsupported moderation scope.', 422, 'INVALID_MODERATION_SCOPE')
  if (!input.reason.trim()) throw new ModerationActionError('A moderation reason is required.', 422, 'MODERATION_REASON_REQUIRED')
  if ((input.scope === 'site_global') !== !input.scopeId) throw new ModerationActionError('Scope identifier does not match scope.', 422, 'INVALID_MODERATION_SCOPE')
  if (input.expiresAt && Number.isNaN(Date.parse(input.expiresAt))) throw new ModerationActionError('Invalid sanction expiry.', 422, 'INVALID_SANCTION_EXPIRY')
}
async function invalidateAfterQuarantine() { try { const { revalidatePath } = await import('next/cache.js'); revalidatePath('/', 'layout'); revalidatePath('/search', 'page') } catch {} }

/** The only write path for COMM-05B decisions: mutation, audit, sanction and outbox share one transaction. */
export async function applyModerationAction(payload: Payload, input: Input) {
  validate(input)
  const result = await transaction(payload, async query => {
    const currentCase = (await query<{ id: string }>('SELECT id FROM moderation_cases WHERE id=$1 AND site_id=$2 FOR UPDATE', [input.caseId, input.siteId])).rows[0]
    if (!currentCase) throw new ModerationActionError('Moderation case not found.', 404, 'MODERATION_CASE_NOT_FOUND')
    const item = await target(query, input)
    if (input.scope === 'space' && input.scopeId !== item.spaceId) throw new ModerationActionError('Target is outside the moderation space.', 422, 'MODERATION_SCOPE_TARGET_MISMATCH')
    if (input.action === 'lock_thread') {
      if (input.targetType === 'comment') await query('UPDATE comment_threads SET is_closed=true, updated_at=now() WHERE id=$1', [item.threadId])
      else if (input.targetType === 'forum_topic') await query('UPDATE forum_topics SET is_locked=true, updated_at=now() WHERE id=$1 AND site_id=$2', [input.targetId, input.siteId])
      else throw new ModerationActionError('lock_thread applies to comments or forum topics.', 422, 'INVALID_ACTION_TARGET')
    }
    if (input.action === 'quarantine' || input.action === 'remove') {
      if (input.targetType === 'comment') await query("UPDATE comments SET status=$1, updated_at=now() WHERE id=$2", [input.action === 'remove' ? 'deleted' : 'rejected', input.targetId])
      else if (input.targetType === 'forum_post') await query('UPDATE forum_posts SET is_quarantined=true, updated_at=now() WHERE id=$1', [input.targetId])
      else if (input.targetType === 'forum_topic') await query('UPDATE forum_topics SET is_quarantined=true, updated_at=now() WHERE id=$1 AND site_id=$2', [input.targetId, input.siteId])
      else throw new ModerationActionError('This target cannot be quarantined.', 422, 'INVALID_ACTION_TARGET')
      await query('DELETE FROM search_documents WHERE site_id=$1 AND canonical_id=$2', [input.siteId, input.targetId]).catch(() => ({ rows: [] }))
    }
    const action = (await query<{ id: string }>(`INSERT INTO moderation_actions (site_id,case_id,actor,actor_member_id,target_type,target_id,action,scope,scope_id,expires_at,reason,details)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING id`, [input.siteId,input.caseId,`member:${input.actorMemberId}`,input.actorMemberId,input.targetType,input.targetId,input.action,input.scope,input.scopeId ?? null,input.expiresAt ?? null,input.reason.trim(),JSON.stringify(input.details ?? {})])).rows[0]!
    if (input.action === 'suspend_posting' || input.action === 'ban_member') {
      if (!item.authorId) throw new ModerationActionError('Sanction target has no member.', 422, 'INVALID_SANCTION_TARGET')
      await query(`INSERT INTO member_sanctions (site_id,member_id,action_id,sanction_type,scope,scope_id,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [input.siteId,item.authorId,action.id,input.action,input.scope,input.scopeId ?? null,input.expiresAt ?? null])
    }
    await query(`INSERT INTO outbox_events (event_type,payload,idempotency_key,created_at) VALUES ('moderation.action.v1',$1::jsonb,$2,now())`, [JSON.stringify({ version: 1, site_id: input.siteId, case_id: input.caseId, action_id: action.id, target_type: input.targetType, target_id: input.targetId, action: input.action, scope: input.scope, scope_id: input.scopeId ?? null, expires_at: input.expiresAt ?? null }), `moderation.action.v1:${action.id}`])
    await audit(query, input.siteId, 'moderation.action.created.v1', { action_id: action.id, case_id: input.caseId, actor_member_id: input.actorMemberId, target_type: input.targetType, target_id: input.targetId, action: input.action })
    return { actionId: action.id }
  })
  if (input.action === 'quarantine' || input.action === 'remove') await invalidateAfterQuarantine()
  return result
}

export async function createModerationAppeal(payload: Payload, input: { siteId: string; moderationActionId: string; appellantMemberId: string; reason: string }) {
  if (!input.reason.trim()) throw new ModerationActionError('An appeal reason is required.', 422, 'APPEAL_REASON_REQUIRED')
  return transaction(payload, async query => {
    const action = (await query<StoredAction>(`SELECT id, site_id AS "siteId", case_id AS "caseId", actor_member_id AS "actorMemberId", target_type AS "targetType", target_id AS "targetId", action, scope, scope_id AS "scopeId", expires_at AS "expiresAt", reason, details FROM moderation_actions WHERE id=$1 AND site_id=$2 FOR UPDATE`, [input.moderationActionId, input.siteId])).rows[0]
    if (!action) throw new ModerationActionError('Moderation action not found.', 404, 'MODERATION_ACTION_NOT_FOUND')
    const item = await target(query, { siteId: input.siteId, caseId: action.caseId, actorMemberId: input.appellantMemberId, targetType: action.targetType, targetId: action.targetId, action: action.action, scope: action.scope, scopeId: action.scopeId, reason: action.reason })
    if (item.authorId !== input.appellantMemberId) throw new ModerationActionError('Only the affected member may appeal this action.', 403, 'APPEAL_NOT_AFFECTED_MEMBER')
    const existing = (await query<{ id: string; status: string }>('SELECT id,status FROM moderation_appeals WHERE moderation_action_id=$1 FOR UPDATE', [action.id])).rows[0]
    if (existing) throw new ModerationActionError(existing.status === 'pending' ? 'A pending appeal already exists.' : 'This moderation action has already been appealed.', 409, existing.status === 'pending' ? 'DUPLICATE_PENDING_APPEAL' : 'APPEAL_ALREADY_EXISTS')
    const appeal = (await query<{ id: string }>('INSERT INTO moderation_appeals (site_id,moderation_action_id,appellant_member_id,reason) VALUES ($1,$2,$3,$4) RETURNING id', [input.siteId, action.id, input.appellantMemberId, input.reason.trim()])).rows[0]!
    await audit(query, input.siteId, 'moderation.appeal.created.v1', { appeal_id: appeal.id, action_id: action.id, appellant_member_id: input.appellantMemberId })
    return { appealId: appeal.id }
  })
}

async function restoreReversedEffect(query: Query, action: StoredAction) {
  if (action.action === 'quarantine' || action.action === 'remove') {
    if (action.targetType === 'comment') await query("UPDATE comments SET status='visible', updated_at=now() WHERE id=$1", [action.targetId])
    if (action.targetType === 'forum_post') await query('UPDATE forum_posts SET is_quarantined=false WHERE id=$1', [action.targetId])
    if (action.targetType === 'forum_topic') await query('UPDATE forum_topics SET is_quarantined=false, updated_at=now() WHERE id=$1 AND site_id=$2', [action.targetId, action.siteId])
  }
  if (action.action === 'lock_thread') {
    const item = await target(query, { siteId: action.siteId, caseId: action.caseId, actorMemberId: action.actorMemberId ?? '', targetType: action.targetType, targetId: action.targetId, action: action.action, scope: action.scope, scopeId: action.scopeId, reason: action.reason })
    if (action.targetType === 'comment') await query('UPDATE comment_threads SET is_closed=false, updated_at=now() WHERE id=$1', [item.threadId])
    if (action.targetType === 'forum_topic') await query('UPDATE forum_topics SET is_locked=false, updated_at=now() WHERE id=$1 AND site_id=$2', [action.targetId, action.siteId])
  }
  if (action.action === 'suspend_posting' || action.action === 'ban_member') await query('UPDATE member_sanctions SET revoked_at=now() WHERE action_id=$1 AND revoked_at IS NULL', [action.id])
}

export async function reviewModerationAppeal(payload: Payload, input: { siteId: string; appealId: string; reviewerMemberId: string; decision: 'accepted' | 'rejected'; reason: string }) {
  if (!['accepted', 'rejected'].includes(input.decision)) throw new ModerationActionError('Invalid appeal decision.', 422, 'INVALID_APPEAL_DECISION')
  if (!input.reason.trim()) throw new ModerationActionError('A decision reason is required.', 422, 'APPEAL_DECISION_REASON_REQUIRED')
  const result = await transaction(payload, async query => {
    const appeal = (await query<{ id: string; actionId: string; status: string }>('SELECT id,moderation_action_id AS "actionId",status FROM moderation_appeals WHERE id=$1 AND site_id=$2 FOR UPDATE', [input.appealId, input.siteId])).rows[0]
    if (!appeal) throw new ModerationActionError('Appeal not found.', 404, 'APPEAL_NOT_FOUND')
    if (appeal.status !== 'pending') throw new ModerationActionError('Appeal has already been reviewed.', 409, 'APPEAL_ALREADY_REVIEWED')
    const action = (await query<StoredAction>(`SELECT id,site_id AS "siteId",case_id AS "caseId",actor_member_id AS "actorMemberId",target_type AS "targetType",target_id AS "targetId",action,scope,scope_id AS "scopeId",expires_at AS "expiresAt",reason,details FROM moderation_actions WHERE id=$1 AND site_id=$2 FOR UPDATE`, [appeal.actionId, input.siteId])).rows[0]
    if (!action) throw new ModerationActionError('Moderation action not found.', 404, 'MODERATION_ACTION_NOT_FOUND')
    const alternative = (await query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM member_site_roles WHERE site_id=$1 AND member_id <> $2 AND role IN ('moderator','community-manager')) AS exists`, [input.siteId, action.actorMemberId ?? ''])).rows[0]?.exists
    if (action.actorMemberId === input.reviewerMemberId && alternative) throw new ModerationActionError('The original moderator cannot review this appeal while another qualified moderator exists.', 403, 'ORIGINAL_MODERATOR_REVIEW_FORBIDDEN')
    let reversalActionId: string | null = null
    if (input.decision === 'accepted') {
      await restoreReversedEffect(query, action)
      const reversal = (await query<{ id: string }>(`INSERT INTO moderation_actions (site_id,case_id,actor,actor_member_id,target_type,target_id,action,scope,scope_id,reason,details) VALUES ($1,$2,$3,$4,$5,$6,'reversal',$7,$8,$9,$10::jsonb) RETURNING id`, [input.siteId, action.caseId, `member:${input.reviewerMemberId}`, input.reviewerMemberId, action.targetType, action.targetId, action.scope, action.scopeId, input.reason.trim(), JSON.stringify({ reversed_action_id: action.id })])).rows[0]!
      reversalActionId = reversal.id
      await query(`INSERT INTO outbox_events (event_type,payload,idempotency_key,created_at) VALUES ('moderation.reversal.v1',$1::jsonb,$2,now())`, [JSON.stringify({ version: 1, site_id: input.siteId, appeal_id: appeal.id, reversal_action_id: reversal.id, reversed_action_id: action.id, target_type: action.targetType, target_id: action.targetId }), `moderation.reversal.v1:${reversal.id}`])
      await query(`INSERT INTO outbox_events (event_type,payload,idempotency_key,created_at) VALUES ('search.rehydrate.v1',$1::jsonb,$2,now())`, [JSON.stringify({ version: 1, site_id: input.siteId, canonical_id: action.targetId, source: 'moderation_reversal' }), `search.rehydrate.v1:moderation-reversal:${reversal.id}`]).catch(() => ({ rows: [] }))
    }
    await query('UPDATE moderation_appeals SET status=$1,reviewed_by_member_id=$2,reviewed_at=now(),decision_reason=$3,reversal_action_id=$4 WHERE id=$5', [input.decision, input.reviewerMemberId, input.reason.trim(), reversalActionId, appeal.id])
    await audit(query, input.siteId, 'moderation.appeal.reviewed.v1', { appeal_id: appeal.id, action_id: action.id, reviewer_member_id: input.reviewerMemberId, decision: input.decision, reversal_action_id: reversalActionId })
    return { appealId: appeal.id, reversalActionId }
  })
  if (input.decision === 'accepted') await invalidateAfterQuarantine()
  return result
}

/** Must be called by every member-originated creation endpoint. Expiry is evaluated in SQL, never by a stale session claim. */
export async function assertMemberCanPost(payload: Payload, input: { siteId: string; memberId: string; spaceId?: string; objectId?: string }) {
  const db = payload as DbPayload
  const pool = db.db?.pool
  const query = pool?.query
    ? pool.query.bind(pool) as Query
    : pool?.connect ? async <T>(text: string, values?: unknown[]) => { const c = await pool.connect!(); try { return await c.query<T>(text, values) } finally { c.release?.() } } : undefined
  if (!query) throw new ModerationActionError('Sanction enforcement requires database access.', 503, 'MODERATION_DB_UNAVAILABLE')
  const blocked = (await query<{ id: string }>(`SELECT id FROM member_sanctions WHERE site_id=$1 AND member_id=$2 AND revoked_at IS NULL AND starts_at <= now() AND (expires_at IS NULL OR expires_at > now()) AND (scope='site_global' OR (scope='space' AND scope_id=$3) OR (scope='object' AND scope_id=$4)) LIMIT 1`, [input.siteId,input.memberId,input.spaceId ?? null,input.objectId ?? null])).rows[0]
  if (blocked) throw new ModerationActionError('Posting is suspended by moderation.', 403, 'MEMBER_POSTING_SUSPENDED')
}
