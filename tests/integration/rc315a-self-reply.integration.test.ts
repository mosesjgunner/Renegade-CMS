/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-15A gap leg: the self-reply. The salvage suite proves owner +
 * subscriber dedupe and the reply-author exclusion when a third member
 * replies; this file proves the remaining named case — a thread owner
 * who is subscribed to their own thread and replies to it receives no
 * notification for their own post, while another subscriber does (so
 * the fanout demonstrably ran).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import {
  replyToForumThread,
  listMemberNotificationsPage,
} from '../../src/modules/community/service'
import { subscribeToThread } from '../../src/modules/community/thread-lifecycle'
import { buildRc2World, teardownRc2World, type Rc2World } from '../fixtures/rc2-world'

describe('RC3-15A self-reply notification exclusion', () => {
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

  it('notifies other subscribers but never the replier themselves', async () => {
    const site = world.siteA.siteId
    const threadId = world.siteA.discussionId!
    const owner = world.siteA.owner.memberId
    const subscriber = world.siteA.subscriber.memberId
    await subscribeToThread(payload, { siteId: site, threadId, memberId: owner })
    await subscribeToThread(payload, { siteId: site, threadId, memberId: subscriber })

    await replyToForumThread(
      payload,
      {
        siteId: site,
        discussionId: threadId,
        authorMemberId: owner,
        body: 'The owner replies to their own thread',
      },
      context(site, owner),
    )

    const ownerInbox = await listMemberNotificationsPage(payload, owner, context(site, owner))
    const subscriberInbox = await listMemberNotificationsPage(
      payload,
      subscriber,
      context(site, subscriber),
    )
    expect(ownerInbox.unreadCount).toBe(0)
    expect(subscriberInbox.unreadCount).toBe(1)
  }, 120000)
})
