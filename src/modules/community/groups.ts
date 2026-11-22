import type { Payload } from 'payload'
import { CommunityError } from './service'
import { dispatchCommunityNotification } from './service'

/**
 * Groups (RC3-15B / COM-GRP-1) — the community contract §5 entity.
 *
 * The product label for groups is a WORKING label, not yet ratified by
 * the owner (Circles delta D1). It lives in exactly this one place so a
 * rename stays a copy change, never a refactor.
 */
export const GROUP_PRODUCT_LABEL = 'Circles'

export const groupPrivacies = ['public', 'private-visible', 'private-hidden'] as const
export type GroupPrivacy = (typeof groupPrivacies)[number]
export const groupJoinModes = ['open', 'request', 'invite'] as const
export type GroupJoinMode = (typeof groupJoinModes)[number]
export const groupRoles = ['owner', 'admin', 'moderator', 'member'] as const
export type GroupRole = (typeof groupRoles)[number]
export const groupMembershipStatuses = [
  'invited',
  'pending',
  'active',
  'removed',
  'banned',
] as const
export type GroupMembershipStatus = (typeof groupMembershipStatuses)[number]

export const groupRoleRank: Record<GroupRole, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
}

type Query = <T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
) => Promise<{ rows: T[] }>
type Client = { query: Query; release?: () => void }
type DbPayload = Payload & { db: { pool?: { connect?: () => Promise<Client>; query?: Query } } }

async function transaction<T>(payload: Payload, work: (query: Query) => Promise<T>): Promise<T> {
  const client = await (payload as DbPayload).db.pool?.connect?.()
  if (!client)
    throw new CommunityError(
      'Groups require transactional database access.',
      503,
      'GROUPS_DB_UNAVAILABLE',
    )
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

function poolQuery(payload: Payload): Query {
  const pool = (payload as DbPayload).db.pool
  if (!pool?.query) throw new CommunityError('Database unavailable.', 503, 'GROUPS_DB_UNAVAILABLE')
  return pool.query.bind(pool)
}

export function slugifyGroupName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '')
  return slug || 'group'
}

export function validateJoinQuestions(questions: unknown): string[] {
  if (questions === undefined || questions === null) return []
  if (!Array.isArray(questions))
    throw new CommunityError('Join questions must be a list.', 422, 'INVALID_JOIN_QUESTIONS')
  if (questions.length > 3)
    throw new CommunityError(
      'A group may ask at most 3 join questions.',
      422,
      'TOO_MANY_JOIN_QUESTIONS',
    )
  return questions.map((question) => {
    const text = String(question ?? '').trim()
    if (!text || text.length > 200)
      throw new CommunityError(
        'Join questions must be 1-200 characters.',
        422,
        'INVALID_JOIN_QUESTIONS',
      )
    return text
  })
}

export function validateJoinAnswers(questions: string[], answers: unknown): string[] {
  if (!questions.length) return []
  if (!Array.isArray(answers) || answers.length !== questions.length)
    throw new CommunityError('Answer every join question.', 422, 'JOIN_ANSWERS_INCOMPLETE')
  return answers.map((answer) => {
    const text = String(answer ?? '').trim()
    if (!text || text.length > 500)
      throw new CommunityError(
        'Join answers must be 1-500 characters.',
        422,
        'JOIN_ANSWERS_INCOMPLETE',
      )
    return text
  })
}

type GroupRow = Record<string, unknown>

function serializeGroup(row: GroupRow) {
  return {
    id: String(row.id),
    siteId: String(row.site_id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description ? String(row.description) : null,
    privacy: String(row.privacy) as GroupPrivacy,
    joinMode: String(row.join_mode) as GroupJoinMode,
    joinQuestions: (row.join_questions as string[]) ?? [],
    createdByMemberId: String(row.created_by_member_id),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

async function audit(
  query: Query,
  siteId: string,
  groupId: string,
  actorMemberId: string | null,
  action: string,
  payloadData: Record<string, unknown> = {},
) {
  await query(
    'INSERT INTO group_audit_entries (site_id,group_id,actor_member_id,action,payload) VALUES ($1,$2,$3,$4,$5::jsonb)',
    [siteId, groupId, actorMemberId, action, JSON.stringify(payloadData)],
  )
}

async function memberStatus(query: Query, memberId: string): Promise<string | null> {
  const row = (
    await query<{ status: string }>('SELECT status FROM members WHERE id=$1', [memberId])
  ).rows[0]
  return row?.status ?? null
}

async function requireUsableMember(query: Query, memberId: string) {
  const status = await memberStatus(query, memberId)
  if (!status) throw new CommunityError('Member not found.', 404, 'MEMBER_NOT_FOUND')
  if (status !== 'active' && status !== 'restricted')
    throw new CommunityError('Member account is not active.', 403, 'MEMBER_NOT_ACTIVE')
  return status
}

export async function isSiteStaff(query: Query, siteId: string, memberId: string) {
  const row = (
    await query<{ role: string }>(
      'SELECT role FROM member_site_roles WHERE site_id=$1 AND member_id=$2',
      [siteId, memberId],
    )
  ).rows[0]
  return row?.role === 'moderator' || row?.role === 'community-manager'
}

async function hasSiteStanding(query: Query, siteId: string, memberId: string) {
  const row = (
    await query<{ id: string }>(
      'SELECT id FROM member_site_roles WHERE site_id=$1 AND member_id=$2',
      [siteId, memberId],
    )
  ).rows[0]
  return Boolean(row)
}

async function loadGroup(query: Query, siteId: string, groupId: string): Promise<GroupRow> {
  const row = (
    await query<GroupRow>('SELECT * FROM groups WHERE id=$1 AND site_id=$2', [groupId, siteId])
  ).rows[0]
  if (!row || row.status !== 'active')
    throw new CommunityError('Group not found.', 404, 'GROUP_NOT_FOUND')
  return row
}

async function loadMembership(
  query: Query,
  groupId: string,
  memberId: string,
): Promise<GroupRow | undefined> {
  return (
    await query<GroupRow>('SELECT * FROM group_memberships WHERE group_id=$1 AND member_id=$2', [
      groupId,
      memberId,
    ])
  ).rows[0]
}

/** The actor's group authority: their membership role, or 'staff' for the site-staff override. */
export async function groupAuthority(
  query: Query,
  siteId: string,
  groupId: string,
  memberId: string,
): Promise<{ role: GroupRole | null; viaStaff: boolean }> {
  const membership = await loadMembership(query, groupId, memberId)
  if (membership && membership.status === 'active')
    return { role: String(membership.role) as GroupRole, viaStaff: false }
  if (await isSiteStaff(query, siteId, memberId)) return { role: null, viaStaff: true }
  return { role: null, viaStaff: false }
}

async function requireGroupManager(
  query: Query,
  siteId: string,
  groupId: string,
  actorMemberId: string,
  minimum: GroupRole = 'admin',
) {
  const authority = await groupAuthority(query, siteId, groupId, actorMemberId)
  if (authority.viaStaff) return authority
  if (!authority.role || groupRoleRank[authority.role] < groupRoleRank[minimum])
    throw new CommunityError(
      'Group administrator permission is required.',
      403,
      'GROUP_ADMIN_REQUIRED',
    )
  return authority
}

export async function createGroup(
  payload: Payload,
  input: {
    siteId: string
    creatorMemberId: string
    name: string
    slug?: string
    description?: string
    privacy?: GroupPrivacy
    joinMode?: GroupJoinMode
    joinQuestions?: unknown
  },
) {
  const name = input.name?.trim()
  if (!name || name.length > 200)
    throw new CommunityError(
      'A group name of 1-200 characters is required.',
      422,
      'INVALID_GROUP_NAME',
    )
  const privacy = input.privacy ?? 'public'
  if (!groupPrivacies.includes(privacy))
    throw new CommunityError('Unknown group privacy.', 422, 'INVALID_GROUP_PRIVACY')
  const joinMode = input.joinMode ?? 'open'
  if (!groupJoinModes.includes(joinMode))
    throw new CommunityError('Unknown group join mode.', 422, 'INVALID_GROUP_JOIN_MODE')
  const questions = validateJoinQuestions(input.joinQuestions)
  const slug = (input.slug?.trim() || slugifyGroupName(name)).slice(0, 120)
  return transaction(payload, async (query) => {
    await requireUsableMember(query, input.creatorMemberId)
    const clash = (
      await query('SELECT id FROM groups WHERE site_id=$1 AND slug=$2', [input.siteId, slug])
    ).rows[0]
    if (clash) throw new CommunityError('That group address is taken.', 409, 'GROUP_SLUG_TAKEN')
    const row = (
      await query<GroupRow>(
        'INSERT INTO groups (site_id,name,slug,description,privacy,join_mode,join_questions,created_by_member_id) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *',
        [
          input.siteId,
          name,
          slug,
          input.description?.trim() || null,
          privacy,
          joinMode,
          JSON.stringify(questions),
          input.creatorMemberId,
        ],
      )
    ).rows[0]!
    await query(
      "INSERT INTO group_memberships (group_id,member_id,role,status) VALUES ($1,$2,'owner','active')",
      [row.id, input.creatorMemberId],
    )
    await audit(query, input.siteId, String(row.id), input.creatorMemberId, 'group.created', {
      privacy,
      joinMode,
    })
    return { ...serializeGroup(row), viewerRole: 'owner' as GroupRole }
  })
}

export async function listGroups(
  payload: Payload,
  input: { siteId: string; viewerMemberId: string },
) {
  const query = poolQuery(payload)
  await requireUsableMember(query, input.viewerMemberId)
  const standing = await hasSiteStanding(query, input.siteId, input.viewerMemberId)
  const rows = await query<GroupRow>(
    `SELECT g.*, gm.role AS viewer_role, gm.status AS viewer_status
     FROM groups g
     LEFT JOIN group_memberships gm ON gm.group_id=g.id AND gm.member_id=$2
     WHERE g.site_id=$1 AND g.status='active'
       AND (gm.id IS NOT NULL OR ($3 AND g.privacy <> 'private-hidden'))
     ORDER BY g.name ASC`,
    [input.siteId, input.viewerMemberId, standing],
  )
  return rows.rows.map((row) => ({
    ...serializeGroup(row),
    viewerRole: row.viewer_role ? (String(row.viewer_role) as GroupRole) : null,
    viewerStatus: row.viewer_status ? String(row.viewer_status) : null,
  }))
}

export async function getGroup(
  payload: Payload,
  input: { siteId: string; groupId: string; viewerMemberId: string },
) {
  const query = poolQuery(payload)
  await requireUsableMember(query, input.viewerMemberId)
  const row = await loadGroup(query, input.siteId, input.groupId)
  const membership = await loadMembership(query, input.groupId, input.viewerMemberId)
  const isMember = membership?.status === 'active'
  const staff = !isMember && (await isSiteStaff(query, input.siteId, input.viewerMemberId))
  // Contract §5: a private-hidden group is unfindable by non-members —
  // the direct-URL answer is the same 404 as a group that does not exist.
  if (row.privacy === 'private-hidden' && !isMember && !staff)
    throw new CommunityError('Group not found.', 404, 'GROUP_NOT_FOUND')
  const countVisible = row.privacy === 'public' || isMember || staff
  const count = countVisible
    ? Number(
        (
          await query<{ count: number }>(
            "SELECT count(*)::int AS count FROM group_memberships WHERE group_id=$1 AND status='active'",
            [input.groupId],
          )
        ).rows[0]?.count ?? 0,
      )
    : null
  return {
    ...serializeGroup(row),
    viewerRole: isMember ? (String(membership!.role) as GroupRole) : null,
    viewerStatus: membership ? String(membership.status) : null,
    memberCount: count,
  }
}

const privacyRank: Record<GroupPrivacy, number> = {
  public: 0,
  'private-visible': 1,
  'private-hidden': 2,
}

export async function updateGroup(
  payload: Payload,
  input: {
    siteId: string
    groupId: string
    actorMemberId: string
    name?: string
    description?: string | null
    joinMode?: GroupJoinMode
    joinQuestions?: unknown
    privacy?: GroupPrivacy
    confirmPrivacyTransition?: boolean
  },
) {
  return transaction(payload, async (query) => {
    const group = await loadGroup(query, input.siteId, input.groupId)
    const authority = await requireGroupManager(
      query,
      input.siteId,
      input.groupId,
      input.actorMemberId,
    )
    const updates: string[] = []
    const values: unknown[] = []
    const push = (column: string, value: unknown) => {
      values.push(value)
      updates.push(`${column}=$${values.length}`)
    }
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name || name.length > 200)
        throw new CommunityError(
          'A group name of 1-200 characters is required.',
          422,
          'INVALID_GROUP_NAME',
        )
      push('name', name)
    }
    if (input.description !== undefined) push('description', input.description?.trim() || null)
    if (input.joinMode !== undefined) {
      if (!groupJoinModes.includes(input.joinMode))
        throw new CommunityError('Unknown group join mode.', 422, 'INVALID_GROUP_JOIN_MODE')
      push('join_mode', input.joinMode)
    }
    if (input.joinQuestions !== undefined)
      push('join_questions', JSON.stringify(validateJoinQuestions(input.joinQuestions)))
    if (input.privacy !== undefined && input.privacy !== group.privacy) {
      if (!groupPrivacies.includes(input.privacy))
        throw new CommunityError('Unknown group privacy.', 422, 'INVALID_GROUP_PRIVACY')
      // Narrowing privacy is a one-way door (contract §5/COM-GRP-1): it
      // must be an explicit, confirmed, audited action.
      if (
        privacyRank[input.privacy] > privacyRank[String(group.privacy) as GroupPrivacy] &&
        !input.confirmPrivacyTransition
      )
        throw new CommunityError(
          'Making a group more private requires explicit confirmation.',
          422,
          'PRIVACY_TRANSITION_CONFIRM_REQUIRED',
        )
      push('privacy', input.privacy)
      await audit(
        query,
        input.siteId,
        input.groupId,
        input.actorMemberId,
        'group.privacy_changed',
        {
          from: String(group.privacy),
          to: input.privacy,
          viaStaffOverride: authority.viaStaff,
        },
      )
    }
    if (!updates.length) return serializeGroup(group)
    values.push(input.groupId)
    const row = (
      await query<GroupRow>(
        `UPDATE groups SET ${updates.join(', ')}, updated_at=now() WHERE id=$${values.length} RETURNING *`,
        values,
      )
    ).rows[0]!
    await audit(query, input.siteId, input.groupId, input.actorMemberId, 'group.updated', {
      fields: updates.map((entry) => entry.split('=')[0]),
      viaStaffOverride: authority.viaStaff,
    })
    return serializeGroup(row)
  })
}

export async function joinGroup(
  payload: Payload,
  input: { siteId: string; groupId: string; memberId: string; answers?: unknown },
) {
  const result = await transaction(payload, async (query) => {
    const group = await loadGroup(query, input.siteId, input.groupId)
    const status = await requireUsableMember(query, input.memberId)
    if (status !== 'active')
      throw new CommunityError('Only active members can join a group.', 403, 'MEMBER_NOT_ACTIVE')
    const existing = await loadMembership(query, input.groupId, input.memberId)
    if (existing?.status === 'banned')
      throw new CommunityError('You are banned from this group.', 403, 'GROUP_BANNED')
    if (existing?.status === 'active')
      throw new CommunityError('You already belong to this group.', 422, 'ALREADY_GROUP_MEMBER')
    if (existing?.status === 'pending')
      throw new CommunityError('Your join request is already pending.', 422, 'JOIN_REQUEST_PENDING')
    // A hidden group cannot be joined by URL guessing: without an
    // invitation it answers exactly like a missing group.
    if (group.privacy === 'private-hidden' && existing?.status !== 'invited')
      throw new CommunityError('Group not found.', 404, 'GROUP_NOT_FOUND')
    let next: GroupMembershipStatus
    let answers: string[] = []
    if (existing?.status === 'invited') next = 'active'
    else if (group.join_mode === 'open') next = 'active'
    else if (group.join_mode === 'request') {
      answers = validateJoinAnswers((group.join_questions as string[]) ?? [], input.answers)
      next = 'pending'
    } else throw new CommunityError('This group is invite-only.', 403, 'GROUP_INVITE_ONLY')
    if (existing)
      await query(
        'UPDATE group_memberships SET status=$3, answers=$4::jsonb, role=$5, updated_at=now() WHERE group_id=$1 AND member_id=$2',
        [
          input.groupId,
          input.memberId,
          next,
          JSON.stringify(answers),
          existing.status === 'removed' || existing.status === 'invited'
            ? 'member'
            : String(existing.role),
        ],
      )
    else
      await query(
        "INSERT INTO group_memberships (group_id,member_id,role,status,answers) VALUES ($1,$2,'member',$3,$4::jsonb)",
        [input.groupId, input.memberId, next, JSON.stringify(answers)],
      )
    if (next === 'active') await materializeRoomFloors(query, input.groupId, input.memberId)
    await audit(query, input.siteId, input.groupId, input.memberId, 'group.join', { status: next })
    return { status: next, group }
  })
  if (result.status === 'pending') {
    const query = poolQuery(payload)
    const admins = await query<{ member_id: string }>(
      "SELECT member_id FROM group_memberships WHERE group_id=$1 AND status='active' AND role IN ('owner','admin')",
      [input.groupId],
    )
    for (const admin of admins.rows)
      await dispatchCommunityNotification(payload, {
        siteId: input.siteId,
        recipientMemberId: admin.member_id,
        actorMemberId: input.memberId,
        type: 'group.join_requested',
        object: { groupId: input.groupId },
        payloadData: { body: 'A member asked to join your group.' },
      })
  }
  return { status: result.status }
}

export async function inviteToGroup(
  payload: Payload,
  input: { siteId: string; groupId: string; actorMemberId: string; memberId: string },
) {
  await transaction(payload, async (query) => {
    await loadGroup(query, input.siteId, input.groupId)
    await requireGroupManager(query, input.siteId, input.groupId, input.actorMemberId, 'moderator')
    await requireUsableMember(query, input.memberId)
    const existing = await loadMembership(query, input.groupId, input.memberId)
    if (existing?.status === 'banned')
      throw new CommunityError('That member is banned from this group.', 422, 'GROUP_BANNED')
    if (existing?.status === 'active')
      throw new CommunityError(
        'That member already belongs to this group.',
        422,
        'ALREADY_GROUP_MEMBER',
      )
    if (existing)
      await query(
        "UPDATE group_memberships SET status='invited', invited_by_member_id=$3, updated_at=now() WHERE group_id=$1 AND member_id=$2",
        [input.groupId, input.memberId, input.actorMemberId],
      )
    else
      await query(
        "INSERT INTO group_memberships (group_id,member_id,role,status,invited_by_member_id) VALUES ($1,$2,'member','invited',$3)",
        [input.groupId, input.memberId, input.actorMemberId],
      )
    await audit(query, input.siteId, input.groupId, input.actorMemberId, 'group.invited', {
      memberId: input.memberId,
    })
  })
  await dispatchCommunityNotification(payload, {
    siteId: input.siteId,
    recipientMemberId: input.memberId,
    actorMemberId: input.actorMemberId,
    type: 'group.invited',
    object: { groupId: input.groupId },
    payloadData: { body: 'You were invited to join a group.' },
  })
  return { status: 'invited' as const }
}

/**
 * From-join history floors (Circles D3) materialize at the moment a
 * member's audience grant begins — joining this group — not at their
 * first room visit, so messages posted between joining and visiting
 * are not silently hidden. A rejoin after removal advances the floor
 * (monotonic: GREATEST) so the absence gap stays invisible.
 */
export async function materializeRoomFloors(
  query: Query,
  groupId: string,
  memberId: string,
): Promise<void> {
  await query(
    `INSERT INTO room_read_states (conversation_id,member_id,history_floor_sequence)
     SELECT b.conversation_id, $2, c.next_message_sequence
     FROM room_bindings b JOIN conversations c ON c.id = b.conversation_id
     WHERE b.group_id = $1 AND b.history_policy = 'from-join'
     ON CONFLICT (conversation_id,member_id) DO UPDATE
       SET history_floor_sequence = GREATEST(room_read_states.history_floor_sequence, EXCLUDED.history_floor_sequence)`,
    [groupId, memberId],
  )
}

export async function reviewJoinRequest(
  payload: Payload,
  input: {
    siteId: string
    groupId: string
    actorMemberId: string
    memberId: string
    approve: boolean
  },
) {
  await transaction(payload, async (query) => {
    await loadGroup(query, input.siteId, input.groupId)
    await requireGroupManager(query, input.siteId, input.groupId, input.actorMemberId)
    const existing = await loadMembership(query, input.groupId, input.memberId)
    if (!existing || existing.status !== 'pending')
      throw new CommunityError(
        'No pending join request for that member.',
        404,
        'JOIN_REQUEST_NOT_FOUND',
      )
    const next = input.approve ? 'active' : 'removed'
    await query(
      'UPDATE group_memberships SET status=$3, updated_at=now() WHERE group_id=$1 AND member_id=$2',
      [input.groupId, input.memberId, next],
    )
    if (input.approve) await materializeRoomFloors(query, input.groupId, input.memberId)
    await audit(query, input.siteId, input.groupId, input.actorMemberId, 'group.join_reviewed', {
      memberId: input.memberId,
      approved: input.approve,
    })
  })
  if (input.approve)
    await dispatchCommunityNotification(payload, {
      siteId: input.siteId,
      recipientMemberId: input.memberId,
      actorMemberId: input.actorMemberId,
      type: 'group.join_approved',
      object: { groupId: input.groupId },
      payloadData: { body: 'Your group join request was approved.' },
    })
  return { status: input.approve ? ('active' as const) : ('removed' as const) }
}

async function countOwners(query: Query, groupId: string) {
  return Number(
    (
      await query<{ count: number }>(
        "SELECT count(*)::int AS count FROM group_memberships WHERE group_id=$1 AND status='active' AND role='owner'",
        [groupId],
      )
    ).rows[0]?.count ?? 0,
  )
}

export async function setGroupMemberRole(
  payload: Payload,
  input: {
    siteId: string
    groupId: string
    actorMemberId: string
    memberId: string
    role: GroupRole
  },
) {
  if (!groupRoles.includes(input.role))
    throw new CommunityError('Unknown group role.', 422, 'INVALID_GROUP_ROLE')
  return transaction(payload, async (query) => {
    await loadGroup(query, input.siteId, input.groupId)
    const authority = await requireGroupManager(
      query,
      input.siteId,
      input.groupId,
      input.actorMemberId,
    )
    const target = await loadMembership(query, input.groupId, input.memberId)
    if (!target || target.status !== 'active')
      throw new CommunityError(
        'Active group membership is required.',
        404,
        'GROUP_MEMBER_NOT_FOUND',
      )
    const targetRole = String(target.role) as GroupRole
    if (input.role === 'owner') {
      // Ownership transfer: only the current owner hands it over, and
      // they step down to admin in the same transaction.
      if (authority.role !== 'owner')
        throw new CommunityError(
          'Only the group owner can transfer ownership.',
          403,
          'GROUP_OWNER_REQUIRED',
        )
      await query(
        "UPDATE group_memberships SET role='admin', updated_at=now() WHERE group_id=$1 AND member_id=$2",
        [input.groupId, input.actorMemberId],
      )
      await query(
        "UPDATE group_memberships SET role='owner', updated_at=now() WHERE group_id=$1 AND member_id=$2",
        [input.groupId, input.memberId],
      )
    } else {
      if (targetRole === 'owner' && (await countOwners(query, input.groupId)) <= 1)
        throw new CommunityError(
          'Transfer ownership before changing the last owner.',
          409,
          'LAST_OWNER',
        )
      if (
        !authority.viaStaff &&
        authority.role !== 'owner' &&
        groupRoleRank[targetRole] >= groupRoleRank[authority.role!]
      )
        throw new CommunityError(
          'You cannot change a role at or above your own.',
          403,
          'GROUP_ROLE_ESCALATION',
        )
      if (
        !authority.viaStaff &&
        authority.role !== 'owner' &&
        groupRoleRank[input.role] >= groupRoleRank[authority.role!]
      )
        throw new CommunityError(
          'You cannot grant a role at or above your own.',
          403,
          'GROUP_ROLE_ESCALATION',
        )
      await query(
        'UPDATE group_memberships SET role=$3, updated_at=now() WHERE group_id=$1 AND member_id=$2',
        [input.groupId, input.memberId, input.role],
      )
    }
    await audit(query, input.siteId, input.groupId, input.actorMemberId, 'group.role_changed', {
      memberId: input.memberId,
      from: targetRole,
      to: input.role,
      viaStaffOverride: authority.viaStaff,
    })
    return { role: input.role }
  })
}

async function moderateMembership(
  payload: Payload,
  input: { siteId: string; groupId: string; actorMemberId: string; memberId: string },
  next: 'removed' | 'banned',
  action: string,
) {
  return transaction(payload, async (query) => {
    await loadGroup(query, input.siteId, input.groupId)
    const authority = await requireGroupManager(
      query,
      input.siteId,
      input.groupId,
      input.actorMemberId,
    )
    const target = await loadMembership(query, input.groupId, input.memberId)
    if (!target || target.status !== 'active')
      throw new CommunityError(
        'Active group membership is required.',
        404,
        'GROUP_MEMBER_NOT_FOUND',
      )
    const targetRole = String(target.role) as GroupRole
    if (targetRole === 'owner')
      throw new CommunityError(
        'The group owner cannot be removed or banned.',
        409,
        'GROUP_OWNER_PROTECTED',
      )
    if (
      !authority.viaStaff &&
      authority.role !== 'owner' &&
      groupRoleRank[targetRole] >= groupRoleRank[authority.role!]
    )
      throw new CommunityError(
        'You cannot moderate a role at or above your own.',
        403,
        'GROUP_ROLE_ESCALATION',
      )
    await query(
      'UPDATE group_memberships SET status=$3, updated_at=now() WHERE group_id=$1 AND member_id=$2',
      [input.groupId, input.memberId, next],
    )
    await audit(query, input.siteId, input.groupId, input.actorMemberId, action, {
      memberId: input.memberId,
      viaStaffOverride: authority.viaStaff,
    })
    return { status: next }
  })
}

export async function removeGroupMember(
  payload: Payload,
  input: { siteId: string; groupId: string; actorMemberId: string; memberId: string },
) {
  return moderateMembership(payload, input, 'removed', 'group.member_removed')
}

export async function banGroupMember(
  payload: Payload,
  input: { siteId: string; groupId: string; actorMemberId: string; memberId: string },
) {
  return moderateMembership(payload, input, 'banned', 'group.member_banned')
}

export async function unbanGroupMember(
  payload: Payload,
  input: { siteId: string; groupId: string; actorMemberId: string; memberId: string },
) {
  return transaction(payload, async (query) => {
    await loadGroup(query, input.siteId, input.groupId)
    await requireGroupManager(query, input.siteId, input.groupId, input.actorMemberId)
    const target = await loadMembership(query, input.groupId, input.memberId)
    if (!target || target.status !== 'banned')
      throw new CommunityError(
        'That member is not banned from this group.',
        404,
        'GROUP_BAN_NOT_FOUND',
      )
    await query(
      "UPDATE group_memberships SET status='removed', updated_at=now() WHERE group_id=$1 AND member_id=$2",
      [input.groupId, input.memberId],
    )
    await audit(query, input.siteId, input.groupId, input.actorMemberId, 'group.member_unbanned', {
      memberId: input.memberId,
    })
    return { status: 'removed' as const }
  })
}

export async function leaveGroup(
  payload: Payload,
  input: { siteId: string; groupId: string; memberId: string },
) {
  return transaction(payload, async (query) => {
    await loadGroup(query, input.siteId, input.groupId)
    const membership = await loadMembership(query, input.groupId, input.memberId)
    if (!membership || membership.status !== 'active')
      throw new CommunityError(
        'Active group membership is required.',
        404,
        'GROUP_MEMBER_NOT_FOUND',
      )
    if (membership.role === 'owner') {
      const others = Number(
        (
          await query<{ count: number }>(
            "SELECT count(*)::int AS count FROM group_memberships WHERE group_id=$1 AND status='active' AND member_id<>$2",
            [input.groupId, input.memberId],
          )
        ).rows[0]?.count ?? 0,
      )
      if (others > 0)
        throw new CommunityError(
          'Transfer ownership before leaving a group with members.',
          409,
          'LAST_OWNER',
        )
    }
    await query(
      "UPDATE group_memberships SET status='removed', updated_at=now() WHERE group_id=$1 AND member_id=$2",
      [input.groupId, input.memberId],
    )
    await audit(query, input.siteId, input.groupId, input.memberId, 'group.left', {})
    return { status: 'removed' as const }
  })
}

export async function listGroupAudit(
  payload: Payload,
  input: { siteId: string; groupId: string; actorMemberId: string },
) {
  const query = poolQuery(payload)
  await loadGroup(query, input.siteId, input.groupId)
  await requireGroupManager(query, input.siteId, input.groupId, input.actorMemberId, 'moderator')
  const rows = await query<GroupRow>(
    'SELECT * FROM group_audit_entries WHERE group_id=$1 ORDER BY created_at ASC',
    [input.groupId],
  )
  return rows.rows.map((row) => ({
    id: String(row.id),
    action: String(row.action),
    actorMemberId: row.actor_member_id ? String(row.actor_member_id) : null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  }))
}
