import type { Payload } from 'payload'

import { executeDbQuery } from './comment-composer'
import type { CommunityActor } from './contracts'

export class CommentLifecycleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'CommentLifecycleError'
  }
}

export type CommentSortMode =
  | 'chronological'
  | 'reverse_chronological'
  | 'reverse chronological'
  | 'reaction_volume'
  | 'reaction volume'

export interface CommentNode {
  id: string
  threadId: string
  parentId: string | null
  rootId: string | null
  authorId: string
  authorType: string
  status: string
  depth: number
  bodyRaw: string
  bodyHtml: string
  reactionCount: number
  reactions: Record<string, number>
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  children: CommentNode[]
}

export interface ThreadLifecycleRecord {
  id: string
  siteId: string
  canonicalContentId: string
  contentType: string
  isClosed: boolean
  isFrozen: boolean
  premoderationEnabled: boolean
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// 1. Staff Lifecycle Controls (closed, frozen, premoderation_enabled)
// ---------------------------------------------------------------------------
export async function updateThreadLifecycle(
  payload: Payload,
  input: {
    siteId: string
    threadId: string
    actor: CommunityActor
    closed?: boolean
    frozen?: boolean
    premoderationEnabled?: boolean
  },
): Promise<ThreadLifecycleRecord> {
  const isAuthorized = input.actor.isStaff || input.actor.isModerator

  if (!isAuthorized) {
    throw new CommentLifecycleError(
      'Staff permissions required to update thread lifecycle controls.',
      403,
      'STAFF_PERMISSION_REQUIRED',
    )
  }

  const rows = await executeDbQuery<ThreadLifecycleRecord>(
    payload,
    `UPDATE comment_threads
     SET is_closed = COALESCE($3, is_closed),
         is_frozen = COALESCE($4, is_frozen),
         premoderation_enabled = COALESCE($5, premoderation_enabled),
         updated_at = now()
     WHERE id = $1 AND site_id = $2
     RETURNING id, site_id AS "siteId", canonical_content_id AS "canonicalContentId",
               content_type AS "contentType", is_closed AS "isClosed", is_frozen AS "isFrozen",
               premoderation_enabled AS "premoderationEnabled", created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [
      input.threadId,
      input.siteId,
      input.closed ?? null,
      input.frozen ?? null,
      input.premoderationEnabled ?? null,
    ],
  )

  const updated = rows[0]
  if (!updated) {
    throw new CommentLifecycleError('Comment thread not found.', 404, 'THREAD_NOT_FOUND')
  }

  return updated
}

export async function getThreadLifecycle(
  payload: Payload,
  input: { siteId: string; threadId: string },
): Promise<ThreadLifecycleRecord> {
  const rows = await executeDbQuery<ThreadLifecycleRecord>(
    payload,
    `SELECT id, site_id AS "siteId", canonical_content_id AS "canonicalContentId",
            content_type AS "contentType", is_closed AS "isClosed", is_frozen AS "isFrozen",
            premoderation_enabled AS "premoderationEnabled", created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM comment_threads
     WHERE id = $1 AND site_id = $2`,
    [input.threadId, input.siteId],
  )

  const thread = rows[0]
  if (!thread) {
    throw new CommentLifecycleError('Comment thread not found.', 404, 'THREAD_NOT_FOUND')
  }

  return thread
}

// ---------------------------------------------------------------------------
// 2. Subscriptions (comment_thread_subscriptions)
// ---------------------------------------------------------------------------
export async function subscribeToThread(
  payload: Payload,
  input: { siteId?: string; threadId: string; memberId: string },
): Promise<{ subscribed: boolean; threadId: string; memberId: string }> {
  await executeDbQuery(
    payload,
    `INSERT INTO comment_thread_subscriptions (thread_id, member_id, created_at)
     VALUES ($1, $2, now())
     ON CONFLICT (thread_id, member_id) DO NOTHING`,
    [input.threadId, input.memberId],
  )

  return { subscribed: true, threadId: input.threadId, memberId: input.memberId }
}

export async function unsubscribeFromThread(
  payload: Payload,
  input: { siteId?: string; threadId: string; memberId: string },
): Promise<{ subscribed: boolean; threadId: string; memberId: string }> {
  await executeDbQuery(
    payload,
    `DELETE FROM comment_thread_subscriptions
     WHERE thread_id = $1 AND member_id = $2`,
    [input.threadId, input.memberId],
  )

  return { subscribed: false, threadId: input.threadId, memberId: input.memberId }
}

export async function isSubscribedToThread(
  payload: Payload,
  input: { threadId: string; memberId: string },
): Promise<boolean> {
  const rows = await executeDbQuery<{ exists: boolean }>(
    payload,
    `SELECT EXISTS(
       SELECT 1 FROM comment_thread_subscriptions
       WHERE thread_id = $1 AND member_id = $2
     ) AS exists`,
    [input.threadId, input.memberId],
  )

  return Boolean(rows[0]?.exists)
}

export async function getThreadSubscribers(payload: Payload, threadId: string): Promise<string[]> {
  const rows = await executeDbQuery<{ member_id: string }>(
    payload,
    `SELECT member_id FROM comment_thread_subscriptions WHERE thread_id = $1`,
    [threadId],
  )

  return rows.map((r) => String(r.member_id))
}

// ---------------------------------------------------------------------------
// 3. Recursive Comment Retrieval bounded to depth 5
// Support sort modes: chronological, reverse chronological, reaction volume
// ---------------------------------------------------------------------------
type RawCommentRow = {
  id: string
  thread_id: string
  parent_id: string | null
  root_id: string | null
  author_id: string
  author_type: string
  status: string
  depth: number
  body_raw: string
  body_html: string
  created_at: string | Date
  updated_at: string | Date
  deleted_at?: string | Date | null
  reactions?: Record<string, number> | string | null
  reactionCount?: number | string | null
}

export async function getThreadCommentsTree(
  payload: Payload,
  input: {
    threadId: string
    siteId?: string
    sort?: CommentSortMode | string
    maxDepth?: number
    includeNonPublic?: boolean
  },
): Promise<CommentNode[]> {
  const maxDepth = Math.min(Math.max(0, input.maxDepth ?? 5), 5)
  const sortMode = (input.sort ?? 'chronological').toLowerCase().replace(/\s+/g, '_')

  let rows: RawCommentRow[] = []
  try {
    rows = await executeDbQuery<RawCommentRow>(
      payload,
      `SELECT c.id, c.thread_id, c.parent_id, c.root_id, c.author_id, c.author_type,
              c.status, c.depth, c.body_raw, c.body_html, c.created_at, c.updated_at, c.deleted_at,
              COALESCE(
                (SELECT jsonb_object_agg(crc.reaction_code, crc.reaction_count)
                 FROM comment_reaction_counters crc
                 WHERE crc.comment_id = c.id),
                '{}'::jsonb
              ) AS reactions,
              COALESCE(
                (SELECT SUM(crc.reaction_count)::integer
                 FROM comment_reaction_counters crc
                 WHERE crc.comment_id = c.id),
                0
              ) AS "reactionCount"
       FROM comments c
       WHERE c.thread_id = $1 AND c.depth <= $2
       ORDER BY c.created_at ASC`,
      [input.threadId, maxDepth],
    )
  } catch {
    // Fallback if counter projection table isn't populated or in test environment
    rows = await executeDbQuery<RawCommentRow>(
      payload,
      `SELECT c.id, c.thread_id, c.parent_id, c.root_id, c.author_id, c.author_type,
              c.status, c.depth, c.body_raw, c.body_html, c.created_at, c.updated_at, c.deleted_at
       FROM comments c
       WHERE c.thread_id = $1 AND c.depth <= $2
       ORDER BY c.created_at ASC`,
      [input.threadId, maxDepth],
    )
  }

  // Filter out non-public comments if requested
  const filteredRows = input.includeNonPublic ? rows : rows.filter((r) => r.status === 'visible')

  const nodesMap = new Map<string, CommentNode>()
  const rootNodes: CommentNode[] = []

  for (const r of filteredRows) {
    let reactionsParsed: Record<string, number> = {}
    if (typeof r.reactions === 'string') {
      try {
        reactionsParsed = JSON.parse(r.reactions)
      } catch {
        reactionsParsed = {}
      }
    } else if (r.reactions && typeof r.reactions === 'object') {
      reactionsParsed = r.reactions as Record<string, number>
    }

    const node: CommentNode = {
      id: String(r.id),
      threadId: String(r.thread_id),
      parentId: r.parent_id ? String(r.parent_id) : null,
      rootId: r.root_id ? String(r.root_id) : null,
      authorId: String(r.author_id),
      authorType: String(r.author_type),
      status: String(r.status),
      depth: Number(r.depth),
      bodyRaw: String(r.body_raw),
      bodyHtml: String(r.body_html),
      reactionCount: Number(r.reactionCount ?? 0),
      reactions: reactionsParsed,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
      children: [],
    }

    nodesMap.set(node.id, node)
  }

  // Assemble hierarchy
  for (const node of nodesMap.values()) {
    if (node.parentId && nodesMap.has(node.parentId)) {
      const parent = nodesMap.get(node.parentId)!
      if (parent.depth < 5) {
        parent.children.push(node)
      }
    } else if (!node.parentId) {
      rootNodes.push(node)
    }
  }

  // Sort children chronologically
  const sortChildren = (nodes: CommentNode[]) => {
    nodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    for (const n of nodes) {
      if (n.children.length > 0) {
        sortChildren(n.children)
      }
    }
  }
  for (const root of rootNodes) {
    if (root.children.length > 0) {
      sortChildren(root.children)
    }
  }

  // Sort top-level roots by requested mode
  if (sortMode === 'reverse_chronological') {
    rootNodes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } else if (sortMode === 'reaction_volume') {
    rootNodes.sort((a, b) => {
      const diff = b.reactionCount - a.reactionCount
      if (diff !== 0) return diff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  } else {
    // chronological (default)
    rootNodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }

  return rootNodes
}

// ---------------------------------------------------------------------------
// 4. Public SSR / Rendered HTML Comments Visibility
// - Only include comments when canonical parent content is published and indexable
// - Scrub deleted, quarantined, rejected, and pending comments from public SSR
// ---------------------------------------------------------------------------
const NON_PUBLIC_STATUSES = new Set([
  'deleted',
  'quarantined',
  'rejected',
  'pending_review',
  'pending',
])

export function isCommentPublicVisible(status: string): boolean {
  const norm = String(status || '')
    .toLowerCase()
    .trim()
  if (!norm) return false
  if (NON_PUBLIC_STATUSES.has(norm)) return false
  return norm === 'visible'
}

export function scrubNonPublicComments(nodes: CommentNode[]): CommentNode[] {
  const result: CommentNode[] = []
  for (const node of nodes) {
    if (!isCommentPublicVisible(node.status)) {
      continue
    }
    const cleanChildren = scrubNonPublicComments(node.children)
    result.push({
      ...node,
      children: cleanChildren,
    })
  }
  return result
}

export async function getPublicSsrComments(
  payload: Payload,
  input: {
    canonicalContentId: string
    siteId: string
    contentStatus?: string
    isIndexable?: boolean
    sort?: CommentSortMode | string
  },
): Promise<CommentNode[]> {
  // 1. Content published check
  const isPublished = (input.contentStatus ?? 'published').toLowerCase() === 'published'
  if (!isPublished) {
    return []
  }

  // 2. Indexability check
  const isIndexable = input.isIndexable !== false
  if (!isIndexable) {
    return []
  }

  // 3. Find thread for canonical content
  let threadId: string | null = null
  try {
    const threadRows = await executeDbQuery<{ id: string }>(
      payload,
      `SELECT id FROM comment_threads WHERE site_id = $1 AND canonical_content_id = $2`,
      [input.siteId, input.canonicalContentId],
    )
    threadId = threadRows[0]?.id ? String(threadRows[0].id) : null
  } catch {
    // ignore
  }

  if (!threadId) {
    return []
  }

  // 4. Retrieve comments tree
  const tree = await getThreadCommentsTree(payload, {
    threadId,
    siteId: input.siteId,
    sort: input.sort ?? 'chronological',
    includeNonPublic: false,
  })

  // 5. Scrub non-public comments
  return scrubNonPublicComments(tree)
}
