import type { Payload } from 'payload'

import { executeDbQuery } from './comment-composer'

export type ForumSpaceVisibility = 'public' | 'member_only' | 'private' | 'hidden'
export type ForumSpaceJoinPolicy = 'open' | 'request_approval' | 'invite_only'
export type SpaceRole = 'viewer' | 'contributor' | 'moderator' | 'administrator'
export type ForumSpaceCapability =
  | 'can_view'
  | 'can_create_topic'
  | 'can_reply'
  | 'can_pin_lock'
  | 'can_manage_members'

export interface ForumSpace {
  id: string
  siteId: string
  parentId: string | null
  name: string
  slug: string
  visibility: ForumSpaceVisibility
  joinPolicy: ForumSpaceJoinPolicy
}

export interface ForumSpaceActor {
  memberId?: string
  /** Allows trusted server callers that have already resolved the site role to avoid a duplicate lookup. */
  isSiteAdministrator?: boolean
}

export interface ForumSpaceAccess {
  space: ForumSpace
  role: SpaceRole | null
  isMember: boolean
  isSiteAdministrator: boolean
  canView: boolean
  canCreateTopic: boolean
  canReply: boolean
  canPinLock: boolean
  canManageMembers: boolean
}

export class ForumSpaceAccessError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
    this.name = 'ForumSpaceAccessError'
  }
}

const notFound = () => new ForumSpaceAccessError('Forum space not found.', 404, 'SPACE_NOT_FOUND')

function capabilitySet(role: SpaceRole | null, siteAdmin: boolean) {
  if (siteAdmin || role === 'administrator') return new Set<ForumSpaceCapability>([
    'can_view', 'can_create_topic', 'can_reply', 'can_pin_lock', 'can_manage_members',
  ])
  if (role === 'moderator') return new Set<ForumSpaceCapability>([
    'can_view', 'can_create_topic', 'can_reply', 'can_pin_lock',
  ])
  if (role === 'contributor') return new Set<ForumSpaceCapability>([
    'can_view', 'can_create_topic', 'can_reply',
  ])
  if (role === 'viewer') return new Set<ForumSpaceCapability>(['can_view'])
  return new Set<ForumSpaceCapability>()
}

/** Resolves visibility and capabilities in one tenant-bound operation. Hidden/private denial is intentionally indistinguishable from absence. */
export async function resolveForumSpaceAccess(
  payload: Payload,
  input: { siteId: string; spaceId: string; actor?: ForumSpaceActor },
): Promise<ForumSpaceAccess> {
  const rows = await executeDbQuery<ForumSpace>(
    payload,
    `SELECT id, site_id AS "siteId", parent_id AS "parentId", name, slug, visibility,
            join_policy AS "joinPolicy"
     FROM forum_spaces WHERE id = $1 AND site_id = $2`,
    [input.spaceId, input.siteId],
  )
  const space = rows[0]
  if (!space) throw notFound()

  const memberId = input.actor?.memberId
  let role: SpaceRole | null = null
  if (memberId) {
    const memberships = await executeDbQuery<{ role: SpaceRole }>(
      payload,
      `SELECT role FROM space_memberships
       WHERE space_id = $1 AND member_id = $2 AND status = 'active'`,
      [space.id, memberId],
    )
    role = memberships[0]?.role ?? null
  }

  let isSiteAdministrator = Boolean(input.actor?.isSiteAdministrator)
  if (memberId && !isSiteAdministrator) {
    const siteRoles = await executeDbQuery<{ exists: boolean }>(
      payload,
      `SELECT EXISTS(
         SELECT 1 FROM member_site_roles
         WHERE site_id = $1 AND member_id = $2 AND role = 'community-manager'
       ) AS exists`,
      [space.siteId, memberId],
    )
    isSiteAdministrator = Boolean(siteRoles[0]?.exists)
  }

  const memberCanView = Boolean(role || isSiteAdministrator)
  const canView =
    space.visibility === 'public' ||
    (space.visibility === 'member_only' && Boolean(memberId)) ||
    ((space.visibility === 'private' || space.visibility === 'hidden') && memberCanView)
  if (!canView) throw notFound()

  const capabilities = capabilitySet(role, isSiteAdministrator)
  return {
    space,
    role,
    isMember: Boolean(role),
    isSiteAdministrator,
    canView,
    canCreateTopic: capabilities.has('can_create_topic'),
    canReply: capabilities.has('can_reply'),
    canPinLock: capabilities.has('can_pin_lock'),
    canManageMembers: capabilities.has('can_manage_members'),
  }
}

export function requireForumSpaceCapability(access: ForumSpaceAccess, capability: ForumSpaceCapability) {
  const map: Record<ForumSpaceCapability, boolean> = {
    can_view: access.canView,
    can_create_topic: access.canCreateTopic,
    can_reply: access.canReply,
    can_pin_lock: access.canPinLock,
    can_manage_members: access.canManageMembers,
  }
  if (!map[capability])
    throw new ForumSpaceAccessError('Forum space capability denied.', 403, 'SPACE_CAPABILITY_DENIED')
}

/** Computes the only valid initial membership state; invitation issuance is intentionally out of scope. */
export function initialSpaceMembershipForJoin(policy: ForumSpaceJoinPolicy): { status: 'active' | 'pending'; role: 'viewer' } {
  if (policy === 'invite_only')
    throw new ForumSpaceAccessError('An invitation is required to join this forum space.', 403, 'SPACE_INVITE_REQUIRED')
  return { status: policy === 'open' ? 'active' : 'pending', role: 'viewer' }
}
