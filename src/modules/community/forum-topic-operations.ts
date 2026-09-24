import type { Payload } from 'payload'

import { executeDbQuery } from './comment-composer'
import { requireForumSpaceCapability, resolveForumSpaceAccess } from './forum-space-access'

export class ForumTopicOperationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

type Client = {
  query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>
  release?: () => void
}
type Topic = {
  id: string
  siteId: string
  spaceId: string
  title: string
  isPinned: boolean
  isLocked: boolean
  isArchived: boolean
}
type PayloadPool = Payload & { db: { pool?: { connect?: () => Promise<Client> } } }

async function transaction<T>(payload: Payload, work: (query: Client['query']) => Promise<T>) {
  const client = await (payload as PayloadPool).db.pool?.connect?.()
  if (!client)
    throw new ForumTopicOperationError(
      'Forum operations require transactional database access.',
      503,
      'FORUM_DB_UNAVAILABLE',
    )
  try {
    await client.query('BEGIN')
    const value = await work(client.query.bind(client))
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release?.()
  }
}
async function lockedTopic(query: Client['query'], siteId: string, topicId: string) {
  const topic = (
    await query<Topic>(
      `SELECT id, site_id AS "siteId", space_id AS "spaceId", title, is_pinned AS "isPinned", is_locked AS "isLocked", is_archived AS "isArchived" FROM forum_topics WHERE id=$1 AND site_id=$2 FOR UPDATE`,
      [topicId, siteId],
    )
  ).rows[0]
  if (!topic) throw new ForumTopicOperationError('Forum topic not found.', 404, 'TOPIC_NOT_FOUND')
  return topic
}
async function staffAccess(payload: Payload, siteId: string, spaceId: string, actorId: string) {
  const access = await resolveForumSpaceAccess(payload, {
    siteId,
    spaceId,
    actor: { memberId: actorId },
  })
  requireForumSpaceCapability(access, 'can_pin_lock')
}
async function audit(
  query: Client['query'],
  input: {
    siteId: string
    operation: string
    sourceTopicId: string
    targetTopicId?: string | null
    postIds?: string[]
    actorId: string
    details?: Record<string, unknown>
  },
) {
  return (
    await query<{ id: string }>(
      `INSERT INTO forum_merge_audit (site_id,operation,source_topic_id,target_topic_id,post_ids,details,actor_member_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) RETURNING id`,
      [
        input.siteId,
        input.operation,
        input.sourceTopicId,
        input.targetTopicId ?? null,
        JSON.stringify(input.postIds ?? []),
        JSON.stringify(input.details ?? {}),
        input.actorId,
      ],
    )
  ).rows[0]!
}
async function sync(
  query: Client['query'],
  input: { siteId: string; topicId: string; auditId: string; spaceId: string; visibility: string },
) {
  const key = `forum.search_sync.v1:${input.topicId}:${input.auditId}`
  await query(
    `INSERT INTO outbox_events (event_type,payload,idempotency_key,created_at) VALUES ('forum.search_sync.v1',$1::jsonb,$2,now()) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
    [
      JSON.stringify({
        version: 1,
        siteId: input.siteId,
        topicId: input.topicId,
        acl: {
          spaceId: input.spaceId,
          visibility: input.visibility,
          requiresMembership: ['private', 'hidden'].includes(input.visibility),
        },
      }),
      key,
    ],
  )
}
async function topicVisibility(query: Client['query'], spaceId: string) {
  return (
    (
      await query<{ visibility: string }>('SELECT visibility FROM forum_spaces WHERE id=$1', [
        spaceId,
      ])
    ).rows[0]?.visibility ?? 'private'
  )
}
async function refreshSummary(query: Client['query'], topicId: string) {
  await query(
    `UPDATE forum_topics t SET next_post_sequence=COALESCE((SELECT MAX(sequence_number)+1 FROM forum_posts WHERE topic_id=t.id),1), reply_count=GREATEST(COALESCE((SELECT COUNT(*)::int FROM forum_posts WHERE topic_id=t.id),0)-1,0), last_post_author_id=(SELECT author_id FROM forum_posts WHERE topic_id=t.id ORDER BY sequence_number DESC LIMIT 1), last_post_timestamp=(SELECT created_at FROM forum_posts WHERE topic_id=t.id ORDER BY sequence_number DESC LIMIT 1), last_post_sequence_number=COALESCE((SELECT MAX(sequence_number) FROM forum_posts WHERE topic_id=t.id),0), updated_at=now() WHERE t.id=$1`,
    [topicId],
  )
}

export async function setForumTopicState(
  payload: Payload,
  input: {
    siteId: string
    topicId: string
    actorId: string
    pinned?: boolean
    locked?: boolean
    archived?: boolean
  },
) {
  return transaction(payload, async (query) => {
    const topic = await lockedTopic(query, input.siteId, input.topicId)
    await staffAccess(payload, input.siteId, topic.spaceId, input.actorId)
    const fields: string[] = []
    const values: unknown[] = []
    for (const [column, value] of Object.entries({
      is_pinned: input.pinned,
      is_locked: input.locked,
      is_archived: input.archived,
    }))
      if (typeof value === 'boolean') {
        values.push(value)
        fields.push(`${column}=$${values.length}`)
      }
    if (!fields.length)
      throw new ForumTopicOperationError(
        'At least one topic state is required.',
        422,
        'TOPIC_STATE_REQUIRED',
      )
    values.push(topic.id)
    const updated = (
      await query<Topic>(
        `UPDATE forum_topics SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length} RETURNING id,site_id AS "siteId",space_id AS "spaceId",title,is_pinned AS "isPinned",is_locked AS "isLocked",is_archived AS "isArchived"`,
        values,
      )
    ).rows[0]!
    const record = await audit(query, {
      siteId: input.siteId,
      operation:
        input.archived !== undefined ? 'archive' : input.locked !== undefined ? 'lock' : 'pin',
      sourceTopicId: topic.id,
      actorId: input.actorId,
      details: input,
    })
    await sync(query, {
      siteId: input.siteId,
      topicId: topic.id,
      auditId: record.id,
      spaceId: topic.spaceId,
      visibility: await topicVisibility(query, topic.spaceId),
    })
    return updated
  })
}

export async function moveForumTopic(
  payload: Payload,
  input: { siteId: string; topicId: string; targetSpaceId: string; actorId: string },
) {
  return transaction(payload, async (query) => {
    const topic = await lockedTopic(query, input.siteId, input.topicId)
    await staffAccess(payload, input.siteId, topic.spaceId, input.actorId)
    await staffAccess(payload, input.siteId, input.targetSpaceId, input.actorId)
    if (topic.spaceId === input.targetSpaceId)
      throw new ForumTopicOperationError(
        'Topic is already in that space.',
        422,
        'TOPIC_ALREADY_MOVED',
      )
    await query('UPDATE forum_topics SET space_id=$1,updated_at=now() WHERE id=$2', [
      input.targetSpaceId,
      topic.id,
    ])
    await query(
      'INSERT INTO forum_topic_redirects (site_id,source_topic_id,target_topic_id,source_space_id,created_by_member_id) VALUES ($1,$2,$2,$3,$4) ON CONFLICT (source_topic_id) DO NOTHING',
      [input.siteId, topic.id, topic.spaceId, input.actorId],
    )
    const record = await audit(query, {
      siteId: input.siteId,
      operation: 'move',
      sourceTopicId: topic.id,
      targetTopicId: topic.id,
      actorId: input.actorId,
      details: { fromSpaceId: topic.spaceId, toSpaceId: input.targetSpaceId },
    })
    await sync(query, {
      siteId: input.siteId,
      topicId: topic.id,
      auditId: record.id,
      spaceId: input.targetSpaceId,
      visibility: await topicVisibility(query, input.targetSpaceId),
    })
    return { ...topic, spaceId: input.targetSpaceId }
  })
}

export async function mergeForumTopics(
  payload: Payload,
  input: { siteId: string; targetTopicId: string; sourceTopicId: string; actorId: string },
) {
  if (input.targetTopicId === input.sourceTopicId)
    throw new ForumTopicOperationError(
      'A topic cannot merge into itself.',
      422,
      'INVALID_TOPIC_MERGE',
    )
  return transaction(payload, async (query) => {
    const target = await lockedTopic(query, input.siteId, input.targetTopicId)
    const source = await lockedTopic(query, input.siteId, input.sourceTopicId)
    await staffAccess(payload, input.siteId, target.spaceId, input.actorId)
    await staffAccess(payload, input.siteId, source.spaceId, input.actorId)
    const posts = (
      await query<{ id: string }[]>(
        'SELECT id FROM forum_posts WHERE topic_id=$1 ORDER BY sequence_number',
        [source.id],
      )
    ).rows as unknown as { id: string }[]
    await query("SET LOCAL renegade.forum_operation = 'merge'")
    await query(
      `UPDATE forum_posts SET sequence_number=sequence_number+1000000000 WHERE topic_id=$1`,
      [source.id],
    )
    await query(
      `WITH numbered AS (SELECT id,row_number() OVER (ORDER BY sequence_number) AS n FROM forum_posts WHERE topic_id=$1) UPDATE forum_posts p SET topic_id=$2,sequence_number=(SELECT n + $3 FROM numbered WHERE numbered.id=p.id) WHERE p.id IN (SELECT id FROM numbered)`,
      [
        source.id,
        target.id,
        (
          await query<{ max: number }>(
            'SELECT COALESCE(MAX(sequence_number),0)::int AS max FROM forum_posts WHERE topic_id=$1',
            [target.id],
          )
        ).rows[0]!.max,
      ],
    )
    await query('UPDATE forum_topics SET is_archived=true,updated_at=now() WHERE id=$1', [
      source.id,
    ])
    await query(
      'INSERT INTO forum_topic_redirects (site_id,source_topic_id,target_topic_id,created_by_member_id) VALUES ($1,$2,$3,$4) ON CONFLICT (source_topic_id) DO NOTHING',
      [input.siteId, source.id, target.id, input.actorId],
    )
    await refreshSummary(query, target.id)
    const record = await audit(query, {
      siteId: input.siteId,
      operation: 'merge',
      sourceTopicId: source.id,
      targetTopicId: target.id,
      postIds: posts.map((p) => p.id),
      actorId: input.actorId,
    })
    await sync(query, {
      siteId: input.siteId,
      topicId: target.id,
      auditId: record.id,
      spaceId: target.spaceId,
      visibility: await topicVisibility(query, target.spaceId),
    })
    return { targetTopicId: target.id, sourceTopicId: source.id, movedPosts: posts.length }
  })
}

export async function splitForumTopic(
  payload: Payload,
  input: {
    siteId: string
    sourceTopicId: string
    targetSpaceId: string
    title: string
    postIds: string[]
    actorId: string
  },
) {
  if (!input.postIds.length || !input.title.trim())
    throw new ForumTopicOperationError(
      'A title and at least one post are required.',
      422,
      'INVALID_TOPIC_SPLIT',
    )
  return transaction(payload, async (query) => {
    const source = await lockedTopic(query, input.siteId, input.sourceTopicId)
    await staffAccess(payload, input.siteId, source.spaceId, input.actorId)
    await staffAccess(payload, input.siteId, input.targetSpaceId, input.actorId)
    const posts = (
      await query<{ id: string }[]>(
        `SELECT id FROM forum_posts WHERE topic_id=$1 AND id=ANY($2::uuid[]) ORDER BY sequence_number`,
        [source.id, input.postIds],
      )
    ).rows as unknown as { id: string }[]
    if (posts.length !== input.postIds.length)
      throw new ForumTopicOperationError(
        'Selected posts must belong to the source topic.',
        422,
        'INVALID_SPLIT_POSTS',
      )
    const target = (
      await query<{ id: string }>(
        `INSERT INTO forum_topics (site_id,space_id,author_id,title,next_post_sequence) VALUES ($1,$2,$3,$4,1) RETURNING id`,
        [input.siteId, input.targetSpaceId, input.actorId, input.title.trim()],
      )
    ).rows[0]!
    await query("SET LOCAL renegade.forum_operation = 'split'")
    await query(
      `UPDATE forum_posts SET sequence_number=sequence_number+1000000000 WHERE id=ANY($1::uuid[])`,
      [input.postIds],
    )
    await query(
      `WITH numbered AS (SELECT id,row_number() OVER (ORDER BY sequence_number) AS n FROM forum_posts WHERE id=ANY($1::uuid[])) UPDATE forum_posts p SET topic_id=$2,sequence_number=(SELECT n FROM numbered WHERE numbered.id=p.id) WHERE p.id IN (SELECT id FROM numbered)`,
      [input.postIds, target.id],
    )
    await refreshSummary(query, source.id)
    await refreshSummary(query, target.id)
    const record = await audit(query, {
      siteId: input.siteId,
      operation: 'split',
      sourceTopicId: source.id,
      targetTopicId: target.id,
      postIds: posts.map((p) => p.id),
      actorId: input.actorId,
      details: { preservesOriginalTimestamps: true },
    })
    const visibility = await topicVisibility(query, input.targetSpaceId)
    await sync(query, {
      siteId: input.siteId,
      topicId: source.id,
      auditId: record.id,
      spaceId: source.spaceId,
      visibility: await topicVisibility(query, source.spaceId),
    })
    await sync(query, {
      siteId: input.siteId,
      topicId: target.id,
      auditId: record.id,
      spaceId: input.targetSpaceId,
      visibility,
    })
    return { sourceTopicId: source.id, targetTopicId: target.id, movedPosts: posts.length }
  })
}

export async function resolveForumTopicRedirect(
  payload: Payload,
  input: { siteId: string; topicId: string },
) {
  return (
    (
      await executeDbQuery<{ targetTopicId: string }>(
        payload,
        'SELECT target_topic_id AS "targetTopicId" FROM forum_topic_redirects WHERE site_id=$1 AND source_topic_id=$2',
        [input.siteId, input.topicId],
      )
    )[0] ?? null
  )
}
