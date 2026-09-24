import { createHash } from 'node:crypto'
import type { Payload } from 'payload'

type Query = <T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
) => Promise<{ rows: T[] }>
type Client = { query: Query; release?: () => void }
type DbPayload = Payload & { db: { pool?: { connect?: () => Promise<Client>; query?: Query } } }
export type AbuseRuleCategory =
  | 'account_tenure'
  | 'verification_tier'
  | 'posting_velocity'
  | 'external_link_density'
  | 'near_duplicate'
export type AbuseDecision = {
  pendingReview: boolean
  score: number
  categories: AbuseRuleCategory[]
  priority: 'normal' | 'high'
  simHash: string
}
const defaults = {
  minAccountAgeHours: 24,
  requireVerifiedForLinks: true,
  maxPostsPerTenSeconds: 9,
  maxLinksPerHundredChars: 3,
  nearDuplicateDistance: 3,
  reviewScore: 3,
}

// Stable 64-bit SimHash; only normalized text is retained in the fingerprint comparison path.
export function simHash(text: string) {
  const weights = Array.from({ length: 64 }, () => 0)
  for (const token of String(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' url ')
    .match(/[\p{L}\p{N}]+/gu) ?? []) {
    const digest = createHash('sha256').update(token).digest()
    for (let bit = 0; bit < 64; bit++)
      weights[bit] += digest[Math.floor(bit / 8)]! & (1 << bit % 8) ? 1 : -1
  }
  return weights
    .map((weight, bit) => (weight >= 0 ? 1n << BigInt(bit) : 0n))
    .reduce((a, b) => a | b, 0n)
    .toString(16)
    .padStart(16, '0')
}
export function simHashDistance(a: string, b: string) {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let count = 0
  while (value) {
    count++
    value &= value - 1n
  }
  return count
}
function hasUnverifiedImageAttachment(
  attachments: unknown[] | undefined,
  verified: boolean | undefined,
) {
  if (verified || !attachments) return false
  return attachments.some((attachment) => {
    if (!attachment || typeof attachment !== 'object') return false
    const value = attachment as Record<string, unknown>
    const mime = String(value.mimeType ?? value.mime_type ?? value.contentType ?? value.type ?? '')
    return mime.toLowerCase().startsWith('image/')
  })
}
export function evaluateAbuseHeuristics(input: {
  text: string
  accountAgeHours?: number
  verified?: boolean
  postsInTenSeconds?: number
  nearestSimHash?: string | null
  config?: Partial<typeof defaults>
}): AbuseDecision {
  const c = { ...defaults, ...input.config },
    categories: AbuseRuleCategory[] = []
  let score = 0
  const links = String(input.text).match(/https?:\/\/[^\s<]+/gi)?.length ?? 0
  if ((input.accountAgeHours ?? Infinity) < c.minAccountAgeHours) {
    categories.push('account_tenure')
    score++
  }
  if (c.requireVerifiedForLinks && links > 0 && !input.verified) {
    categories.push('verification_tier')
    score++
  }
  if ((input.postsInTenSeconds ?? 0) >= c.maxPostsPerTenSeconds) {
    categories.push('posting_velocity')
    score += 3
  }
  if (links * 100 > Math.max(String(input.text).length, 1) * c.maxLinksPerHundredChars) {
    categories.push('external_link_density')
    score++
  }
  const fingerprint = simHash(input.text)
  if (
    input.nearestSimHash &&
    simHashDistance(fingerprint, input.nearestSimHash) <= c.nearDuplicateDistance
  ) {
    categories.push('near_duplicate')
    score += 3
  }
  return {
    pendingReview: score >= c.reviewScore,
    score,
    categories,
    priority: score >= c.reviewScore ? 'high' : 'normal',
    simHash: fingerprint,
  }
}
async function withTransaction<T>(payload: Payload, work: (query: Query) => Promise<T>) {
  const pool = (payload as DbPayload).db.pool
  // Payload's lightweight adapters expose pool.query without connect(). They
  // are already responsible for their transaction semantics; the production
  // Postgres path below remains explicitly transactional.
  if (!pool?.connect) {
    if (!pool?.query) throw new Error('MODERATION_DB_UNAVAILABLE')
    return work(pool.query.bind(pool))
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client.query.bind(client))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release?.()
  }
}
export async function triageSubmission(
  payload: Payload,
  input: {
    siteId: string
    targetType: 'comment' | 'forum_post' | 'forum_topic' | 'message'
    targetId: string
    authorId: string
    text: string
    attachments?: unknown[]
  },
) {
  return withTransaction(payload, async (query) => {
    const config = (
      await query<{ config: Partial<typeof defaults> }>(
        'SELECT config FROM community_abuse_heuristic_configs WHERE site_id=$1',
        [input.siteId],
      )
    ).rows[0]?.config
    const member = (
      await query<{ age: number; verified: boolean }>(
        `SELECT EXTRACT(EPOCH FROM (now()-created_at))/3600 AS age, verified_email_at IS NOT NULL AS verified FROM members WHERE id=$1`,
        [input.authorId],
      )
    ).rows[0]
    const velocity =
      Number(
        (
          await query<{ count: number }>(
            `SELECT count(*)::int AS count FROM moderation_submission_fingerprints WHERE site_id=$1 AND author_id=$2 AND created_at >= now()-interval '10 seconds'`,
            [input.siteId, input.authorId],
          )
        ).rows[0]?.count ?? 0,
      ) + 1
    // Compare against a bounded recent candidate set.  Choosing the actual
    // nearest candidate matters: the most recent submission need not be the
    // duplicate one, especially when spam is spread across spaces.
    const currentHash = simHash(input.text)
    const nearest = (
      await query<{ fingerprint: string }>(
        `SELECT fingerprint FROM moderation_submission_fingerprints WHERE site_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [input.siteId],
      )
    ).rows.reduce<string | null>((best, row) => {
      if (!row.fingerprint) return best
      return !best ||
        simHashDistance(currentHash, row.fingerprint) < simHashDistance(currentHash, best)
        ? row.fingerprint
        : best
    }, null)
    const decision = evaluateAbuseHeuristics({
      text: input.text,
      accountAgeHours: Number(member?.age),
      verified: member?.verified,
      postsInTenSeconds: velocity,
      nearestSimHash: nearest,
      config,
    })
    await query(
      `INSERT INTO moderation_submission_fingerprints (site_id,author_id,target_type,target_id,fingerprint) VALUES ($1,$2,$3,$4,$5)`,
      [input.siteId, input.authorId, input.targetType, input.targetId, decision.simHash],
    )
    if (!decision.pendingReview) return decision
    if (input.targetType === 'comment')
      await query("UPDATE comments SET status='pending_review', updated_at=now() WHERE id=$1", [
        input.targetId,
      ])
    if (input.targetType === 'forum_post')
      await query(
        "UPDATE forum_posts SET is_quarantined=true, review_status='pending_review', updated_at=now() WHERE id=$1",
        [input.targetId],
      )
    const row = (
      await query<{ id: string }>(
        `INSERT INTO moderation_cases (site_id,target_type,target_id,priority,rule_categories,sla_deadline,triage_payload) VALUES ($1,$2,$3,'high',$4::jsonb,now()+interval '4 hours',$5::jsonb) RETURNING id`,
        [
          input.siteId,
          input.targetType,
          input.targetId,
          JSON.stringify(decision.categories),
          JSON.stringify({
            version: 1,
            score: decision.score,
            categories: decision.categories,
            sensitiveMedia: hasUnverifiedImageAttachment(input.attachments, member?.verified),
          }),
        ],
      )
    ).rows[0]
    await query(
      `INSERT INTO community_audit_log (site_id,event_type,event_payload) VALUES ($1,'moderation.triage.created.v1',$2::jsonb)`,
      [
        input.siteId,
        JSON.stringify({
          case_id: row?.id,
          target_id: input.targetId,
          categories: decision.categories,
          score: decision.score,
        }),
      ],
    )
    return { ...decision, caseId: row?.id }
  })
}
export async function listModerationCases(
  payload: Payload,
  input: {
    siteId: string
    priority?: string
    status?: string
    ruleCategory?: string
    slaBefore?: string
  },
) {
  const pool = (payload as DbPayload).db.pool
  if (!pool?.connect) throw new Error('MODERATION_DB_UNAVAILABLE')
  const client = await pool.connect()
  try {
    const rows = await client.query<Record<string, unknown>>(
      `SELECT c.*, EXISTS(SELECT 1 FROM moderation_appeals a JOIN moderation_actions ma ON ma.id=a.moderation_action_id WHERE ma.case_id=c.id AND a.status='pending') AS "hasPendingAppeal" FROM moderation_cases c WHERE c.site_id=$1 AND ($2::text IS NULL OR c.priority=$2) AND ($3::text IS NULL OR c.status=$3) AND ($4::text IS NULL OR c.rule_categories ? $4) AND ($5::timestamptz IS NULL OR c.sla_deadline <= $5) ORDER BY CASE c.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,c.sla_deadline NULLS LAST,c.opened_at DESC`,
      [
        input.siteId,
        input.priority ?? null,
        input.status ?? null,
        input.ruleCategory ?? null,
        input.slaBefore ?? null,
      ],
    )
    return rows.rows.map((row) => ({
      ...row,
      preview: {
        blurSensitiveMedia: Boolean(
          (row.triage_payload as Record<string, unknown> | undefined)?.sensitiveMedia,
        ),
        blurSensitiveText:
          Array.isArray(row.rule_categories) &&
          (row.rule_categories as string[]).includes('near_duplicate'),
      },
    }))
  } finally {
    client.release?.()
  }
}

export async function batchDispositionModerationCases(
  payload: Payload,
  input: { siteId: string; actorMemberId: string; caseIds: string[]; disposition: string },
) {
  if (!input.caseIds.length || input.caseIds.length > 50) throw new Error('MODERATION_BATCH_LIMIT')
  return Promise.all(
    input.caseIds.map(async (caseId) => {
      try {
        return await withTransaction(payload, async (query) => {
          const found = (
            await query<{ id: string }>(
              'SELECT id FROM moderation_cases WHERE id=$1 AND site_id=$2 FOR UPDATE',
              [caseId, input.siteId],
            )
          ).rows[0]
          if (!found) return { caseId, success: false, code: 'CASE_NOT_FOUND' as const }
          const closes = ['close', 'closed', 'dismiss'].includes(input.disposition)
          await query(
            "UPDATE moderation_cases SET status=CASE WHEN $1 IN ('close','closed','dismiss') THEN 'closed' ELSE status END, disposition=$1, closed_at=CASE WHEN $1 IN ('close','closed','dismiss') THEN now() ELSE closed_at END, closed_by_member_id=CASE WHEN $1 IN ('close','closed','dismiss') THEN $2 ELSE closed_by_member_id END WHERE id=$3",
            [input.disposition, input.actorMemberId, caseId],
          )
          await query(
            "INSERT INTO community_audit_log (site_id,event_type,event_payload) VALUES ($1,'moderation.case.disposition.v1',$2::jsonb)",
            [
              input.siteId,
              JSON.stringify({
                case_id: caseId,
                actor_member_id: input.actorMemberId,
                disposition: input.disposition,
                closes,
              }),
            ],
          )
          return { caseId, success: true as const }
        })
      } catch {
        return { caseId, success: false as const, code: 'CASE_DISPOSITION_FAILED' as const }
      }
    }),
  )
}

export async function exportModerationCaseAudit(payload: Payload, siteId: string) {
  const pool = (payload as DbPayload).db.pool
  if (!pool?.connect) throw new Error('MODERATION_DB_UNAVAILABLE')
  const client = await pool.connect()
  try {
    return (
      await client.query<Record<string, unknown>>(
        `SELECT c.id AS case_id, c.target_type, c.target_id, c.status, c.priority, c.rule_categories,
        c.sla_deadline, c.opened_at, c.disposition, l.event_type, l.event_payload, l.created_at AS audit_created_at
       FROM moderation_cases c LEFT JOIN community_audit_log l ON l.site_id=c.site_id
        AND (l.event_payload->>'case_id')=c.id::text
       WHERE c.site_id=$1 ORDER BY c.opened_at DESC, l.created_at ASC NULLS LAST`,
        [siteId],
      )
    ).rows
  } finally {
    client.release?.()
  }
}
