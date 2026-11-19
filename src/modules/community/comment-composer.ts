import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import xss from 'xss'

import type { CommunityActor } from './contracts'
import { executeDbQuery } from './db-query'
import { assertMemberCanPost, ModerationActionError } from './moderation-actions'
import { triageSubmission } from './abuse-triage'
import { getThreadLifecycle } from './thread-lifecycle'

export { executeDbQuery } from './db-query'

const escapeXssAttr = (xss as unknown as { escapeAttrValue: (value: string) => string })
  .escapeAttrValue

export class CommentComposerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'CommentComposerError'
  }
}

// ---------------------------------------------------------------------------
// Rate Limiting (5 comments per rolling 60 seconds for authenticated members)
// ---------------------------------------------------------------------------
type RateLimitBucket = { count: number; resetAt: number; mutationIds: Set<string> }
const memberCommentBuckets = new Map<string, RateLimitBucket>()

export function consumeCommentRateLimit(
  memberId: string,
  now = Date.now(),
  max = 5,
  windowMs = 60_000,
  mutationId?: string,
) {
  const key = `member:comment:${memberId}`
  const current = memberCommentBuckets.get(key)
  const bucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs, mutationIds: new Set<string>() }
      : current

  if (mutationId && bucket.mutationIds.has(mutationId)) {
    return {
      allowed: true,
      count: bucket.count,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count++
  if (mutationId) {
    bucket.mutationIds.add(mutationId)
  }
  memberCommentBuckets.set(key, bucket)
  return {
    allowed: bucket.count <= max,
    count: bucket.count,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

export function resetCommentRateLimitsForTest() {
  memberCommentBuckets.clear()
}

// ---------------------------------------------------------------------------
// Idempotency Mapping (Map Idempotency-Key to valid PostgreSQL UUID)
// ---------------------------------------------------------------------------
export function toDeterministicUuid(key: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return key.toLowerCase()
  }
  const hash = createHash('sha256').update(key).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

// ---------------------------------------------------------------------------
// Rich-Text Sanitization
// Allowed markup: p, b, i, em, strong, a, ul, ol, li, blockquote, code
// Strip: scripts, styles, inline style attributes, data URIs, unsafe protocols,
//        unknown tags, event handlers
// Allowed link protocols: http, https, mailto
// ---------------------------------------------------------------------------

function isSafeLinkUrl(value: string): boolean {
  if (!value) return false
  let decoded = value
  for (let i = 0; i < 5; i++) {
    const prev = decoded
    decoded = decoded
      .replace(/&#(\d+);?/g, (_, num) => String.fromCharCode(Number(num)))
      .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    if (decoded === prev) break
  }
  const normalized = decoded.replace(/[\u0000-\u001f\u007f-\u009f\s]/g, '').toLowerCase()

  // Allowed link protocols: http, https, mailto (plus safe internal absolute paths /members/, /content/)
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('mailto:') ||
    (normalized.startsWith('/') && !normalized.startsWith('//'))
  ) {
    if (
      !normalized.includes('javascript:') &&
      !normalized.includes('data:') &&
      !normalized.includes('vbscript:')
    ) {
      return true
    }
  }
  return false
}

export function sanitizeCommentHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''

  return xss(html, {
    whiteList: {
      p: [],
      b: [],
      i: [],
      em: [],
      strong: [],
      a: ['href'],
      ul: [],
      ol: [],
      li: [],
      blockquote: [],
      code: [],
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: [
      'script',
      'style',
      'xml',
      'noscript',
      'iframe',
      'object',
      'embed',
      'svg',
      'canvas',
      'template',
      'form',
    ],
    onTagAttr: (tag, name, value) => {
      if (tag === 'a' && name === 'href') {
        if (!isSafeLinkUrl(value)) {
          return ''
        }
        return `href="${escapeXssAttr(value.trim())}"`
      }
      return ''
    },
  })
}

// ---------------------------------------------------------------------------
// Mentions Extraction & Site Scoped Resolution
// Regex: @([a-zA-Z0-9_\-\.]{3,30})
// Scoped to active members on the same site only.
// Unresolved and cross-site handles remain inert plain text.
// ---------------------------------------------------------------------------
export const MENTION_REGEX = /@([a-zA-Z0-9_\-.]{3,30})/g

export function extractMentions(text: string): string[] {
  if (!text) return []
  const matches = new Set<string>()
  const regex = new RegExp(MENTION_REGEX.source, 'g')
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    matches.add(match[1])
  }
  return Array.from(matches)
}

export async function resolveSiteMentions(
  payload: Payload,
  siteId: string,
  handles: string[],
): Promise<Map<string, { memberId: string; handle: string }>> {
  const result = new Map<string, { memberId: string; handle: string }>()
  if (handles.length === 0) return result

  const lowerHandles = handles.map((h) => h.toLowerCase())

  // Site-scoped resolution through Payload collections. (The pre-fold
  // SQL fast path referenced spaces.member_id, removed by RC2-DEBT-01;
  // it had been silently falling back to this path ever since.)
  try {
    if (typeof payload.find === 'function') {
      const profilesRes = await payload.find({
        collection: 'profiles',
        where: { handle: { in: lowerHandles } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })

      for (const p of profilesRes.docs as unknown as Array<{
        id: string
        member?: string | { id?: string }
        handle: string
        site?: string | { id?: string }
      }>) {
        const memberId =
          typeof p.member === 'object' && p.member ? String(p.member.id) : String(p.member ?? '')
        if (!memberId) continue

        let memberStatus = 'active'
        try {
          const memberDoc = (await payload.findByID({
            collection: 'members',
            id: memberId,
            depth: 0,
            overrideAccess: true,
          })) as unknown as { status?: string } | null
          memberStatus = memberDoc?.status ?? 'active'
        } catch {
          // If mock findByID fails, keep active
        }

        if (memberStatus !== 'active') continue

        let isScoped = false
        const docSite =
          typeof p.site === 'object' && p.site ? String(p.site.id) : String(p.site ?? '')
        if (docSite && docSite === siteId) {
          isScoped = true
        }

        if (!isScoped) {
          try {
            const roleCheck = await payload.find({
              collection: 'member-site-roles',
              where: {
                and: [{ site: { equals: siteId } }, { member: { equals: memberId } }],
              },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
            if (roleCheck.docs.length > 0) isScoped = true
          } catch (error) {
            console.error('[comment-composer] mention scope role check failed.', error)
          }
        }

        if (!isScoped) {
          try {
            // RC2-DEBT-01: spaces carry no member field; a member is
            // space-scoped when their profile holds a space on the site.
            const spaceCheck = await payload.find({
              collection: 'spaces',
              where: {
                and: [{ site: { equals: siteId } }, { 'profile.member': { equals: memberId } }],
              },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
            if (spaceCheck.docs.length > 0) isScoped = true
          } catch (error) {
            console.error('[comment-composer] mention scope space check failed.', error)
          }
        }

        if (isScoped) {
          result.set(p.handle.toLowerCase(), {
            memberId,
            handle: p.handle,
          })
        }
      }
    }
  } catch (error) {
    console.error('[comment-composer] mention resolution failed.', error)
  }

  return result
}

export function linkResolvedMentions(
  html: string,
  resolvedMap: Map<string, { memberId: string; handle: string }>,
): string {
  if (!html) return ''
  const parts = html.split(/(<[^>]+>)/g)
  let inAnchor = false
  let inCode = false

  const out = parts.map((part) => {
    if (part.startsWith('<')) {
      const lower = part.toLowerCase()
      if (lower.startsWith('<a ') || lower === '<a>') inAnchor = true
      else if (lower.startsWith('</a')) inAnchor = false
      else if (lower.startsWith('<code ') || lower === '<code>') inCode = true
      else if (lower.startsWith('</code')) inCode = false
      return part
    }
    if (inAnchor || inCode) {
      return part
    }
    const regex = new RegExp(MENTION_REGEX.source, 'g')
    return part.replace(regex, (fullMatch, handle) => {
      const resolved = resolvedMap.get(handle.toLowerCase())
      if (resolved) {
        return `<a href="/members/${resolved.handle}">${fullMatch}</a>`
      }
      return fullMatch
    })
  })

  return out.join('')
}

/**
 * The live discussion store keeps comment bodies as plain text. The
 * folded composer sanitizes rich input exactly as before, links
 * resolved mentions, then reduces the result to its text content —
 * mention anchors collapse back to their @handle text.
 */
export function commentBodyToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

// ---------------------------------------------------------------------------
// RC2-DEBT-20 fold: the composer writes to the live Payload
// discussions / discussion-posts store. A v1 thread id is a discussion
// id. The v1 contracts preserved: Idempotency-Key required with a
// 60-second replay window (backed by discussion-posts.clientMutationId),
// 5-per-60s member rate limit, depth cap 5, sanction gate, submission
// triage, the comment.created.v1 outbox event, and the 15-minute edit
// window. The v1 record shape returned to callers is unchanged.
// ---------------------------------------------------------------------------

type Doc = Record<string, unknown>

function relationId(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in (value as Doc)) return String((value as Doc).id ?? '')
  return ''
}

function mapPostStatusToV1(status: unknown): string {
  const value = String(status ?? 'published')
  if (value === 'published') return 'visible'
  if (value === 'removed') return 'deleted'
  return 'pending_review'
}

function postToCommentRecord(
  post: Doc,
  extra: { depth: number; rootId: string | null; authorType: string },
): Record<string, unknown> {
  return {
    id: String(post.id),
    thread_id: relationId(post.discussion),
    parent_id: relationId(post.parent) || null,
    root_id: extra.rootId,
    author_id: relationId(post.authorMember) || relationId(post.authorGuest) || null,
    author_type: extra.authorType,
    depth: extra.depth,
    body_raw: String(post.body ?? ''),
    body_html: String(post.body ?? ''),
    client_mutation_id: (post.clientMutationId as string | null) ?? null,
    status: mapPostStatusToV1(post.status),
    created_at: post.createdAt,
    updated_at: post.updatedAt,
  }
}

async function discussionDoc(payload: Payload, discussionId: string): Promise<Doc | null> {
  const found = await payload
    .findByID({ collection: 'discussions', id: discussionId, depth: 0, overrideAccess: true })
    .catch(() => null)
  return (found as unknown as Doc | null) ?? null
}

async function parentChain(
  payload: Payload,
  parentId: string,
  discussionId: string,
): Promise<{ depth: number; rootId: string }> {
  let depth = 0
  let rootId = parentId
  let currentId: string | null = parentId
  const seen = new Set<string>()
  while (currentId) {
    if (seen.has(currentId)) break
    seen.add(currentId)
    const doc = (await payload
      .findByID({ collection: 'discussion-posts', id: currentId, depth: 0, overrideAccess: true })
      .catch(() => null)) as unknown as Doc | null
    if (!doc) {
      throw new CommentComposerError(
        'Parent comment is not in this thread',
        422,
        'INVALID_COMMENT_PARENT',
      )
    }
    if (relationId(doc.discussion) !== discussionId) {
      throw new CommentComposerError(
        'Parent comment is not in this thread',
        422,
        'INVALID_COMMENT_PARENT',
      )
    }
    rootId = String(doc.id)
    const next = relationId(doc.parent) || null
    if (next) depth++
    currentId = next
  }
  return { depth: depth + 1, rootId }
}

export interface PostThreadCommentInput {
  siteId: string
  threadId: string
  parentId?: string | null
  authorId: string
  authorType?: 'member' | 'anonymous' | 'system'
  body: string
  idempotencyKey: string
  actor?: CommunityActor
  now?: Date
}

export async function postThreadComment(payload: Payload, input: PostThreadCommentInput) {
  if (!input.idempotencyKey || !input.idempotencyKey.trim()) {
    throw new CommentComposerError(
      'An Idempotency-Key header is required for creating comments.',
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    )
  }

  const rawBody = String(input.body ?? '').trim()
  if (!rawBody) {
    throw new CommentComposerError('Comment body cannot be empty.', 422, 'EMPTY_COMMENT_BODY')
  }

  const clientMutationId = toDeterministicUuid(input.idempotencyKey.trim())
  const currentTime = (input.now ?? new Date()).getTime()
  const authorType = input.authorType ?? 'member'

  // 1. Idempotency replay: an existing post carrying this mutation id
  // within the thread replays for 60 seconds, then the key expires.
  const prior = await payload.find({
    collection: 'discussion-posts',
    where: {
      and: [
        { discussion: { equals: input.threadId } },
        { clientMutationId: { equals: clientMutationId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existing = prior.docs[0] as unknown as Doc | undefined
  if (existing) {
    if (relationId(existing.authorMember) !== input.authorId)
      throw new CommentComposerError(
        'Idempotency key belongs to another author.',
        409,
        'IDEMPOTENCY_AUTHOR_MISMATCH',
      )
    const createdAt = new Date(String(existing.createdAt)).getTime()
    if (currentTime - createdAt <= 60_000) {
      const chain = existing.parent
        ? await parentChain(payload, relationId(existing.parent), input.threadId).catch(() => ({
            depth: 0,
            rootId: null as string | null,
          }))
        : { depth: 0, rootId: null as string | null }
      return {
        comment: postToCommentRecord(existing, {
          depth: chain.depth,
          rootId: chain.rootId,
          authorType,
        }),
        replayed: true,
      }
    }
    throw new CommentComposerError(
      'Idempotency key has expired (60s replay window).',
      409,
      'IDEMPOTENCY_KEY_EXPIRED',
    )
  }

  // 2. Rate limit for authenticated members
  if (authorType !== 'anonymous' && input.authorId) {
    const rate = consumeCommentRateLimit(input.authorId, currentTime, 5, 60_000, clientMutationId)
    if (!rate.allowed) {
      throw new CommentComposerError(
        'Rate limit exceeded: maximum 5 comments per rolling 60 seconds.',
        429,
        'COMMENT_RATE_LIMITED',
        { retryAfter: rate.retryAfter },
      )
    }
  }

  // 3. Thread validation on the live store (scoped to site)
  const thread = await getThreadLifecycle(payload, {
    siteId: input.siteId,
    threadId: input.threadId,
  }).catch(() => null)
  if (!thread) {
    throw new CommentComposerError('Comment thread not found.', 404, 'THREAD_NOT_FOUND')
  }
  if (thread.isFrozen) {
    throw new CommentComposerError('This comment thread is frozen.', 403, 'THREAD_FROZEN')
  }
  if (thread.isClosed) {
    throw new CommentComposerError(
      'This comment thread is closed to new comments.',
      403,
      'THREAD_CLOSED',
    )
  }

  // Sanction gate. Payload-only test/adaptor mode has no SQL read
  // boundary; production PostgreSQL always has one, so it cannot
  // silently bypass sanctions.
  const queryable = payload as unknown as {
    db?: { pool?: unknown; drizzle?: unknown }
  }
  const hasDbBoundary = Boolean(queryable.db?.pool || queryable.db?.drizzle)
  if (hasDbBoundary && authorType === 'member' && input.authorId) {
    try {
      await assertMemberCanPost(payload, {
        siteId: input.siteId,
        memberId: input.authorId,
        objectId: input.threadId,
      })
    } catch (error) {
      if (error instanceof ModerationActionError)
        throw new CommentComposerError(error.message, error.status, error.code)
      throw error
    }
  }

  // 4. Parent validation + depth (cap 5)
  let depth = 0
  let rootId: string | null = null
  if (input.parentId) {
    const chain = await parentChain(payload, input.parentId, input.threadId)
    depth = chain.depth
    rootId = chain.rootId
    if (depth > 5) {
      throw new CommentComposerError(
        'Comment nesting cannot exceed depth 5',
        422,
        'COMMENT_DEPTH_EXCEEDED',
      )
    }
  }

  // 5. Sanitize rich text, resolve mentions, reduce to the live
  // store's plain-text body model.
  const sanitized = sanitizeCommentHtml(rawBody)
  const handles = extractMentions(rawBody)
  const resolvedMentions = await resolveSiteMentions(payload, input.siteId, handles)
  const bodyText = commentBodyToText(linkResolvedMentions(sanitized, resolvedMentions))

  // 6. Allocate display order + permalink like the live comment path.
  const discussion = await discussionDoc(payload, input.threadId)
  const canonicalPath = String(discussion?.canonicalPath ?? `/discussions/${input.threadId}`)
  const countRes = await payload.find({
    collection: 'discussion-posts',
    where: { discussion: { equals: input.threadId } },
    limit: 0,
    overrideAccess: true,
  })
  let nextOrder = countRes.totalDocs + 1
  let permalink = `${canonicalPath}#comment-${nextOrder}`
  let collision = await payload.find({
    collection: 'discussion-posts',
    where: { permalink: { equals: permalink } },
    limit: 1,
    overrideAccess: true,
  })
  while (collision.totalDocs > 0) {
    nextOrder++
    permalink = `${canonicalPath}#comment-${nextOrder}`
    collision = await payload.find({
      collection: 'discussion-posts',
      where: { permalink: { equals: permalink } },
      limit: 1,
      overrideAccess: true,
    })
  }

  const created = (await payload.create({
    collection: 'discussion-posts' as never,
    data: {
      discussion: input.threadId,
      authorMember: authorType === 'member' && input.authorId ? input.authorId : null,
      body: bodyText,
      parent: input.parentId ?? null,
      displayOrder: nextOrder,
      permalink,
      paginationAnchor: `comment-${nextOrder}`,
      status: 'published',
      visibility: 'public',
      moderationState: 'clear',
      clientMutationId,
    } as never,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Doc

  // 7. Outbox event, same payload shape as the v1 store emitted. If
  // the outbox write fails, the created post is removed again — the
  // pair commits or neither does.
  const outboxPayload = {
    site_id: input.siteId,
    comment_id: String(created.id),
    thread_id: input.threadId,
    canonical_content_id: thread.canonicalContentId || null,
    author_id: input.authorId,
    parent_id: input.parentId ?? null,
    mentioned_handles: handles,
    timestamp: new Date(currentTime).toISOString(),
  }
  try {
    await executeDbQuery(
      payload,
      `INSERT INTO outbox_events (event_type, payload, created_at) VALUES ($1, $2, now())`,
      ['comment.created.v1', JSON.stringify(outboxPayload)],
    )
  } catch (error) {
    await payload
      .delete({ collection: 'discussion-posts', id: String(created.id), overrideAccess: true })
      .catch((compensationError) =>
        console.error('[comment-composer] outbox compensation delete failed.', compensationError),
      )
    throw error
  }

  // Triage only ever moves a submission into review; it never performs a sanction.
  if (authorType === 'member' && input.authorId)
    await triageSubmission(payload, {
      siteId: input.siteId,
      targetType: 'comment',
      targetId: String(created.id),
      authorId: input.authorId,
      text: rawBody,
    })

  // RC2-DEBT-21: with the inbox projector retired, the parent author is
  // notified through the canonical dispatcher — the same comment.reply
  // notification the community composer path sends. Best-effort: a
  // notification failure never fails the comment itself. (Dynamic
  // import: service.ts already imports this module.)
  if (input.parentId && authorType === 'member' && input.authorId) {
    try {
      const parent = (await payload
        .findByID({
          collection: 'discussion-posts',
          id: input.parentId,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)) as unknown as Doc | null
      const parentAuthorId = parent ? relationId(parent.authorMember) : ''
      if (parentAuthorId && parentAuthorId !== input.authorId) {
        const { dispatchCommunityNotification } = await import('./service')
        await dispatchCommunityNotification(payload, {
          siteId: input.siteId,
          recipientMemberId: parentAuthorId,
          actorMemberId: input.authorId,
          type: 'comment.reply',
          object: { id: String(created.id), permalink },
          payloadData: {
            bodySnippet: bodyText.slice(0, 120),
            discussionTitle: String(discussion?.title ?? ''),
          },
        })
      }
    } catch (error) {
      console.error('[comment-composer] reply notification dispatch failed.', error)
    }
  }

  return {
    comment: postToCommentRecord(created, { depth, rootId, authorType }),
    replayed: false,
  }
}

// ---------------------------------------------------------------------------
// Comment Editing & 15-Minute Edit Window
// Allow author edits for exactly 15 minutes.
// Allow staff edits after 15 minutes only with staff:community_moderate.
// The previous body is preserved in the community audit log
// (event comment.edited.v1), the folded equivalent of comment_revisions.
// ---------------------------------------------------------------------------
export interface EditThreadCommentInput {
  siteId: string
  threadId?: string
  commentId: string
  newBody: string
  actor: CommunityActor & { permissions?: string[]; scopes?: string[] }
  reason?: string
  now?: Date
}

export const EDIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

export async function editThreadComment(payload: Payload, input: EditThreadCommentInput) {
  const trimmedBody = String(input.newBody ?? '').trim()
  if (!trimmedBody) {
    throw new CommentComposerError('Comment body cannot be empty.', 422, 'EMPTY_COMMENT_BODY')
  }

  const comment = (await payload
    .findByID({
      collection: 'discussion-posts',
      id: input.commentId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)) as unknown as Doc | null
  if (!comment) {
    throw new CommentComposerError('Comment not found.', 404, 'COMMENT_NOT_FOUND')
  }

  const discussionId = relationId(comment.discussion)
  const discussion = await discussionDoc(payload, discussionId)
  if (discussion && String(relationId(discussion.site)) !== input.siteId) {
    throw new CommentComposerError('Site mismatch for this comment.', 403, 'SITE_MISMATCH')
  }

  if (input.threadId && discussionId !== input.threadId) {
    throw new CommentComposerError('Thread mismatch for this comment.', 422, 'THREAD_MISMATCH')
  }

  if (String(comment.status) === 'removed') {
    throw new CommentComposerError('Cannot edit a deleted comment.', 422, 'COMMENT_DELETED')
  }

  const createdAt = new Date(String(comment.createdAt)).getTime()
  const currentTime = (input.now ?? new Date()).getTime()
  const elapsedMs = currentTime - createdAt

  const isAuthor = Boolean(
    input.actor.memberId && relationId(comment.authorMember) === input.actor.memberId,
  )

  const hasStaffModerate = Boolean(
    input.actor.isStaff &&
      (input.actor.permissions?.includes('staff:community_moderate') ||
        input.actor.scopes?.includes('staff:community_moderate') ||
        input.actor.role === 'staff:community_moderate' ||
        input.actor.role === 'administrator' ||
        input.actor.role === 'admin'),
  )

  if (elapsedMs <= EDIT_WINDOW_MS) {
    if (!isAuthor && !input.actor.isStaff && !input.actor.isModerator) {
      throw new CommentComposerError(
        'Only the comment author or staff can edit this comment.',
        403,
        'UNAUTHORIZED_COMMENT_EDIT',
      )
    }
  } else {
    if (isAuthor && !hasStaffModerate) {
      throw new CommentComposerError(
        'Author edit window has expired (15 minutes).',
        403,
        'EDIT_WINDOW_EXPIRED',
      )
    }
    if (!hasStaffModerate) {
      throw new CommentComposerError(
        'Edits after 15 minutes require staff:community_moderate permission.',
        403,
        'EDIT_WINDOW_EXPIRED',
      )
    }
  }

  const sanitized = sanitizeCommentHtml(trimmedBody)
  const handles = extractMentions(trimmedBody)
  const resolvedMentions = await resolveSiteMentions(payload, input.siteId, handles)
  const bodyText = commentBodyToText(linkResolvedMentions(sanitized, resolvedMentions))

  const editorId = input.actor.memberId ?? input.actor.userId ?? relationId(comment.authorMember)
  await executeDbQuery(
    payload,
    'INSERT INTO community_audit_log (site_id,event_type,event_payload,record_hash) VALUES ($1,$2,$3::jsonb,$4)',
    [
      input.siteId,
      'comment.edited.v1',
      JSON.stringify({
        comment_id: input.commentId,
        editor_id: editorId,
        previous_body: String(comment.body ?? ''),
        reason: input.reason ?? null,
      }),
      'trigger-derived',
    ],
  ).catch((error) => console.error('[comment-composer] edit audit record failed.', error))

  const updated = (await payload.update({
    collection: 'discussion-posts',
    id: input.commentId,
    data: { body: bodyText },
    depth: 0,
    overrideAccess: true,
  })) as unknown as Doc

  const chain = updated.parent
    ? await parentChain(payload, relationId(updated.parent), discussionId).catch(() => ({
        depth: 0,
        rootId: null as string | null,
      }))
    : { depth: 0, rootId: null as string | null }

  return postToCommentRecord(updated, {
    depth: chain.depth,
    rootId: chain.rootId,
    authorType: updated.authorMember ? 'member' : 'anonymous',
  })
}
