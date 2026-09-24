import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import {
  changeMemberAccountState,
  currentMember,
  readMemberSession,
} from '../identity/member-identity'
import type {
  AddCommentInput,
  CommunityActor,
  CommunityConversationRecord,
  CommunityDiscussionRecord,
  CommunityMessageRecord,
  CommunityModerationActionRecord,
  CommunityPolicyContext,
  CommunityPostRecord,
  CommunityPublicProfile,
  CommunityReactionRecord,
  CommunityReportRecord,
  CreateThreadInput,
  DeleteCommentInput,
  DirectMessageInput,
  EditCommentInput,
  ReplyPostInput,
} from './contracts'
import {
  evaluateCommunityPolicy,
  sanitizeProfileProjection,
  type RelationshipCheck,
} from './policy'
import { emitCommunityEvent } from './realtime'
import { loadProfileProjection } from './profile-projection'
import { consumeApiRateLimit } from '../integrations/rate-limit'
import { assertMemberCanPost, ModerationActionError } from './moderation-actions'

export class CommunityError extends Error {
  status: number
  code: string

  constructor(message: string, status = 400, code = 'COMMUNITY_ERROR') {
    super(message)
    this.name = 'CommunityError'
    this.status = status
    this.code = code
  }
}

/** Server-side write throttle shared by every member-originated interaction. */
export function enforceCommunityWriteRateLimit(context: CommunityPolicyContext, action: string) {
  const memberId = context.actor.memberId
  if (!memberId) return
  const rate = consumeApiRateLimit(`community:${action}:${memberId}`, true)
  if (!rate.allowed) throw new CommunityError('Rate limit exceeded', 429, 'COMMUNITY_RATE_LIMITED')
}
const hasSanctionReadBoundary = (payload: Payload) =>
  Boolean((payload as any).db?.pool || (payload as any).db?.drizzle)

export async function queryDb<T = any>(
  payload: Payload,
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[] }> {
  const db = payload.db as any
  if (db?.pool?.query) {
    return db.pool.query(text, params)
  }
  if (db?.drizzle?.execute) {
    const res = await db.drizzle.execute(text, params)
    return { rows: res.rows ?? res }
  }
  throw new Error('Database query execution not available')
}

/**
 * Resolves the acting CommunityActor from request, headers, or direct session token.
 */
export async function resolveCommunityActor(
  payload: Payload,
  headersOrTokenOrReq?: Headers | Request | string | null,
  siteId?: string,
): Promise<CommunityActor> {
  let sessionToken: string | undefined
  if (typeof headersOrTokenOrReq === 'string') {
    sessionToken = headersOrTokenOrReq
  } else if (headersOrTokenOrReq && 'headers' in headersOrTokenOrReq) {
    sessionToken = readMemberSession(headersOrTokenOrReq.headers as Headers)
  } else if (headersOrTokenOrReq) {
    sessionToken = readMemberSession(headersOrTokenOrReq as Headers)
  }

  if (!sessionToken) {
    return { kind: 'anonymous', isStaff: false, isModerator: false }
  }

  const memberId = await currentMember(payload as never, sessionToken)
  if (!memberId) {
    return { kind: 'anonymous', isStaff: false, isModerator: false }
  }

  const memberDoc = (await payload.findByID({
    collection: 'members',
    id: memberId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!memberDoc) {
    return { kind: 'anonymous', isStaff: false, isModerator: false }
  }

  // Check moderator role via team-memberships or relationships
  let isModerator = false
  if (siteId) {
    try {
      const memberships = await payload.find({
        collection: 'team-memberships',
        where: {
          and: [
            { member: { equals: memberId } },
            { status: { equals: 'active' } },
            { role: { in: ['owner', 'administrator', 'moderator'] } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (memberships.docs.length > 0) isModerator = true
    } catch {
      // module might not be enabled
    }

    if (!isModerator) {
      try {
        const rels = await payload.find({
          collection: 'relationships',
          where: {
            and: [
              { subject: { equals: memberId } },
              { role: { in: ['owner', 'moderator'] } },
              { status: { equals: 'active' } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (rels.docs.length > 0) isModerator = true
      } catch {
        // ignore
      }
    }
  }

  return {
    kind: 'member',
    memberId,
    status: (memberDoc.status as 'active' | 'disabled' | 'archived') ?? 'active',
    isStaff: false,
    isModerator,
  }
}

/**
 * Checks bidirectional block status between two members.
 */
export async function checkBlockBetween(
  payload: Payload,
  memberIdA: string,
  memberIdB: string,
  siteId?: string,
): Promise<RelationshipCheck> {
  if (memberIdA === memberIdB) return { isBlocked: false }

  const pairKeyA = `block:${memberIdA}:${memberIdB}`
  const pairKeyB = `block:${memberIdB}:${memberIdA}`
  const keys = siteId
    ? [
        `block:${siteId}:${memberIdA}:${memberIdB}`,
        `block:${siteId}:${memberIdB}:${memberIdA}`,
        pairKeyA,
        pairKeyB,
      ]
    : [pairKeyA, pairKeyB]

  const blocks = await payload.find({
    collection: 'relationships',
    where: {
      and: [
        { kind: { equals: 'block' } },
        { status: { equals: 'active' } },
        ...(siteId ? [{ site: { equals: siteId } }] : []),
        { pairKey: { in: keys } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  return { isBlocked: blocks.docs.length > 0 }
}

/** Mute is one-way: the viewer hides the target's content and notifications. */
export async function checkMuteFrom(
  payload: Payload,
  viewerMemberId: string,
  targetMemberId: string,
  siteId: string,
): Promise<boolean> {
  if (viewerMemberId === targetMemberId) return false
  const mutes = await payload.find({
    collection: 'relationships',
    where: {
      and: [
        { site: { equals: siteId } },
        { kind: { equals: 'mute' } },
        { status: { equals: 'active' } },
        {
          pairKey: {
            in: [
              `mute:${siteId}:${viewerMemberId}:${targetMemberId}`,
              `mute:${viewerMemberId}:${targetMemberId}`,
            ],
          },
        },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return mutes.docs.length > 0
}

/**
 * Profile projection and retrieval.
 */
export async function getPublicMemberProfile(
  payload: Payload,
  handleOrId: string,
  context: CommunityPolicyContext,
): Promise<CommunityPublicProfile> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handleOrId)
  const where: any = isUuid
    ? { or: [{ id: { equals: handleOrId } }, { member: { equals: handleOrId } }] }
    : { handle: { equals: handleOrId.toLowerCase() } }

  const res = await payload.find({
    collection: 'profiles',
    where,
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })

  const profile = (res.docs[0] as unknown as Record<string, unknown>) || undefined
  if (!profile) {
    throw new CommunityError('Profile not found', 404, 'PROFILE_NOT_FOUND')
  }

  const memberId =
    typeof profile.member === 'string'
      ? profile.member
      : String((profile.member as { id?: string })?.id ?? '')

  // Verify member status
  const member = (await payload.findByID({
    collection: 'members',
    id: memberId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!member || member.status !== 'active') {
    throw new CommunityError('Profile is unavailable', 404, 'MEMBER_UNAVAILABLE')
  }

  const decision = evaluateCommunityPolicy(context, {
    visibility: profile.visibility as string,
    authorMemberId: memberId,
  })

  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Access denied',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const projected = await loadProfileProjection(
    payload,
    String(profile.handle),
    context.siteId,
    context.actor.memberId,
  )
  return {
    ...projected.profile,
    createdAt: String(profile.createdAt ?? ''),
    visibility: projected.profile.visibility as CommunityPublicProfile['visibility'],
  }
}

/**
 * Updates a member's profile and returns the sanitized public projection.
 */
export async function updateMemberProfile(
  payload: Payload,
  input: {
    memberId: string
    handle?: string
    displayName?: string
    bio?: string
    avatarUrl?: string
    visibility?: 'public' | 'unlisted' | 'members' | 'private'
  },
  context: CommunityPolicyContext,
): Promise<CommunityPublicProfile> {
  const isSelf = context.actor.memberId === input.memberId
  const isPrivileged = context.actor.isStaff || context.actor.isModerator

  if (!isSelf && !isPrivileged) {
    throw new CommunityError(
      'Unauthorized to update this profile',
      403,
      'PROFILE_UPDATE_UNAUTHORIZED',
    )
  }

  const existingRes = await payload.find({
    collection: 'profiles',
    where: { member: { equals: input.memberId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const existing = existingRes.docs[0]
  if (!existing) {
    throw new CommunityError('Profile not found', 404, 'PROFILE_NOT_FOUND')
  }

  const updateData: Record<string, unknown> = {}
  if (input.handle !== undefined) updateData.handle = input.handle.trim().toLowerCase()
  if (input.displayName !== undefined) updateData.displayName = input.displayName.trim()
  if (input.bio !== undefined) updateData.bio = input.bio
  if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl
  if (input.visibility !== undefined) updateData.visibility = input.visibility

  const updated = (await payload.update({
    collection: 'profiles',
    id: existing.id,
    data: updateData,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>

  return sanitizeProfileProjection({
    ...updated,
    ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
  })
}

/**
 * Attached discussion for Comments on Content/Media.
 */
export async function getOrCreateAttachedDiscussion(
  payload: Payload,
  input: {
    siteId: string
    attachedToCollection: 'content' | 'media-assets' | 'albums'
    attachedToId: string
    title: string
    canonicalPath: string
    commentsPolicy?: 'open' | 'members' | 'closed'
  },
): Promise<CommunityDiscussionRecord> {
  // Bind to stable canonical content ID (attachedTo.value) and site_id, never URLs or slugs
  const discussions = await payload.find({
    collection: 'discussions',
    where: {
      and: [
        { site: { equals: input.siteId } },
        { kind: { equals: 'attached' } },
        { 'attachedTo.value': { equals: input.attachedToId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (discussions.docs[0]) {
    const existing = discussions.docs[0] as unknown as CommunityDiscussionRecord
    // If canonical path or title changed on parent content, update metadata without orphaning thread
    if (existing.canonicalPath !== input.canonicalPath || existing.title !== input.title) {
      if (typeof payload.update === 'function') {
        await payload.update({
          collection: 'discussions',
          id: existing.id,
          data: {
            canonicalPath: input.canonicalPath,
            title: input.title,
          },
          overrideAccess: true,
        })
      }
      return {
        ...existing,
        canonicalPath: input.canonicalPath,
        title: input.title,
      }
    }
    return existing
  }

  const created = (await payload.create({
    collection: 'discussions',
    data: {
      site: input.siteId,
      kind: 'attached',
      attachedTo: { relationTo: input.attachedToCollection, value: input.attachedToId },
      title: input.title,
      canonicalPath: input.canonicalPath,
      status: 'open',
      visibility: 'public',
      moderationState: 'clear',
      commentsPolicy: input.commentsPolicy ?? 'open',
      retentionMode: 'permanent',
      retentionHold: 'none',
    },
    overrideAccess: true,
  })) as unknown as CommunityDiscussionRecord

  return created
}

/**
 * Adds a comment to an attached discussion.
 */
export async function addComment(
  payload: Payload,
  input: AddCommentInput,
  context: CommunityPolicyContext,
): Promise<CommunityPostRecord> {
  enforceCommunityWriteRateLimit(context, 'comment')
  if (hasSanctionReadBoundary(payload))
    try {
      await assertMemberCanPost(payload, {
        siteId: input.siteId,
        memberId: input.authorMemberId,
        objectId: input.attachedToId,
      })
    } catch (error) {
      if (error instanceof ModerationActionError)
        throw new CommunityError(error.message, error.status, error.code)
      throw error
    }
  const discussion = await getOrCreateAttachedDiscussion(payload, {
    siteId: input.siteId,
    attachedToCollection: input.attachedToCollection,
    attachedToId: input.attachedToId,
    title: input.title,
    canonicalPath: input.canonicalPath,
  })

  const decision = evaluateCommunityPolicy(
    context,
    {
      siteId: input.siteId,
      status: discussion.status,
      commentsPolicy: discussion.commentsPolicy,
      moderationState: discussion.moderationState,
    },
    'comment',
  )

  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot comment',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const countRes = await payload.find({
    collection: 'discussion-posts',
    where: { discussion: { equals: discussion.id } },
    limit: 0,
    overrideAccess: true,
  })
  const nextOrder = countRes.totalDocs + 1
  const permalink = `${discussion.canonicalPath}#comment-${nextOrder}`

  const post = (await payload.create({
    collection: 'discussion-posts' as any,
    data: {
      discussion: discussion.id,
      authorMember: input.authorMemberId,
      body: input.body,
      parent: input.parentPostId ?? null,
      displayOrder: nextOrder,
      permalink,
      paginationAnchor: `comment-${nextOrder}`,
      status: 'published',
      visibility: 'public',
      moderationState: 'clear',
      attachments: input.attachments ?? [],
    } as any,
    overrideAccess: true,
  })) as unknown as CommunityPostRecord

  // Dispatch notification to content/discussion owner or parent comment author
  let recipientMemberId: string | undefined
  if (input.parentPostId) {
    const parentPost = (await payload.findByID({
      collection: 'discussion-posts',
      id: input.parentPostId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null
    if (parentPost && parentPost.authorMember) {
      recipientMemberId = String(
        typeof parentPost.authorMember === 'string'
          ? parentPost.authorMember
          : (parentPost.authorMember as { id?: string }).id,
      )
    }
  }

  if (recipientMemberId && recipientMemberId !== input.authorMemberId) {
    await dispatchCommunityNotification(payload, {
      siteId: input.siteId,
      recipientMemberId,
      actorMemberId: input.authorMemberId,
      type: 'comment.reply',
      object: { id: post.id, permalink: post.permalink },
      payloadData: { bodySnippet: input.body.slice(0, 120), discussionTitle: input.title },
    })
  }

  await emitCommunityEvent(payload, {
    type: 'community.comment_created',
    siteId: input.siteId,
    actorMemberId: input.authorMemberId,
    payload: { commentId: post.id, permalink: post.permalink, discussionId: discussion.id },
  })

  return { ...post, discussion: discussion.id }
}

/**
 * Lists published comments for an attached discussion with policy evaluation.
 */
export async function listDiscussionComments(
  payload: Payload,
  discussionId: string,
  context: CommunityPolicyContext,
): Promise<CommunityPostRecord[]> {
  const discussion = (await payload.findByID({
    collection: 'discussions',
    id: discussionId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!discussion) return []

  const discSite =
    typeof discussion.site === 'string'
      ? discussion.site
      : (discussion.site as { id?: string } | undefined)?.id
  if (discSite && discSite !== context.siteId) {
    throw new CommunityError('Tenant site mismatch', 404, 'SITE_MISMATCH')
  }

  const decision = evaluateCommunityPolicy(
    context,
    {
      siteId: String(discussion.site ?? context.siteId),
      visibility: String(discussion.visibility ?? 'public'),
      moderationState: String(discussion.moderationState ?? 'clear'),
      status: String(discussion.status ?? 'open'),
    },
    'read',
  )

  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot read discussion',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const postsRes = await payload.find({
    collection: 'discussion-posts',
    where: { discussion: { equals: discussionId } },
    sort: 'displayOrder',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })

  const viewerMemberId = context.actor.memberId
  const visible: CommunityPostRecord[] = []

  // Resolve author profiles in site scope
  const authorIds = Array.from(
    new Set(
      postsRes.docs
        .map((doc) => {
          const am = (doc as any).authorMember
          return typeof am === 'string' ? am : am?.id
        })
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const profileMap = new Map<
    string,
    { displayName: string; handle: string; avatarUrl?: string | null }
  >()
  if (authorIds.length > 0) {
    try {
      const profilesRes = await payload.find({
        collection: 'profiles',
        where: {
          and: [{ site: { equals: context.siteId } }, { member: { in: authorIds } }],
        },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })

      for (const p of profilesRes.docs) {
        const memberId = typeof p.member === 'string' ? p.member : (p.member as { id?: string })?.id
        if (memberId) {
          const sanitized = sanitizeProfileProjection(p as unknown as Record<string, unknown>)
          profileMap.set(memberId, {
            displayName: sanitized.displayName,
            handle: sanitized.handle,
            avatarUrl: sanitized.avatarUrl,
          })
        }
      }
    } catch {
      // profiles collection read fallback
    }
  }

  // Aggregate reactions from community_reactions
  const postIds = postsRes.docs.map((d) => String(d.id))
  const reactionsMap: Record<string, Record<string, number>> = {}
  const viewerReactionsMap: Record<string, string[]> = {}

  if (postIds.length > 0) {
    try {
      const rxRes = await queryDb(
        payload,
        `SELECT target_id, emoji, COUNT(*)::int as count
         FROM "community_reactions"
         WHERE site_id = $1 AND target_type = 'post' AND target_id = ANY($2)
         GROUP BY target_id, emoji`,
        [context.siteId, postIds],
      )
      for (const row of rxRes.rows) {
        const tid = String(row.target_id)
        if (!reactionsMap[tid]) reactionsMap[tid] = {}
        reactionsMap[tid][String(row.emoji)] = Number(row.count)
      }

      if (viewerMemberId) {
        const vrRes = await queryDb(
          payload,
          `SELECT target_id, emoji
           FROM "community_reactions"
           WHERE site_id = $1 AND member_id = $2 AND target_type = 'post' AND target_id = ANY($3)`,
          [context.siteId, viewerMemberId, postIds],
        )
        for (const row of vrRes.rows) {
          const tid = String(row.target_id)
          if (!viewerReactionsMap[tid]) viewerReactionsMap[tid] = []
          viewerReactionsMap[tid].push(String(row.emoji))
        }
      }
    } catch {
      // reaction query fallback
    }
  }

  for (const doc of postsRes.docs) {
    const post = doc as unknown as CommunityPostRecord
    const authorId =
      typeof post.authorMember === 'string'
        ? post.authorMember
        : (post.authorMember as { id?: string } | undefined)?.id

    // Check tombstone / removed state
    const isRemoved = post.status === 'removed' || post.moderationState === 'removed'
    if (isRemoved) {
      if ((post as any).tombstoneLabel) {
        const tombstoneLabel = (post as any).tombstoneLabel
        visible.push({
          ...post,
          body: tombstoneLabel,
          isTombstone: true,
          tombstoneLabel,
          authorProfile: undefined,
          reactions: {},
          viewerReactions: [],
        })
      }
      continue
    }

    let isBlocked = false
    let isMuted = false
    if (viewerMemberId && authorId) {
      const [rel, muted] = await Promise.all([
        checkBlockBetween(payload, viewerMemberId, authorId, context.siteId),
        checkMuteFrom(payload, viewerMemberId, authorId, context.siteId),
      ])
      isBlocked = rel.isBlocked
      isMuted = muted
    }

    const postDecision = evaluateCommunityPolicy(
      context,
      {
        siteId: context.siteId,
        authorMemberId: authorId,
        visibility: post.visibility,
        moderationState: post.moderationState,
        status: post.status,
      },
      'read',
      { isBlocked, isMuted },
    )

    if (postDecision.allowed) {
      visible.push({
        ...post,
        isTombstone: false,
        authorProfile: authorId ? profileMap.get(authorId) : undefined,
        reactions: reactionsMap[post.id] ?? {},
        viewerReactions: viewerReactionsMap[post.id] ?? [],
      })
    }
  }

  return visible
}

/**
 * Edits an existing comment post. Only allowed by author while active.
 */
export async function editComment(
  payload: Payload,
  input: EditCommentInput,
  context: CommunityPolicyContext,
): Promise<CommunityPostRecord> {
  enforceCommunityWriteRateLimit(context, 'comment')
  const post = (await payload.findByID({
    collection: 'discussion-posts',
    id: input.commentId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!post) {
    throw new CommunityError('Comment not found', 404, 'COMMENT_NOT_FOUND')
  }

  const discussion = (await payload.findByID({
    collection: 'discussions',
    id: String(post.discussion),
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!discussion || String(discussion.site) !== input.siteId) {
    throw new CommunityError('Tenant site mismatch', 403, 'SITE_MISMATCH')
  }

  const authorId =
    typeof post.authorMember === 'string'
      ? post.authorMember
      : (post.authorMember as { id?: string } | undefined)?.id

  const decision = evaluateCommunityPolicy(
    context,
    {
      siteId: input.siteId,
      authorMemberId: authorId,
      status: String(post.status ?? 'published'),
      moderationState: String(post.moderationState ?? 'clear'),
    },
    'edit',
  )

  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot edit comment',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const trimmedBody = input.body.trim()
  if (!trimmedBody) {
    throw new CommunityError('Comment body cannot be empty', 400, 'EMPTY_BODY')
  }

  const updated = (await payload.update({
    collection: 'discussion-posts' as any,
    id: input.commentId,
    data: {
      body: trimmedBody,
    } as any,
    overrideAccess: true,
  })) as unknown as CommunityPostRecord

  await emitCommunityEvent(payload, {
    type: 'community.comment_edited',
    siteId: input.siteId,
    actorMemberId: input.authorMemberId,
    payload: { commentId: updated.id, discussionId: String(post.discussion) },
  })

  return updated
}

/**
 * Soft-deletes a comment post and creates a durable tombstone preserving discussion tree integrity.
 */
export async function deleteComment(
  payload: Payload,
  input: DeleteCommentInput,
  context: CommunityPolicyContext,
): Promise<{ success: boolean; tombstoneLabel: string }> {
  const post = (await payload.findByID({
    collection: 'discussion-posts',
    id: input.commentId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!post) {
    throw new CommunityError('Comment not found', 404, 'COMMENT_NOT_FOUND')
  }

  const discussion = (await payload.findByID({
    collection: 'discussions',
    id: String(post.discussion),
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!discussion || String(discussion.site) !== input.siteId) {
    throw new CommunityError('Tenant site mismatch', 403, 'SITE_MISMATCH')
  }

  const authorId =
    typeof post.authorMember === 'string'
      ? post.authorMember
      : (post.authorMember as { id?: string } | undefined)?.id

  const decision = evaluateCommunityPolicy(
    context,
    {
      siteId: input.siteId,
      authorMemberId: authorId,
      status: String(post.status ?? 'published'),
      moderationState: String(post.moderationState ?? 'clear'),
    },
    'delete',
  )

  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot delete comment',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const isPrivileged = context.actor.isStaff || context.actor.isModerator
  const isAuthor = context.actor.memberId === authorId

  const tombstoneLabel =
    isPrivileged && !isAuthor ? '[Comment removed by moderator]' : '[Comment deleted by author]'

  await payload.update({
    collection: 'discussion-posts' as any,
    id: input.commentId,
    data: {
      status: 'removed',
      tombstoneLabel,
      moderationState: isPrivileged && !isAuthor ? 'removed' : 'clear',
    } as any,
    overrideAccess: true,
  })

  await emitCommunityEvent(payload, {
    type: 'community.comment_deleted',
    siteId: input.siteId,
    actorMemberId: context.actor.memberId,
    payload: {
      commentId: input.commentId,
      discussionId: String(post.discussion),
      tombstoneLabel,
      reason: input.reason,
    },
  })

  return { success: true, tombstoneLabel }
}

/**
 * Creates a new forum thread.
 */
export async function createForumThread(
  payload: Payload,
  input: CreateThreadInput,
  context: CommunityPolicyContext,
): Promise<{ discussion: CommunityDiscussionRecord; firstPost: CommunityPostRecord }> {
  enforceCommunityWriteRateLimit(context, 'thread')
  if (hasSanctionReadBoundary(payload))
    try {
      await assertMemberCanPost(payload, {
        siteId: input.siteId,
        memberId: input.authorMemberId,
        objectId: input.forumId,
      })
    } catch (error) {
      if (error instanceof ModerationActionError)
        throw new CommunityError(error.message, error.status, error.code)
      throw error
    }
  const forum = (await payload.findByID({
    collection: 'forums',
    id: input.forumId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!forum) {
    throw new CommunityError('Forum not found', 404, 'FORUM_NOT_FOUND')
  }

  const decision = evaluateCommunityPolicy(
    context,
    {
      siteId: input.siteId,
    },
    'create_thread',
  )

  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot create thread',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const slug = `${input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${randomUUID().slice(0, 8)}`
  const canonicalPath = `/forums/${forum.slug}/${slug}`

  const discussion = (await payload.create({
    collection: 'discussions',
    data: {
      site: input.siteId,
      kind: 'thread',
      forum: input.forumId,
      owner: input.authorMemberId,
      title: input.title,
      canonicalPath,
      status: 'open',
      visibility: input.visibility ?? 'public',
      moderationState: 'clear',
      commentsPolicy: 'open',
      retentionMode: 'permanent',
      retentionHold: 'none',
    },
    overrideAccess: true,
  })) as unknown as CommunityDiscussionRecord

  const permalink = `${canonicalPath}#post-1`
  const firstPost = (await payload.create({
    collection: 'discussion-posts' as any,
    data: {
      discussion: discussion.id,
      authorMember: input.authorMemberId,
      body: input.body,
      displayOrder: 1,
      permalink,
      paginationAnchor: 'post-1',
      status: 'published',
      visibility: input.visibility ?? 'public',
      moderationState: 'clear',
      attachments: input.attachments ?? [],
    } as any,
    overrideAccess: true,
  })) as unknown as CommunityPostRecord

  await emitCommunityEvent(payload, {
    type: 'community.reply_created',
    siteId: input.siteId,
    actorMemberId: input.authorMemberId,
    payload: { discussionId: discussion.id, postId: firstPost.id, title: input.title },
  })

  return { discussion, firstPost: { ...firstPost, discussion: discussion.id } }
}

/**
 * Replies to an existing forum thread.
 */
export async function replyToForumThread(
  payload: Payload,
  input: ReplyPostInput,
  context: CommunityPolicyContext,
): Promise<CommunityPostRecord> {
  enforceCommunityWriteRateLimit(context, 'reply')
  if (hasSanctionReadBoundary(payload))
    try {
      await assertMemberCanPost(payload, {
        siteId: input.siteId,
        memberId: input.authorMemberId,
        objectId: input.discussionId,
      })
    } catch (error) {
      if (error instanceof ModerationActionError)
        throw new CommunityError(error.message, error.status, error.code)
      throw error
    }
  const discussion = (await payload.findByID({
    collection: 'discussions',
    id: input.discussionId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!discussion) {
    throw new CommunityError('Thread not found', 404, 'THREAD_NOT_FOUND')
  }

  const decision = evaluateCommunityPolicy(
    context,
    {
      siteId: input.siteId,
      status: String(discussion.status ?? 'open'),
      commentsPolicy: String(discussion.commentsPolicy ?? 'open'),
      moderationState: String(discussion.moderationState ?? 'clear'),
    },
    'reply',
  )

  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot reply to thread',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const countRes = await payload.find({
    collection: 'discussion-posts',
    where: { discussion: { equals: input.discussionId } },
    limit: 0,
    overrideAccess: true,
  })
  const nextOrder = countRes.totalDocs + 1
  const permalink = `${String(discussion.canonicalPath)}#post-${nextOrder}`

  const post = (await payload.create({
    collection: 'discussion-posts' as any,
    data: {
      discussion: input.discussionId,
      authorMember: input.authorMemberId,
      body: input.body,
      parent: input.parentPostId ?? null,
      quote: input.quotePostId ?? null,
      displayOrder: nextOrder,
      permalink,
      paginationAnchor: `post-${nextOrder}`,
      status: 'published',
      visibility: 'public',
      moderationState: 'clear',
      attachments: input.attachments ?? [],
    },
    overrideAccess: true,
  })) as unknown as CommunityPostRecord

  // Notify thread owner or parent author
  const threadOwnerId =
    typeof discussion.owner === 'string'
      ? discussion.owner
      : (discussion.owner as { id?: string } | undefined)?.id

  if (threadOwnerId && threadOwnerId !== input.authorMemberId) {
    await dispatchCommunityNotification(payload, {
      siteId: input.siteId,
      recipientMemberId: threadOwnerId,
      actorMemberId: input.authorMemberId,
      type: 'thread.reply',
      object: { id: post.id, permalink: post.permalink },
      payloadData: { threadTitle: String(discussion.title), snippet: input.body.slice(0, 120) },
    })
  }

  await emitCommunityEvent(payload, {
    type: 'community.reply_created',
    siteId: input.siteId,
    actorMemberId: input.authorMemberId,
    payload: { discussionId: input.discussionId, postId: post.id },
  })

  return { ...post, discussion: input.discussionId }
}

/**
 * Reactions: Add or remove an emoji reaction.
 */
export async function toggleCommunityReaction(
  payload: Payload,
  input: {
    siteId: string
    memberId: string
    targetType: 'post' | 'discussion' | 'content'
    targetId: string
    emoji: string
  },
  context?: CommunityPolicyContext,
): Promise<{ added: boolean; emoji: string; count: number }> {
  const policyContext = context ?? {
    siteId: input.siteId,
    actor: {
      kind: 'member' as const,
      memberId: input.memberId,
      status: 'active' as const,
      isStaff: false,
      isModerator: false,
    },
  }
  const decision = evaluateCommunityPolicy(policyContext, { siteId: input.siteId }, 'react')
  enforceCommunityWriteRateLimit(policyContext, 'reaction')
  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot react',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const existing = await queryDb(
    payload,
    `SELECT id FROM "community_reactions" 
     WHERE site_id = $1 AND member_id = $2 AND target_type = $3 AND target_id = $4 AND emoji = $5`,
    [input.siteId, input.memberId, input.targetType, input.targetId, input.emoji],
  )

  let added = false
  if (existing.rows.length > 0) {
    await queryDb(payload, `DELETE FROM "community_reactions" WHERE id = $1`, [existing.rows[0].id])
    added = false
  } else {
    await queryDb(
      payload,
      `INSERT INTO "community_reactions" (site_id, member_id, target_type, target_id, emoji)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.siteId, input.memberId, input.targetType, input.targetId, input.emoji],
    )
    added = true
  }

  const countRes = await queryDb(
    payload,
    `SELECT COUNT(*)::int as count FROM "community_reactions"
     WHERE site_id = $1 AND target_type = $2 AND target_id = $3 AND emoji = $4`,
    [input.siteId, input.targetType, input.targetId, input.emoji],
  )

  const count = Number(countRes.rows[0]?.count ?? 0)

  await emitCommunityEvent(payload, {
    type: 'community.reaction_updated',
    siteId: input.siteId,
    actorMemberId: input.memberId,
    payload: {
      targetType: input.targetType,
      targetId: input.targetId,
      emoji: input.emoji,
      count,
      added,
    },
  })

  return { added, emoji: input.emoji, count }
}

/**
 * Blocks another member.
 */
export async function blockMember(
  payload: Payload,
  input: { siteId: string; subjectMemberId: string; targetMemberId: string },
): Promise<void> {
  if (input.subjectMemberId === input.targetMemberId) {
    throw new CommunityError('Cannot block yourself', 400, 'SELF_BLOCK')
  }

  const pairKey = `block:${input.subjectMemberId}:${input.targetMemberId}`
  const existing = await payload.find({
    collection: 'relationships',
    where: { pairKey: { equals: pairKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'relationships',
      id: existing.docs[0].id,
      data: { status: 'active' },
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'relationships',
      data: {
        site: input.siteId,
        subject: input.subjectMemberId,
        object: { relationTo: 'members', value: input.targetMemberId },
        kind: 'block',
        status: 'active',
        visibility: 'private',
        pairKey,
      },
      overrideAccess: true,
    })
  }
}

/**
 * Submits a community report.
 */
export async function submitCommunityReport(
  payload: Payload,
  input: {
    siteId: string
    reporterId: string
    targetType: 'post' | 'discussion' | 'member'
    targetId: string
    reason: string
    details?: string
  },
  context: CommunityPolicyContext,
): Promise<string> {
  const decision = evaluateCommunityPolicy(context, { siteId: input.siteId }, 'report')
  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot report',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const res = await queryDb(
    payload,
    `INSERT INTO "community_reports" (site_id, reporter_id, target_type, target_id, reason, details, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [
      input.siteId,
      input.reporterId,
      input.targetType,
      input.targetId,
      input.reason,
      input.details ?? null,
    ],
  )

  return String(res.rows[0].id)
}

/**
 * Executes a moderator decision (dismiss, restrict, remove, suspend).
 */
export async function executeModerationDecision(
  payload: Payload,
  input: {
    siteId: string
    moderatorActor: CommunityActor
    reportId?: string
    targetType: 'post' | 'discussion' | 'member'
    targetId: string
    action: 'clear' | 'warn' | 'restrict' | 'remove' | 'suspend'
    reason: string
    details?: Record<string, unknown>
  },
  context: CommunityPolicyContext,
): Promise<void> {
  const decision = evaluateCommunityPolicy(context, { siteId: input.siteId }, 'moderate')
  if (!decision.allowed) {
    throw new CommunityError('Moderator authorization required', 403, 'MODERATION_DENIED')
  }

  const now = new Date()

  // Apply action to the target entity
  if (input.targetType === 'post') {
    const post = (await payload.findByID({
      collection: 'discussion-posts',
      id: input.targetId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null

    if (post) {
      const updateData: Record<string, unknown> = {}
      if (input.action === 'remove') {
        updateData.moderationState = 'removed'
        updateData.status = 'removed'
      } else if (input.action === 'restrict') {
        updateData.moderationState = 'restricted'
      } else if (input.action === 'clear') {
        updateData.moderationState = 'clear'
        updateData.status = 'published'
      }
      if (Object.keys(updateData).length > 0) {
        await payload.update({
          collection: 'discussion-posts',
          id: input.targetId,
          data: updateData,
          overrideAccess: true,
        })
      }
    }
  } else if (input.targetType === 'discussion') {
    const disc = (await payload.findByID({
      collection: 'discussions',
      id: input.targetId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null

    if (disc) {
      const updateData: Record<string, unknown> = {}
      if (input.action === 'remove') {
        updateData.moderationState = 'removed'
        updateData.status = 'archived'
      } else if (input.action === 'restrict') {
        updateData.moderationState = 'restricted'
      } else if (input.action === 'clear') {
        updateData.moderationState = 'clear'
      }
      if (Object.keys(updateData).length > 0) {
        await payload.update({
          collection: 'discussions',
          id: input.targetId,
          data: updateData,
          overrideAccess: true,
        })
      }
    }
  } else if (input.targetType === 'member' || input.action === 'suspend') {
    // Member lifecycle is the sole authority for state changes and revocation.
    // The pre-COMM-01 `disabled` value is no longer a valid account state.
    await changeMemberAccountState(
      payload as never,
      {
        actorUserId: input.moderatorActor.userId ?? input.moderatorActor.memberId ?? 'system',
        memberId: input.targetId,
        state: input.action === 'clear' ? 'active' : 'suspended',
        reason: input.reason,
      },
      now,
    )
    await payload.update({
      collection: 'members',
      id: input.targetId,
      data: {
        disabledAt: input.action === 'clear' ? null : now.toISOString(),
        moderationReason: input.reason,
      },
      overrideAccess: true,
    })
  }

  // Record moderation action audit entry
  const actorLabel = input.moderatorActor.userId
    ? `user:${input.moderatorActor.userId}`
    : `member:${input.moderatorActor.memberId}`

  await queryDb(
    payload,
    `INSERT INTO "moderation_actions" (site_id, actor, target_type, target_id, action, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.siteId,
      actorLabel,
      input.targetType,
      input.targetId,
      input.action,
      input.reason,
      JSON.stringify(input.details ?? {}),
    ],
  )

  // Mark report resolved if provided
  if (input.reportId) {
    await queryDb(
      payload,
      `UPDATE "community_reports"
       SET status = 'resolved', resolution = $1, resolved_by = $2, resolved_at = now(), updated_at = now()
       WHERE id = $3`,
      [input.action, actorLabel, input.reportId],
    )
  }

  await emitCommunityEvent(payload, {
    type: 'community.moderation_applied',
    siteId: input.siteId,
    payload: {
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
    },
  })
}

/**
 * Direct Messaging: Starts or retrieves a 1-on-1 direct conversation between two members.
 */
async function activeMemberOutput(payload: Payload, memberId: string): Promise<boolean> {
  const member = (await payload
    .findByID({ collection: 'members', id: memberId, depth: 0, overrideAccess: true } as never)
    .catch(() => null)) as Record<string, unknown> | null
  return member?.status === 'active' || member?.status === 'restricted'
}

/**
 * The message table is intentionally never a read boundary.  Re-evaluate
 * participant blocks and sender mutes at read time so an interaction made
 * after delivery cannot be recovered through an old conversation URL.
 */
export async function listConversationMessages(
  payload: Payload,
  conversationId: string,
  context: CommunityPolicyContext,
): Promise<CommunityMessageRecord[]> {
  const conversation = await queryDb(
    payload,
    `SELECT id, site_id, status FROM "community_conversations" WHERE id = $1 LIMIT 1`,
    [conversationId],
  )
  const row = conversation.rows[0] as
    | { id?: unknown; site_id?: unknown; status?: unknown }
    | undefined
  if (!row || String(row.site_id) !== context.siteId)
    throw new CommunityError('Conversation unavailable', 404, 'CONVERSATION_UNAVAILABLE')
  const participantRows = await queryDb(
    payload,
    `SELECT member_id FROM "community_conversation_participants" WHERE conversation_id = $1`,
    [conversationId],
  )
  const participants = participantRows.rows.map((item: { member_id: unknown }) =>
    String(item.member_id),
  )
  if (!context.actor.memberId || !participants.includes(context.actor.memberId))
    throw new CommunityError('Access denied to this conversation', 403, 'NOT_PARTICIPANT')
  for (const participant of participants) {
    if (participant === context.actor.memberId) continue
    const relation = await checkBlockBetween(
      payload,
      context.actor.memberId,
      participant,
      context.siteId,
    )
    const decision = evaluateCommunityPolicy(
      context,
      { siteId: context.siteId, participants, status: String(row.status ?? 'active') },
      'read',
      relation,
    )
    if (!decision.allowed)
      throw new CommunityError('Conversation unavailable', 404, 'CONVERSATION_UNAVAILABLE')
  }
  const messages = await queryDb(
    payload,
    `SELECT id, conversation_id, sender_id, body, attachments, read_by, created_at, updated_at
     FROM "community_messages" WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 100`,
    [conversationId],
  )
  const visible: CommunityMessageRecord[] = []
  for (const message of messages.rows as Array<Record<string, unknown>>) {
    const senderId = String(message.sender_id)
    if (!(await activeMemberOutput(payload, senderId))) continue
    const relation =
      senderId === context.actor.memberId
        ? { isBlocked: false, isMuted: false }
        : {
            ...(await checkBlockBetween(
              payload,
              context.actor.memberId!,
              senderId,
              context.siteId,
            )),
            isMuted: await checkMuteFrom(
              payload,
              context.actor.memberId!,
              senderId,
              context.siteId,
            ),
          }
    if (
      !evaluateCommunityPolicy(
        context,
        { siteId: context.siteId, authorMemberId: senderId },
        'read',
        relation,
      ).allowed
    )
      continue
    visible.push({
      id: String(message.id),
      conversationId: String(message.conversation_id),
      senderId,
      body: String(message.body),
      attachments: Array.isArray(message.attachments) ? (message.attachments as string[]) : [],
      readBy: Array.isArray(message.read_by) ? (message.read_by as string[]) : [],
      createdAt: String(message.created_at),
      updatedAt: String(message.updated_at),
    })
  }
  return visible
}

export async function startOrGetConversation(
  payload: Payload,
  input: { siteId: string; initiatorMemberId: string; recipientMemberId: string; title?: string },
  context: CommunityPolicyContext,
): Promise<CommunityConversationRecord> {
  enforceCommunityWriteRateLimit(context, 'conversation')
  const rel = await checkBlockBetween(
    payload,
    input.initiatorMemberId,
    input.recipientMemberId,
    input.siteId,
  )
  const decision = evaluateCommunityPolicy(context, { siteId: input.siteId }, 'message', rel)
  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot initiate conversation',
      decision.status ?? 403,
      decision.reason,
    )
  }

  // Find existing conversation with exactly these two participants
  const existingRes = await queryDb(
    payload,
    `SELECT c.id, c.site_id, c.title, c.status, c.last_message_at, c.created_at, c.updated_at
     FROM "community_conversations" c
     JOIN "community_conversation_participants" p1 ON p1.conversation_id = c.id AND p1.member_id = $1
     JOIN "community_conversation_participants" p2 ON p2.conversation_id = c.id AND p2.member_id = $2
     WHERE c.site_id = $3
     LIMIT 1`,
    [input.initiatorMemberId, input.recipientMemberId, input.siteId],
  )

  if (existingRes.rows.length > 0) {
    const row = existingRes.rows[0]
    return {
      id: String(row.id),
      siteId: String(row.site_id),
      title: row.title ? String(row.title) : null,
      status: (row.status as CommunityConversationRecord['status']) ?? 'active',
      lastMessageAt: String(row.last_message_at),
      participants: [input.initiatorMemberId, input.recipientMemberId],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }
  }

  // Create new conversation
  const convRes = await queryDb(
    payload,
    `INSERT INTO "community_conversations" (site_id, title, status)
     VALUES ($1, $2, 'active')
     RETURNING id, site_id, title, status, last_message_at, created_at, updated_at`,
    [input.siteId, input.title ?? null],
  )
  const convId = String(convRes.rows[0].id)

  await queryDb(
    payload,
    `INSERT INTO "community_conversation_participants" (conversation_id, member_id)
     VALUES ($1, $2), ($1, $3)`,
    [convId, input.initiatorMemberId, input.recipientMemberId],
  )

  return {
    id: convId,
    siteId: input.siteId,
    title: input.title ?? null,
    status: 'active',
    lastMessageAt: new Date().toISOString(),
    participants: [input.initiatorMemberId, input.recipientMemberId],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Sends a direct message in a conversation.
 */
export async function sendDirectMessage(
  payload: Payload,
  input: DirectMessageInput,
  context: CommunityPolicyContext,
): Promise<CommunityMessageRecord> {
  enforceCommunityWriteRateLimit(context, 'message')
  if (!input.conversationId && input.recipientMemberId) {
    const conv = await startOrGetConversation(
      payload,
      {
        siteId: input.siteId,
        initiatorMemberId: input.senderMemberId,
        recipientMemberId: input.recipientMemberId,
      },
      context,
    )
    input.conversationId = conv.id
  }

  if (!input.conversationId) {
    throw new CommunityError('Conversation ID is required', 400, 'CONVERSATION_REQUIRED')
  }

  // Verify participant status
  const partRes = await queryDb(
    payload,
    `SELECT member_id FROM "community_conversation_participants" WHERE conversation_id = $1`,
    [input.conversationId],
  )
  const participants = partRes.rows.map((r: { member_id: unknown }) => String(r.member_id))
  if (!participants.includes(input.senderMemberId)) {
    throw new CommunityError('Not a participant in this conversation', 403, 'NOT_PARTICIPANT')
  }

  // Check blocks against other participants
  for (const p of participants) {
    if (p !== input.senderMemberId) {
      const rel = await checkBlockBetween(payload, input.senderMemberId, p, context.siteId)
      if (rel.isBlocked) {
        throw new CommunityError(
          'Cannot send message to blocked participant',
          403,
          'BLOCKED_COMMUNICATION',
        )
      }
    }
  }

  const decision = evaluateCommunityPolicy(
    context,
    {
      siteId: input.siteId,
      participants,
    },
    'message',
  )

  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot send message',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const msgRes = await queryDb(
    payload,
    `INSERT INTO "community_messages" (conversation_id, sender_id, body, attachments, read_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, conversation_id, sender_id, body, attachments, read_by, created_at, updated_at`,
    [
      input.conversationId,
      input.senderMemberId,
      input.body,
      JSON.stringify(input.attachments ?? []),
      JSON.stringify([input.senderMemberId]),
    ],
  )

  await queryDb(
    payload,
    `UPDATE "community_conversations" SET last_message_at = now(), updated_at = now() WHERE id = $1`,
    [input.conversationId],
  )

  const msgRow = msgRes.rows[0]
  const message: CommunityMessageRecord = {
    id: String(msgRow.id),
    conversationId: String(msgRow.conversation_id),
    senderId: String(msgRow.sender_id),
    body: String(msgRow.body),
    attachments: (msgRow.attachments as string[]) ?? [],
    readBy: (msgRow.read_by as string[]) ?? [],
    createdAt: String(msgRow.created_at),
    updatedAt: String(msgRow.updated_at),
  }

  // Notify recipients
  for (const recipientId of participants) {
    if (recipientId !== input.senderMemberId) {
      await dispatchCommunityNotification(payload, {
        siteId: input.siteId,
        recipientMemberId: recipientId,
        actorMemberId: input.senderMemberId,
        type: 'direct_message.received',
        object: { conversationId: input.conversationId, messageId: message.id },
        payloadData: { preview: input.body.slice(0, 80) },
      })
      await emitCommunityEvent(payload, {
        type: 'community.message_sent',
        siteId: input.siteId,
        recipientMemberId: recipientId,
        actorMemberId: input.senderMemberId,
        payload: { conversationId: input.conversationId, messageId: message.id },
      })
    }
  }

  return message
}

/**
 * Dispatches a notification to a member.
 */
export async function dispatchCommunityNotification(
  payload: Payload,
  input: {
    siteId: string
    recipientMemberId: string
    actorMemberId?: string
    type: string
    object: Record<string, unknown>
    payloadData: Record<string, unknown>
  },
): Promise<void> {
  // A block or one-way mute suppresses both future and queued notification payloads.
  if (input.actorMemberId) {
    const [rel, muted] = await Promise.all([
      checkBlockBetween(payload, input.recipientMemberId, input.actorMemberId, input.siteId),
      checkMuteFrom(payload, input.recipientMemberId, input.actorMemberId, input.siteId),
    ])
    if (rel.isBlocked || muted) return
  }

  const activity = await payload.create({
    collection: 'activity-events',
    data: {
      site: input.siteId,
      type: input.type,
      actor: input.actorMemberId ? { memberId: input.actorMemberId } : { system: true },
      object: input.object,
      payload: input.payloadData,
      occurredAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'notifications',
    data: {
      activityEvent: activity.id,
      recipientMember: input.recipientMemberId,
      status: 'unread',
      channels: ['in-app'],
    },
    overrideAccess: true,
  })

  await emitCommunityEvent(payload, {
    type: 'community.notification_dispatched',
    siteId: input.siteId,
    recipientMemberId: input.recipientMemberId,
    actorMemberId: input.actorMemberId,
    payload: { type: input.type, object: input.object },
  })
}

/**
 * Fetches notifications for a member.
 */
export async function getMemberNotifications(
  payload: Payload,
  memberId: string,
  context: CommunityPolicyContext,
): Promise<Array<Record<string, unknown>>> {
  const canReadAnotherMember = context.actor.isStaff || context.actor.isModerator
  if (context.actor.memberId !== memberId && !canReadAnotherMember) {
    throw new CommunityError(
      'Cannot read another member notifications',
      403,
      'NOTIFICATION_OWNER_REQUIRED',
    )
  }

  const decision = evaluateCommunityPolicy(context, { authorMemberId: memberId }, 'read')
  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot read notifications',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const res = await payload.find({
    collection: 'notifications',
    where: { recipientMember: { equals: memberId } },
    sort: '-createdAt',
    limit: 50,
    depth: 1,
    overrideAccess: true,
  })

  const visible: Array<Record<string, unknown>> = []
  const relationCache = new Map<string, boolean>()
  for (const notification of res.docs as unknown as Array<Record<string, unknown>>) {
    const relation = notification.activityEvent
    const activity =
      relation && typeof relation === 'object'
        ? (relation as Record<string, unknown>)
        : ((await payload
            .findByID({
              collection: 'activity-events',
              id: String(relation ?? ''),
              depth: 0,
              overrideAccess: true,
            } as never)
            .catch(() => null)) as Record<string, unknown> | null)
    if (!activity) continue
    const site = activity.site
    const activitySiteId =
      typeof site === 'string' ? site : String((site as { id?: string } | null)?.id ?? '')
    if (activitySiteId !== context.siteId) continue
    const actor = activity.actor as { memberId?: unknown } | null
    const actorId = typeof actor?.memberId === 'string' ? actor.memberId : ''
    if (actorId && actorId !== memberId) {
      let hidden = relationCache.get(actorId)
      if (hidden === undefined) {
        const [block, mute] = await Promise.all([
          checkBlockBetween(payload, memberId, actorId, context.siteId),
          checkMuteFrom(payload, memberId, actorId, context.siteId),
        ])
        hidden = block.isBlocked || mute
        relationCache.set(actorId, hidden)
      }
      if (hidden) continue
    }
    visible.push(notification)
  }
  return visible
}

/**
 * Returns member history: comments, discussions, and conversations.
 */
export async function getMemberActivityHistory(
  payload: Payload,
  memberId: string,
  context: CommunityPolicyContext,
): Promise<{
  comments: CommunityPostRecord[]
  threads: CommunityDiscussionRecord[]
  conversationsCount: number
}> {
  const canReadAnotherMember = context.actor.isStaff || context.actor.isModerator
  if (context.actor.memberId !== memberId && !canReadAnotherMember) {
    throw new CommunityError('Cannot view another member history', 403, 'HISTORY_OWNER_REQUIRED')
  }

  const decision = evaluateCommunityPolicy(context, { authorMemberId: memberId }, 'read')
  if (!decision.allowed) {
    throw new CommunityError(
      decision.reason ?? 'Cannot view history',
      decision.status ?? 403,
      decision.reason,
    )
  }

  const postsRes = await payload.find({
    collection: 'discussion-posts',
    where: { authorMember: { equals: memberId } },
    sort: '-createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })

  const discussionsRes = await payload.find({
    collection: 'discussions',
    where: { owner: { equals: memberId } },
    sort: '-createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })

  const convCountRes = await queryDb(
    payload,
    `SELECT COUNT(*)::int as count FROM "community_conversation_participants" WHERE member_id = $1`,
    [memberId],
  )

  return {
    comments: postsRes.docs as unknown as CommunityPostRecord[],
    threads: discussionsRes.docs as unknown as CommunityDiscussionRecord[],
    conversationsCount: Number(convCountRes.rows[0]?.count ?? 0),
  }
}
