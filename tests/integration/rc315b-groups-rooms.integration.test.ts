import { randomUUID } from 'node:crypto'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import {
  listConversationMessages,
  reportConversationMessage,
  sendConversationMessage,
} from '../../src/modules/community/conversation-composer'
import {
  banGroupMember,
  createGroup,
  getGroup,
  inviteToGroup,
  joinGroup,
  leaveGroup,
  listGroupAudit,
  listGroups,
  removeGroupMember,
  reviewJoinRequest,
  setGroupMemberRole,
  unbanGroupMember,
  updateGroup,
} from '../../src/modules/community/groups'
import {
  createRecap,
  createRoom,
  getGroupHome,
  getRecap,
  getRoom,
  listGroupLibrary,
  listRoomMessages,
  markRoomRead,
  publishRecap,
  setRoomLifecycle,
} from '../../src/modules/community/rooms'
import { buildRc2World, teardownRc2World, type Rc2World } from '../fixtures/rc2-world'

/**
 * RC3-15B proof: groups & rooms on the canonical rc2 world.
 *
 * The load-bearing claims, each with a named test:
 *  - groups carry privacy/join/role machinery with group-scoped bans
 *    and audited privacy transitions (COM-GRP-1);
 *  - rooms derive their audience — a group room holds ZERO
 *    conversation_memberships rows, and removal/revocation bite on
 *    the very next read and write (Circles D3, PT-K1);
 *  - cursor polling over Postgres is lossless and idempotent, and
 *    read cursors are monotonic (D8);
 *  - event restriction may only narrow; group staff keep read-only
 *    oversight (PT-K1 prototype decision);
 *  - a room member can report a room message (CIR-R-09 fix) while a
 *    non-member cannot;
 *  - recaps quote by reference with destination ⊆ source proven over
 *    resolved member sets at creation AND at publish (D4), and a
 *    removed source renders placeholder/tombstone, never content.
 */

let payload: Payload
let world: Rc2World

type PoolQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>
const createDoc = async (args: Record<string, unknown>): Promise<Record<string, any>> =>
  payload.create(args as never) as Promise<Record<string, any>>
const pool = () => (payload as unknown as { db: { pool: { query: PoolQuery } } }).db.pool
const sql = async (text: string, values: unknown[] = []) => (await pool().query(text, values)).rows
const code = (error: unknown) => (error as { code?: string }).code

beforeAll(async () => {
  payload = await getPayload({ config })
  world = await buildRc2World(payload)
}, 240000)

afterAll(async () => {
  await teardownRc2World(payload, world)
})

const siteA = () => world.siteA.siteId
const owner = () => world.siteA.owner.memberId
const admin = () => world.siteA.admin.memberId
const editor = () => world.siteA.editor.memberId
const member = () => world.siteA.member.memberId
const subscriber = () => world.siteA.subscriber.memberId

describe('RC3-15B groups: privacy, join modes, roles', () => {
  it('creates groups and hides private-hidden groups from non-members', async () => {
    const open = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Book Club ${world.suffix}`,
      privacy: 'public',
      joinMode: 'open',
    })
    expect(open.slug).toContain('book-club')
    const hidden = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: admin(),
      name: `Secret Society ${world.suffix}`,
      privacy: 'private-hidden',
      joinMode: 'invite',
    })
    const listed = await listGroups(payload, { siteId: siteA(), viewerMemberId: member() })
    const ids = listed.map((group) => group.id)
    expect(ids).toContain(open.id)
    expect(ids).not.toContain(hidden.id)
    await expect(
      getGroup(payload, { siteId: siteA(), groupId: hidden.id, viewerMemberId: member() }),
    ).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' })
    const ownerView = await getGroup(payload, {
      siteId: siteA(),
      groupId: hidden.id,
      viewerMemberId: admin(),
    })
    expect(ownerView.viewerRole).toBe('owner')
    expect(ownerView.memberCount).toBe(1)
  })

  it('enforces slug uniqueness per site but not across sites', async () => {
    await expect(
      createGroup(payload, {
        siteId: siteA(),
        creatorMemberId: owner(),
        name: `Book Club ${world.suffix}`,
      }),
    ).rejects.toMatchObject({ code: 'GROUP_SLUG_TAKEN' })
    const siteBVersion = await createGroup(payload, {
      siteId: world.siteB.siteId,
      creatorMemberId: world.siteB.owner.memberId,
      name: `Book Club ${world.suffix}`,
    })
    expect(siteBVersion.siteId).toBe(world.siteB.siteId)
  })

  it('runs open, request-with-answers and invite join modes', async () => {
    const openGroup = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Open Mic ${world.suffix}`,
      joinMode: 'open',
    })
    const joined = await joinGroup(payload, {
      siteId: siteA(),
      groupId: openGroup.id,
      memberId: member(),
    })
    expect(joined.status).toBe('active')

    const requestGroup = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Seminar ${world.suffix}`,
      privacy: 'private-visible',
      joinMode: 'request',
      joinQuestions: ['Why do you want in?', 'Do you accept the norms?'],
    })
    await expect(
      joinGroup(payload, { siteId: siteA(), groupId: requestGroup.id, memberId: editor() }),
    ).rejects.toMatchObject({ code: 'JOIN_ANSWERS_INCOMPLETE' })
    const pending = await joinGroup(payload, {
      siteId: siteA(),
      groupId: requestGroup.id,
      memberId: editor(),
      answers: ['To learn.', 'Yes.'],
    })
    expect(pending.status).toBe('pending')
    const approved = await reviewJoinRequest(payload, {
      siteId: siteA(),
      groupId: requestGroup.id,
      actorMemberId: owner(),
      memberId: editor(),
      approve: true,
    })
    expect(approved.status).toBe('active')

    const inviteGroup = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Salon ${world.suffix}`,
      privacy: 'private-visible',
      joinMode: 'invite',
    })
    await expect(
      joinGroup(payload, { siteId: siteA(), groupId: inviteGroup.id, memberId: subscriber() }),
    ).rejects.toMatchObject({ code: 'GROUP_INVITE_ONLY' })
    await inviteToGroup(payload, {
      siteId: siteA(),
      groupId: inviteGroup.id,
      actorMemberId: owner(),
      memberId: subscriber(),
    })
    const invited = await joinGroup(payload, {
      siteId: siteA(),
      groupId: inviteGroup.id,
      memberId: subscriber(),
    })
    expect(invited.status).toBe('active')
  })

  it('enforces the role ladder and protects the last owner', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Ladder ${world.suffix}`,
    })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: member() })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: editor() })
    await setGroupMemberRole(payload, {
      siteId: siteA(),
      groupId: group.id,
      actorMemberId: owner(),
      memberId: member(),
      role: 'moderator',
    })
    // Role management is administrator work: a moderator is refused.
    await expect(
      setGroupMemberRole(payload, {
        siteId: siteA(),
        groupId: group.id,
        actorMemberId: member(),
        memberId: editor(),
        role: 'member',
      }),
    ).rejects.toMatchObject({ code: 'GROUP_ADMIN_REQUIRED' })
    // An admin cannot grant a role at their own level (escalation guard).
    await setGroupMemberRole(payload, {
      siteId: siteA(),
      groupId: group.id,
      actorMemberId: owner(),
      memberId: editor(),
      role: 'admin',
    })
    await expect(
      setGroupMemberRole(payload, {
        siteId: siteA(),
        groupId: group.id,
        actorMemberId: editor(),
        memberId: member(),
        role: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'GROUP_ROLE_ESCALATION' })
    // The last owner cannot be demoted or leave into a vacuum.
    await expect(
      setGroupMemberRole(payload, {
        siteId: siteA(),
        groupId: group.id,
        actorMemberId: owner(),
        memberId: owner(),
        role: 'member',
      }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' })
    await expect(
      leaveGroup(payload, { siteId: siteA(), groupId: group.id, memberId: owner() }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' })
    // Ownership transfer: the new owner takes over, the old steps down.
    const transfer = await setGroupMemberRole(payload, {
      siteId: siteA(),
      groupId: group.id,
      actorMemberId: owner(),
      memberId: editor(),
      role: 'owner',
    })
    expect(transfer.role).toBe('owner')
    const after = await getGroup(payload, {
      siteId: siteA(),
      groupId: group.id,
      viewerMemberId: owner(),
    })
    expect(after.viewerRole).toBe('admin')
  })

  it('scopes bans to the group and leaves site standing untouched', async () => {
    const first = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Ban One ${world.suffix}`,
    })
    const second = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Ban Two ${world.suffix}`,
    })
    for (const group of [first, second])
      await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: member() })
    await banGroupMember(payload, {
      siteId: siteA(),
      groupId: first.id,
      actorMemberId: owner(),
      memberId: member(),
    })
    await expect(
      joinGroup(payload, { siteId: siteA(), groupId: first.id, memberId: member() }),
    ).rejects.toMatchObject({ code: 'GROUP_BANNED' })
    const stillIn = await getGroup(payload, {
      siteId: siteA(),
      groupId: second.id,
      viewerMemberId: member(),
    })
    expect(stillIn.viewerRole).toBe('member')
    const standing = await sql(
      'SELECT role FROM member_site_roles WHERE site_id=$1 AND member_id=$2',
      [siteA(), member()],
    )
    expect(standing).toHaveLength(1)
    await unbanGroupMember(payload, {
      siteId: siteA(),
      groupId: first.id,
      actorMemberId: owner(),
      memberId: member(),
    })
    const rejoined = await joinGroup(payload, {
      siteId: siteA(),
      groupId: first.id,
      memberId: member(),
    })
    expect(rejoined.status).toBe('active')
  })

  it('requires explicit confirmation to narrow privacy and audits it', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Shutters ${world.suffix}`,
      privacy: 'public',
    })
    await expect(
      updateGroup(payload, {
        siteId: siteA(),
        groupId: group.id,
        actorMemberId: owner(),
        privacy: 'private-hidden',
      }),
    ).rejects.toMatchObject({ code: 'PRIVACY_TRANSITION_CONFIRM_REQUIRED' })
    const narrowed = await updateGroup(payload, {
      siteId: siteA(),
      groupId: group.id,
      actorMemberId: owner(),
      privacy: 'private-hidden',
      confirmPrivacyTransition: true,
    })
    expect(narrowed.privacy).toBe('private-hidden')
    const audit = await listGroupAudit(payload, {
      siteId: siteA(),
      groupId: group.id,
      actorMemberId: owner(),
    })
    expect(audit.map((entry) => entry.action)).toContain('group.privacy_changed')
  })
})

describe('RC3-15B site lounge: cursor polling over Postgres', () => {
  it('serves standing members, denies outsiders, and keeps cursors monotonic', async () => {
    const lounge = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: admin(),
      title: `Lobby ${world.suffix}`,
    })
    const first = await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: lounge.id,
      senderId: member(),
      body: 'first post',
      idempotencyKey: `lounge-${world.suffix}-1`,
    })
    const duplicate = await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: lounge.id,
      senderId: member(),
      body: 'first post',
      idempotencyKey: `lounge-${world.suffix}-1`,
    })
    expect(String(duplicate.id)).toBe(String(first.id))
    await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: lounge.id,
      senderId: owner(),
      body: 'second post',
      idempotencyKey: `lounge-${world.suffix}-2`,
    })
    const page = await listRoomMessages(payload, {
      siteId: siteA(),
      conversationId: lounge.id,
      memberId: subscriber(),
      afterSequence: 0,
    })
    const bodies = page.messages.map((message) => String(message.body_html))
    expect(bodies).toContain('first post')
    expect(bodies).toContain('second post')
    expect(page.unreadCount).toBe(2)

    const marked = await markRoomRead(payload, {
      siteId: siteA(),
      conversationId: lounge.id,
      memberId: subscriber(),
      upToSequence: page.latestSequence,
    })
    expect(marked.lastReadSequence).toBe(page.latestSequence)
    const rewound = await markRoomRead(payload, {
      siteId: siteA(),
      conversationId: lounge.id,
      memberId: subscriber(),
      upToSequence: 1,
    })
    expect(rewound.lastReadSequence).toBe(page.latestSequence)

    await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: lounge.id,
      senderId: owner(),
      body: 'third post',
      idempotencyKey: `lounge-${world.suffix}-3`,
    })
    const resumed = await listRoomMessages(payload, {
      siteId: siteA(),
      conversationId: lounge.id,
      memberId: subscriber(),
      afterSequence: page.latestSequence,
    })
    expect(resumed.messages.map((message) => String(message.body_html))).toEqual(['third post'])
    expect(resumed.unreadCount).toBe(1)

    // The Site B admin has no Site A standing: no read, and the
    // metadata surface leaks nothing beyond existence (D6).
    await expect(
      listRoomMessages(payload, {
        siteId: siteA(),
        conversationId: lounge.id,
        memberId: world.outsider.memberId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_ROOM_AUDIENCE' })
    const deniedView = await getRoom(payload, {
      siteId: siteA(),
      conversationId: lounge.id,
      viewerMemberId: world.outsider.memberId,
    })
    expect(deniedView.access).toBe('denied')
    expect(deniedView).not.toHaveProperty('title')
  })

  it('converges a slow reader through 120 messages in exact order', async () => {
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: admin(),
      title: `Firehose ${world.suffix}`,
    })
    for (let index = 0; index < 120; index += 1)
      await sendConversationMessage(payload, {
        siteId: siteA(),
        conversationId: room.id,
        senderId: member(),
        body: `burst ${index}`,
        idempotencyKey: `burst-${world.suffix}-${index}`,
      })
    const seen: number[] = []
    let cursor = 0
    for (let pageIndex = 0; pageIndex < 12; pageIndex += 1) {
      const page = await listRoomMessages(payload, {
        siteId: siteA(),
        conversationId: room.id,
        memberId: subscriber(),
        afterSequence: cursor,
        limit: 25,
      })
      for (const message of page.messages) {
        if (String(message.sender_id) !== member()) continue
        seen.push(Number(message.sequence_number))
        cursor = Number(message.sequence_number)
      }
      if (page.messages.length === 0) break
    }
    expect(seen).toHaveLength(120)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    expect(new Set(seen).size).toBe(120)
  }, 120000)
})

describe('RC3-15B group rooms: derived audiences', () => {
  it('holds zero roster rows and follows membership changes immediately', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Derived ${world.suffix}`,
      privacy: 'private-visible',
    })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'General',
      groupId: group.id,
      historyPolicy: 'all',
    })
    await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: owner(),
      body: 'before you joined',
      idempotencyKey: `derived-${world.suffix}-0`,
    })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: member() })
    const roster = await sql(
      'SELECT count(*)::int AS count FROM conversation_memberships WHERE conversation_id=$1',
      [room.id],
    )
    expect(Number(roster[0]?.count)).toBe(0)
    // History policy 'all': the new member sees what predates them.
    const history = await listConversationMessages(payload, {
      siteId: siteA(),
      conversationId: room.id,
      memberId: member(),
    })
    expect(history.map((message) => String(message.body_html))).toContain('before you joined')
    await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: member(),
      body: 'member voice',
      idempotencyKey: `derived-${world.suffix}-1`,
    })
    // Removal mid-session: the very next read and write are denied.
    await removeGroupMember(payload, {
      siteId: siteA(),
      groupId: group.id,
      actorMemberId: owner(),
      memberId: member(),
    })
    await expect(
      listRoomMessages(payload, { siteId: siteA(), conversationId: room.id, memberId: member() }),
    ).rejects.toMatchObject({ code: 'NOT_ROOM_AUDIENCE' })
    await expect(
      sendConversationMessage(payload, {
        siteId: siteA(),
        conversationId: room.id,
        senderId: member(),
        body: 'should fail',
        idempotencyKey: `derived-${world.suffix}-2`,
      }),
    ).rejects.toMatchObject({ code: 'NOT_ROOM_AUDIENCE' })
  })

  it('applies the from-join floor to late joiners', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Floored ${world.suffix}`,
      privacy: 'private-visible',
    })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'Fresh eyes',
      groupId: group.id,
      historyPolicy: 'from-join',
    })
    await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: owner(),
      body: 'early secret',
      idempotencyKey: `floor-${world.suffix}-0`,
    })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: editor() })
    const firstRead = await listRoomMessages(payload, {
      siteId: siteA(),
      conversationId: room.id,
      memberId: editor(),
    })
    expect(firstRead.messages.map((message) => String(message.body_html))).not.toContain(
      'early secret',
    )
    await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: owner(),
      body: 'after you arrived',
      idempotencyKey: `floor-${world.suffix}-1`,
    })
    const secondRead = await listRoomMessages(payload, {
      siteId: siteA(),
      conversationId: room.id,
      memberId: editor(),
    })
    expect(secondRead.messages.map((message) => String(message.body_html))).toContain(
      'after you arrived',
    )
  })

  it('lets public-group guests read but not write, and revokes room creation with the role', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Porch ${world.suffix}`,
      privacy: 'public',
    })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'Porch chat',
      groupId: group.id,
    })
    await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: owner(),
      body: 'porch talk',
      idempotencyKey: `porch-${world.suffix}-0`,
    })
    const guestRead = await listRoomMessages(payload, {
      siteId: siteA(),
      conversationId: room.id,
      memberId: subscriber(),
    })
    expect(guestRead.messages.map((message) => String(message.body_html))).toContain('porch talk')
    await expect(
      sendConversationMessage(payload, {
        siteId: siteA(),
        conversationId: room.id,
        senderId: subscriber(),
        body: 'guest should not write',
        idempotencyKey: `porch-${world.suffix}-1`,
      }),
    ).rejects.toMatchObject({ code: 'NOT_ROOM_AUDIENCE' })

    // Role revocation: an admin can open rooms; a demoted member cannot.
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: editor() })
    await setGroupMemberRole(payload, {
      siteId: siteA(),
      groupId: group.id,
      actorMemberId: owner(),
      memberId: editor(),
      role: 'admin',
    })
    const adminRoom = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: editor(),
      title: 'Admin annex',
      groupId: group.id,
    })
    expect(adminRoom.groupId).toBe(group.id)
    await setGroupMemberRole(payload, {
      siteId: siteA(),
      groupId: group.id,
      actorMemberId: owner(),
      memberId: editor(),
      role: 'member',
    })
    await expect(
      createRoom(payload, {
        siteId: siteA(),
        creatorMemberId: editor(),
        title: 'Nope',
        groupId: group.id,
      }),
    ).rejects.toMatchObject({ code: 'GROUP_ADMIN_REQUIRED' })
  })
})

describe('RC3-15B event rooms: restriction only narrows', () => {
  it('admits attendees, keeps staff read-only oversight, and closes cleanly', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Stage ${world.suffix}`,
      privacy: 'private-visible',
    })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: member() })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: editor() })
    await setGroupMemberRole(payload, {
      siteId: siteA(),
      groupId: group.id,
      actorMemberId: owner(),
      memberId: editor(),
      role: 'moderator',
    })
    const event = await createDoc({
      collection: 'calendar-entries',
      data: {
        site: siteA(),
        title: `Live Q&A ${world.suffix}`,
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        timeZone: 'America/Chicago',
        status: 'scheduled',
        visibility: 'public',
        canonicalPath: `/events/qa-${randomUUID().slice(0, 8)}`,
      },
      overrideAccess: true,
    })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'Q&A room',
      groupId: group.id,
      eventId: String(event.id),
      eventRestricted: true,
      attendeeMemberIds: [member()],
    })
    // The attendee speaks.
    await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: member(),
      body: 'question one',
      idempotencyKey: `qa-${world.suffix}-0`,
    })
    // A group member who is not an attendee is fully out.
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: subscriber() })
    await expect(
      listRoomMessages(payload, {
        siteId: siteA(),
        conversationId: room.id,
        memberId: subscriber(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_ROOM_AUDIENCE' })
    // Group staff oversight (PT-K1): the moderator reads but cannot write.
    const oversight = await listRoomMessages(payload, {
      siteId: siteA(),
      conversationId: room.id,
      memberId: editor(),
    })
    expect(oversight.messages.map((message) => String(message.body_html))).toContain('question one')
    await expect(
      sendConversationMessage(payload, {
        siteId: siteA(),
        conversationId: room.id,
        senderId: editor(),
        body: 'moderator should not post here',
        idempotencyKey: `qa-${world.suffix}-1`,
      }),
    ).rejects.toMatchObject({ code: 'NOT_ROOM_AUDIENCE' })
    // An attendee outside the base audience is refused at setup.
    await expect(
      createRoom(payload, {
        siteId: siteA(),
        creatorMemberId: owner(),
        title: 'Bad attendees',
        groupId: group.id,
        eventId: String(event.id),
        eventRestricted: true,
        attendeeMemberIds: [world.outsider.memberId],
      }),
    ).rejects.toMatchObject({ code: 'ATTENDEE_OUTSIDE_AUDIENCE' })
    // Closing stops writes; history stays readable.
    await setRoomLifecycle(payload, {
      siteId: siteA(),
      conversationId: room.id,
      actorMemberId: owner(),
      lifecycle: 'closed',
    })
    await expect(
      sendConversationMessage(payload, {
        siteId: siteA(),
        conversationId: room.id,
        senderId: member(),
        body: 'after close',
        idempotencyKey: `qa-${world.suffix}-2`,
      }),
    ).rejects.toMatchObject({ code: 'ROOM_CLOSED' })
    const afterClose = await listRoomMessages(payload, {
      siteId: siteA(),
      conversationId: room.id,
      memberId: member(),
    })
    expect(afterClose.messages.map((message) => String(message.body_html))).toContain(
      'question one',
    )
  })
})

describe('RC3-15B reports: CIR-R-09', () => {
  it('lets a room member report a room message and refuses non-members', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Watch ${world.suffix}`,
      privacy: 'private-visible',
    })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: member() })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'Watched room',
      groupId: group.id,
    })
    const roster = await sql(
      'SELECT count(*)::int AS count FROM conversation_memberships WHERE conversation_id=$1',
      [room.id],
    )
    expect(Number(roster[0]?.count)).toBe(0)
    const offensive = await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: owner(),
      body: 'reportable content',
      idempotencyKey: `watch-${world.suffix}-0`,
    })
    // At baseline this report was impossible: authorization required a
    // conversation_memberships row that bound rooms never create.
    const report = await reportConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      messageId: String(offensive.id),
      memberId: member(),
      reason: 'Targeted abuse in the room.',
    })
    expect(report.caseId).toBeTruthy()
    const stored = await sql('SELECT target_snapshot_payload FROM community_reports WHERE id=$1', [
      String(report.reportId),
    ])
    expect(JSON.stringify(stored[0]?.target_snapshot_payload)).toContain('reportable content')
    // A non-member cannot report what they cannot read.
    await expect(
      reportConversationMessage(payload, {
        siteId: siteA(),
        conversationId: room.id,
        messageId: String(offensive.id),
        memberId: subscriber(),
        reason: 'I cannot even see this.',
      }),
    ).rejects.toThrow()
    const bySubscriber = await sql(
      'SELECT count(*)::int AS count FROM community_reports WHERE reporter_id=$1',
      [subscriber()],
    )
    expect(Number(bySubscriber[0]?.count)).toBe(0)
  })
})

describe('RC3-15B recaps: containment over resolved sets', () => {
  it('refuses an event-room recap into the wider group at creation (PT-K2)', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Episode ${world.suffix}`,
      privacy: 'private-visible',
    })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: member() })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: editor() })
    const event = await createDoc({
      collection: 'calendar-entries',
      data: {
        site: siteA(),
        title: `Episode night ${world.suffix}`,
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        timeZone: 'America/Chicago',
        status: 'scheduled',
        visibility: 'public',
        canonicalPath: `/events/ep-${randomUUID().slice(0, 8)}`,
      },
      overrideAccess: true,
    })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'Live discussion',
      groupId: group.id,
      eventId: String(event.id),
      eventRestricted: true,
      attendeeMemberIds: [member()],
    })
    const question = await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: member(),
      body: 'attendees only',
      idempotencyKey: `ep-${world.suffix}-0`,
    })
    // The episode → invitation → live Q&A slice: quoting the
    // restricted room into the whole Circle is the containment
    // violation PT-K2 predicted; creation refuses it outright.
    await expect(
      createRecap(payload, {
        siteId: siteA(),
        sourceConversationId: room.id,
        authorMemberId: member(),
        title: 'Q&A recap',
        quoteMessageIds: [String(question.id)],
        destinationGroupId: group.id,
      }),
    ).rejects.toMatchObject({ code: 'RECAP_AUDIENCE_WIDER' })
  })

  it('publishes a lounge recap into the group library with human approval', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Library ${world.suffix}`,
      privacy: 'private-visible',
    })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: member() })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'Discussion',
      groupId: group.id,
    })
    const first = await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: owner(),
      body: 'key point one',
      idempotencyKey: `lib-${world.suffix}-0`,
    })
    const second = await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: member(),
      body: 'key point two',
      idempotencyKey: `lib-${world.suffix}-1`,
    })
    const recap = await createRecap(payload, {
      siteId: siteA(),
      sourceConversationId: room.id,
      authorMemberId: member(),
      title: 'Session recap',
      body: 'What we covered.',
      quoteMessageIds: [String(first.id), String(second.id)],
    })
    expect(recap.status).toBe('draft')
    // The author alone cannot publish: a human approver is required.
    await expect(
      publishRecap(payload, { siteId: siteA(), recapId: recap.id, approverMemberId: member() }),
    ).rejects.toMatchObject({ code: 'RECAP_APPROVAL_REQUIRED' })
    const published = await publishRecap(payload, {
      siteId: siteA(),
      recapId: recap.id,
      approverMemberId: owner(),
    })
    expect(published.status).toBe('published')
    const library = await listGroupLibrary(payload, {
      siteId: siteA(),
      groupId: group.id,
      viewerMemberId: member(),
    })
    const entry = library.find((item) => item.id === recap.id)
    expect(entry?.quoteCount).toBe(2)
    expect(entry).not.toHaveProperty('body')
    const view = await getRecap(payload, {
      siteId: siteA(),
      recapId: recap.id,
      viewerMemberId: member(),
    })
    const bodies = view.quotes.map((quote) => ('bodyHtml' in quote ? String(quote.bodyHtml) : null))
    expect(bodies).toContain('key point one')
    expect(bodies).toContain('key point two')
    // The group home projects rooms + library without leaking bodies.
    const home = await getGroupHome(payload, {
      siteId: siteA(),
      groupId: group.id,
      viewerMemberId: member(),
    })
    expect(home.rooms.map((item) => item.id)).toContain(room.id)
    expect(home.library.map((item) => item.id)).toContain(recap.id)
  })

  it('blocks at publish when the destination outgrows the source', async () => {
    const source = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Source Circle ${world.suffix}`,
      privacy: 'private-visible',
    })
    const destination = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Dest Circle ${world.suffix}`,
      privacy: 'private-visible',
    })
    for (const group of [source, destination])
      await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: member() })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'Source room',
      groupId: source.id,
    })
    const quoted = await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: member(),
      body: 'contained words',
      idempotencyKey: `block-${world.suffix}-0`,
    })
    const recap = await createRecap(payload, {
      siteId: siteA(),
      sourceConversationId: room.id,
      authorMemberId: member(),
      title: 'Cross recap',
      quoteMessageIds: [String(quoted.id)],
      destinationGroupId: destination.id,
    })
    // The destination gains a member the source never had.
    await joinGroup(payload, { siteId: siteA(), groupId: destination.id, memberId: editor() })
    const outcome = await publishRecap(payload, {
      siteId: siteA(),
      recapId: recap.id,
      approverMemberId: owner(),
    })
    expect(outcome.status).toBe('blocked')
    if (outcome.status === 'blocked') expect(outcome.blockedReason).toContain('no longer contained')
    const view = await getRecap(payload, {
      siteId: siteA(),
      recapId: recap.id,
      viewerMemberId: owner(),
    })
    expect(view.status).toBe('blocked')
  })

  it('renders placeholders below the floor and tombstones after source removal', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Echoes ${world.suffix}`,
      privacy: 'private-visible',
    })
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: member() })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'Echo room',
      groupId: group.id,
      historyPolicy: 'from-join',
    })
    const quoted = await sendConversationMessage(payload, {
      siteId: siteA(),
      conversationId: room.id,
      senderId: owner(),
      body: ' soon to vanish',
      idempotencyKey: `echo-${world.suffix}-0`,
    })
    const recap = await createRecap(payload, {
      siteId: siteA(),
      sourceConversationId: room.id,
      authorMemberId: member(),
      title: 'Echo recap',
      quoteMessageIds: [String(quoted.id)],
    })
    await publishRecap(payload, { siteId: siteA(), recapId: recap.id, approverMemberId: owner() })
    // A late joiner's floor sits above the quote: placeholder, never content.
    await joinGroup(payload, { siteId: siteA(), groupId: group.id, memberId: editor() })
    const lateView = await getRecap(payload, {
      siteId: siteA(),
      recapId: recap.id,
      viewerMemberId: editor(),
    })
    expect(lateView.quotes).toHaveLength(1)
    expect(lateView.quotes[0]).toMatchObject({ placeholder: true })
    expect(JSON.stringify(lateView.quotes)).not.toContain('soon to vanish')
    // Hard-deleting the source message tombstones the quote everywhere.
    await sql('DELETE FROM messages WHERE id=$1', [String(quoted.id)])
    const afterDelete = await getRecap(payload, {
      siteId: siteA(),
      recapId: recap.id,
      viewerMemberId: owner(),
    })
    expect(afterDelete.quotes[0]).toMatchObject({ tombstone: true })
    expect(JSON.stringify(afterDelete.quotes)).not.toContain('soon to vanish')
  })
})

describe('RC3-15B two-site isolation', () => {
  it('denies cross-site group and room access in both directions', async () => {
    const group = await createGroup(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      name: `Border ${world.suffix}`,
      privacy: 'public',
    })
    const room = await createRoom(payload, {
      siteId: siteA(),
      creatorMemberId: owner(),
      title: 'Border room',
      groupId: group.id,
    })
    await expect(
      getGroup(payload, {
        siteId: world.siteB.siteId,
        groupId: group.id,
        viewerMemberId: world.siteB.owner.memberId,
      }),
    ).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' })
    await expect(
      listRoomMessages(payload, {
        siteId: world.siteB.siteId,
        conversationId: room.id,
        memberId: world.siteB.owner.memberId,
      }),
    ).rejects.toThrow()
    await expect(
      createRoom(payload, {
        siteId: world.siteB.siteId,
        creatorMemberId: world.siteB.owner.memberId,
        title: 'Squatter',
        groupId: group.id,
      }),
    ).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' })
    expect(
      code(
        await getGroup(payload, {
          siteId: siteA(),
          groupId: group.id,
          viewerMemberId: owner(),
        }).catch((error: unknown) => error),
      ),
    ).toBeUndefined()
  })
})
