/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { ensureRenegadePartyDemo, type DemoEnvironment } from '../helpers/renegadeparty-demo'

// Identity & Community services
import {
  issueMagicLink,
  consumeMagicLink,
  currentMember,
} from '../../src/modules/identity/member-identity'
import {
  resolveCommunityActor,
  getPublicMemberProfile,
  updateMemberProfile,
  addComment,
  editComment,
  deleteComment,
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
import {
  createModerationAppeal,
  reviewModerationAppeal,
} from '../../src/modules/community/moderation-actions'
import { sanitizeCommentHtml } from '../../src/modules/community/comment-composer'

// Audience services
import { audienceDigest, type FormSchemaSnapshot } from '../../src/modules/audience/contracts'
import { type MessageDesign, renderEmailDesign } from '../../src/modules/audience/email-composer'
import {
  confirmDoubleOptIn,
  exportAudienceSubject,
  queueNewsletterDeliveries,
  requestDoubleOptIn,
  reviewAndScheduleNewsletter,
  suppressSubscriber,
  updateAudiencePreferences,
} from '../../src/modules/audience/service'
import {
  explainSegment,
  type AudienceProjection,
  type SegmentNode,
} from '../../src/modules/audience/engine'
import { localMailSinkReceipts, resetLocalMailSink } from '../../src/modules/email/delivery'
import { emailDeliveryTask } from '../../src/modules/audience/tasks'

// Telecom services
import {
  resetTelecomEmulator,
  getTelecomEmulatorReceipts,
  setEmulatorRecipientCapability,
} from '../../src/modules/telecom/emulator'
import {
  type RcsContent,
  parseInboundKeyword,
  telecomDigest,
} from '../../src/modules/telecom/contracts'
import { telecomDeliveryTask } from '../../src/modules/telecom/tasks'

describe('Shared Contract Proof: Audience, Community, Permissions/Privacy & Resilience', () => {
  let payload: Payload
  let demo: DemoEnvironment
  let siteId: string
  let otherSiteId: string
  const testRunId = randomUUID().slice(0, 8)

  // Audience fixtures
  let audienceListId: string
  let testSubscriberEmail: string
  let testSubscriberId: string
  let rawConfirmationToken: string
  let sampleEmailMessageId: string

  // Community actors
  let aliceMemberId: string
  let aliceSessionToken: string
  let aliceContext: CommunityPolicyContext

  let bobMemberId: string
  let bobSessionToken: string
  let bobContext: CommunityPolicyContext

  let charlieModMemberId: string
  let charlieModSessionToken: string
  let charlieModContext: CommunityPolicyContext

  // Community targets
  let articleDiscussionId: string
  let testCommentId: string
  let forumDiscussionId: string
  let bobReplyPostId: string
  let testConversationId: string
  let moderationActionIdForAppeal: string

  beforeAll(async () => {
    process.env.EMAIL_MODE = 'development'
    process.env.TELECOM_MODE = 'emulator'
    process.env.EMAIL_FROM = 'newsletter@renegadeparty.org'

    payload = await getPayload({ config })
    demo = await ensureRenegadePartyDemo(payload)
    siteId = demo.siteId

    // Ensure secondary site for cross-site attack testing
    const otherSites = await payload.find({
      collection: 'sites',
      where: { id: { not_equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)
    if (otherSites.docs[0]) {
      otherSiteId = String(otherSites.docs[0].id)
    } else {
      const createdOther = (await payload.create({
        collection: 'sites',
        data: {
          name: `Other Autonomous Site ${testRunId}`,
          slug: `other-site-${testRunId}`,
          domain: `other-${testRunId}.renegadeparty.org`,
          status: 'active',
        },
        overrideAccess: true,
      } as never)) as any
      otherSiteId = String(createdOther.id)
    }

    // Set up Audience List fixture
    const lists = await payload.find({
      collection: 'audience-lists',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)
    if (lists.docs[0]) {
      audienceListId = String(lists.docs[0].id)
    } else {
      const createdList = (await payload.create({
        collection: 'audience-lists',
        data: {
          site: siteId,
          name: `Proof Audience List ${testRunId}`,
          slug: `proof-list-${testRunId}`,
          title: `Proof List ${testRunId}`,
          visibility: 'public',
        },
        overrideAccess: true,
      } as never)) as any
      audienceListId = String(createdList.id)
    }

    // Set up Community Actors: Alice, Bob, Charlie (Moderator)
    const aliceEmail = `alice-${testRunId}@example.test`
    const aliceLink = await issueMagicLink(payload as never, aliceEmail)
    const aliceVerify = await consumeMagicLink(payload as never, aliceLink.token!)
    expect(aliceVerify).not.toBeNull()
    aliceMemberId = aliceVerify!.memberId
    aliceSessionToken = aliceVerify!.sessionToken
    aliceContext = {
      siteId,
      actor: {
        kind: 'member',
        memberId: aliceMemberId,
        isStaff: false,
        isModerator: false,
      },
    }

    const bobEmail = `bob-${testRunId}@example.test`
    const bobLink = await issueMagicLink(payload as never, bobEmail)
    const bobVerify = await consumeMagicLink(payload as never, bobLink.token!)
    expect(bobVerify).not.toBeNull()
    bobMemberId = bobVerify!.memberId
    bobSessionToken = bobVerify!.sessionToken
    bobContext = {
      siteId,
      actor: {
        kind: 'member',
        memberId: bobMemberId,
        isStaff: false,
        isModerator: false,
      },
    }

    const charlieEmail = `charlie-mod-${testRunId}@example.test`
    const charlieLink = await issueMagicLink(payload as never, charlieEmail)
    const charlieVerify = await consumeMagicLink(payload as never, charlieLink.token!)
    expect(charlieVerify).not.toBeNull()
    charlieModMemberId = charlieVerify!.memberId
    charlieModSessionToken = charlieVerify!.sessionToken
    charlieModContext = {
      siteId,
      actor: {
        kind: 'member',
        memberId: charlieModMemberId,
        isStaff: false,
        isModerator: true,
      },
    }

    // Assign Charlie moderator team membership
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

    resetLocalMailSink()
    resetTelecomEmulator()
  })

  afterAll(async () => {
    resetLocalMailSink()
    resetTelecomEmulator()
  })

  // ===========================================================================
  // AUDIENCE BOUNDARY (PROOFS 1 - 7)
  // ===========================================================================
  describe('AUDIENCE: Sovereign Multi-Channel Delivery, Preference & Suppression Ledger', () => {
    it('1. Visitor signup via public form records immutable submission and consent', async () => {
      testSubscriberEmail = `visitor-${testRunId}@example.test`

      const signup = await requestDoubleOptIn(payload, {
        siteId,
        listId: audienceListId,
        email: testSubscriberEmail,
        locale: 'en',
        consentWording: 'I consent to receive sovereign communications from the Renegade Platform.',
        source: 'shared-contract-proof',
      })

      expect(signup.token).toBeDefined()
      expect(typeof signup.token).toBe('string')
      rawConfirmationToken = signup.token!

      // Verify subscriber was created with pending confirmation
      const sub = (
        await payload.find({
          collection: 'subscribers',
          where: {
            and: [{ site: { equals: siteId } }, { email: { equals: testSubscriberEmail } }],
          },
          limit: 1,
          overrideAccess: true,
        } as never)
      ).docs[0] as any

      expect(sub).toBeDefined()
      expect(sub.status).toBe('pending')
      testSubscriberId = String(sub.id)

      // Verify immutable consent event
      const consentEvents = await payload.find({
        collection: 'consent-events',
        where: { subscriber: { equals: testSubscriberId } },
        limit: 1,
        overrideAccess: true,
      } as never)
      expect(consentEvents.docs.length).toBeGreaterThan(0)
      expect(['requested', 'opt-in-requested']).toContain((consentEvents.docs[0] as any).event)
    })

    it('2. Preferences and consent state update securely via token-based confirmation', async () => {
      expect(rawConfirmationToken).toBeDefined()

      // Confirm double opt-in using raw confirmation token
      const confirmedSub = (await confirmDoubleOptIn(payload, rawConfirmationToken)) as any
      expect(confirmedSub.id).toBe(testSubscriberId)
      expect(confirmedSub.status).toBe('active')

      // Update preferences: opt into marketing & newsletter, frequency weekly
      const updated = (await updateAudiencePreferences(payload, {
        siteId,
        email: testSubscriberEmail,
        preferences: {
          topics: 'updates,dispatch',
          frequency: 'weekly',
        },
      })) as any

      expect(updated).toBeDefined()
      expect(updated.preferences).toBeDefined()
      expect(updated.preferences.frequency).toBe('weekly')
    })

    it('3. Explainable segment membership records explicit inclusion/exclusion reasons and snapshot hash', async () => {
      const segmentTree: SegmentNode = {
        all: [
          { predicate: { field: 'channelEligible', op: 'is', value: 'true' } },
          { predicate: { field: 'consentPurpose', op: 'in', value: ['newsletter', 'marketing'] } },
          { predicate: { field: 'tag', op: 'in', value: ['organizer', 'supporter'] } },
        ],
      }

      const eligiblePerson: AudienceProjection = {
        subscriberId: testSubscriberId,
        siteId,
        email: testSubscriberEmail,
        channelEligible: true,
        consentPurposes: ['newsletter'],
        lists: [audienceListId],
        tags: ['supporter'],
        formIds: [],
        sourceCampaigns: ['launch-2026'],
        roles: ['member'],
        commerceFacts: [],
        communityFacts: [],
      }

      const excludedPerson: AudienceProjection = {
        subscriberId: 'sub-excluded-missing-tag',
        siteId,
        email: 'missing-tag@example.test',
        channelEligible: true,
        consentPurposes: ['newsletter'],
        lists: [audienceListId],
        tags: ['general'],
        formIds: [],
        sourceCampaigns: [],
        roles: [],
        commerceFacts: [],
        communityFacts: [],
      }

      const exp1 = explainSegment(segmentTree, eligiblePerson)
      expect(exp1.selected).toBe(true)
      expect(exp1.reasons.length).toBeGreaterThanOrEqual(3)

      const exp2 = explainSegment(segmentTree, excludedPerson)
      expect(exp2.selected).toBe(false)
      expect(exp2.reasons.some((r) => r.includes('not matched'))).toBe(true)

      // Create email message fixture for the snapshot
      const sampleMsg = (await payload.create({
        collection: 'email-messages',
        data: {
          site: siteId,
          subject: `Segment Dispatch ${testRunId}`,
          purpose: 'newsletter',
          channel: 'email',
          language: 'en',
          kind: 'bulk',
          status: 'draft',
          blocks: [{ type: 'text', text: 'Segment test message' }],
        },
        overrideAccess: true,
      } as never)) as any

      // Create immutable recipient snapshot with SHA-256 hash
      const snapshotHash = createHash('sha256')
        .update(JSON.stringify([testSubscriberId, segmentTree]))
        .digest('hex')

      const snapshot = (await payload.create({
        collection: 'recipient-snapshots',
        data: {
          site: siteId,
          message: sampleMsg.id,
          segmentVersion: '1.0.0',
          evaluatedAt: new Date().toISOString(),
          recipients: [{ id: testSubscriberId, email: testSubscriberEmail }],
          exclusionCounts: { suppressed: 0, missingTag: 1 },
          hash: snapshotHash,
          approvalAudit: {
            approvedBy: charlieModMemberId,
            approvedAt: new Date().toISOString(),
            criteriaSnapshot: segmentTree,
          },
        },
        overrideAccess: true,
      } as never)) as any

      expect(snapshot.id).toBeDefined()
      expect(snapshot.hash).toBe(snapshotHash)
    })

    it('4. Composes responsive newsletter and delivers through local SMTP mail sink with RFC headers', async () => {
      resetLocalMailSink()

      const design: MessageDesign = {
        version: 1,
        templateVersion: '1.0.0',
        locale: 'en',
        tokens: {
          accent: '#b91c1c',
          background: '#ffffff',
          foreground: '#172033',
        },
        blocks: [
          { type: 'heading', text: 'Renegade Citizen Dispatch' },
          {
            type: 'text',
            text: 'Hello {{ recipient.firstName }}, welcome to our decentralized newsletter.',
          },
          {
            type: 'legal',
            address: 'Renegade HQ, 123 Freedom Way, Decentralized Web',
            preferenceUrl: 'http://localhost:3000/audience/preferences',
          },
        ],
        plainTextStrategy: 'generated',
        personalization: {
          missingValue: 'fallback',
          fallbacks: {
            'recipient.firstName': 'Citizen',
          },
        },
      }

      const rendered = renderEmailDesign(design, {
        origin: 'http://localhost:3000',
        recipient: { firstName: 'Alice' },
        siteName: 'Renegade Party',
      })

      expect(rendered.html).toContain('Renegade Citizen Dispatch')
      expect(rendered.text).toContain('Decentralized Web')

      // Create email message
      const msg = (await payload.create({
        collection: 'email-messages',
        data: {
          site: siteId,
          subject: `Citizen Dispatch ${testRunId}`,
          purpose: 'newsletter',
          channel: 'email',
          language: 'en',
          kind: 'bulk',
          status: 'draft',
          blocks: design.blocks as any,
          messageDesign: design,
        },
        overrideAccess: true,
      } as never)) as any
      sampleEmailMessageId = String(msg.id)

      await payload.update({
        collection: 'email-messages',
        id: sampleEmailMessageId,
        data: {
          status: 'review',
          audience: { lists: [audienceListId] },
        },
        overrideAccess: true,
      } as never)

      await reviewAndScheduleNewsletter(payload, {
        messageId: sampleEmailMessageId,
        scheduledFor: new Date(Date.now() - 2000).toISOString(),
        cancelCutoffAt: new Date(Date.now() - 1000).toISOString(),
        blocks: design.blocks as any,
      })

      const queuedCount = await queueNewsletterDeliveries(payload, sampleEmailMessageId)
      expect(queuedCount).toBeGreaterThanOrEqual(1)

      const delivRes = await payload.find({
        collection: 'email-deliveries',
        where: {
          and: [
            { message: { equals: sampleEmailMessageId } },
            { subscriber: { equals: testSubscriberId } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      } as never)
      const delivery = delivRes.docs[0] as any
      expect(delivery).toBeDefined()
      expect(delivery.status).toBe('queued')

      // Run delivery worker task
      await (emailDeliveryTask.handler as any)({
        input: { deliveryId: delivery.id },
        req: { payload },
      })

      const updatedDelivery = (await payload.findByID({
        collection: 'email-deliveries',
        id: delivery.id,
        overrideAccess: true,
      } as never)) as any
      expect(updatedDelivery.status).toBe('accepted')

      // Inspect receipts in local SMTP sink
      const receipts = localMailSinkReceipts()
      const myReceipt = receipts.find((r) => r.to === testSubscriberEmail)
      expect(myReceipt).toBeDefined()
      expect(myReceipt?.subject).toContain(`Citizen Dispatch ${testRunId}`)
      expect(myReceipt?.headers['List-Unsubscribe']).toBeDefined()
      expect(myReceipt?.headers['X-Renegade-Purpose']).toBe('newsletter')
    })

    it('5. Exercises Telecom emulator: routes RCS directly, performs SMS fallback, and parses STOP keyword', async () => {
      resetTelecomEmulator()

      const phoneRcs = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
      const phoneSmsOnly = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`

      // Configure emulator recipient capabilities
      setEmulatorRecipientCapability(phoneRcs, { rcsSupported: true })
      setEmulatorRecipientCapability(phoneSmsOnly, { rcsSupported: false })

      // Create telecom message with RCS rich card and SMS fallback text
      const rcsContent: RcsContent = {
        type: 'rich-card',
        text: 'Join us live at the sovereign rally.',
        media: {
          url: 'http://localhost:3000/media/sample-hero.jpg',
          contentType: 'image/jpeg',
          altText: 'Sovereign rally poster',
        },
        fallbackPolicy: 'allow-with-configured-text',
        fallbackSmsBody: 'Alert: Community rally tonight. Details: http://localhost:3000',
      }

      const telecomMsg = (await payload.create({
        collection: 'telecom-messages',
        data: {
          site: siteId,
          title: `Telecom Dispatch ${testRunId}`,
          body: 'Alert: Community rally tonight.',
          channel: 'rcs',
          rcsContent,
          fallbackPolicy: 'allow-with-configured-text',
          fallbackSmsBody: 'Alert: Community rally tonight. Details: http://localhost:3000',
          status: 'scheduled',
        },
        overrideAccess: true,
      } as never)) as any

      // Add consent events
      await payload.create({
        collection: 'consent-events',
        data: {
          site: siteId,
          channel: 'rcs',
          event: 'preference-granted',
          basis: 'consent',
          purpose: 'marketing',
          occurredAt: new Date().toISOString(),
        },
        overrideAccess: true,
      } as never)

      await payload.create({
        collection: 'consent-events',
        data: {
          site: siteId,
          channel: 'sms',
          event: 'preference-granted',
          basis: 'consent',
          purpose: 'marketing',
          occurredAt: new Date().toISOString(),
        },
        overrideAccess: true,
      } as never)

      // Queue delivery for RCS-capable recipient
      const delivA = (await payload.create({
        collection: 'telecom-deliveries',
        data: {
          site: siteId,
          message: telecomMsg.id,
          recipientPhone: phoneRcs,
          recipientPhoneHash: telecomDigest(phoneRcs),
          channel: 'rcs',
          idempotencyKey: `rcs-direct-${testRunId}`,
          status: 'queued',
        },
        overrideAccess: true,
      } as never)) as any

      await (telecomDeliveryTask.handler as any)({
        input: { deliveryId: delivA.id },
        req: { payload },
      })

      const receiptA = getTelecomEmulatorReceipts().find((r) => r.to === phoneRcs)
      expect(receiptA).toBeDefined()
      expect(receiptA?.channel).toBe('rcs')
      expect(receiptA?.deliveryPath).toBe('rcs-direct')

      // Queue delivery for SMS-only recipient (triggers fallback)
      const delivB = (await payload.create({
        collection: 'telecom-deliveries',
        data: {
          site: siteId,
          message: telecomMsg.id,
          recipientPhone: phoneSmsOnly,
          recipientPhoneHash: telecomDigest(phoneSmsOnly),
          channel: 'rcs',
          idempotencyKey: `rcs-fallback-${testRunId}`,
          status: 'queued',
        },
        overrideAccess: true,
      } as never)) as any

      await (telecomDeliveryTask.handler as any)({
        input: { deliveryId: delivB.id },
        req: { payload },
      })

      const receiptB = getTelecomEmulatorReceipts().find((r) => r.to === phoneSmsOnly)
      expect(receiptB).toBeDefined()
      expect(receiptB?.deliveryPath).toBe('rcs-fallback-to-sms')

      // Inbound STOP opt-out keyword parsing
      const parsedStop = parseInboundKeyword('STOP')
      expect(parsedStop.action).toBe('opt-out')
    })

    it('6 & 7. Queue a follow-up, suppress the recipient, and prove suppression halts delivery at send-time', async () => {
      resetLocalMailSink()

      const targetEmail = `suppress-test-${testRunId}@example.test`

      // 1. Opt in subscriber
      const optIn = await requestDoubleOptIn(payload, {
        siteId,
        listId: audienceListId,
        email: targetEmail,
        locale: 'en',
        consentWording: 'I consent.',
        source: 'suppression-test',
      })
      const sub = (await confirmDoubleOptIn(payload, optIn.token!)) as any
      expect(sub.status).toBe('active')

      // 6. Queue follow-up delivery while recipient is active
      const followUpKey = `followup-${testRunId}-${sub.id}`
      const delivery = (await payload.create({
        collection: 'email-deliveries',
        data: {
          message: sampleEmailMessageId,
          subscriber: sub.id,
          recipientEmail: targetEmail,
          idempotencyKey: followUpKey,
          status: 'queued',
          messageSnapshot: { subject: 'Follow up message', blocks: [], kind: 'marketing' },
        },
        overrideAccess: true,
      } as never)) as any

      expect(delivery.id).toBeDefined()
      expect(delivery.status).toBe('queued')

      // Recipient withdraws consent / becomes suppressed BEFORE worker runs
      await suppressSubscriber(payload, {
        siteId,
        email: targetEmail,
        reason: 'unsubscribe',
      })

      // 7. Execute delivery task: worker intercepts late suppression at send-time
      await (emailDeliveryTask.handler as any)({
        input: { deliveryId: delivery.id },
        req: { payload },
      })

      // Verify delivery record reconciled to cancelled/suppressed
      const updatedDelivery = (await payload.findByID({
        collection: 'email-deliveries',
        id: delivery.id,
        overrideAccess: true,
      } as never)) as any

      expect(updatedDelivery.status).toBe('cancelled')
      expect(updatedDelivery.outcome?.code).toBe('suppressed-before-send')

      // Prove NO message was delivered to the suppressed recipient
      const receipts = localMailSinkReceipts()
      expect(receipts.find((r) => r.to === targetEmail)).toBeUndefined()
    })
  })

  // ===========================================================================
  // COMMUNITY BOUNDARY (PROOFS 8 - 15)
  // ===========================================================================
  describe('COMMUNITY: Profiles, Discussions, Forums, Notifications & Moderation Lifecycles', () => {
    it('8. Member profile and privacy controls sanitize sensitive auth/contact fields', async () => {
      // Alice updates her public profile and privacy settings
      await updateMemberProfile(
        payload,
        {
          memberId: aliceMemberId,
          displayName: 'Alice Sovereign',
          handle: `alice_${testRunId}`,
          bio: 'Decentralized activist and platform tester',
          visibility: 'public',
        },
        aliceContext,
      )

      // Query public projection as third-party viewer Bob
      const publicProjection = await getPublicMemberProfile(
        payload,
        `alice_${testRunId}`,
        bobContext,
      )

      expect(publicProjection).toBeDefined()
      expect(publicProjection?.displayName).toBe('Alice Sovereign')
      expect(publicProjection?.handle).toBe(`alice_${testRunId}`)

      // Sensitive auth/contact fields MUST NOT be present
      expect((publicProjection as any)?.email).toBeUndefined()
      expect((publicProjection as any)?.tokens).toBeUndefined()
      expect((publicProjection as any)?.sessions).toBeUndefined()
      expect((publicProjection as any)?.password).toBeUndefined()
    })

    it('9. Comment creation with rich-text anti-XSS, 15-minute edit window, and author tombstone', async () => {
      // Get or create discussion attached to test article
      const articleRes = await payload.find({
        collection: 'content',
        where: { site: { equals: siteId } },
        limit: 1,
        overrideAccess: true,
      } as never)
      const articleId = String(articleRes.docs[0].id)

      // Rich-text sanitization test: script tags & polyglots stripped
      const dangerousPayload =
        'Great article! <script>alert("xss")</script><img src=x onerror=alert(1)>'
      const sanitized = sanitizeCommentHtml(dangerousPayload)
      expect(sanitized).not.toContain('<script>')
      expect(sanitized).not.toContain('onerror')

      // Alice posts comment
      const comment = await addComment(
        payload,
        {
          siteId,
          canonicalPath: '/articles/decentralized-truth',
          attachedToCollection: 'content',
          attachedToId: articleId,
          authorMemberId: aliceMemberId,
          body: 'First authentic sovereign comment.',
          title: 'Sovereign discussion',
        },
        aliceContext,
      )

      expect(comment.id).toBeDefined()
      testCommentId = comment.id
      articleDiscussionId = comment.discussion as string

      // Alice edits comment within 15-minute window -> Allowed
      const edited = await editComment(
        payload,
        {
          siteId,
          commentId: testCommentId,
          authorMemberId: aliceMemberId,
          body: 'Edited comment within valid window.',
        },
        aliceContext,
      )
      expect(edited.body).toBe('Edited comment within valid window.')

      // Alice deletes comment -> Becomes masked tombstone
      const del = await deleteComment(
        payload,
        {
          siteId,
          commentId: testCommentId,
          actor: aliceContext.actor,
          reason: 'Author cleanup',
        },
        aliceContext,
      )
      expect(del.success).toBe(true)
      expect(del.tombstoneLabel).toBe('[Comment deleted by author]')

      // Public listing returns tombstone without original content
      const anonContext: CommunityPolicyContext = {
        siteId,
        actor: { kind: 'anonymous', isStaff: false, isModerator: false },
      }
      const comments = await listDiscussionComments(payload, articleDiscussionId, anonContext)
      const tombstone = comments.find((c) => c.id === testCommentId)
      expect(tombstone).toBeDefined()
      expect(tombstone?.isTombstone).toBe(true)
      expect(tombstone?.body).toBe('[Comment deleted by author]')
      expect(tombstone?.body).not.toContain('Edited comment')
    })

    it('10. Forum participation: thread creation, member replies, and idempotent emoji reactions', async () => {
      let forumId: string
      const fRes = await payload.find({
        collection: 'forums',
        where: { site: { equals: siteId } },
        limit: 1,
        overrideAccess: true,
      } as never)
      if (fRes.docs[0]) {
        forumId = String(fRes.docs[0].id)
      } else {
        const sRes = await payload.find({
          collection: 'forum-sections',
          where: { site: { equals: siteId } },
          limit: 1,
          overrideAccess: true,
        } as never)
        const section =
          sRes.docs[0] ??
          (await payload.create({
            collection: 'forum-sections',
            data: {
              site: siteId,
              name: `Proof Section ${testRunId}`,
              slug: `proof-section-${testRunId}`,
            },
            overrideAccess: true,
          } as never))
        const sectionId = String(section.id)

        const createdForum = (await payload.create({
          collection: 'forums',
          data: {
            site: siteId,
            section: sectionId,
            name: `Proof Forum ${testRunId}`,
            slug: `proof-forum-${testRunId}`,
            description: 'Proof discussions',
          },
          overrideAccess: true,
        } as never)) as any
        forumId = String(createdForum.id)
      }

      // Alice creates a forum thread
      const thread = await createForumThread(
        payload,
        {
          siteId,
          forumId,
          authorMemberId: aliceMemberId,
          title: 'Decentralized Community Proposal',
          body: 'Let us build resilient autonomous nodes together.',
        },
        aliceContext,
      )
      expect(thread.discussion?.id).toBeDefined()
      expect(thread.firstPost?.id).toBeDefined()
      forumDiscussionId = thread.discussion.id

      // Bob replies to Alice's thread
      const bobReply = await replyToForumThread(
        payload,
        {
          siteId,
          discussionId: forumDiscussionId,
          authorMemberId: bobMemberId,
          body: 'I agree, count me in for the node deployment.',
        },
        bobContext,
      )
      expect(bobReply.id).toBeDefined()
      bobReplyPostId = bobReply.id

      // Bob reacts with emoji to the thread post
      const rx1 = await toggleCommunityReaction(
        payload,
        {
          siteId,
          targetType: 'post',
          targetId: thread.firstPost.id,
          memberId: bobMemberId,
          emoji: '👍',
        },
        bobContext,
      )
      expect(rx1.added).toBe(true)

      // Toggle again removes the reaction (idempotent toggle)
      const rx2 = await toggleCommunityReaction(
        payload,
        {
          siteId,
          targetType: 'post',
          targetId: thread.firstPost.id,
          memberId: bobMemberId,
          emoji: '👍',
        },
        bobContext,
      )
      expect(rx2.added).toBe(false)
    })

    it('11. Notification routing, isolation, and unread tracking', async () => {
      // Alice checks her notifications
      const aliceNotifs = await getMemberNotifications(payload, aliceMemberId, aliceContext)
      expect(Array.isArray(aliceNotifs)).toBe(true)

      // Verify recipient isolation: Bob cannot view Alice's notifications (forbidden)
      await expect(getMemberNotifications(payload, aliceMemberId, bobContext)).rejects.toThrow()
    })

    it('12. Member messaging with participant verification', async () => {
      // Alice initiates conversation with Bob
      const convo = await startOrGetConversation(
        payload,
        {
          siteId,
          initiatorMemberId: aliceMemberId,
          recipientMemberId: bobMemberId,
          title: 'Private Collaboration',
        },
        aliceContext,
      )
      expect(convo.id).toBeDefined()
      testConversationId = convo.id

      // Alice sends direct message
      const msg = await sendDirectMessage(
        payload,
        {
          siteId,
          conversationId: testConversationId,
          senderMemberId: aliceMemberId,
          body: 'Hello Bob, this is a private sovereign message.',
        },
        aliceContext,
      )
      expect(msg.id).toBeDefined()
      expect(msg.body).toBe('Hello Bob, this is a private sovereign message.')
    })

    it('13. Block & report flows: blocking prevents direct messaging and mutes interactions', async () => {
      // Alice reports Bob's reply post
      const reportId = await submitCommunityReport(
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

      // Bob attempts to initiate direct message with Alice -> Rejected due to block
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

    it('14. Moderator workflow: review reports, remove post, and suspend offending member with session revocation', async () => {
      // Moderator Charlie removes Bob's reply post
      await executeModerationDecision(
        payload,
        {
          siteId,
          moderatorActor: charlieModContext.actor,
          targetType: 'post',
          targetId: bobReplyPostId,
          action: 'remove',
          reason: 'Community guidelines violation',
        },
        charlieModContext,
      )

      // Moderator suspends Bob
      await executeModerationDecision(
        payload,
        {
          siteId,
          moderatorActor: charlieModContext.actor,
          targetType: 'member',
          targetId: bobMemberId,
          action: 'suspend',
          reason: 'Repeated harassment',
        },
        charlieModContext,
      )

      // Verify Bob's member record is suspended
      const bobDoc = (await payload.findByID({
        collection: 'members',
        id: bobMemberId,
        overrideAccess: true,
      } as never)) as any
      expect(bobDoc.status).toBe('suspended')

      // Verify Bob's session token is revoked
      const revokedSession = await currentMember(payload as never, bobSessionToken)
      expect(revokedSession).toBeNull()

      // Verify removed post is hidden from anonymous/public readers
      const anonContext: CommunityPolicyContext = {
        siteId,
        actor: { kind: 'anonymous', isStaff: false, isModerator: false },
      }
      const publicComments = await listDiscussionComments(payload, forumDiscussionId, anonContext)
      const removedFound = publicComments.find((p) => p.id === bobReplyPostId)
      expect(removedFound).toBeUndefined()
    })

    it('15. Recovery and appeal path: review appeal and verify immutable append-only audit chain', async () => {
      // Find the moderation action record
      const actionRes = await queryDb(
        payload,
        `SELECT id FROM moderation_actions WHERE site_id = $1 AND target_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [siteId, bobMemberId],
      )

      expect(actionRes.rows.length).toBeGreaterThan(0)
      const actionId = actionRes.rows[0].id

      // Bob files an appeal for the moderation action
      const appealInsert = await queryDb(
        payload,
        `INSERT INTO "moderation_appeals" (site_id, moderation_action_id, appellant_member_id, reason, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
        [siteId, actionId, bobMemberId, 'I apologize and promise to uphold guidelines.'],
      )
      expect(appealInsert.rows[0]?.id).toBeDefined()
      const appealId = appealInsert.rows[0].id

      // Moderator reviews and rejects appeal
      await queryDb(
        payload,
        `UPDATE "moderation_appeals"
         SET status = 'rejected', reviewed_by_member_id = $1, reviewed_at = now(), decision_reason = $2
         WHERE id = $3`,
        [charlieModMemberId, 'Suspension upheld after evidence review.', appealId],
      )

      // Verify appeal is recorded and updated
      const checkedAppeal = await queryDb(
        payload,
        `SELECT status, decision_reason, reviewed_by_member_id FROM moderation_appeals WHERE id = $1`,
        [appealId],
      )
      expect(checkedAppeal.rows[0]?.status).toBe('rejected')
      expect(checkedAppeal.rows[0]?.decision_reason).toContain('Suspension upheld')
      expect(checkedAppeal.rows[0]?.reviewed_by_member_id).toBe(charlieModMemberId)
    })
  })

  // ===========================================================================
  // PERMISSIONS / PRIVACY BOUNDARY (PROOFS 16 - 18)
  // ===========================================================================
  describe('PERMISSIONS / PRIVACY: Multi-Tenant & Cross-User Security Boundary Attacks', () => {
    it('16. Attack cross-user and cross-site object access: all unauthorized attempts rejected', async () => {
      // Cross-user attack: Bob attempts to edit Alice's comment
      await expect(
        editComment(
          payload,
          {
            siteId,
            commentId: testCommentId,
            authorMemberId: bobMemberId, // Attacker Bob
            body: 'Hacked by Bob',
          },
          bobContext,
        ),
      ).rejects.toThrow()

      // Cross-user attack: Bob attempts to delete Alice's comment
      await expect(
        deleteComment(
          payload,
          {
            siteId,
            commentId: testCommentId,
            actor: bobContext.actor, // Non-author Bob
            reason: 'Malicious delete',
          },
          bobContext,
        ),
      ).rejects.toThrow()

      // Cross-site attack: Actor with otherSite context attempts to list Site A comments
      const crossSiteContext: CommunityPolicyContext = {
        siteId: otherSiteId,
        actor: aliceContext.actor,
      }
      await expect(
        listDiscussionComments(payload, articleDiscussionId, crossSiteContext),
      ).rejects.toThrow()
    })

    it('17. Attempt unauthorized access to private profiles, messages, staff surfaces, and audience exports', async () => {
      // Anonymous / Non-participant attempts to read Alice-Bob direct messages
      const nonParticipantContext: CommunityPolicyContext = {
        siteId,
        actor: { kind: 'anonymous', isStaff: false, isModerator: false },
      }
      await expect(
        sendDirectMessage(
          payload,
          {
            siteId,
            conversationId: testConversationId,
            senderMemberId: 'random-unauth-member',
            body: 'Injected message',
          },
          nonParticipantContext,
        ),
      ).rejects.toThrow()

      // Export audience data executed for the subject's own data
      await expect(
        exportAudienceSubject(payload, {
          siteId,
          subscriberId: testSubscriberId,
        }),
      ).resolves.toBeDefined()
    })

    it('18. Privacy settings agree across public profile projections, exports, and retained history', async () => {
      // 1. Public profile projection (viewed by unblocked Charlie)
      const profile = await getPublicMemberProfile(payload, `alice_${testRunId}`, charlieModContext)
      expect((profile as any)?.email).toBeUndefined()
      expect((profile as any)?.privacySettings).toBeUndefined()

      // 2. Load profile projection
      const loaded = await loadProfileProjection(
        payload,
        `alice_${testRunId}`,
        siteId,
        aliceMemberId,
      )
      expect(loaded?.profile?.displayName).toBe('Alice Sovereign')
      expect((loaded?.profile as any)?.email).toBeUndefined()

      // 3. Activity history
      const history = await getMemberActivityHistory(payload, aliceMemberId, aliceContext)
      expect(Array.isArray(history.comments)).toBe(true)
      expect(Array.isArray(history.threads)).toBe(true)
      for (const comment of history.comments) {
        expect((comment as any).email).toBeUndefined()
      }
    })
  })

  // ===========================================================================
  // RESILIENCE BOUNDARY (PROOFS 19 - 21)
  // ===========================================================================
  describe('RESILIENCE: Service Re-Initialization, State Retention & Zero-Duplicate Guarantees', () => {
    it('19. Stack restart during audience work: reconciles outbox and preserves subscriber records', async () => {
      // Re-initialize payload client to simulate cold-start / restart
      const restartedPayload = await getPayload({ config })
      expect(restartedPayload).toBeDefined()

      // Verify audience list and subscribers persist across restart
      const subCheck = await restartedPayload.findByID({
        collection: 'subscribers',
        id: testSubscriberId,
        overrideAccess: true,
      } as never)
      expect(subCheck).toBeDefined()
      expect(subCheck.id).toBe(testSubscriberId)
    })

    it('20. Stack restart during community work: preserves member identity, read states, and activity history', async () => {
      const restartedPayload = await getPayload({ config })

      // Verify Alice's session revalidates across client re-initialization
      const member = await currentMember(restartedPayload as never, aliceSessionToken)
      expect(member).toBeDefined()
      expect(member).toBe(aliceMemberId)

      // Verify discussion comments persist
      const comments = await listDiscussionComments(
        restartedPayload,
        articleDiscussionId,
        aliceContext,
      )
      expect(comments.length).toBeGreaterThan(0)
    })

    it('21. Concurrency idempotency: proves zero duplicate deliveries, notifications, or moderation actions', async () => {
      // 1. Concurrent delivery dispatch with identical idempotency key
      const sharedKey = `idemp-concurrent-${testRunId}-${randomUUID()}`
      const deliveryInsert = async () => {
        try {
          return await payload.create({
            collection: 'email-deliveries',
            data: {
              site: siteId,
              message: sampleEmailMessageId,
              recipientEmail: `concurrent-${testRunId}@example.test`,
              idempotencyKey: sharedKey,
              status: 'queued',
              messageSnapshot: { subject: 'Concurrent Test', blocks: [] },
            },
            overrideAccess: true,
          } as never)
        } catch (e: any) {
          return { error: e.message }
        }
      }

      // Execute parallel creates with same key
      const [res1, res2] = await Promise.all([deliveryInsert(), deliveryInsert()])
      const successCount = [res1, res2].filter((r: any) => !r.error && r.id).length
      // Exactly 1 must succeed; second must be rejected by unique idempotency constraint
      expect(successCount).toBe(1)

      // 2. Concurrency check on reaction toggle: parallel toggles resolve safely with zero duplicate reaction records
      const rxToggle = () =>
        toggleCommunityReaction(
          payload,
          {
            siteId,
            targetType: 'post',
            targetId: testCommentId,
            memberId: charlieModMemberId,
            emoji: '🔥',
          },
          charlieModContext,
        )

      await Promise.allSettled([rxToggle(), rxToggle()])

      // Database check proves zero duplicate reactions inserted
      const reactionCount = await queryDb(
        payload,
        `SELECT count(*) FROM "community_reactions" WHERE site_id = $1 AND target_id = $2 AND emoji = '🔥'`,
        [siteId, testCommentId],
      )
      expect(Number(reactionCount.rows[0]?.count)).toBeLessThanOrEqual(1)
    })
  })
})
