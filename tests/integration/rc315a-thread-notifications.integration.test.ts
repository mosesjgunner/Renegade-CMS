/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import {
  replyToForumThread,
  listMemberNotificationsPage,
} from '../../src/modules/community/service'
import { setMemberRelation } from '../../src/modules/community/profile-projection'
import { communityRealtime } from '../../src/modules/community/realtime'
import { postThreadComment } from '../../src/modules/community/comment-composer'
import {
  subscribeToThread,
  unsubscribeFromThread,
} from '../../src/modules/community/thread-lifecycle'
import { setMemberNotificationPreference } from '../../src/modules/community/notification-delivery'
import {
  buildRc2World,
  teardownRc2World,
  loginAsMember,
  type Rc2World,
} from '../fixtures/rc2-world'
import {
  GET as readSubscription,
  POST as subscribe,
  DELETE as unsubscribe,
} from '../../src/app/(frontend)/api/v1/sites/[site_id]/threads/[thread_id]/subscriptions/route'

describe('RC3-15A thread subscriber notifications', () => {
  let payload: Payload
  let world: Rc2World
  const context = (siteId: string, memberId: string) => ({
    siteId,
    actor: {
      kind: 'member' as const,
      memberId,
      status: 'active' as const,
      isStaff: false,
      isModerator: false,
    },
  })
  beforeAll(async () => {
    payload = await getPayload({ config })
    world = await buildRc2World(payload)
    await (payload as any).update({
      collection: 'discussions',
      id: world.siteA.discussionId,
      data: { owner: world.siteA.owner.memberId },
      overrideAccess: true,
    })
  }, 240000)
  afterAll(async () => {
    if (world) await teardownRc2World(payload, world)
  })

  it('deduplicates the owner and subscriber, respects unsubscribe and reports site-scoped unread state', async () => {
    const site = world.siteA.siteId
    const threadId = world.siteA.discussionId!
    const owner = world.siteA.owner.memberId
    const subscriber = world.siteA.subscriber.memberId
    const author = world.siteA.member.memberId
    for (const memberId of [owner, subscriber, author])
      await subscribeToThread(payload, { siteId: site, threadId, memberId })
    const send = () =>
      replyToForumThread(
        payload,
        {
          siteId: site,
          discussionId: threadId,
          authorMemberId: author,
          body: 'A real subscriber reply',
        },
        context(site, author),
      )
    await send()
    const ownerInbox = await listMemberNotificationsPage(payload, owner, context(site, owner))
    const subscriberInbox = await listMemberNotificationsPage(
      payload,
      subscriber,
      context(site, subscriber),
    )
    const authorInbox = await listMemberNotificationsPage(payload, author, context(site, author))
    expect(ownerInbox.unreadCount).toBe(1)
    expect(subscriberInbox.unreadCount).toBe(1)
    expect(authorInbox.unreadCount).toBe(0)
    expect(
      (
        await listMemberNotificationsPage(
          payload,
          subscriber,
          context(world.siteB.siteId, subscriber),
        )
      ).unreadCount,
    ).toBe(0)
    await unsubscribeFromThread(payload, { siteId: site, threadId, memberId: subscriber })
    await send()
    expect(
      (await listMemberNotificationsPage(payload, owner, context(site, owner))).unreadCount,
    ).toBe(2)
    expect(
      (await listMemberNotificationsPage(payload, subscriber, context(site, subscriber)))
        .unreadCount,
    ).toBe(1)
    await subscribeToThread(payload, { siteId: site, threadId, memberId: subscriber })
    await setMemberNotificationPreference(payload, {
      siteId: site,
      memberId: subscriber,
      channel: 'in_app',
      kind: 'thread.reply',
      frequency: 'off',
    })
    await send()
    expect(
      (await listMemberNotificationsPage(payload, subscriber, context(site, subscriber)))
        .unreadCount,
    ).toBe(1)
  }, 120000)
  it('hides old notices and skips new subscriber notices after access is lost', async () => {
    const site = world.siteA.siteId
    const threadId = world.siteA.discussionId!
    const owner = world.siteA.owner.memberId
    const subscriber = world.siteA.subscriber.memberId
    const moderator = world.siteA.editor.memberId
    const roles = await (payload as any).find({
      collection: 'member-site-roles',
      where: { and: [{ site: { equals: site } }, { member: { equals: moderator } }] },
      overrideAccess: true,
    })
    const previousRole = roles.docs[0].role
    await (payload as any).update({
      collection: 'member-site-roles',
      id: roles.docs[0].id,
      data: { role: 'moderator' },
      overrideAccess: true,
    })
    await subscribeToThread(payload, { siteId: site, threadId, memberId: moderator })
    const moderatorBefore = await (payload as any).count({
      collection: 'notifications',
      where: { recipientMember: { equals: moderator } },
      overrideAccess: true,
    })
    // Model a pre-upgrade reply notification whose object contains only the post id.
    const historical = await (payload as any).find({
      collection: 'notifications',
      where: { recipientMember: { equals: subscriber } },
      depth: 1,
      overrideAccess: true,
    })
    const activity = historical.docs[0].activityEvent
    await (payload as any).update({
      collection: 'activity-events',
      id: activity.id,
      data: { object: { id: activity.object.id, permalink: activity.object.permalink } },
      overrideAccess: true,
    })
    await setMemberNotificationPreference(payload, {
      siteId: site,
      memberId: subscriber,
      channel: 'in_app',
      kind: 'thread.reply',
      frequency: 'immediate',
    })
    await (payload as any).update({
      collection: 'discussions',
      id: threadId,
      data: { visibility: 'private' },
      overrideAccess: true,
    })
    expect(
      (await listMemberNotificationsPage(payload, subscriber, context(site, subscriber)))
        .unreadCount,
    ).toBe(0)
    await replyToForumThread(
      payload,
      { siteId: site, discussionId: threadId, authorMemberId: owner, body: 'Private reply' },
      context(site, owner),
    )
    const moderatorAfter = await (payload as any).count({
      collection: 'notifications',
      where: { recipientMember: { equals: moderator } },
      overrideAccess: true,
    })
    expect(moderatorAfter.totalDocs).toBe(moderatorBefore.totalDocs + 1)
    await (payload as any).update({
      collection: 'member-site-roles',
      id: roles.docs[0].id,
      data: { role: previousRole },
      overrideAccess: true,
    })
    await (payload as any).update({
      collection: 'discussions',
      id: threadId,
      data: { visibility: 'public' },
      overrideAccess: true,
    })
    expect(
      (await listMemberNotificationsPage(payload, subscriber, context(site, subscriber)))
        .unreadCount,
    ).toBe(1)
  }, 120000)

  it('suppresses new notices when the subscriber blocks or mutes the author', async () => {
    const site = world.siteA.siteId
    const threadId = world.siteA.discussionId!
    const subscriber = world.siteA.subscriber.memberId
    const author = world.siteA.member.memberId
    const notifications = () =>
      (payload as any).count({
        collection: 'notifications',
        where: { recipientMember: { equals: subscriber } },
        overrideAccess: true,
      })
    const before = (await notifications()).totalDocs
    await setMemberRelation(payload, {
      siteId: site,
      subjectId: subscriber,
      targetId: author,
      kind: 'block',
      active: true,
    })
    await replyToForumThread(
      payload,
      { siteId: site, discussionId: threadId, authorMemberId: author, body: 'Blocked notice' },
      context(site, author),
    )
    expect((await notifications()).totalDocs).toBe(before)
    await setMemberRelation(payload, {
      siteId: site,
      subjectId: subscriber,
      targetId: author,
      kind: 'block',
      active: false,
    })
    await setMemberRelation(payload, {
      siteId: site,
      subjectId: subscriber,
      targetId: author,
      kind: 'mute',
      active: true,
    })
    await replyToForumThread(
      payload,
      { siteId: site, discussionId: threadId, authorMemberId: author, body: 'Muted notice' },
      context(site, author),
    )
    expect((await notifications()).totalDocs).toBe(before)
  }, 120000)
  it('rolls back an interrupted notification fanout and retries without duplicates', async () => {
    const site = world.siteA.siteId
    const threadId = world.siteA.discussionId!
    const owner = world.siteA.owner.memberId
    const editor = world.siteA.editor.memberId
    const author = world.siteA.member.memberId
    await subscribeToThread(payload, { siteId: site, threadId, memberId: editor })
    const postCount = async () =>
      (
        await (payload as any).count({
          collection: 'discussion-posts',
          where: { discussion: { equals: threadId } },
          overrideAccess: true,
        })
      ).totalDocs
    const notificationCount = async (memberId: string) =>
      (
        await (payload as any).count({
          collection: 'notifications',
          where: { recipientMember: { equals: memberId } },
          overrideAccess: true,
        })
      ).totalDocs
    const before = {
      posts: await postCount(),
      owner: await notificationCount(owner),
      editor: await notificationCount(editor),
    }
    const original = payload.create.bind(payload)
    const hints: string[] = []
    const unsubscribeHints = communityRealtime.subscribeMember(owner, (event) =>
      hints.push(event.type),
    )
    let calls = 0
    const spy = vi.spyOn(payload, 'create').mockImplementation(async (args: any) => {
      if (args.collection === 'notifications' && ++calls === 2)
        throw new Error('injected fanout interruption')
      return original(args)
    })
    const send = () =>
      replyToForumThread(
        payload,
        {
          siteId: site,
          discussionId: threadId,
          authorMemberId: author,
          body: 'Retry after interruption',
        },
        context(site, author),
      )
    try {
      await expect(send()).rejects.toThrow('injected fanout interruption')
    } finally {
      spy.mockRestore()
    }
    expect(await postCount()).toBe(before.posts)
    expect(await notificationCount(owner)).toBe(before.owner)
    expect(await notificationCount(editor)).toBe(before.editor)
    expect(hints).toEqual([])
    await send()
    expect(await postCount()).toBe(before.posts + 1)
    expect(await notificationCount(owner)).toBe(before.owner + 1)
    expect(await notificationCount(editor)).toBe(before.editor + 1)
    expect(hints).toContain('community.notification_dispatched')
    unsubscribeHints()
  }, 120000)
  it('uses the session and host-bound subscription routes and rejects a foreign site', async () => {
    const site = world.siteA.siteId
    const thread = world.siteA.discussionId!
    const session = await loginAsMember(payload, world.siteA.editor)
    const cookie = `${session.headers.get('cookie')}; renegade-member-csrf=rc315a-token`
    const request = (method: string) =>
      new Request(
        `http://${world.siteA.host}/api/v1/sites/${site}/threads/${thread}/subscriptions`,
        { method, headers: { host: world.siteA.host, cookie, 'x-member-csrf': 'rc315a-token' } },
      )
    const params = { params: Promise.resolve({ site_id: site, thread_id: thread }) }
    expect((await unsubscribe(request('DELETE'), params)).status).toBe(200)
    expect((await (await readSubscription(request('GET'), params)).json()).data.subscribed).toBe(
      false,
    )
    expect((await subscribe(request('POST'), params)).status).toBe(200)
    expect((await (await readSubscription(request('GET'), params)).json()).data.subscribed).toBe(
      true,
    )
    const foreign = {
      params: Promise.resolve({
        site_id: world.siteB.siteId,
        thread_id: world.siteB.discussionId!,
      }),
    }
    expect((await subscribe(request('POST'), foreign)).status).toBe(404)
  }, 120000)
  it('fans out a v1 reply once and replays its idempotency key without duplicates', async () => {
    const site = world.siteA.siteId
    const threadId = world.siteA.discussionId!
    const subscriber = world.siteA.subscriber.memberId
    const author = world.siteA.member.memberId
    await setMemberRelation(payload, {
      siteId: site,
      subjectId: subscriber,
      targetId: author,
      kind: 'mute',
      active: false,
    })
    await setMemberNotificationPreference(payload, {
      siteId: site,
      memberId: subscriber,
      channel: 'in_app',
      kind: 'comment.reply',
      frequency: 'immediate',
    })
    await subscribeToThread(payload, { siteId: site, threadId, memberId: subscriber })
    const before = await listMemberNotificationsPage(payload, subscriber, context(site, subscriber))
    const input = {
      siteId: site,
      threadId,
      authorId: author,
      body: `A v1 subscriber test ${world.suffix}`,
      idempotencyKey: `v1-rc315a-${world.suffix}`,
    }
    const created = await postThreadComment(payload, input)
    const replay = await postThreadComment(payload, input)
    expect(created.replayed).toBe(false)
    expect(replay.replayed).toBe(true)
    const after = await listMemberNotificationsPage(payload, subscriber, context(site, subscriber))
    expect(after.unreadCount).toBe(before.unreadCount + 1)
  }, 120000)
  it('retries a v1 fanout after an interrupted notification without duplicating the reply', async () => {
    const site = world.siteA.siteId
    const threadId = world.siteA.discussionId!
    const subscriber = world.siteA.subscriber.memberId
    const author = world.siteA.member.memberId
    const count = async () =>
      (
        await (payload as any).count({
          collection: 'notifications',
          where: { recipientMember: { equals: subscriber } },
          overrideAccess: true,
        })
      ).totalDocs
    const before = await count()
    const input = {
      siteId: site,
      threadId,
      authorId: author,
      body: `A different v1 recovery message ${world.suffix}`,
      idempotencyKey: `v1-recovery-${world.suffix}`,
    }
    const original = payload.create.bind(payload)
    let injected = false
    const spy = vi.spyOn(payload, 'create').mockImplementation(async (args: any) => {
      if (args.collection === 'notifications' && !injected) {
        injected = true
        throw new Error('injected v1 interruption')
      }
      return original(args)
    })
    try {
      await expect(postThreadComment(payload, input)).rejects.toThrow('injected v1 interruption')
    } finally {
      spy.mockRestore()
    }
    expect(await count()).toBe(before)
    const replay = await postThreadComment(payload, input)
    expect(replay.replayed).toBe(true)
    expect(await count()).toBe(before + 1)
    await postThreadComment(payload, input)
    expect(await count()).toBe(before + 1)
  }, 120000)
})
