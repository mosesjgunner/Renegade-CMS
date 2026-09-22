import type {
  CommunityAction,
  CommunityActor,
  CommunityPolicyContext,
  CommunityPolicyDecision,
  CommunityPublicProfile,
} from './contracts'

export type RelationshipCheck = {
  isBlocked: boolean
  isMuted?: boolean
  isFollowing?: boolean
}

export type PolicyTarget = {
  id?: string
  siteId?: string
  site?: string | { id?: string }
  ownerId?: string | null
  authorMemberId?: string | null
  participants?: string[]
  visibility?: 'public' | 'unlisted' | 'members' | 'friends' | 'private' | string
  moderationState?: 'clear' | 'review' | 'restricted' | 'removed' | string
  status?: string
  commentsPolicy?: 'open' | 'members' | 'closed' | string
  retentionMode?: string
  retentionExpiresAt?: string | null
  retentionHold?: string
  deletedAt?: string | null
}

const resolveSiteId = (target: PolicyTarget): string | undefined => {
  if (target.siteId) return target.siteId
  if (typeof target.site === 'string') return target.site
  if (target.site && typeof target.site === 'object' && target.site.id) return target.site.id
  return undefined
}

export function evaluateCommunityPolicy(
  context: CommunityPolicyContext,
  target?: PolicyTarget,
  action: CommunityAction = 'read',
  rel?: RelationshipCheck,
): CommunityPolicyDecision {
  const safeContext: CommunityPolicyContext = context ?? {
    siteId: target ? (resolveSiteId(target) ?? 'default') : 'default',
    actor: { kind: 'anonymous', isStaff: false, isModerator: false },
  }
  const now = safeContext.now ?? new Date()
  const { actor } = safeContext

  // 1. Site Tenant Boundary Check
  if (target) {
    const targetSiteId = resolveSiteId(target)
    if (targetSiteId && targetSiteId !== context.siteId) {
      return { allowed: false, reason: 'cross_site_forbidden', status: 403 }
    }
  }

  // 2. Suspended / Disabled Actor Check
  if (actor.kind === 'member' && actor.status && actor.status !== 'active') {
    return {
      allowed: false,
      reason: actor.status === 'archived' ? 'member_archived' : 'member_suspended',
      status: 403,
    }
  }

  // 3. Target Deletion & Retention Check
  if (target) {
    if (target.retentionHold === 'burn' || target.retentionMode === 'manual-burn') {
      return { allowed: false, reason: 'record_burned', status: 410 }
    }
    if (action === 'edit' && (target.status === 'removed' || target.moderationState === 'removed' || target.deletedAt || target.retentionMode === 'tombstone')) {
      return { allowed: false, reason: 'cannot_edit_removed_content', status: 400 }
    }
    if (target.deletedAt || target.retentionMode === 'tombstone' || target.status === 'removed') {
      return { allowed: false, reason: 'record_deleted', status: 404, redacted: true }
    }
    if (
      target.retentionMode === 'expire-at' &&
      target.retentionExpiresAt &&
      new Date(target.retentionExpiresAt) <= now &&
      (!target.retentionHold || target.retentionHold === 'none')
    ) {
      return { allowed: false, reason: 'retention_expired', status: 404 }
    }
  }

  // 4. Block Precedence Check
  if (rel?.isBlocked) {
    if (action === 'message') {
      return { allowed: false, reason: 'blocked_communication', status: 403 }
    }
    if (action === 'reply' || action === 'comment' || action === 'react') {
      return { allowed: false, reason: 'blocked_by_user', status: 403 }
    }
    if (action === 'read') {
      if (target?.participants)
        return { allowed: false, reason: 'blocked_conversation', status: 403 }
      if (target?.authorMemberId)
        return { allowed: false, reason: 'blocked_member_content', status: 404 }
    }
  }
  if (rel?.isMuted && action === 'read' && target?.authorMemberId)
    return { allowed: false, reason: 'muted_member_content', status: 404 }

  // 5. Moderation Action Privilege
  if (action === 'moderate') {
    if (actor.isStaff || actor.isModerator) {
      return { allowed: true }
    }
    return { allowed: false, reason: 'moderator_privilege_required', status: 403 }
  }

  // 6. Moderation State Enforcement on Targets
  if (target) {
    const isOwner =
      actor.memberId &&
      (target.authorMemberId === actor.memberId || target.ownerId === actor.memberId)
    const isStaffOrMod = actor.isStaff || actor.isModerator

    if (target.moderationState === 'removed' || target.status === 'removed') {
      if (!isStaffOrMod) {
        return { allowed: false, reason: 'content_removed', status: 404 }
      }
    }

    if (target.moderationState === 'restricted' || target.moderationState === 'review') {
      if (!isStaffOrMod && !isOwner) {
        return { allowed: false, reason: 'content_under_moderation', status: 403 }
      }
    }
  }

  // 7. Write Action Checks (thread creation, comments, replies, messages, reactions, reports)
  if (['create_thread', 'comment', 'reply', 'react', 'report', 'message'].includes(action)) {
    if (actor.kind === 'anonymous') {
      return { allowed: false, reason: 'authentication_required', status: 401 }
    }

    if (target) {
      if (target.status === 'locked' || target.status === 'archived') {
        return { allowed: false, reason: 'discussion_locked', status: 403 }
      }
      if (target.commentsPolicy === 'closed') {
        return { allowed: false, reason: 'comments_closed', status: 403 }
      }
    }
  }

  // 7b. Edit / Delete Action Checks
  if (action === 'edit' || action === 'delete') {
    if (actor.kind === 'anonymous') {
      return { allowed: false, reason: 'authentication_required', status: 401 }
    }
    const isOwner = actor.memberId && target?.authorMemberId === actor.memberId
    const isPrivileged = actor.isStaff || actor.isModerator
    if (!isOwner && !isPrivileged) {
      return { allowed: false, reason: 'ownership_required', status: 403 }
    }
    if (action === 'edit' && target && (target.status === 'removed' || target.moderationState === 'removed')) {
      return { allowed: false, reason: 'cannot_edit_removed_content', status: 400 }
    }
  }

  // 8. Visibility Checks for Read Action
  if (action === 'read' && target) {
    const visibility = target.visibility ?? 'public'
    if (visibility === 'public' || visibility === 'unlisted') {
      return { allowed: true }
    }

    if (visibility === 'members') {
      if (actor.kind === 'anonymous') {
        return { allowed: false, reason: 'members_only_visibility', status: 401 }
      }
      return { allowed: true }
    }

    if (visibility === 'private') {
      const isOwner =
        actor.memberId &&
        (target.authorMemberId === actor.memberId || target.ownerId === actor.memberId)
      const isParticipant =
        actor.memberId && target.participants && target.participants.includes(actor.memberId)
      const isStaffOrMod = actor.isStaff || actor.isModerator

      if (isOwner || isParticipant || isStaffOrMod) {
        return { allowed: true }
      }
      return { allowed: false, reason: 'private_visibility', status: 403 }
    }
  }

  return { allowed: true }
}

/**
 * Strips all internal or sensitive auth/contact details from a profile.
 * Guarantees public profiles are deliberate projections, never serializations of member records.
 */
export function sanitizeProfileProjection(
  rawProfile: Record<string, unknown>,
): CommunityPublicProfile {
  return {
    id: String(rawProfile.id ?? ''),
    memberId:
      typeof rawProfile.member === 'string'
        ? rawProfile.member
        : String((rawProfile.member as { id?: string } | undefined)?.id ?? ''),
    displayName: String(rawProfile.displayName ?? 'Community Member'),
    handle: String(rawProfile.handle ?? ''),
    bio: typeof rawProfile.bio === 'string' ? rawProfile.bio : null,
    avatarUrl:
      rawProfile.avatar && typeof rawProfile.avatar === 'object'
        ? String((rawProfile.avatar as { url?: string }).url ?? '')
        : typeof rawProfile.avatarUrl === 'string'
          ? rawProfile.avatarUrl
          : null,
    coverUrl:
      rawProfile.cover && typeof rawProfile.cover === 'object'
        ? String((rawProfile.cover as { url?: string }).url ?? '')
        : typeof rawProfile.coverUrl === 'string'
          ? rawProfile.coverUrl
          : null,
    visibility: (rawProfile.visibility as CommunityPublicProfile['visibility']) ?? 'public',
    links: Array.isArray(rawProfile.links) ? rawProfile.links : [],
    createdAt: String(rawProfile.createdAt ?? new Date().toISOString()),
  }
}
