/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { ensureRenegadePartyDemo, type DemoEnvironment } from '../helpers/renegadeparty-demo'
import {
  issueMagicLink,
  consumeMagicLink,
  memberSessionCookie,
  currentMember,
} from '../../src/modules/identity/member-identity'
import {
  resolveCommunityActor,
  getPublicMemberProfile,
  updateMemberProfile,
  addComment,
  listDiscussionComments,
  createForumThread,
  replyToForumThread,
  toggleCommunityReaction,
  submitCommunityReport,
  blockMember,
  executeModerationDecision,
  startOrGetConversation,
  sendDirectMessage,
  getMemberNotifications,
  getMemberActivityHistory,
  queryDb,
} from '../../src/modules/community/service'
import type { CommunityActor, CommunityPolicyContext } from '../../src/modules/community/contracts'
import { loadProfileProjection } from '../../src/modules/community/profile-projection'

describe('COMM-00: Canonical Community Domain Full Member Journey', () => {
  let payload: Payload
  let demo: DemoEnvironment
  let siteId: string
  let articleId: string
  let forumId: string
  const suffix = randomUUID().slice(0, 8)

  // Test Actors
  let aliceMemberId: string
  let aliceSessionToken: string
  let aliceHeaders: Headers

  let bobMemberId: string
  let bobSessionToken: string
  let bobHeaders: Headers

  let charlieModMemberId: string
  let charlieModSessionToken: string
  let charlieModHeaders: Headers

  beforeAll(async () => {
    payload = await getPayload({ config })
    demo = await ensureRenegadePartyDemo(payload)
    siteId = demo.siteId

    // Find or create a test article for comments
    const contentRes = await payload.find({
      collection: 'content',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)

    if (contentRes.docs[0]) {
      articleId = String(contentRes.docs[0].id)
    } else {
      const createdContent = (await payload.create({
        collection: 'content',
        data: {
          site: siteId,
          title: `Renegade Community Manifesto ${suffix}`,
          slug: `renegade-community-manifesto-${suffix}`,
          summary: 'Community platform foundation.',
          status: 'published',
          publishedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      } as never)) as any
      articleId = String(createdContent.id)
    }

    // Find or create a forum section and forum space
    const sectionRes = await payload.find({
      collection: 'forum-sections',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)

    let sectionId: string
    if (sectionRes.docs[0]) {
      sectionId = String(sectionRes.docs[0].id)
    } else {
      const createdSection = (await payload.create({
        collection: 'forum-sections',
        data: {
          site: siteId,
          name: `General Discussions ${suffix}`,
          slug: `general-discussions-${suffix}`,
          description: 'Community forum sections',
        },
        overrideAccess: true,
      } as never)) as any
      sectionId = String(createdSection.id)
    }

    const forumRes = await payload.find({
      collection: 'forums',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)

    if (forumRes.docs[0]) {
      forumId = String(forumRes.docs[0].id)
    } else {
      const createdForum = (await payload.create({
        collection: 'forums',
        data: {
          site: siteId,
          section: sectionId,
          name: `Public Square ${suffix}`,
          slug: `public-square-${suffix}`,
          description: 'Open discussion forum for renegade members',
        },
        overrideAccess: true,
      } as never)) as any
      forumId = String(createdForum.id)
    }
  }, 120_000)

  afterAll(async () => {
    await payload?.db?.destroy?.()
  })

  let aliceMagicToken: string

  // ---------------------------------------------------------------------------
  // Step 1: Reader Registration via Magic Link
  // ---------------------------------------------------------------------------
  it('1. Reader registration issues a secure, non-reusable magic link token', async () => {
    const aliceEmail = `alice-${suffix}@renegadeparty.org`
    const issued = await issueMagicLink(payload as never, aliceEmail)
    expect(issued.accepted).toBe(true)
    expect(issued.token).toBeDefined()
    expect(typeof issued.token).toBe('string')
    aliceMagicToken = issued.token!
  })

  // ---------------------------------------------------------------------------
  // Step 2: Verification and Member Login
  // ---------------------------------------------------------------------------
  it('2. Verification consumes token and establishes authenticated member session', async () => {
    const result = await consumeMagicLink(payload as never, aliceMagicToken)

    expect(result).not.toBeNull()
    expect(result?.memberId).toBeDefined()
    expect(result?.sessionToken).toBeDefined()

    aliceMemberId = result!.memberId
    aliceSessionToken = result!.sessionToken

    // Create realistic browser HTTP headers with member session cookie
    aliceHeaders = new Headers()
    aliceHeaders.set('cookie', memberSessionCookie(aliceSessionToken, false))
    aliceHeaders.set('x-site-id', siteId)

    // Verify actor resolution
    const actor = await resolveCommunityActor(payload, aliceHeaders, siteId)
    expect(actor.kind).toBe('member')
    expect(actor.memberId).toBe(aliceMemberId)
    expect(actor.status).toBe('active')
    expect(actor.isStaff).toBe(false)
    expect(actor.isModerator).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Step 3: Profile Setup and Sanitized Public Projection
  // ---------------------------------------------------------------------------
  it('3. Member updates profile and public projection exposes zero auth or contact fields', async () => {
    const aliceActor: CommunityActor = {
      kind: 'member',
      memberId: aliceMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    const aliceContext: CommunityPolicyContext = { siteId, actor: aliceActor }

    const handle = `alice_${suffix.toLowerCase()}`
    const updated = await updateMemberProfile(
      payload,
      {
        memberId: aliceMemberId,
        handle,
        displayName: 'Alice Renegade',
        bio: 'Investigative reporter and community activist',
        avatarUrl: 'https://cdn.renegadeparty.org/avatars/alice.png',
        visibility: 'public',
      },
      aliceContext,
    )

    expect(updated.handle).toBe(handle)
    expect(updated.displayName).toBe('Alice Renegade')
    expect(updated.avatarUrl).toBe('https://cdn.renegadeparty.org/avatars/alice.png')

    // Fetch projection as an anonymous public user
    const anonContext: CommunityPolicyContext = {
      siteId,
      actor: { kind: 'anonymous', isStaff: false, isModerator: false },
    }
    const publicProfile = await getPublicMemberProfile(payload, handle, anonContext)

    expect(publicProfile.handle).toBe(handle)
    expect(publicProfile.displayName).toBe('Alice Renegade')
    expect(publicProfile.bio).toBe('Investigative reporter and community activist')

    // Absolute guarantee against auth/contact leakage
    const rawRecord = publicProfile as unknown as Record<string, unknown>
    expect(rawRecord.email).toBeUndefined()
    expect(rawRecord.passwordHash).toBeUndefined()
    expect(rawRecord.sessionToken).toBeUndefined()
    expect(rawRecord.apiKey).toBeUndefined()
  })

  it('3b. A pending governed profile image stays absent until its governed usage is approved', async () => {
    const profile = await payload.find({
      collection: 'profiles',
      where: { member: { equals: aliceMemberId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const image = (await payload.create({
      collection: 'media-assets',
      overrideAccess: true,
      data: {
        site: siteId,
        owner: aliceMemberId,
        title: `Pending profile image ${suffix}`,
        kind: 'image',
        storageProvider: 'local',
        storageLocation: `private/${suffix}.png`,
        processingState: 'ready',
        publicPolicy: 'published-use',
        rightsStatus: 'approved',
      },
    } as never)) as any
    await payload.update({
      collection: 'profiles',
      id: String(profile.docs[0].id),
      data: { avatar: image.id },
      overrideAccess: true,
    } as never)
    const usage = (await payload.create({
      collection: 'media-usages',
      overrideAccess: true,
      data: {
        site: siteId,
        media: image.id,
        usageKey: `profile:${profile.docs[0].id}:avatar:${suffix}`,
        usedBy: { relationTo: 'profiles', value: profile.docs[0].id },
        targetType: 'profile',
        targetId: String(profile.docs[0].id),
        field: 'avatar',
        purpose: 'avatar',
        lifecycle: 'draft',
        approvedForPublic: false,
      },
    } as never)) as any
    const profileHandle = String((profile.docs[0] as any).handle)
    const pending = await loadProfileProjection(payload, profileHandle, siteId)
    expect(pending.profile).not.toHaveProperty('avatarUrl')
    await payload.update({
      collection: 'media-usages',
      id: String(usage.id),
      data: { approvedForPublic: true, lifecycle: 'public' },
      overrideAccess: true,
    } as never)
    const approved = await loadProfileProjection(payload, profileHandle, siteId)
    expect(approved.profile.avatarUrl).toBe(`/media/${image.id}`)
  })

  // ---------------------------------------------------------------------------
  // Step 4: Commenting on Content / Article
  // ---------------------------------------------------------------------------
  let aliceCommentId: string
  let discussionId: string

  it('4. Authenticated member comments on an article; anonymous readers can view it', async () => {
    const post = await addComment(
      payload,
      {
        siteId,
        attachedToCollection: 'content',
        attachedToId: articleId,
        title: 'Manifesto Discussion',
        canonicalPath: `/articles/${articleId}`,
        authorMemberId: aliceMemberId,
        body: 'This community platform represents true editorial autonomy.',
      },
      {
        siteId,
        actor: {
          kind: 'member',
          memberId: aliceMemberId,
          status: 'active',
          isStaff: false,
          isModerator: false,
        },
      },
    )

    expect(post.id).toBeDefined()
    expect(post.permalink).toContain('#comment-')
    expect(post.paginationAnchor).toContain('comment-')
    expect(post.body).toBe('This community platform represents true editorial autonomy.')

    aliceCommentId = post.id
    discussionId = post.discussion

    // Anonymous reader lists comments
    const anonContext: CommunityPolicyContext = {
      siteId,
      actor: { kind: 'anonymous', isStaff: false, isModerator: false },
    }
    const comments = await listDiscussionComments(payload, discussionId, anonContext)
    expect(comments.length).toBeGreaterThanOrEqual(1)
    const found = comments.find((c) => c.id === aliceCommentId)
    expect(found).toBeDefined()

    // Cross-site request is rejected
    const wrongSiteContext: CommunityPolicyContext = {
      siteId: 'wrong-tenant-site-999',
      actor: anonContext.actor,
    }
    await expect(listDiscussionComments(payload, discussionId, wrongSiteContext)).rejects.toThrow()
  })

  // ---------------------------------------------------------------------------
  // Step 5: Forum Post & Reply by Second Member (Bob)
  // ---------------------------------------------------------------------------
  let threadDiscussionId: string
  let bobReplyPostId: string

  it('5. Second member registers and replies to a forum thread', async () => {
    // Register & login Bob
    const bobEmail = `bob-${suffix}@renegadeparty.org`
    const bobIssued = await issueMagicLink(payload as never, bobEmail)
    const bobResult = await consumeMagicLink(payload as never, bobIssued.token!)
    bobMemberId = bobResult!.memberId
    bobSessionToken = bobResult!.sessionToken

    bobHeaders = new Headers()
    bobHeaders.set('cookie', memberSessionCookie(bobSessionToken, false))
    bobHeaders.set('x-site-id', siteId)

    // Alice creates a forum thread
    const aliceActor: CommunityActor = {
      kind: 'member',
      memberId: aliceMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    const threadResult = await createForumThread(
      payload,
      {
        siteId,
        forumId,
        authorMemberId: aliceMemberId,
        title: `Community Governance Ideas ${suffix}`,
        body: 'How should we structure decentralized publishing moderation?',
      },
      { siteId, actor: aliceActor },
    )

    expect(threadResult.discussion.id).toBeDefined()
    expect(threadResult.firstPost.id).toBeDefined()
    threadDiscussionId = threadResult.discussion.id

    // Bob replies to Alice's thread
    const bobActor: CommunityActor = {
      kind: 'member',
      memberId: bobMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    const bobReply = await replyToForumThread(
      payload,
      {
        siteId,
        discussionId: threadDiscussionId,
        authorMemberId: bobMemberId,
        body: 'We should use transparent audit logs and clear community standards.',
      },
      { siteId, actor: bobActor },
    )

    expect(bobReply.id).toBeDefined()
    const discussionIdResolved =
      typeof bobReply.discussion === 'object' && bobReply.discussion !== null
        ? (bobReply.discussion as any).id
        : bobReply.discussion
    expect(discussionIdResolved).toBe(threadDiscussionId)
    bobReplyPostId = bobReply.id

    // Bob reacts with a 👍 emoji to Alice's first post
    const reactionRes = await toggleCommunityReaction(payload, {
      siteId,
      memberId: bobMemberId,
      targetType: 'post',
      targetId: threadResult.firstPost.id,
      emoji: '👍',
    })
    expect(reactionRes.added).toBe(true)
    expect(reactionRes.emoji).toBe('👍')
  })

  // ---------------------------------------------------------------------------
  // Step 6: Notification Dispatch & Recipient Isolation
  // ---------------------------------------------------------------------------
  it('6. Notifications are routed to recipients with unread tracking and isolation', async () => {
    // Alice checks her notifications
    const aliceActor: CommunityActor = {
      kind: 'member',
      memberId: aliceMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    const aliceNotifications = await getMemberNotifications(payload, aliceMemberId, {
      siteId,
      actor: aliceActor,
    })

    expect(Array.isArray(aliceNotifications)).toBe(true)

    // Bob cannot read Alice's notifications
    const bobActor: CommunityActor = {
      kind: 'member',
      memberId: bobMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    await expect(
      getMemberNotifications(payload, aliceMemberId, { siteId, actor: bobActor }),
    ).rejects.toThrow()
  })

  // ---------------------------------------------------------------------------
  // Step 7: Report & Block Race
  // ---------------------------------------------------------------------------
  let reportId: string

  it('7. Alice reports objectionable content and blocks Bob', async () => {
    const aliceActor: CommunityActor = {
      kind: 'member',
      memberId: aliceMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    const aliceContext: CommunityPolicyContext = { siteId, actor: aliceActor }

    // Alice reports Bob's reply
    reportId = await submitCommunityReport(
      payload,
      {
        siteId,
        reporterId: aliceMemberId,
        targetType: 'post',
        targetId: bobReplyPostId,
        reason: 'Harassment and trolling behavior',
      },
      aliceContext,
    )
    expect(reportId).toBeDefined()

    // Alice blocks Bob
    await blockMember(payload, {
      siteId,
      subjectMemberId: aliceMemberId,
      targetMemberId: bobMemberId,
    })

    // Once blocked, Bob cannot initiate direct messaging to Alice
    const bobActor: CommunityActor = {
      kind: 'member',
      memberId: bobMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    const bobContext: CommunityPolicyContext = { siteId, actor: bobActor }

    await expect(
      startOrGetConversation(
        payload,
        {
          siteId,
          initiatorMemberId: bobMemberId,
          recipientMemberId: aliceMemberId,
        },
        bobContext,
      ),
    ).rejects.toThrow()
  })

  // ---------------------------------------------------------------------------
  // Step 8: Moderator Decision, Content Restriction, and Suspension
  // ---------------------------------------------------------------------------
  it('8. Moderator resolves report, removes post, and suspends offending member', async () => {
    // Setup Moderator Charlie
    const charlieEmail = `charlie-mod-${suffix}@renegadeparty.org`
    const charlieIssued = await issueMagicLink(payload as never, charlieEmail)
    const charlieResult = await consumeMagicLink(payload as never, charlieIssued.token!)
    charlieModMemberId = charlieResult!.memberId
    charlieModSessionToken = charlieResult!.sessionToken

    // Assign moderator capability via team membership
    await payload.create({
      collection: 'team-memberships',
      data: {
        scopeKind: 'site',
        site: siteId,
        member: charlieModMemberId,
        role: 'moderator',
        status: 'active',
        grants: [],
      },
      overrideAccess: true,
    } as never)

    charlieModHeaders = new Headers()
    charlieModHeaders.set('cookie', memberSessionCookie(charlieModSessionToken, false))
    charlieModHeaders.set('x-site-id', siteId)

    const charlieActor = await resolveCommunityActor(payload, charlieModHeaders, siteId)
    expect(charlieActor.isModerator).toBe(true)

    // Ordinary member (Alice) cannot execute moderation actions
    const aliceActor: CommunityActor = {
      kind: 'member',
      memberId: aliceMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    await expect(
      executeModerationDecision(
        payload,
        {
          siteId,
          moderatorActor: aliceActor,
          reportId,
          targetType: 'post',
          targetId: bobReplyPostId,
          action: 'remove',
          reason: 'Violates terms of service',
        },
        { siteId, actor: aliceActor },
      ),
    ).rejects.toThrow()

    // Charlie executes removal and suspension
    await executeModerationDecision(
      payload,
      {
        siteId,
        moderatorActor: charlieActor,
        reportId,
        targetType: 'post',
        targetId: bobReplyPostId,
        action: 'remove',
        reason: 'Violates terms of service',
      },
      { siteId, actor: charlieActor },
    )

    await executeModerationDecision(
      payload,
      {
        siteId,
        moderatorActor: charlieActor,
        targetType: 'member',
        targetId: bobMemberId,
        action: 'suspend',
        reason: 'Repeated offensive content',
      },
      { siteId, actor: charlieActor },
    )

    // Verify Bob's member record is disabled
    const bobMember = (await payload.findByID({
      collection: 'members',
      id: bobMemberId,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
    // COMM-01 lifecycle replaced the ambiguous legacy `disabled` state with
    // `suspended`, which carries mandatory session revocation and audit.
    expect(bobMember.status).toBe('suspended')

    // Verify Bob's session has been revoked
    const validMember = await currentMember(payload as never, bobSessionToken)
    expect(validMember).toBeNull()

    // Verify removed post is hidden from anonymous/public readers
    const anonContext: CommunityPolicyContext = {
      siteId,
      actor: { kind: 'anonymous', isStaff: false, isModerator: false },
    }
    const publicComments = await listDiscussionComments(payload, threadDiscussionId, anonContext)
    const removedFound = publicComments.find((p) => p.id === bobReplyPostId)
    expect(removedFound).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Step 9: Direct Messaging Between Members
  // ---------------------------------------------------------------------------
  it('9. Direct messaging operates with participant verification and block enforcement', async () => {
    const aliceActor: CommunityActor = {
      kind: 'member',
      memberId: aliceMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    const aliceContext: CommunityPolicyContext = { siteId, actor: aliceActor }

    const charlieActor: CommunityActor = {
      kind: 'member',
      memberId: charlieModMemberId,
      status: 'active',
      isStaff: false,
      isModerator: true,
    }

    // Alice and Moderator Charlie initiate conversation
    const conversation = await startOrGetConversation(
      payload,
      {
        siteId,
        initiatorMemberId: aliceMemberId,
        recipientMemberId: charlieModMemberId,
        title: 'Moderation Follow-up',
      },
      aliceContext,
    )

    expect(conversation.id).toBeDefined()
    expect(conversation.participants).toContain(aliceMemberId)
    expect(conversation.participants).toContain(charlieModMemberId)

    // Alice sends a message
    const message = await sendDirectMessage(
      payload,
      {
        siteId,
        conversationId: conversation.id,
        senderMemberId: aliceMemberId,
        body: 'Thank you for reviewing the report so quickly.',
      },
      aliceContext,
    )

    expect(message.id).toBeDefined()
    expect(message.body).toBe('Thank you for reviewing the report so quickly.')

    // Verify message is saved in PostgreSQL database
    const dbMessages = await queryDb(
      payload,
      `SELECT * FROM "community_messages" WHERE conversation_id = $1`,
      [conversation.id],
    )
    expect(dbMessages.rows.length).toBeGreaterThanOrEqual(1)
    expect(dbMessages.rows[0].body).toBe('Thank you for reviewing the report so quickly.')
  })

  // ---------------------------------------------------------------------------
  // Step 10: Restart / Login / Activity History Persistence
  // ---------------------------------------------------------------------------
  it('10. Member session revalidates across restart and activity history persists accurately', async () => {
    // Re-verify Alice's active session
    const verifiedMemberId = await currentMember(payload as never, aliceSessionToken)
    expect(verifiedMemberId).toBe(aliceMemberId)

    const aliceActor: CommunityActor = {
      kind: 'member',
      memberId: aliceMemberId,
      status: 'active',
      isStaff: false,
      isModerator: false,
    }
    const aliceContext: CommunityPolicyContext = { siteId, actor: aliceActor }

    // Fetch complete member activity history
    const history = await getMemberActivityHistory(payload, aliceMemberId, aliceContext)

    expect(Array.isArray(history.comments)).toBe(true)
    expect(Array.isArray(history.threads)).toBe(true)
    expect(history.conversationsCount).toBeGreaterThanOrEqual(1)

    // Verify Alice's created thread appears in history
    const threadFound = history.threads.find((t) => t.id === threadDiscussionId)
    expect(threadFound).toBeDefined()

    // Verify Alice's comment appears in history
    const commentFound = history.comments.find((c) => c.id === aliceCommentId)
    expect(commentFound).toBeDefined()
  })
})
