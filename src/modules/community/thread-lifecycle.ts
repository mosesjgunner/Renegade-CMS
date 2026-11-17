import type { Payload } from 'payload'

import { executeDbQuery } from './db-query'
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
// RC2-DEBT-20 fold: the v1 thread surface lives on the live Payload
// discussions / discussion-posts store. A v1 thread id IS a discussion
// id. Lifecycle mapping: closed <=> commentsPolicy 'closed' (or a
// non-open status); frozen <=> status 'locked'/'archived';
// premoderation has no live-store counterpart (the live store
// moderates post-hoc and via submission triage) and is reported as
// false — setting it is rejected rather than silently dropped.
// ---------------------------------------------------------------------------

type Doc = Record<string, unknown>

function relationId(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in (value as Doc)) return String((value as Doc).id ?? '')
  return ''
}

async function findDiscussion(
  payload: Payload,
  siteId: string,
  threadId: string,
): Promise<Doc | null> {
  const found = await payload
    .findByID({ collection: 'discussions', id: threadId, depth: 1, overrideAccess: true })
    .catch(() => null)
  if (!found) return null
  const doc = found as unknown as Doc
  if (String(doc.site ? relationId(doc.site) : '') !== siteId) return null
  return doc
}

function lifecycleRecord(doc: Doc): ThreadLifecycleRecord {
  const status = String(doc.status ?? 'open')
  const attached = doc.attachedTo as Doc | undefined
  const attachedId = attached ? relationId(attached.value) : ''
  return {
    id: String(doc.id),
    siteId: String(relationId(doc.site)),
    canonicalContentId: attachedId,
    contentType: attachedId ? String(attached?.relationTo ?? 'content') : 'discussion',
    isClosed: String(doc.commentsPolicy ?? 'open') === 'closed' || status !== 'open',
    isFrozen: status === 'locked' || status === 'archived',
    premoderationEnabled: false,
    createdAt: new Date(String(doc.createdAt)).toISOString(),
    updatedAt: new Date(String(doc.updatedAt)).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// 1. Staff Lifecycle Controls (closed, frozen; premoderation unsupported)
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

  if (input.premoderationEnabled !== undefined) {
    throw new CommentLifecycleError(
      'Premoderation is not a control of the live discussion store; submissions are moderated post-hoc and by triage.',
      422,
      'UNSUPPORTED_LIFECYCLE_CONTROL',
    )
  }

  const doc = await findDiscussion(payload, input.siteId, input.threadId)
  if (!doc) {
    throw new CommentLifecycleError('Comment thread not found.', 404, 'THREAD_NOT_FOUND')
  }

  const data: Record<string, unknown> = {}
  if (input.frozen !== undefined) data.status = input.frozen ? 'locked' : 'open'
  if (input.closed !== undefined) data.commentsPolicy = input.closed ? 'closed' : 'open'
  if (Object.keys(data).length > 0) {
    const updated = await payload.update({
      collection: 'discussions',
      id: input.threadId,
      data,
      depth: 1,
      overrideAccess: true,
    })
    return lifecycleRecord(updated as unknown as Doc)
  }
  return lifecycleRecord(doc)
}

export async function getThreadLifecycle(
  payload: Payload,
  input: { siteId: string; threadId: string },
): Promise<ThreadLifecycleRecord> {
  const doc = await findDiscussion(payload, input.siteId, input.threadId)
  if (!doc) {
    throw new CommentLifecycleError('Comment thread not found.', 404, 'THREAD_NOT_FOUND')
  }
  return lifecycleRecord(doc)
}

// ---------------------------------------------------------------------------
// 2. Subscriptions (comment_thread_subscriptions — a subscription list
// keyed by thread id; after the fold the id is the discussion id)
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
// 3. Recursive Comment Retrieval bounded to depth 5, over the live
// discussion-posts store. Live statuses map to the v1 vocabulary:
// published -> visible, hidden -> pending_review, removed -> deleted.
// ---------------------------------------------------------------------------

function mapPostStatus(doc: Doc): string {
  const status = String(doc.status ?? 'published')
  if (status === 'published') return 'visible'
  if (status === 'removed') return 'deleted'
  return 'pending_review'
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

  const docs: Doc[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'discussion-posts',
      where: { discussion: { equals: input.threadId } },
      sort: 'createdAt',
      page,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    docs.push(...(res.docs as unknown as Doc[]))
    if (!res.hasNextPage) break
    page++
  }

  const reactionsByPost = new Map<string, Record<string, number>>()
  if (docs.length > 0) {
    try {
      const rows = await executeDbQuery<{ target_id: string; emoji: string; count: number }>(
        payload,
        `SELECT target_id, emoji, COUNT(*)::int AS count
         FROM community_reactions
         WHERE target_type = 'post' AND target_id = ANY($1)
         GROUP BY target_id, emoji`,
        [docs.map((d) => String(d.id))],
      )
      for (const row of rows) {
        const entry = reactionsByPost.get(String(row.target_id)) ?? {}
        entry[String(row.emoji)] = Number(row.count)
        reactionsByPost.set(String(row.target_id), entry)
      }
    } catch {
      // Reaction counts are a projection; the tree renders without them.
    }
  }

  type Flat = { doc: Doc; parentId: string | null }
  const flats: Flat[] = docs.map((doc) => ({
    doc,
    parentId: relationId(doc.parent) || null,
  }))
  const byId = new Map(flats.map((f) => [String(f.doc.id), f]))
  const depthOf = (f: Flat): number => {
    let depth = 0
    let current: Flat | undefined = f
    while (current?.parentId && byId.has(current.parentId) && depth <= 10) {
      depth++
      current = byId.get(current.parentId)
    }
    return depth
  }

  const nodesMap = new Map<string, CommentNode>()
  const rootNodes: CommentNode[] = []

  for (const flat of flats) {
    const status = mapPostStatus(flat.doc)
    if (!input.includeNonPublic && status !== 'visible') continue
    const depth = depthOf(flat)
    if (depth > maxDepth) continue
    const reactions = reactionsByPost.get(String(flat.doc.id)) ?? {}
    const rootId = ((): string | null => {
      let current: Flat | undefined = flat
      let root: string | null = null
      while (current?.parentId && byId.has(current.parentId)) {
        root = current.parentId
        current = byId.get(current.parentId)
      }
      return root
    })()
    nodesMap.set(String(flat.doc.id), {
      id: String(flat.doc.id),
      threadId: input.threadId,
      parentId: flat.parentId,
      rootId,
      authorId: relationId(flat.doc.authorMember) || relationId(flat.doc.authorGuest),
      authorType: flat.doc.authorMember ? 'member' : flat.doc.authorGuest ? 'anonymous' : 'system',
      status,
      depth,
      bodyRaw: String(flat.doc.body ?? ''),
      bodyHtml: String(flat.doc.body ?? ''),
      reactionCount: Object.values(reactions).reduce((sum, n) => sum + n, 0),
      reactions,
      createdAt: new Date(String(flat.doc.createdAt)).toISOString(),
      updatedAt: new Date(String(flat.doc.updatedAt)).toISOString(),
      deletedAt: null,
      children: [],
    })
  }

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

  if (sortMode === 'reverse_chronological') {
    rootNodes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } else if (sortMode === 'reaction_volume') {
    rootNodes.sort((a, b) => {
      const diff = b.reactionCount - a.reactionCount
      if (diff !== 0) return diff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  } else {
    rootNodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }

  return rootNodes
}

// ---------------------------------------------------------------------------
// 4. Public visibility helpers over the v1 node vocabulary
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
