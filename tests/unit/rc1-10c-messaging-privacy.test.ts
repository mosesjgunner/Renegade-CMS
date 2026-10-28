import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConversationError,
  administerGroupConversation,
  createGroupConversation,
  listConversationMessages,
  sendConversationMessage,
  startDirectConversation,
} from '@/modules/community/conversation-composer'
import {
  createMessageAttachmentPresign,
  linkMessageAttachments,
  messageAttachmentMaxBytes,
  messageAttachmentMimeTypes,
} from '@/modules/community/message-attachments'
import {
  NotificationStreamManager,
  notificationStreamManager,
} from '@/modules/community/notification-stream'
import {
  listInbox,
  markInboxRead,
  noSnippet,
  projectInboxEvent,
} from '@/modules/community/inbox-notifications'
import * as communityService from '@/modules/community/service'
import { querySearchProjection } from '@/modules/public/search-projection'

const siteA = '00000000-0000-7000-8000-000000000001'
const siteB = '00000000-0000-7000-8000-000000000002'
const alice = '00000000-0000-7000-8000-000000000010'
const bob = '00000000-0000-7000-8000-000000000020'
const eve = '00000000-0000-7000-8000-000000000030'

describe('RC1 10C — Messages, Blocks, Notifications and Privacy Invariants', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    notificationStreamManager.clear()
  })

  // --------------------------------------------------------------------------
  // 1. Direct & Group Message Exchange and Idempotency
  // --------------------------------------------------------------------------
  describe('Direct and group message exchange', () => {
    function createConversationHarness() {
      const convos = new Map<string, Record<string, unknown>>()
      const memberships = new Map<string, Array<{ member_id: string; role: string; left_at: string | null; visible_from_sequence: number }>>()
      const messages = new Map<string, Record<string, unknown>>()
      let sequence = 1

      const query = vi.fn(async (text: string, values: unknown[] = []) => {
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text) || text.includes('pg_advisory')) {
          return { rows: [] }
        }

        // Check active membership
        if (text.includes('SELECT c.request_state') || text.includes('FROM conversation_memberships cm JOIN conversations c')) {
          const convId = String(values[0])
          const memId = String(values[1])
          const sId = String(values[2])
          const c = convos.get(convId)
          const mems = memberships.get(convId) || []
          const m = mems.find((item) => item.member_id === memId && !item.left_at)
          if (c && c.site_id === sId && m) {
            return {
              rows: [{
                request_state: c.request_state,
                request_recipient_member_id: c.request_recipient_member_id,
                status: c.status,
                visible_from_sequence: m.visible_from_sequence,
              }],
            }
          }
          return { rows: [] }
        }

        // Query conversation peers
        if (text.includes('SELECT member_id FROM conversation_memberships WHERE conversation_id=$1 AND member_id<>$2 AND left_at IS NULL')) {
          const convId = String(values[0])
          const senderId = String(values[1])
          const mems = memberships.get(convId) || []
          return {
            rows: mems
              .filter((item) => item.member_id !== senderId && !item.left_at)
              .map((item) => ({ member_id: item.member_id })),
          }
        }

        // Duplicate check by idempotency key
        if (text.startsWith('SELECT * FROM messages WHERE conversation_id=$1 AND idempotency_key=$2')) {
          const key = `${values[0]}:${values[1]}`
          const existing = messages.get(key)
          return { rows: existing ? [existing] : [] }
        }

        // Sequence update
        if (text.startsWith('UPDATE conversations SET next_message_sequence')) {
          const currentSeq = sequence++
          return { rows: [{ sequence_number: currentSeq }] }
        }

        // Message insert
        if (text.startsWith('INSERT INTO messages')) {
          const row = {
            id: `msg-${sequence}`,
            conversation_id: values[0],
            sender_id: values[1],
            idempotency_key: values[2],
            sequence_number: values[3],
            body_html: values[4],
            created_at: new Date().toISOString(),
          }
          messages.set(`${values[0]}:${values[2]}`, row)
          return { rows: [row] }
        }

        return { rows: [] }
      })

      const payload = {
        db: { pool: { connect: async () => ({ query, release: vi.fn() }), query } },
        find: vi.fn(async () => ({ docs: [] })),
        collections: {},
      } as never

      return {
        payload,
        convos,
        memberships,
        messages,
      }
    }

    it('exchanges messages with sequence numbering and idempotent deduplication', async () => {
      const { payload, convos, memberships } = createConversationHarness()
      convos.set('conv-1', {
        id: 'conv-1',
        site_id: siteA,
        kind: 'direct',
        status: 'active',
        request_state: 'active',
      })
      memberships.set('conv-1', [
        { member_id: alice, role: 'member', left_at: null, visible_from_sequence: 1 },
        { member_id: bob, role: 'member', left_at: null, visible_from_sequence: 1 },
      ])

      // Alice sends message 1
      const msg1 = await sendConversationMessage(payload, {
        siteId: siteA,
        conversationId: 'conv-1',
        senderId: alice,
        body: 'Hello Bob!',
        idempotencyKey: 'idemp-1',
      })
      expect(msg1.duplicate).toBe(false)
      expect(msg1.sequence_number).toBe(1)
      expect(msg1.body_html).toContain('Hello Bob!')

      // Duplicate submission with same idempotencyKey returns existing without bumping sequence
      const dup = await sendConversationMessage(payload, {
        siteId: siteA,
        conversationId: 'conv-1',
        senderId: alice,
        body: 'Hello Bob! (retry)',
        idempotencyKey: 'idemp-1',
      })
      expect(dup.duplicate).toBe(true)
      expect(dup.sequence_number).toBe(1)

      // Bob replies with next sequence number
      const msg2 = await sendConversationMessage(payload, {
        siteId: siteA,
        conversationId: 'conv-1',
        senderId: bob,
        body: 'Hi Alice, received!',
        idempotencyKey: 'idemp-2',
      })
      expect(msg2.duplicate).toBe(false)
      expect(msg2.sequence_number).toBe(2)
      expect(msg2.body_html).toContain('Hi Alice, received!')
    })

    it('rejects message sending by non-members or cross-site attackers', async () => {
      const { payload, convos, memberships } = createConversationHarness()
      convos.set('conv-1', {
        id: 'conv-1',
        site_id: siteA,
        kind: 'direct',
        status: 'active',
        request_state: 'active',
      })
      memberships.set('conv-1', [
        { member_id: alice, role: 'member', left_at: null, visible_from_sequence: 1 },
        { member_id: bob, role: 'member', left_at: null, visible_from_sequence: 1 },
      ])

      // Eve is not in conversation memberships -> 403 NOT_CONVERSATION_MEMBER
      await expect(
        sendConversationMessage(payload, {
          siteId: siteA,
          conversationId: 'conv-1',
          senderId: eve,
          body: 'Intruder message',
          idempotencyKey: 'idemp-eve',
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'NOT_CONVERSATION_MEMBER',
      })

      // Alice attempting to send to Site B using Site A conversation -> rejected
      await expect(
        sendConversationMessage(payload, {
          siteId: siteB,
          conversationId: 'conv-1',
          senderId: alice,
          body: 'Cross-site leak attempt',
          idempotencyKey: 'idemp-cross',
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'NOT_CONVERSATION_MEMBER',
      })
    })
  })

  // --------------------------------------------------------------------------
  // 2. Member Blocking Enforcement Across Messaging & Initiation
  // --------------------------------------------------------------------------
  describe('Member blocking enforcement', () => {
    it('blocks conversation initiation between blocked members', async () => {
      vi.spyOn(communityService, 'checkBlockBetween').mockResolvedValue({
        isBlocked: true,
      })

      const payload = {
        db: { pool: { connect: vi.fn(), query: vi.fn() } },
        find: vi.fn(async () => ({ docs: [] })),
      } as never

      await expect(
        startDirectConversation(payload, {
          siteId: siteA,
          memberId: alice,
          recipientMemberId: bob,
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'BLOCKED_COMMUNICATION',
      })
    })

    it('rejects sending messages when either party has blocked the other', async () => {
      // Mock membership query to pass, but checkBlockBetween reports blocked
      const query = vi.fn(async (text: string) => {
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] }
        if (text.includes('SELECT c.request_state')) {
          return {
            rows: [{ request_state: 'active', status: 'active' }],
          }
        }
        if (text.includes('SELECT member_id FROM conversation_memberships WHERE conversation_id=$1 AND member_id<>$2')) {
          return { rows: [{ member_id: bob }] }
        }
        return { rows: [] }
      })

      const payload = {
        db: { pool: { connect: async () => ({ query, release: vi.fn() }), query } },
        find: vi.fn(async () => ({ docs: [] })),
      } as never

      vi.spyOn(communityService, 'checkBlockBetween').mockResolvedValue({
        isBlocked: true,
      })

      await expect(
        sendConversationMessage(payload, {
          siteId: siteA,
          conversationId: 'conv-1',
          senderId: alice,
          body: 'Unsolicited message after block',
          idempotencyKey: 'blocked-attempt-1',
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'BLOCKED_COMMUNICATION',
      })
    })
  })

  // --------------------------------------------------------------------------
  // 3. Notification Suppression on Block and Privacy Protection
  // --------------------------------------------------------------------------
  describe('Notification suppression on block', () => {
    it('generates zero notifications for a recipient who has blocked the actor', async () => {
      vi.spyOn(communityService, 'checkBlockBetween').mockResolvedValue({
        isBlocked: true,
      })
      vi.spyOn(communityService, 'checkMuteFrom').mockResolvedValue(false)

      const query = vi.fn(async (text: string) => {
        if (text.includes('SELECT status, deleted_at FROM comments')) {
          return { rows: [{ status: 'visible', deleted_at: null }] }
        }
        return { rows: [] }
      })

      const payload = { db: { pool: { query } } } as never

      const count = await projectInboxEvent(payload, {
        id: 'evt-blocked',
        eventType: 'comment.created.v1',
        payload: {
          site_id: siteA,
          author_id: alice,
          comment_id: 'comment-123',
          recipient_member_ids: [bob],
        },
      })

      expect(count).toBe(0)
    })

    it('strips private message content from notification snapshots', () => {
      const sensitivePayload = {
        kind: 'direct_message.received',
        sender: 'alice',
        body: 'Super secret private discussion',
        body_html: '<p>Super secret private discussion</p>',
        snippet: 'Super secret...',
        preview: 'Super secret preview',
        message: 'Direct message content',
        content: 'Confidential inner content',
      }

      const clean = noSnippet(sensitivePayload)
      expect(clean).toEqual({
        kind: 'direct_message.received',
        sender: 'alice',
      })
      expect(clean).not.toHaveProperty('body')
      expect(clean).not.toHaveProperty('body_html')
      expect(clean).not.toHaveProperty('snippet')
      expect(clean).not.toHaveProperty('preview')
      expect(clean).not.toHaveProperty('message')
      expect(clean).not.toHaveProperty('content')
    })
  })

  // --------------------------------------------------------------------------
  // 4. Notification Stream Reconnect and Site Isolation
  // --------------------------------------------------------------------------
  describe('Notification stream reconnect and cross-site isolation', () => {
    it('delivers missed hints sequentially upon reconnect with Last-Event-ID', () => {
      const delivered: string[] = []
      const connection = {
        id: 'conn-test-1',
        siteId: siteA,
        memberId: alice,
        send: (chunk: string) => delivered.push(chunk),
        close: vi.fn(),
      }

      // Initial lease
      expect(notificationStreamManager.acquireLease(alice, connection)).toBe(true)

      const hint0 = notificationStreamManager.emitHint(siteA, alice, 1)
      expect(delivered).toHaveLength(1)
      expect(delivered[0]).toContain(`id: ${hint0.id}`)

      // Disconnect
      notificationStreamManager.releaseLease(alice, connection)

      // Hints arrive while client is disconnected
      const hint1 = notificationStreamManager.emitHint(siteA, alice, 2)
      const hint2 = notificationStreamManager.emitHint(siteA, alice, 3)

      // Reconnect supplying Last-Event-ID of hint0
      const missed = notificationStreamManager.getMissedHints(siteA, alice, hint0.id)
      expect(missed).toHaveLength(2)
      expect(missed[0].id).toBe(hint1.id)
      expect(missed[1].id).toBe(hint2.id)
      expect(missed.map((h) => h.unreadCount)).toEqual([2, 3])
    })

    it('strictly isolates hints between sites for the same member ID', () => {
      const siteAMessages: string[] = []
      const siteBMessages: string[] = []

      const connA = {
        id: 'conn-site-a',
        siteId: siteA,
        memberId: alice,
        send: (chunk: string) => siteAMessages.push(chunk),
        close: vi.fn(),
      }
      const connB = {
        id: 'conn-site-b',
        siteId: siteB,
        memberId: alice,
        send: (chunk: string) => siteBMessages.push(chunk),
        close: vi.fn(),
      }

      notificationStreamManager.acquireLease(alice, connA)
      notificationStreamManager.acquireLease(alice, connB)

      // Emit on Site A
      notificationStreamManager.emitHint(siteA, alice, 4)
      expect(siteAMessages).toHaveLength(1)
      expect(siteBMessages).toHaveLength(0)

      // Emit on Site B
      notificationStreamManager.emitHint(siteB, alice, 1)
      expect(siteAMessages).toHaveLength(1)
      expect(siteBMessages).toHaveLength(1)
    })
  })

  // --------------------------------------------------------------------------
  // 5. Attachment Governance and Storage Prerequisites
  // --------------------------------------------------------------------------
  describe('Attachment governance and private storage prerequisites', () => {
    it('refuses presign when S3 storage driver is unavailable', async () => {
      const payload = { db: { pool: { query: vi.fn() } } } as never
      const localConfig = {
        storage: {
          driver: 'local',
          mediaDir: '/tmp/local-media',
          maxUploadBytes: messageAttachmentMaxBytes,
        },
      } as never

      await expect(
        createMessageAttachmentPresign(payload, localConfig, {
          siteId: siteA,
          memberId: alice,
          filename: 'confidential.pdf',
          mimeType: 'application/pdf',
          size: 1024,
        }),
      ).rejects.toMatchObject({
        status: 503,
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      })
    })

    it('enforces MIME type restrictions and 10MB size ceiling', async () => {
      const payload = { db: { pool: { query: vi.fn() } } } as never
      const config = {
        storage: {
          driver: 's3',
          s3: {
            endpoint: 'https://s3.example.test',
            bucket: 'test',
            region: 'us-east-1',
            accessKeyId: 'k',
            secretAccessKey: 's',
          },
        },
      } as never

      // Disallowed executable MIME type
      await expect(
        createMessageAttachmentPresign(payload, config, {
          siteId: siteA,
          memberId: alice,
          filename: 'payload.exe',
          mimeType: 'application/x-msdownload',
          size: 1024,
        }),
      ).rejects.toMatchObject({
        status: 422,
        code: 'ATTACHMENT_MIME_NOT_ALLOWED',
      })

      // Over 10MB limit
      await expect(
        createMessageAttachmentPresign(payload, config, {
          siteId: siteA,
          memberId: alice,
          filename: 'huge-file.pdf',
          mimeType: 'application/pdf',
          size: messageAttachmentMaxBytes + 1,
        }),
      ).rejects.toMatchObject({
        status: 413,
        code: 'ATTACHMENT_TOO_LARGE',
      })
    })

    it('prevents linking cross-site attachments or unapproved quarantined items', async () => {
      const query = vi.fn(async () => ({ rows: [] }))

      // Object ID substitution attempt: linking another user's or another site's attachment
      await expect(
        linkMessageAttachments(query, {
          siteId: siteA,
          memberId: alice,
          messageId: 'msg-1',
          attachmentIds: ['00000000-0000-7000-8000-000000000099'],
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'ATTACHMENT_SCOPE_DENIED',
      })
    })
  })

  // --------------------------------------------------------------------------
  // 6. Zero Leakage Through Search Projection & Public Projections
  // --------------------------------------------------------------------------
  describe('Zero leakage through search projection', () => {
    it('ensures search projection query only accesses public search_documents and never private message tables', async () => {
      const query = vi.fn(async (text: string) => {
        expect(text).toContain('search_documents')
        expect(text).not.toContain('messages')
        expect(text).not.toContain('conversations')
        expect(text).not.toContain('inbox_notifications')
        expect(text).not.toContain('message_attachments')
        return { rows: [] }
      })

      const payload = { db: { pool: { query } } } as never

      const results = await querySearchProjection(payload, {
        siteId: siteA,
        query: 'confidential conversation topic',
        page: 1,
        pageSize: 10,
      })

      expect(results.hits).toHaveLength(0)
      expect(results.total).toBe(0)
    })
  })
})
