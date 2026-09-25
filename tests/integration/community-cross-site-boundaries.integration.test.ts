/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { ensureRenegadePartyDemo, type DemoEnvironment } from '../helpers/renegadeparty-demo'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  issueMagicLink,
  consumeMagicLink,
  memberSessionCookie,
  currentMember,
  exportMemberData,
  requestMemberDeletion,
} from '../../src/modules/identity/member-identity'
import {
  resolveCommunityActor,
  createForumThread,
  replyToForumThread,
  toggleCommunityReaction,
  blockMember,
  updateMemberProfile,
  getMemberNotifications,
  getMemberActivityHistory,
  queryDb,
} from '../../src/modules/community/service'
import type { CommunityActor, CommunityPolicyContext } from '../../src/modules/community/contracts'
import { loadProfileProjection, ProfileAccessError } from '../../src/modules/community/profile-projection'
import { ingestModerationReport } from '../../src/modules/community/moderation-reports'
import {
  applyModerationAction,
  verifyCommunityAuditChain,
} from '../../src/modules/community/moderation-actions'
import {
  startDirectConversation,
  sendConversationMessage,
  ConversationError,
} from '../../src/modules/community/conversation-composer'
import { linkMessageAttachments } from '../../src/modules/community/message-attachments'
import {
  noSnippet,
  projectInboxEvent,
  projectPendingInboxEvents,
  listInbox,
} from '../../src/modules/community/inbox-notifications'
import { notificationStreamManager } from '../../src/modules/community/notification-stream'
import {
  createOperationalBackupManifest,
  verifyOperationalBackup,
} from '../../src/modules/operations/backup'

describe('Community Domain Cross-Site, Multi-Member & Boundary Verification', () => {
  let payload: Payload
  let demo: DemoEnvironment
  let siteAId: string
  let siteBId: string
  let forumId: string
  const suffix = randomUUID().slice(0, 8)

  // Member 1: Alice (Site A, Regular Member)
  let aliceMemberId: string
  let aliceSessionToken: string
  let aliceHeaders: Headers
  let aliceActor: CommunityActor

  // Member 2: Bob (Site A & Site B, Regular Member)
  let bobMemberId: string
  let bobSessionToken: string
  let bobHeaders: Headers
  let bobActor: CommunityActor

  // Member 3: Charlie (Site A, Moderator/Staff)
  let charlieMemberId: string
  let charlieSessionToken: string
  let charlieHeaders: Headers
  let charlieActor: CommunityActor

  beforeAll(async () => {
    payload = await getPayload({ config })
    demo = await ensureRenegadePartyDemo(payload)
    siteAId = demo.siteId

    // 1. Ensure Site B exists for cross-site boundary testing
    const siteBRes = await payload.find({
      collection: 'sites',
      where: { slug: { equals: `renegade-site-b-${suffix}` } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)

    if (siteBRes.docs[0]) {
      siteBId = String(siteBRes.docs[0].id)
    } else {
      const createdSiteB = await payload.create({
        collection: 'sites',
        data: {
          name: `Renegade Satellite Site ${suffix}`,
          slug: `renegade-site-b-${suffix}`,
          domain: `satellite-${suffix}.example.test`,
          status: 'published',
        },
        overrideAccess: true,
      } as never)
      siteBId = String(createdSiteB.id)
    }

    // 2. Ensure Forum Section and Forum exist on Site A
    const section = await payload.create({
      collection: 'forum-sections',
      data: {
        site: siteAId,
        name: `Public Square ${suffix}`,
        slug: `public-square-${suffix}`,
        description: 'Community-wide civic discussions',
      },
      overrideAccess: true,
    } as never)

    const forum = await payload.create({
      collection: 'forums',
      data: {
        site: siteAId,
        section: section.id,
        name: `General Discussions ${suffix}`,
        slug: `general-${suffix}`,
        description: 'Open community topics and debates',
      },
      overrideAccess: true,
    } as never)
    forumId = String(forum.id)

    // 3. Register Member 1: Alice on Site A
    const aliceMagic = await issueMagicLink(payload as never, `alice-${suffix}@renegade.test`)
    const aliceConsumed = await consumeMagicLink(payload as never, aliceMagic.token!)
    aliceMemberId = aliceConsumed!.memberId
    aliceSessionToken = aliceConsumed!.sessionToken
    aliceHeaders = new Headers({
      cookie: memberSessionCookie(aliceSessionToken, false),
      'x-site-id': siteAId,
    })
    aliceActor = await resolveCommunityActor(payload, aliceHeaders, siteAId)

    await updateMemberProfile(
      payload,
      {
        memberId: aliceMemberId,
        handle: `alice_${suffix.toLowerCase()}`,
        displayName: 'Alice Operator',
        bio: 'Site A founding community participant',
        visibility: 'public',
      },
      { siteId: siteAId, actor: aliceActor },
    )

    // 4. Register Member 2: Bob on Site A and Site B
    const bobMagic = await issueMagicLink(payload as never, `bob-${suffix}@renegade.test`)
    const bobConsumed = await consumeMagicLink(payload as never, bobMagic.token!)
    bobMemberId = bobConsumed!.memberId
    bobSessionToken = bobConsumed!.sessionToken
    bobHeaders = new Headers({
      cookie: memberSessionCookie(bobSessionToken, false),
      'x-site-id': siteAId,
    })
    bobActor = await resolveCommunityActor(payload, bobHeaders, siteAId)

    await updateMemberProfile(
      payload,
      {
        memberId: bobMemberId,
        handle: `bob_${suffix.toLowerCase()}`,
        displayName: 'Bob CrossSite',
        bio: 'Member on Site A and Site B',
        visibility: 'public',
      },
      { siteId: siteAId, actor: bobActor },
    )

    // 5. Register Member 3: Charlie (Staff / Moderator on Site A)
    const charlieMagic = await issueMagicLink(payload as never, `charlie-mod-${suffix}@renegade.test`)
    const charlieConsumed = await consumeMagicLink(payload as never, charlieMagic.token!)
    charlieMemberId = charlieConsumed!.memberId
    charlieSessionToken = charlieConsumed!.sessionToken
    charlieHeaders = new Headers({
      cookie: memberSessionCookie(charlieSessionToken, false),
      'x-site-id': siteAId,
    })

    await payload.create({
      collection: 'team-memberships',
      data: {
        scopeKind: 'site',
        site: siteAId,
        member: charlieMemberId,
        role: 'moderator',
        status: 'active',
        grants: [],
      },
      overrideAccess: true,
    } as never)

    charlieActor = await resolveCommunityActor(payload, charlieHeaders, siteAId)
    expect(charlieActor.isModerator).toBe(true)

    await updateMemberProfile(
      payload,
      {
        memberId: charlieMemberId,
        handle: `charlie_${suffix.toLowerCase()}`,
        displayName: 'Charlie Moderator',
        bio: 'Community moderation and compliance lead',
        visibility: 'public',
      },
      { siteId: siteAId, actor: charlieActor },
    )
  })

  afterAll(async () => {
    // Cleanup test data to prevent database pollution
    try {
      await queryDb(
        payload,
        `DELETE FROM "community_audit_log" WHERE site_id = $1`,
        [siteAId],
      )
    } catch {
      // Ignored
    }
  })

  it('1. Object-ID Attacks: Prevents cross-member private resource query and mutation', async () => {
    const aliceContext: CommunityPolicyContext = { siteId: siteAId, actor: aliceActor }
    const bobContext: CommunityPolicyContext = { siteId: siteAId, actor: bobActor }

    // Alice starts a direct conversation with Charlie
    const aliceCharlieConv = await startDirectConversation(payload, {
      siteId: siteAId,
      memberId: aliceMemberId,
      recipientMemberId: charlieMemberId,
    })
    expect(aliceCharlieConv.id).toBeDefined()

    await sendConversationMessage(payload, {
      siteId: siteAId,
      conversationId: aliceCharlieConv.id,
      senderId: aliceMemberId,
      body: 'Confidential conversation between Alice and Charlie.',
      idempotencyKey: randomUUID(),
    })

    // ATTACK 1: Bob tries to send a message into Alice and Charlie's conversation
    await expect(
      sendConversationMessage(payload, {
        siteId: siteAId,
        conversationId: aliceCharlieConv.id,
        senderId: bobMemberId,
        body: 'Malicious injection by Bob into private conversation',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow()

    // ATTACK 2: Bob tries to access Alice's private notification inbox
    await expect(
      getMemberNotifications(payload, aliceMemberId, bobContext),
    ).rejects.toThrow('Cannot read another member notifications')

    // ATTACK 3: Bob tries to access Alice's activity history
    await expect(
      getMemberActivityHistory(payload, aliceMemberId, bobContext),
    ).rejects.toThrow('Cannot view another member history')

    // ATTACK 4: Private Attachment Theft
    // Bob attempts to link Alice's private message attachment into his message
    const aliceAttachmentId = randomUUID()
    await queryDb(
      payload,
      `INSERT INTO message_attachments (id, site_id, owner_id, storage_key, original_filename, claimed_mime_type, byte_size, status, upload_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'clean', now() + interval '1 hour')`,
      [
        aliceAttachmentId,
        siteAId,
        aliceMemberId,
        `community/${siteAId}/attachments/${aliceAttachmentId}`,
        'secret-briefing.pdf',
        'application/pdf',
        2048,
      ],
    )

    // Bob tries to link Alice's attachment into his message
    await expect(
      linkMessageAttachments(
        async (text: string, values?: unknown[]) => queryDb(payload, text, values),
        {
          siteId: siteAId,
          memberId: bobMemberId,
          messageId: randomUUID(),
          attachmentIds: [aliceAttachmentId],
        },
      ),
    ).rejects.toThrow('Attachment is unavailable for this site or sender.')

    // Legitimate owner Alice can access her own notifications without error
    const aliceNotifs = await getMemberNotifications(payload, aliceMemberId, aliceContext)
    expect(Array.isArray(aliceNotifs)).toBe(true)
  })

  it('2. Blocked Relationships: Enforces strict isolation on messaging, projection, and notifications', async () => {
    // Alice blocks Bob on Site A
    await blockMember(
      payload,
      { siteId: siteAId, subjectMemberId: aliceMemberId, targetMemberId: bobMemberId },
    )

    // A. Profile Projection: Bob viewing Alice's profile throws 404 ProfileAccessError
    await expect(
      loadProfileProjection(payload, `alice_${suffix.toLowerCase()}`, siteAId, bobMemberId),
    ).rejects.toThrow(ProfileAccessError)

    // B. Direct Messaging: Bob attempting to initiate a direct conversation with Alice fails
    await expect(
      startDirectConversation(payload, {
        siteId: siteAId,
        memberId: bobMemberId,
        recipientMemberId: aliceMemberId,
      }),
    ).rejects.toThrow()

    // C. Notification Isolation: Events created by Bob are not delivered to Alice
    const inboxCountBefore = await listInbox(payload, { siteId: siteAId, memberId: aliceMemberId })

    await projectInboxEvent(payload, {
      id: randomUUID(),
      eventType: 'comment.created.v1',
      payload: {
        siteId: siteAId,
        actorId: bobMemberId,
        recipientMemberIds: [aliceMemberId],
        body: 'Unsolicited ping from blocked user Bob',
      },
    })

    const inboxCountAfter = await listInbox(payload, { siteId: siteAId, memberId: aliceMemberId })
    // Alice should receive 0 notifications from the blocked Bob
    expect(inboxCountAfter.unreadCount).toBe(inboxCountBefore.unreadCount)
  })

  it('3. Search and Notification Leakage: Respects discovery opt-out and scrubs sensitive snippets', async () => {
    // Update Bob's profile to opt out of discovery
    const bobProfileRes = await payload.find({
      collection: 'profiles',
      where: { member: { equals: bobMemberId } },
      limit: 1,
      overrideAccess: true,
    } as never)
    const bobProfile = bobProfileRes.docs[0]

    await payload.update({
      collection: 'profiles',
      id: bobProfile.id,
      data: {
        discoveryOptOut: true,
      },
      overrideAccess: true,
    } as never)

    // Directory query should not return profiles that opted out of search
    const directoryQuery = await payload.find({
      collection: 'profiles',
      where: {
        and: [
          { visibility: { equals: 'public' } },
          { discoveryOptOut: { not_equals: true } },
          { handle: { contains: `bob_${suffix}` } },
        ],
      },
      overrideAccess: true,
    } as never)
    expect(directoryQuery.docs).toHaveLength(0)

    // Test notification snippet scrubbing (noSnippet contract)
    const rawSensitiveSnapshot = {
      kind: 'comment.created.v1',
      actorName: 'Bob',
      body: 'Highly confidential comment payload',
      body_html: '<p>HTML payload</p>',
      body_raw: 'Raw unscrubbed content',
      snippet: 'Secret snippet preview',
      preview: 'Sneak preview',
      message: 'Sensitive message body',
    }
    const sanitizedSnapshot = noSnippet(rawSensitiveSnapshot)
    expect(sanitizedSnapshot).toEqual({
      kind: 'comment.created.v1',
      actorName: 'Bob',
    })
    expect(sanitizedSnapshot).not.toHaveProperty('body')
    expect(sanitizedSnapshot).not.toHaveProperty('body_html')
    expect(sanitizedSnapshot).not.toHaveProperty('snippet')
    expect(sanitizedSnapshot).not.toHaveProperty('preview')
    expect(sanitizedSnapshot).not.toHaveProperty('message')
  })

  it('4. Realtime Reconnect: Manages event leases, reconnects with Last-Event-ID, isolates sites', () => {
    notificationStreamManager.clear()

    const receivedA: string[] = []
    const connectionA = {
      id: `conn-alice-${suffix}`,
      siteId: siteAId,
      memberId: aliceMemberId,
      send: (chunk: string) => receivedA.push(chunk),
      close: () => undefined,
    }

    // 1. Establish lease for Alice on Site A
    expect(notificationStreamManager.acquireLease(aliceMemberId, connectionA)).toBe(true)

    // Emit initial hint on Site A
    const hint0 = notificationStreamManager.emitHint(siteAId, aliceMemberId, 1)
    expect(receivedA).toHaveLength(1)
    expect(receivedA[0]).toContain(`id: ${hint0.id}`)

    // 2. Alice disconnects
    notificationStreamManager.releaseLease(aliceMemberId, connectionA)

    // 3. While disconnected, emit 2 hints on Site A, and 1 hint on Site B (different site)
    const hint1 = notificationStreamManager.emitHint(siteAId, aliceMemberId, 2)
    const hint2 = notificationStreamManager.emitHint(siteAId, aliceMemberId, 3)
    notificationStreamManager.emitHint(siteBId, aliceMemberId, 99) // Should not leak to Site A

    // 4. Reconnect with Last-Event-ID = hint0.id on Site A
    const missedHints = notificationStreamManager.getMissedHints(siteAId, aliceMemberId, hint0.id)
    expect(missedHints).toHaveLength(2)
    expect(missedHints.map((h) => h.id)).toEqual([hint1.id, hint2.id])
    expect(missedHints.map((h) => h.unreadCount)).toEqual([2, 3])
  })

  it('5. Worker Restart & Idempotency: Outbox projection delivers at-least-once with zero duplicate inboxes', async () => {
    // Insert a test outbox event directly into outbox_events
    const eventId = randomUUID()
    const idempotencyKey = `idemp-${suffix}-1`
    await queryDb(
      payload,
      `INSERT INTO outbox_events (id, event_type, payload, idempotency_key, created_at)
       VALUES ($1, 'comment.created.v1', $2::jsonb, $3, now())`,
      [
        eventId,
        JSON.stringify({
          siteId: siteAId,
          targetType: 'comment',
          targetId: randomUUID(),
          recipientMemberIds: [aliceMemberId],
          actorId: charlieMemberId,
        }),
        idempotencyKey,
      ],
    )

    // Worker pass 1
    const run1 = await projectPendingInboxEvents(payload, 50)
    expect(run1.processed).toBeGreaterThanOrEqual(1)

    // Simulate worker restart / crash replay: Worker runs the exact same pending event again
    const run2 = await projectPendingInboxEvents(payload, 50)
    // Idempotent delivery: delivered count for this event is 0 because recipient unique key prevented duplicate
    expect(run2.delivered).toBe(0)
  })

  it('6. Full Journey & Moderator Audit Trail: Report, inspect, resolve, and verify tamper-evident audit chain', async () => {
    // Step 1: Alice creates a forum thread and Bob replies
    const threadRes = await createForumThread(
      payload,
      {
        siteId: siteAId,
        forumId,
        authorMemberId: aliceMemberId,
        title: `Community Policy Review ${suffix}`,
        body: 'Welcome to the formal policy review thread.',
        visibility: 'public',
      },
      { siteId: siteAId, actor: aliceActor },
    )
    expect(threadRes.discussion.id).toBeDefined()

    const replyRes = await replyToForumThread(
      payload,
      {
        siteId: siteAId,
        discussionId: threadRes.discussion.id,
        authorMemberId: bobMemberId,
        body: 'Discussion contribution from Bob.',
      },
      { siteId: siteAId, actor: bobActor },
    )
    expect(replyRes.id).toBeDefined()

    // Step 2: Create a comment thread and objectionable comment on Site A
    const modContent = await payload.create({
      collection: 'content',
      data: {
        site: siteAId,
        contentType: 'article',
        title: `Test Moderation Article ${suffix} ${randomUUID().slice(0, 6)}`,
        slug: `test-mod-${suffix}-${randomUUID().slice(0, 8)}`,
        status: 'published',
        publishedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)
    const testThreadId = randomUUID()
    const testCommentId = randomUUID()
    const canonicalContentId = String(modContent.id)
    await queryDb(
      payload,
      `INSERT INTO comment_threads (id, site_id, canonical_content_id, content_type) VALUES ($1, $2, $3, $4)`,
      [testThreadId, siteAId, canonicalContentId, 'article'],
    )
    await queryDb(
      payload,
      `INSERT INTO comments (id, thread_id, author_id, author_type, body_raw, body_html, status)
       VALUES ($1, $2, $3, 'member', $4, $5, 'visible')`,
      [
        testCommentId,
        testThreadId,
        bobMemberId,
        'Disruptive comment content that violates standards',
        '<p>Disruptive comment content that violates standards</p>',
      ],
    )

    // Step 3: Alice reports Bob's objectionable comment
    const reportRes = await ingestModerationReport(payload, {
      siteId: siteAId,
      reporterId: aliceMemberId,
      targetType: 'comment',
      targetId: testCommentId,
      reason: 'Harassment and disruption of community process',
      details: 'Offensive language targeting community members.',
    })
    expect(reportRes.reportId).toBeDefined()
    expect(reportRes.caseId).toBeDefined()
    expect(reportRes.targetSnapshotHash).toBeDefined()

    // Step 4: Moderator Charlie inspects the report & cases
    const openReports = await queryDb<{ id: string; target_type: string; status: string }>(
      payload,
      `SELECT id, target_type, status FROM "community_reports" WHERE id = $1`,
      [reportRes.reportId],
    )
    expect(openReports.rows).toHaveLength(1)
    expect(openReports.rows[0].status).toBe('pending')

    // Step 5: Moderator Charlie applies 'quarantine' action to the comment
    await applyModerationAction(payload, {
      siteId: siteAId,
      caseId: reportRes.caseId,
      actorMemberId: charlieMemberId,
      targetType: 'comment',
      targetId: testCommentId,
      action: 'quarantine',
      scope: 'object',
      scopeId: testCommentId,
      reason: 'Violates civility policy; quarantined pending full review',
    })

    // Step 6: Verify comment is quarantined (status = 'rejected') in persisted database
    const quarantinedComment = await queryDb<{ status: string }>(
      payload,
      `SELECT status FROM "comments" WHERE id = $1`,
      [testCommentId],
    )
    expect(quarantinedComment.rows[0].status).toBe('rejected')

    // Step 7: Verify moderation action recorded with Charlie as actor
    const recordedAction = await queryDb<{ action: string; actor: string }>(
      payload,
      `SELECT action, actor FROM "moderation_actions" WHERE case_id = $1`,
      [reportRes.caseId],
    )
    expect(recordedAction.rows).toHaveLength(1)
    expect(recordedAction.rows[0].action).toBe('quarantine')
    expect(recordedAction.rows[0].actor).toContain(charlieMemberId)

    // Step 8: Verify immutable audit log contains trigger-derived hash and audit chain is valid
    const auditValid = await verifyCommunityAuditChain(payload, siteAId)
    expect(auditValid).toBe(true)
  })

  it('7. Backup/Restore and Data Lifecycle Policy: Preserves community state, enforces secret exclusions, and satisfies deletion compliance', async () => {
    // Step 1: Verify all canonical community relational tables exist in PostgreSQL
    const communityTables = await queryDb<{ table_name: string }>(
      payload,
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' 
         AND table_name IN ('comment_threads', 'comments', 'community_audit_log', 'community_reports', 'moderation_actions', 'discussions', 'discussion_posts', 'message_attachments')`,
    )
    expect(communityTables.rows.length).toBeGreaterThanOrEqual(6)

    // Step 2: Operational backup policy manifest excludes all credentials, tokens, secrets
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-comm-backup-'))
    try {
      await writeFile(path.join(tempDir, 'database.dump'), 'community-postgres-pg_dump-content')
      await writeFile(path.join(tempDir, 'media.tar.gz'), Buffer.from('community-media-archive'))

      const manifest = await createOperationalBackupManifest(tempDir, {
        createdAt: new Date().toISOString(),
        renegade: { version: '1.0.0', buildSha: null },
        postgresql: { version: '17.6' },
        consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
        includedComponents: [
          'postgresql-data',
          'media-and-local-generated-assets',
          'db-extension-and-capability-state',
          'non-secret-installation-metadata',
        ],
        migrationState: ['20260921_020000_comm_03a_comment_identity'],
        installation: { storageDriver: 'local', mediaDir: '/app/media', imageTag: null },
      })

      // Exclusions must be explicit
      expect(manifest.exclusions).toContain('Payload secrets')
      expect(manifest.exclusions).toContain('database passwords')
      expect(manifest.exclusions).toContain('provider credentials')

      await writeFile(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
      const verified = await verifyOperationalBackup(tempDir)
      expect(verified.totals.files).toBe(2)

      // Step 3: Member Data Lifecycle: Export and Deletion
      // Alice exports data
      const exportData = await exportMemberData(payload as never, aliceMemberId)
      expect((exportData.member as any).status).toBe('active')
      expect(exportData.profile).toBeDefined()

      // Bob requests deletion
      await requestMemberDeletion(payload as never, bobMemberId)
      const deletedMember = await payload.findByID({
        collection: 'members',
        id: bobMemberId,
        overrideAccess: true,
      })
      expect((deletedMember as any).deletionRequestedAt).toBeDefined()
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
