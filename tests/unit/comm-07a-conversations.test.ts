import { describe, expect, it, vi } from 'vitest'
import { down, up } from '@/migrations/20260922_070000_comm_07a_conversations'
import {
  ConversationError,
  sendConversationMessage,
  startDirectConversation,
} from '@/modules/community/conversation-composer'

const site = '00000000-0000-7000-8000-000000000001'
const alice = '00000000-0000-7000-8000-000000000002'
const bob = '00000000-0000-7000-8000-000000000003'

function payload() {
  let direct: Record<string, unknown> | undefined
  let sequence = 1
  const messages = new Map<string, Record<string, unknown>>()
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (
      text === 'BEGIN' ||
      text === 'COMMIT' ||
      text === 'ROLLBACK' ||
      text.includes('pg_advisory')
    )
      return { rows: [] }
    if (text.startsWith('SELECT * FROM conversations')) return { rows: direct ? [direct] : [] }
    if (text.startsWith('INSERT INTO conversations')) {
      direct = { id: 'conversation-1', site_id: site, kind: 'direct', created_at: 'now' }
      return { rows: [direct] }
    }
    if (text.includes('conversation_memberships') && text.includes('FOR SHARE'))
      return { rows: [{ '?column?': 1 }] }
    if (text.startsWith('SELECT * FROM messages'))
      return { rows: messages.has(String(values[1])) ? [messages.get(String(values[1]))] : [] }
    if (text.startsWith('UPDATE conversations SET next_message_sequence'))
      return { rows: [{ sequence_number: sequence++ }] }
    if (text.startsWith('INSERT INTO messages')) {
      const row = {
        id: `m-${sequence}`,
        conversation_id: values[0],
        sender_id: values[1],
        idempotency_key: values[2],
        sequence_number: values[3],
        body_html: values[4],
      }
      messages.set(String(values[2]), row)
      return { rows: [row] }
    }
    return { rows: [] }
  })
  return {
    db: { pool: { connect: async () => ({ query, release: vi.fn() }) } },
    find: async () => ({ docs: [] }),
    query,
  } as never
}

describe('COMM-07A conversations', () => {
  it('creates canonical aggregate tables and database membership/ordering guards', async () => {
    const execute = vi.fn(async () => undefined)
    await up({ db: { execute } } as never)
    await down({ db: { execute } } as never)
    const schema = JSON.stringify(execute.mock.calls[0][0])
    expect(schema).toContain('conversations')
    expect(schema).toContain('conversation_memberships')
    expect(schema).toContain('messages')
    expect(schema).toContain('conversations_active_direct_pair_unique')
    expect(schema).toContain('messages_conversation_sequence_unique')
    expect(schema).toContain('messages_require_active_membership')
  })
  it('returns the same direct conversation for unordered repeated creation', async () => {
    const p = payload()
    const [one, two] = await Promise.all([
      startDirectConversation(p, { siteId: site, memberId: alice, recipientMemberId: bob }),
      startDirectConversation(p, { siteId: site, memberId: bob, recipientMemberId: alice }),
    ])
    expect(one.id).toBe(two.id)
  })
  it('sanitizes, orders, and deduplicates messages by required idempotency key', async () => {
    const p = payload()
    const first = await sendConversationMessage(p, {
      siteId: site,
      conversationId: 'conversation-1',
      senderId: alice,
      body: '<p>Hello</p><script>bad()</script>',
      idempotencyKey: 'one',
    })
    const duplicate = await sendConversationMessage(p, {
      siteId: site,
      conversationId: 'conversation-1',
      senderId: alice,
      body: '<p>ignored</p>',
      idempotencyKey: 'one',
    })
    const second = await sendConversationMessage(p, {
      siteId: site,
      conversationId: 'conversation-1',
      senderId: alice,
      body: '<p>Two</p>',
      idempotencyKey: 'two',
    })
    expect(first).toMatchObject({ sequence_number: 1, body_html: '<p>Hello</p>', duplicate: false })
    expect(duplicate).toMatchObject({ sequence_number: 1, duplicate: true })
    expect(second).toMatchObject({ sequence_number: 2 })
  })
  it('allocates 100 concurrent group-message sequences without gaps', async () => {
    const p = payload()
    const sent = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        sendConversationMessage(p, {
          siteId: site,
          conversationId: 'group-1',
          senderId: alice,
          body: `<p>${index}</p>`,
          idempotencyKey: `message-${index}`,
        }),
      ),
    )
    expect(sent.map((message) => Number(message.sequence_number)).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    )
  })
  it('rejects missing idempotency keys and non-members', async () => {
    await expect(
      sendConversationMessage(payload(), {
        siteId: site,
        conversationId: 'c',
        senderId: alice,
        body: 'x',
        idempotencyKey: '',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' })
    const p = payload()
    p.db.pool.connect = async () => ({
      query: async (text: string) =>
        text.includes('conversation_memberships') ? { rows: [] } : { rows: [] },
      release: vi.fn(),
    })
    await expect(
      sendConversationMessage(p, {
        siteId: site,
        conversationId: 'c',
        senderId: alice,
        body: 'x',
        idempotencyKey: 'x',
      }),
    ).rejects.toBeInstanceOf(ConversationError)
  })
})
