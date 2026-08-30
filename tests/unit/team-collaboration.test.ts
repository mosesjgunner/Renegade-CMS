import { describe, expect, it } from 'vitest'

import {
  acceptTeamInvitation,
  addEditorialComment,
  assertTeamPermission,
  assignEditorialWork,
  inviteTeamMember,
  notifyEditorialDecision,
  notifyReleaseAction,
  readWorkConversation,
  requestTeamReview,
  revokeTeamInvitation,
  sendWorkMessage,
  type CollaborationStore,
  type TeamScope,
} from '../../src/modules/collaboration/service'

class MemoryStore implements CollaborationStore {
  records = new Map<string, Array<Record<string, unknown>>>()
  sequence = 0
  async create({ collection, data }: Record<string, unknown>) {
    const record = { ...(data as Record<string, unknown>), id: `id-${++this.sequence}` }
    this.records.set(String(collection), [...(this.records.get(String(collection)) ?? []), record])
    return record
  }
  async find({ collection, where }: Record<string, unknown>) {
    return {
      docs: (this.records.get(String(collection)) ?? []).filter((record) =>
        match(record, where as Record<string, unknown>),
      ),
    }
  }
  async findByID({ collection, id }: Record<string, unknown>) {
    const result = (this.records.get(String(collection)) ?? []).find((record) => record.id === id)
    if (!result) throw new Error('not found')
    return result
  }
  async update({ collection, id, data }: Record<string, unknown>) {
    const record = await this.findByID({ collection, id })
    Object.assign(record, data)
    return record
  }
}
function value(input: unknown) {
  return typeof input === 'string' ? input : (input as { id?: string } | null)?.id
}
function match(record: Record<string, unknown>, where: Record<string, unknown>): boolean {
  if (Array.isArray(where.and))
    return where.and.every((entry) => match(record, entry as Record<string, unknown>))
  return Object.entries(where).every(([field, predicate]) => {
    if (field === 'and') return true
    const equals = (predicate as { equals?: unknown }).equals
    return equals === undefined ? true : value(record[field]) === equals
  })
}
const scope: TeamScope = { kind: 'site', siteId: 'site-a' }
const otherScope: TeamScope = { kind: 'site', siteId: 'site-b' }
async function member(store: MemoryStore, memberId: string, role: string, target = scope) {
  await store.create({
    collection: 'team-memberships',
    data: {
      member: memberId,
      scopeKey: `${target.kind}:${target.siteId}`,
      status: 'active',
      role,
      grants: [],
    },
  })
}

describe('Prompt 16 team collaboration', () => {
  it('issues hashed expiring, single-use invitations without creating another account', async () => {
    const store = new MemoryStore()
    await member(store, 'owner', 'owner')
    const issued = await inviteTeamMember(store, {
      actorMemberId: 'owner',
      email: 'EDITOR@example.test',
      scope,
      role: 'editor',
      expiresAt: new Date('2026-09-02T00:00:00Z'),
      now: new Date('2026-09-01T00:00:00Z'),
    })
    expect(JSON.stringify([...store.records.values()])).not.toContain(issued.token)
    await acceptTeamInvitation(store, {
      token: issued.token,
      memberId: 'existing-member',
      verifiedEmail: 'editor@example.test',
      now: new Date('2026-09-01T01:00:00Z'),
    })
    await expect(
      acceptTeamInvitation(store, {
        token: issued.token,
        memberId: 'existing-member',
        verifiedEmail: 'editor@example.test',
      }),
    ).rejects.toThrow('unavailable')
    expect(store.records.get('members') ?? []).toHaveLength(0)
    expect(
      store.records.get('team-memberships')?.some((entry) => entry.member === 'existing-member'),
    ).toBe(true)
    expect(store.records.get('notifications')?.length).toBe(1)
  })

  it('rejects expired and revoked invitations', async () => {
    const store = new MemoryStore()
    await member(store, 'owner', 'owner')
    const expired = await inviteTeamMember(store, {
      actorMemberId: 'owner',
      email: 'a@example.test',
      scope,
      role: 'author',
      expiresAt: new Date('2026-09-01T01:00:00Z'),
      now: new Date('2026-09-01T00:00:00Z'),
    })
    await expect(
      acceptTeamInvitation(store, {
        token: expired.token,
        memberId: 'a',
        verifiedEmail: 'a@example.test',
        now: new Date('2026-09-01T02:00:00Z'),
      }),
    ).rejects.toThrow('unavailable')
    const revoked = await inviteTeamMember(store, {
      actorMemberId: 'owner',
      email: 'b@example.test',
      scope,
      role: 'author',
      expiresAt: new Date('2026-09-02T00:00:00Z'),
    })
    await revokeTeamInvitation(store, {
      actorMemberId: 'owner',
      invitationId: revoked.invitationId,
    })
    await expect(
      acceptTeamInvitation(store, {
        token: revoked.token,
        memberId: 'b',
        verifiedEmail: 'b@example.test',
      }),
    ).rejects.toThrow('unavailable')
  })

  it('applies granular role permissions and denies cross-site access', async () => {
    const store = new MemoryStore()
    await member(store, 'editor', 'editor')
    await member(store, 'author', 'author')
    await expect(
      assertTeamPermission(store, 'editor', scope, 'content.assign'),
    ).resolves.toBeTruthy()
    await expect(assertTeamPermission(store, 'author', scope, 'content.approve')).rejects.toThrow(
      'permission denied',
    )
    await expect(assertTeamPermission(store, 'editor', otherScope, 'content.read')).rejects.toThrow(
      'scope access denied',
    )
  })

  it('creates assignment, review, comment mention/reply, and durable notifications', async () => {
    const store = new MemoryStore()
    await member(store, 'editor', 'editor')
    await member(store, 'author', 'author')
    await member(store, 'reviewer', 'editor')
    const assignment = await assignEditorialWork(store, {
      actorMemberId: 'editor',
      assigneeMemberId: 'author',
      scope,
      contentId: 'content-1',
      articleId: 'article-1',
      revisionId: 'revision-1',
      title: 'Finish copy',
      dueAt: '2026-09-05T00:00:00Z',
    })
    expect(assignment.dueAt).toBe('2026-09-05T00:00:00Z')
    await requestTeamReview(store, {
      actorMemberId: 'author',
      reviewerMemberId: 'reviewer',
      scope,
      contentId: 'content-1',
      articleId: 'article-1',
      revisionId: 'revision-1',
    })
    const discussion = await store.create({
      collection: 'editorial-discussions',
      data: { scopeKey: 'site:site-a', state: 'open' },
    })
    const parent = await store.create({
      collection: 'editorial-comments',
      data: { author: 'reviewer' },
    })
    await addEditorialComment(store, {
      actorMemberId: 'author',
      scope,
      discussionId: String(discussion.id),
      body: 'Please review @editor',
      mentions: ['editor'],
      replyTo: String(parent.id),
    })
    expect(store.records.get('notifications')).toHaveLength(4)
    expect(store.records.get('activity-events')?.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'editorial.assignment',
        'editorial.review_requested',
        'editorial.mention',
        'editorial.comment_reply',
      ]),
    )
  })

  it('does not expose private staff conversations to a nonparticipant or another site', async () => {
    const store = new MemoryStore()
    await member(store, 'editor', 'editor')
    await member(store, 'author', 'author')
    await member(store, 'outsider', 'editor')
    const conversation = await store.create({
      collection: 'work-conversations',
      data: {
        scopeKey: 'site:site-a',
        privateOnly: true,
        status: 'open',
        participants: ['editor', 'author'],
      },
    })
    await sendWorkMessage(store, {
      actorMemberId: 'editor',
      scope,
      conversationId: String(conversation.id),
      body: 'Internal draft notes',
    })
    await expect(
      readWorkConversation(store, {
        memberId: 'outsider',
        scope,
        conversationId: String(conversation.id),
      }),
    ).rejects.toThrow('Private conversation access denied')
    await expect(
      readWorkConversation(store, {
        memberId: 'editor',
        scope: otherScope,
        conversationId: String(conversation.id),
      }),
    ).rejects.toThrow('scope access denied')
  })

  it('records approval, rejection, and release notifications against existing workflow records', async () => {
    const store = new MemoryStore()
    await member(store, 'owner', 'owner')
    await member(store, 'author', 'author')
    await notifyEditorialDecision(store, {
      actorMemberId: 'owner',
      recipientMemberId: 'author',
      scope,
      approved: true,
      contentId: 'content-1',
      articleId: 'article-1',
      revisionId: 'revision-2',
    })
    await notifyEditorialDecision(store, {
      actorMemberId: 'owner',
      recipientMemberId: 'author',
      scope,
      approved: false,
      contentId: 'content-1',
      articleId: 'article-1',
      revisionId: 'revision-3',
    })
    await notifyReleaseAction(store, {
      actorMemberId: 'owner',
      recipientMemberId: 'author',
      scope,
      action: 'released',
      releaseId: 'release-1',
      contentId: 'content-1',
    })
    expect(store.records.get('activity-events')?.map((event) => event.type)).toEqual([
      'editorial.approved',
      'editorial.rejected',
      'release.released',
    ])
    expect(store.records.get('team-audit-events')).toHaveLength(3)
  })
})
