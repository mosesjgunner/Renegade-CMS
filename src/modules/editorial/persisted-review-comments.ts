import { createLocalReq, type Payload, type PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import {
  checkOperatorRecordAccess,
  resolveOperatorGrantContext,
} from '../operations/operator-grants'
import type { CommentTarget, ReviewComment } from './comments'

type Actor = NonNullable<PayloadRequest['user']>
type StoredComment = {
  id: string
  body: string
  site: unknown
  review?: unknown
  createdAt: string
  updatedAt: string
}
const idOf = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String(value.id)
    : String(value ?? '')
export class ReviewCommentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
export const reviewCommentsAvailable = (payload: Payload) =>
  Boolean(payload.collections['editorial-comments'] && payload.collections['editorial-discussions'])
function requireAvailable(payload: Payload) {
  if (!reviewCommentsAvailable(payload))
    throw new ReviewCommentError(
      503,
      'Review comments require the collaboration module. Enable it to save and resolve editorial feedback.',
    )
}
function project(row: StoredComment): ReviewComment {
  const review = row.review as ReviewComment
  return {
    ...review,
    id: row.id,
    content: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    directLink: `/admin/workflow?tab=comments&articleId=${encodeURIComponent(review.articleId)}&commentId=${row.id}&focus=${review.target}`,
  }
}

export async function listPersistedReviewComments(
  payload: Payload,
  user: Actor,
  filter: { articleId?: string; target?: CommentTarget; all?: boolean; siteIds?: string[] } = {},
): Promise<ReviewComment[]> {
  requireAvailable(payload)
  if (!(await resolveOperatorGrantContext(payload, user)).authorized)
    throw new ReviewCommentError(403, 'Staff site access required.')
  if (
    filter.articleId &&
    !(await checkOperatorRecordAccess(payload, user, 'content', filter.articleId))
  )
    throw new ReviewCommentError(403, 'Staff site access required.')
  const req = await createLocalReq({ user }, payload)
  // JSON subfield paths are not Payload query fields. Site access is enforced by the
  // canonical collection; projection filters the saved review metadata after that read.
  const result = await payload.find({
    collection: 'editorial-comments',
    where: {
      and: [
        { review: { exists: true } },
        ...(filter.siteIds ? [{ site: { in: filter.siteIds } }] : []),
      ],
    },
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: false,
    req,
  })
  return (result.docs as unknown as StoredComment[])
    .map(project)
    .filter(
      (comment) =>
        (!filter.articleId || comment.articleId === filter.articleId) &&
        (!filter.target || comment.target === filter.target) &&
        (filter.all || comment.status !== 'resolved'),
    )
}

async function transaction<T>(
  payload: Payload,
  user: Actor,
  work: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new ReviewCommentError(503, 'Review storage transaction unavailable.')
  const req = await createLocalReq({ user }, payload)
  req.transactionID = transactionID
  try {
    const result = await work(req)
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

async function audit(
  payload: Payload,
  req: PayloadRequest,
  site: string,
  member: string,
  action: string,
  details: Record<string, unknown>,
) {
  await payload.create({
    collection: 'team-audit-events',
    data: {
      scopeKind: 'site',
      site,
      scopeKey: `site:${site}`,
      action,
      actorMember: member,
      details,
      occurredAt: new Date().toISOString(),
    },
    overrideAccess: true,
    req,
  })
}

export async function createPersistedReviewComment(
  payload: Payload,
  user: Actor,
  input: { articleId?: unknown; content?: unknown; target?: unknown; targetAnchor?: unknown },
): Promise<ReviewComment> {
  requireAvailable(payload)
  const articleId = typeof input.articleId === 'string' ? input.articleId.trim() : ''
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  const target = String(input.target ?? 'body') as CommentTarget
  if (
    !articleId ||
    !content ||
    content.length > 10000 ||
    !['body', 'media', 'seo', 'layout'].includes(target)
  )
    throw new ReviewCommentError(
      400,
      'An article, a valid feedback target, and 1–10000 characters of feedback are required.',
    )
  if (!(await checkOperatorRecordAccess(payload, user, 'content', articleId)))
    throw new ReviewCommentError(403, 'Staff site access required.')
  const grant = await resolveOperatorGrantContext(payload, user)
  const member = grant.user.member
  if (!member) throw new ReviewCommentError(403, 'A canonical member identity is required.')
  return transaction(payload, user, async (req) => {
    const article = await payload.findByID({
      collection: 'content',
      id: articleId,
      depth: 0,
      overrideAccess: false,
      req,
    })
    const site = idOf(article.site)
    const discussion = await payload.create({
      collection: 'editorial-discussions',
      data: {
        scopeKind: 'site',
        site,
        scopeKey: `site:${site}`,
        content: articleId,
        subject: `${target} review: ${article.title}`,
        state: 'open',
        openedBy: member,
      },
      overrideAccess: false,
      req,
    })
    const review = {
      articleId,
      articleTitle: article.title,
      revisionSequence: 1,
      target,
      targetAnchor:
        typeof input.targetAnchor === 'string' ? input.targetAnchor.slice(0, 500) : null,
      authorId: String(user.id),
      authorName: String(user.email || 'Reviewer'),
      authorRole: String(user.role),
      status: 'open',
      resolutionNote: null,
      resolvedBy: null,
      resolvedAt: null,
    }
    const row = await payload.create({
      collection: 'editorial-comments',
      data: {
        scopeKind: 'site',
        site,
        scopeKey: `site:${site}`,
        discussion: discussion.id,
        author: member,
        body: content,
        review,
      } as never,
      overrideAccess: true,
      req,
    })
    await audit(payload, req, site, member, 'editorial.review-comment.created', {
      commentId: row.id,
      articleId,
      target,
    })
    return project(row as unknown as StoredComment)
  })
}

export async function transitionPersistedReviewComment(
  payload: Payload,
  user: Actor,
  input: { commentId?: unknown; action: 'resolve' | 'addressed'; resolutionNote?: unknown },
): Promise<ReviewComment> {
  requireAvailable(payload)
  const id = typeof input.commentId === 'string' ? input.commentId.trim() : ''
  if (!id) throw new ReviewCommentError(400, 'A review comment is required.')
  if (!(await checkOperatorRecordAccess(payload, user, 'editorial-comments', id)))
    throw new ReviewCommentError(403, 'Staff site access required.')
  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.user.member)
    throw new ReviewCommentError(403, 'A canonical member identity is required.')
  return transaction(payload, user, async (req) => {
    const transactionID = await req.transactionID
    const session = payload.db.sessions?.[String(transactionID)]?.db as
      | { execute: (query: unknown) => Promise<unknown> }
      | undefined
    if (!session) throw new ReviewCommentError(503, 'Review storage transaction unavailable.')
    await session.execute(sql`SELECT id FROM editorial_comments WHERE id = ${id} FOR UPDATE`)
    const row = await payload.findByID({
      collection: 'editorial-comments',
      id,
      depth: 0,
      overrideAccess: false,
      req,
    })
    const comment = project(row as unknown as StoredComment)
    if (
      !comment.articleId ||
      !(await checkOperatorRecordAccess(payload, user, 'content', comment.articleId))
    )
      throw new ReviewCommentError(403, 'Staff site access required.')
    if (comment.status === 'resolved') {
      if (input.action === 'resolve') return comment // Retry is idempotent, with no second audit event.
      throw new ReviewCommentError(409, 'A resolved review comment cannot be marked addressed.')
    }
    const review = {
      ...((row as unknown as StoredComment).review as ReviewComment),
      status: input.action === 'resolve' ? 'resolved' : 'addressed',
      ...(input.action === 'resolve'
        ? {
            resolvedBy: String(user.email || user.id),
            resolvedAt: new Date().toISOString(),
            resolutionNote:
              typeof input.resolutionNote === 'string'
                ? input.resolutionNote.slice(0, 10000)
                : 'Resolved by reviewer',
          }
        : {}),
    }
    const site = idOf(row.site)
    const updated = await payload.update({
      collection: 'editorial-comments',
      id,
      data: { scopeKind: 'site', site, review } as never,
      overrideAccess: true,
      overrideLock: false,
      req,
    })
    await audit(
      payload,
      req,
      site,
      grant.user.member!,
      `editorial.review-comment.${input.action === 'resolve' ? 'resolved' : 'addressed'}`,
      { commentId: id, articleId: comment.articleId, previousStatus: comment.status },
    )
    return project(updated as unknown as StoredComment)
  })
}
