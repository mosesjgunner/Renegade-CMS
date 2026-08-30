import { digest, opaqueToken, normalizeEmail } from '../identity/member-identity'

export const TEAM_ROLES = [
  'owner',
  'administrator',
  'editor',
  'author',
  'moderator',
  'commerce-operator',
] as const
export type TeamRole = (typeof TEAM_ROLES)[number]
export type TeamPermission =
  | 'team.manage'
  | 'content.read'
  | 'content.edit'
  | 'content.assign'
  | 'content.request-review'
  | 'content.review'
  | 'content.approve'
  | 'content.publish'
  | 'discussion.comment'
  | 'discussion.resolve'
  | 'conversation.participate'
  | 'commerce.operate'

export type TeamScope = Readonly<{
  kind: 'site' | 'publication' | 'space'
  siteId: string
  publicationId?: string | null
  spaceId?: string | null
}>
export type CollaborationStore = {
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>
  find(args: Record<string, unknown>): Promise<{ docs: Array<Record<string, unknown>> }>
  findByID(args: Record<string, unknown>): Promise<Record<string, unknown>>
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>
}

const rolePermissions: Record<TeamRole, readonly (TeamPermission | '*')[]> = {
  owner: ['*'],
  administrator: [
    'team.manage',
    'content.read',
    'content.edit',
    'content.assign',
    'content.request-review',
    'content.review',
    'content.approve',
    'content.publish',
    'discussion.comment',
    'discussion.resolve',
    'conversation.participate',
    'commerce.operate',
  ],
  editor: [
    'content.read',
    'content.edit',
    'content.assign',
    'content.request-review',
    'content.review',
    'discussion.comment',
    'discussion.resolve',
    'conversation.participate',
  ],
  author: [
    'content.read',
    'content.edit',
    'content.request-review',
    'discussion.comment',
    'conversation.participate',
  ],
  moderator: [
    'content.read',
    'discussion.comment',
    'discussion.resolve',
    'conversation.participate',
  ],
  'commerce-operator': ['content.read', 'conversation.participate', 'commerce.operate'],
}

const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: string } | undefined)?.id ?? '')
const scopeKey = (scope: TeamScope) =>
  `${scope.kind}:${scope.kind === 'site' ? scope.siteId : scope.kind === 'publication' ? scope.publicationId : scope.spaceId}`
const nowIso = (now?: Date) => (now ?? new Date()).toISOString()
const scopeData = (scope: TeamScope) => ({
  scopeKind: scope.kind,
  site: scope.siteId,
  publication: scope.publicationId ?? null,
  space: scope.spaceId ?? null,
  scopeKey: scopeKey(scope),
})

async function one(store: CollaborationStore, collection: string, where: Record<string, unknown>) {
  return (await store.find({ collection, where, limit: 1, overrideAccess: true })).docs[0]
}

async function recordAudit(
  store: CollaborationStore,
  scope: TeamScope,
  action: string,
  actorMember: string | null,
  subjectMember: string | null,
  details: Record<string, unknown> = {},
  now?: Date,
) {
  return store.create({
    collection: 'team-audit-events',
    overrideAccess: true,
    data: {
      ...scopeData(scope),
      action,
      actorMember,
      subjectMember,
      details,
      occurredAt: nowIso(now),
    },
  })
}

async function notify(
  store: CollaborationStore,
  scope: TeamScope,
  type: string,
  actorMember: string | null,
  recipientMember: string,
  object: Record<string, unknown>,
  now?: Date,
) {
  const event = await store.create({
    collection: 'activity-events',
    overrideAccess: true,
    data: {
      ...scopeData(scope),
      type,
      actor: actorMember ? { memberId: actorMember } : null,
      object,
      payload: { private: true },
      visibilitySnapshot: { visibility: 'staff', federated: false },
      occurredAt: nowIso(now),
    },
  })
  return store.create({
    collection: 'notifications',
    overrideAccess: true,
    data: { activityEvent: id(event), recipientMember, status: 'unread', channels: ['in-app'] },
  })
}

export async function assertTeamPermission(
  store: CollaborationStore,
  memberId: string,
  scope: TeamScope,
  permission: TeamPermission,
): Promise<Record<string, unknown>> {
  const membership = await one(store, 'team-memberships', {
    and: [
      { member: { equals: memberId } },
      { scopeKey: { equals: scopeKey(scope) } },
      { status: { equals: 'active' } },
    ],
  })
  if (!membership) throw new Error('Team scope access denied.')
  const role = membership.role as TeamRole
  const grants = Array.isArray(membership.grants) ? membership.grants.map(String) : []
  const permissions = rolePermissions[role]
  if (
    !permissions.includes('*') &&
    !permissions.includes(permission) &&
    !grants.includes(permission)
  )
    throw new Error(`Team permission denied: ${permission}.`)
  return membership
}

export async function inviteTeamMember(
  store: CollaborationStore,
  input: {
    actorMemberId: string
    email: string
    scope: TeamScope
    role: TeamRole
    grants?: readonly TeamPermission[]
    expiresAt: Date
    now?: Date
  },
) {
  const actor = await assertTeamPermission(store, input.actorMemberId, input.scope, 'team.manage')
  const actorRole = actor.role as TeamRole
  if ((input.role === 'owner' || input.role === 'administrator') && actorRole !== 'owner')
    throw new Error('Only a scoped owner can grant administrator or owner access.')
  for (const grant of input.grants ?? [])
    await assertTeamPermission(store, input.actorMemberId, input.scope, grant)
  const email = normalizeEmail(input.email)
  if (!email) throw new Error('A valid invitation email is required.')
  if (input.expiresAt.getTime() <= (input.now ?? new Date()).getTime())
    throw new Error('Invitation expiry must be in the future.')
  const token = opaqueToken()
  const invitation = await store.create({
    collection: 'team-invitations',
    overrideAccess: true,
    data: {
      ...scopeData(input.scope),
      emailHash: digest(email),
      tokenHash: digest(token),
      role: input.role,
      grants: input.grants ?? [],
      expiresAt: input.expiresAt.toISOString(),
      createdBy: input.actorMemberId,
    },
  })
  await recordAudit(
    store,
    input.scope,
    'team.invitation_created',
    input.actorMemberId,
    null,
    { invitationId: id(invitation), role: input.role },
    input.now,
  )
  return { invitationId: id(invitation), token }
}

/** Accepting never creates a member or login. The caller must already hold a verified identity for the invited email. */
export async function acceptTeamInvitation(
  store: CollaborationStore,
  input: { token: string; memberId: string; verifiedEmail: string; now?: Date },
) {
  const invitation = await one(store, 'team-invitations', {
    tokenHash: { equals: digest(input.token) },
  })
  const now = input.now ?? new Date()
  if (
    !invitation ||
    invitation.revokedAt ||
    invitation.acceptedAt ||
    new Date(String(invitation.expiresAt)).getTime() <= now.getTime()
  )
    throw new Error('Invitation is unavailable.')
  const email = normalizeEmail(input.verifiedEmail)
  if (!email || digest(email) !== invitation.emailHash)
    throw new Error('Invitation email does not match the signed-in member.')
  const scope: TeamScope = {
    kind: invitation.scopeKind as TeamScope['kind'],
    siteId: id(invitation.site),
    publicationId: invitation.publication ? id(invitation.publication) : null,
    spaceId: invitation.space ? id(invitation.space) : null,
  }
  const existing = await one(store, 'team-memberships', {
    and: [{ member: { equals: input.memberId } }, { scopeKey: { equals: scopeKey(scope) } }],
  })
  if (existing?.status === 'active') throw new Error('Member already has access to this scope.')
  if (existing)
    await store.update({
      collection: 'team-memberships',
      id: id(existing),
      overrideAccess: true,
      data: {
        role: invitation.role,
        grants: invitation.grants ?? [],
        status: 'active',
        acceptedAt: nowIso(now),
        revokedAt: null,
      },
    })
  else
    await store.create({
      collection: 'team-memberships',
      overrideAccess: true,
      data: {
        ...scopeData(scope),
        member: input.memberId,
        role: invitation.role,
        grants: invitation.grants ?? [],
        status: 'active',
        acceptedAt: nowIso(now),
      },
    })
  // Mark before notifications so a racing second use cannot create a second membership.
  await store.update({
    collection: 'team-invitations',
    id: id(invitation),
    overrideAccess: true,
    data: { acceptedAt: nowIso(now), acceptedBy: input.memberId },
  })
  await recordAudit(
    store,
    scope,
    'team.invitation_accepted',
    input.memberId,
    input.memberId,
    { invitationId: id(invitation) },
    now,
  )
  await notify(
    store,
    scope,
    'team.invitation.accepted',
    input.memberId,
    id(invitation.createdBy),
    { invitationId: id(invitation) },
    now,
  )
}

export async function revokeTeamInvitation(
  store: CollaborationStore,
  input: { actorMemberId: string; invitationId: string; now?: Date },
) {
  const invitation = await store.findByID({
    collection: 'team-invitations',
    id: input.invitationId,
    overrideAccess: true,
  })
  const scope: TeamScope = {
    kind: invitation.scopeKind as TeamScope['kind'],
    siteId: id(invitation.site),
    publicationId: invitation.publication ? id(invitation.publication) : null,
    spaceId: invitation.space ? id(invitation.space) : null,
  }
  await assertTeamPermission(store, input.actorMemberId, scope, 'team.manage')
  if (invitation.acceptedAt) throw new Error('Accepted invitations cannot be revoked.')
  await store.update({
    collection: 'team-invitations',
    id: input.invitationId,
    overrideAccess: true,
    data: { revokedAt: nowIso(input.now) },
  })
  await recordAudit(
    store,
    scope,
    'team.invitation_revoked',
    input.actorMemberId,
    null,
    { invitationId: input.invitationId },
    input.now,
  )
}

export async function assignEditorialWork(
  store: CollaborationStore,
  input: {
    actorMemberId: string
    assigneeMemberId: string
    scope: TeamScope
    contentId: string
    articleId?: string
    revisionId?: string
    title: string
    dueAt?: string
    now?: Date
  },
) {
  await assertTeamPermission(store, input.actorMemberId, input.scope, 'content.assign')
  await assertTeamPermission(store, input.assigneeMemberId, input.scope, 'content.read')
  const assignment = await store.create({
    collection: 'editorial-assignments',
    overrideAccess: true,
    data: {
      ...scopeData(input.scope),
      content: input.contentId,
      article: input.articleId ?? null,
      revision: input.revisionId ?? null,
      title: input.title,
      assignee: input.assigneeMemberId,
      assignedBy: input.actorMemberId,
      dueAt: input.dueAt ?? null,
      status: 'open',
    },
  })
  await recordAudit(
    store,
    input.scope,
    'editorial.assignment_created',
    input.actorMemberId,
    input.assigneeMemberId,
    {
      assignmentId: id(assignment),
      contentId: input.contentId,
      revisionId: input.revisionId ?? null,
    },
    input.now,
  )
  await notify(
    store,
    input.scope,
    'editorial.assignment',
    input.actorMemberId,
    input.assigneeMemberId,
    {
      assignmentId: id(assignment),
      contentId: input.contentId,
      articleId: input.articleId ?? null,
      revisionId: input.revisionId ?? null,
    },
    input.now,
  )
  return assignment
}

export async function requestTeamReview(
  store: CollaborationStore,
  input: {
    actorMemberId: string
    reviewerMemberId: string
    scope: TeamScope
    contentId: string
    articleId?: string
    revisionId?: string
    now?: Date
  },
) {
  await assertTeamPermission(store, input.actorMemberId, input.scope, 'content.request-review')
  await assertTeamPermission(store, input.reviewerMemberId, input.scope, 'content.review')
  await recordAudit(
    store,
    input.scope,
    'editorial.review_requested',
    input.actorMemberId,
    input.reviewerMemberId,
    {
      contentId: input.contentId,
      articleId: input.articleId ?? null,
      revisionId: input.revisionId ?? null,
    },
    input.now,
  )
  return notify(
    store,
    input.scope,
    'editorial.review_requested',
    input.actorMemberId,
    input.reviewerMemberId,
    {
      contentId: input.contentId,
      articleId: input.articleId ?? null,
      revisionId: input.revisionId ?? null,
    },
    input.now,
  )
}

/** Call this after the existing editorial workflow records its approval/rejection revision. */
export async function notifyEditorialDecision(
  store: CollaborationStore,
  input: {
    actorMemberId: string
    recipientMemberId: string
    scope: TeamScope
    approved: boolean
    contentId: string
    articleId?: string
    revisionId?: string
    now?: Date
  },
) {
  await assertTeamPermission(store, input.actorMemberId, input.scope, 'content.approve')
  const type = input.approved ? 'editorial.approved' : 'editorial.rejected'
  const object = {
    contentId: input.contentId,
    articleId: input.articleId ?? null,
    revisionId: input.revisionId ?? null,
  }
  await recordAudit(
    store,
    input.scope,
    type,
    input.actorMemberId,
    input.recipientMemberId,
    object,
    input.now,
  )
  return notify(
    store,
    input.scope,
    type,
    input.actorMemberId,
    input.recipientMemberId,
    object,
    input.now,
  )
}

/** Release services can emit this after their own canonical release audit succeeds. */
export async function notifyReleaseAction(
  store: CollaborationStore,
  input: {
    actorMemberId: string
    recipientMemberId: string
    scope: TeamScope
    action: 'scheduled' | 'released' | 'failed' | 'cancelled'
    releaseId: string
    contentId?: string
    now?: Date
  },
) {
  await assertTeamPermission(store, input.actorMemberId, input.scope, 'content.publish')
  const type = `release.${input.action}`
  const object = { releaseId: input.releaseId, contentId: input.contentId ?? null }
  await recordAudit(
    store,
    input.scope,
    type,
    input.actorMemberId,
    input.recipientMemberId,
    object,
    input.now,
  )
  return notify(
    store,
    input.scope,
    type,
    input.actorMemberId,
    input.recipientMemberId,
    object,
    input.now,
  )
}

export async function addEditorialComment(
  store: CollaborationStore,
  input: {
    actorMemberId: string
    scope: TeamScope
    discussionId: string
    body: string
    mentions?: readonly string[]
    replyTo?: string
    now?: Date
  },
) {
  await assertTeamPermission(store, input.actorMemberId, input.scope, 'discussion.comment')
  if (!input.body.trim()) throw new Error('A comment body is required.')
  const discussion = await store.findByID({
    collection: 'editorial-discussions',
    id: input.discussionId,
    overrideAccess: true,
  })
  if (discussion.scopeKey !== scopeKey(input.scope) || discussion.state !== 'open')
    throw new Error('Editorial discussion is unavailable.')
  const comment = await store.create({
    collection: 'editorial-comments',
    overrideAccess: true,
    data: {
      ...scopeData(input.scope),
      discussion: input.discussionId,
      author: input.actorMemberId,
      body: input.body,
      mentions: input.mentions ?? [],
      replyTo: input.replyTo ?? null,
    },
  })
  for (const memberId of new Set(input.mentions ?? []))
    if (memberId !== input.actorMemberId)
      await notify(
        store,
        input.scope,
        'editorial.mention',
        input.actorMemberId,
        memberId,
        { commentId: id(comment), discussionId: input.discussionId },
        input.now,
      )
  if (input.replyTo) {
    const parent = await store.findByID({
      collection: 'editorial-comments',
      id: input.replyTo,
      overrideAccess: true,
    })
    const parentAuthor = id(parent.author)
    if (parentAuthor && parentAuthor !== input.actorMemberId)
      await notify(
        store,
        input.scope,
        'editorial.comment_reply',
        input.actorMemberId,
        parentAuthor,
        { commentId: id(comment), discussionId: input.discussionId },
        input.now,
      )
  }
  return comment
}

export async function setEditorialDiscussionState(
  store: CollaborationStore,
  input: {
    actorMemberId: string
    scope: TeamScope
    discussionId: string
    state: 'open' | 'resolved'
    now?: Date
  },
) {
  await assertTeamPermission(store, input.actorMemberId, input.scope, 'discussion.resolve')
  const discussion = await store.findByID({
    collection: 'editorial-discussions',
    id: input.discussionId,
    overrideAccess: true,
  })
  if (discussion.scopeKey !== scopeKey(input.scope))
    throw new Error('Editorial discussion scope access denied.')
  return store.update({
    collection: 'editorial-discussions',
    id: input.discussionId,
    overrideAccess: true,
    data: {
      state: input.state,
      resolvedBy: input.state === 'resolved' ? input.actorMemberId : null,
      resolvedAt: input.state === 'resolved' ? nowIso(input.now) : null,
    },
  })
}

export async function sendWorkMessage(
  store: CollaborationStore,
  input: {
    actorMemberId: string
    scope: TeamScope
    conversationId: string
    body: string
    mentions?: readonly string[]
    now?: Date
  },
) {
  await assertTeamPermission(store, input.actorMemberId, input.scope, 'conversation.participate')
  const conversation = await store.findByID({
    collection: 'work-conversations',
    id: input.conversationId,
    overrideAccess: true,
  })
  const participants = Array.isArray(conversation.participants)
    ? conversation.participants.map(id)
    : []
  if (
    conversation.scopeKey !== scopeKey(input.scope) ||
    conversation.privateOnly !== true ||
    conversation.status !== 'open' ||
    !participants.includes(input.actorMemberId)
  )
    throw new Error('Private conversation access denied.')
  if (!input.body.trim()) throw new Error('A message body is required.')
  const message = await store.create({
    collection: 'work-messages',
    overrideAccess: true,
    data: {
      ...scopeData(input.scope),
      conversation: input.conversationId,
      author: input.actorMemberId,
      body: input.body,
      mentions: input.mentions ?? [],
    },
  })
  for (const memberId of new Set(input.mentions ?? []))
    if (participants.includes(memberId) && memberId !== input.actorMemberId)
      await notify(
        store,
        input.scope,
        'work.mention',
        input.actorMemberId,
        memberId,
        { messageId: id(message), conversationId: input.conversationId },
        input.now,
      )
  return message
}

export async function readWorkConversation(
  store: CollaborationStore,
  input: { memberId: string; scope: TeamScope; conversationId: string },
) {
  await assertTeamPermission(store, input.memberId, input.scope, 'conversation.participate')
  const conversation = await store.findByID({
    collection: 'work-conversations',
    id: input.conversationId,
    overrideAccess: true,
  })
  const participants = Array.isArray(conversation.participants)
    ? conversation.participants.map(id)
    : []
  if (
    conversation.scopeKey !== scopeKey(input.scope) ||
    conversation.privateOnly !== true ||
    !participants.includes(input.memberId)
  )
    throw new Error('Private conversation access denied.')
  return store.find({
    collection: 'work-messages',
    where: { conversation: { equals: input.conversationId } },
    limit: 100,
    overrideAccess: true,
  })
}
