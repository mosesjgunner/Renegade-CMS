import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { CommunityError } from './service'

export const moderationTargetTypes = ['comment', 'forum_post', 'forum_topic', 'member_profile', 'message'] as const
export type ModerationTargetType = (typeof moderationTargetTypes)[number]
type Query = <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>
type Client = { query: Query; release?: () => void }
type DbPayload = Payload & { db: { pool?: { connect?: () => Promise<Client> } } }

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const item = value as Record<string, unknown>
  return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${stable(item[key])}`).join(',')}}`
}
export function snapshotHash(snapshot: Record<string, unknown>) { return createHash('sha256').update(stable(snapshot)).digest('hex') }

async function transaction<T>(payload: Payload, work: (query: Query) => Promise<T>): Promise<T> {
  const client = await (payload as DbPayload).db.pool?.connect?.()
  if (!client) throw new CommunityError('Moderation requires transactional database access.', 503, 'MODERATION_DB_UNAVAILABLE')
  try { await client.query('BEGIN'); const result = await work(client.query.bind(client)); await client.query('COMMIT'); return result }
  catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release?.() }
}

const targetSql: Record<ModerationTargetType, string> = {
  comment: `SELECT c.id, c.body_raw AS body, c.body_html AS "bodyHtml", c.status, c.created_at AS "createdAt", c.updated_at AS "updatedAt", c.author_id AS "authorId", t.id AS "threadId", t.canonical_content_id AS "canonicalContentId" FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE c.id=$1 AND t.site_id=$2`,
  forum_post: `SELECT p.id, p.body_raw AS body, p.body_html AS "bodyHtml", p.created_at AS "createdAt", p.updated_at AS "updatedAt", p.author_id AS "authorId", p.sequence_number AS "sequenceNumber", t.id AS "topicId", t.title AS "topicTitle" FROM forum_posts p JOIN forum_topics t ON t.id=p.topic_id WHERE p.id=$1 AND t.site_id=$2`,
  forum_topic: `SELECT t.id, t.title, t.created_at AS "createdAt", t.updated_at AS "updatedAt", t.author_id AS "authorId", t.space_id AS "spaceId", t.is_locked AS "isLocked", t.is_archived AS "isArchived" FROM forum_topics t WHERE t.id=$1 AND t.site_id=$2`,
  member_profile: `SELECT p.id, p.member_id AS "memberId", p.display_name AS "displayName", p.handle, p.bio, p.visibility, p.updated_at AS "updatedAt" FROM profiles p JOIN member_site_roles r ON r.member_id=p.member_id WHERE p.id=$1 AND r.site_id=$2`,
  message: `SELECT m.id, m.body_html AS "bodyHtml", m.sequence_number AS "sequenceNumber", m.created_at AS "createdAt", m.sender_id AS "senderId", m.conversation_id AS "conversationId" FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.site_id=$2`,
}

async function resolveSnapshot(query: Query, siteId: string, type: ModerationTargetType, id: string) {
  const row = (await query<Record<string, unknown>>(targetSql[type], [id, siteId])).rows[0]
  if (!row) throw new CommunityError('Report target not found.', 404, 'REPORT_TARGET_NOT_FOUND')
  // A copy is intentional: evidence must not track later edits or tombstones.
  return JSON.parse(stable({ version: 1, targetType: type, targetId: id, siteId, target: row })) as Record<string, unknown>
}

export async function createCommunityPolicy(payload: Payload, input: { siteId: string; policyKey: string; policy: Record<string, unknown>; actorId?: string }) {
  return transaction(payload, async query => {
    const key = input.policyKey.trim()
    if (!key || key.length > 128) throw new CommunityError('Invalid policy key.', 422, 'INVALID_POLICY_KEY')
    // The lock also covers the first version, where there is no row for FOR UPDATE to lock.
    await query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`policy:${input.siteId}:${key}`])
    const version = Number((await query<{ version: number }>('SELECT COALESCE(MAX(version),0)+1 AS version FROM community_policies WHERE site_id=$1 AND policy_key=$2', [input.siteId, key])).rows[0]?.version ?? 1)
    return (await query<{ id: string; version: number }>('INSERT INTO community_policies (site_id,policy_key,version,policy_payload,created_by_member_id) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id,version', [input.siteId, key, version, JSON.stringify(input.policy), input.actorId ?? null])).rows[0]!
  })
}
export const updateCommunityPolicy = createCommunityPolicy

export async function ingestModerationReport(payload: Payload, input: { siteId: string; reporterId: string; targetType: ModerationTargetType; targetId: string; reason: string; details?: string; policyKey?: string }) {
  if (!moderationTargetTypes.includes(input.targetType)) throw new CommunityError('Unsupported report target.', 422, 'INVALID_REPORT_TARGET')
  if (!input.reason.trim()) throw new CommunityError('A report reason is required.', 422, 'REPORT_REASON_REQUIRED')
  return transaction(payload, async query => {
    const snapshot = await resolveSnapshot(query, input.siteId, input.targetType, input.targetId)
    const hash = snapshotHash(snapshot)
    // Serialize concurrent reports for this exact site/target without making a 24-hour unique index impossible to expire.
    await query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${input.siteId}:${input.targetType}:${input.targetId}`])
    let policy: { id: string; version: number } | undefined
    if (input.policyKey) policy = (await query<{ id: string; version: number }>('SELECT id,version FROM community_policies WHERE site_id=$1 AND policy_key=$2 ORDER BY version DESC LIMIT 1', [input.siteId, input.policyKey])).rows[0]
    let parent = (await query<{ id: string }>(`SELECT id FROM moderation_cases WHERE site_id=$1 AND target_type=$2 AND target_id=$3 AND status='open' AND last_reported_at >= now() - interval '24 hours' ORDER BY last_reported_at DESC LIMIT 1 FOR UPDATE`, [input.siteId, input.targetType, input.targetId])).rows[0]
    if (!parent) parent = (await query<{ id: string }>('INSERT INTO moderation_cases (site_id,target_type,target_id) VALUES ($1,$2,$3) RETURNING id', [input.siteId, input.targetType, input.targetId])).rows[0]!
    else await query('UPDATE moderation_cases SET last_reported_at=now() WHERE id=$1', [parent.id])
    const report = (await query<{ id: string }>('INSERT INTO community_reports (site_id,reporter_id,target_type,target_id,reason,details,status,parent_case_id,target_snapshot_payload,target_snapshot_hash,policy_id,policy_version) VALUES ($1,$2,$3,$4,$5,$6,\'pending\',$7,$8::jsonb,$9,$10,$11) RETURNING id', [input.siteId,input.reporterId,input.targetType,input.targetId,input.reason.trim(),input.details?.trim() || null,parent.id,JSON.stringify(snapshot),hash,policy?.id ?? null,policy?.version ?? null])).rows[0]!
    return { reportId: report.id, caseId: parent.id, targetSnapshotHash: hash }
  })
}

/** This is the only author/public-safe report shape. It intentionally has no reporter identifier. */
export function serializeReportForAuthor(record: Record<string, unknown>) {
  return { id: String(record.id), siteId: String(record.site_id ?? record.siteId), targetType: String(record.target_type ?? record.targetType), targetId: String(record.target_id ?? record.targetId), reason: String(record.reason), status: String(record.status), parentCaseId: String(record.parent_case_id ?? record.parentCaseId ?? ''), createdAt: record.created_at ?? record.createdAt }
}
