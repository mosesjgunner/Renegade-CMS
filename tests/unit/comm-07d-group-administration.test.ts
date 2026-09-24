import { describe, expect, it, vi } from 'vitest'
import { up } from '@/migrations/20260922_100000_comm_07d_group_administration'
import {
  administerGroupConversation,
  ConversationError,
  listConversationMessages,
  sendConversationMessage,
} from '@/modules/community/conversation-composer'

const site = '00000000-0000-7000-8000-000000000001'
const alice = '00000000-0000-7000-8000-000000000002'
const bob = '00000000-0000-7000-8000-000000000003'

function groupPayload(
  options: { active?: number; admins?: number; members?: number; visibleFrom?: number } = {},
) {
  const notices: Record<string, unknown>[] = []
  let memberLeft = false
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] }
    if (text.startsWith('SELECT c.* FROM conversations'))
      return { rows: [{ kind: 'group', status: 'active' }] }
    if (text.startsWith('SELECT role,left_at')) {
      if (values[1] === alice) return { rows: [{ role: 'admin', left_at: null }] }
      if (options.active === 100) return { rows: [] }
      return { rows: [{ role: 'member', left_at: null }] }
    }
    if (text.startsWith('SELECT role FROM conversation_memberships'))
      return { rows: [{ role: 'admin' }] }
    if (text.includes("role='admin'")) return { rows: [{ count: options.admins ?? 1 }] }
    if (text.startsWith('SELECT count(*)::int AS count FROM conversation_memberships'))
      return { rows: [{ count: memberLeft ? 0 : (options.active ?? 2) }] }
    if (text.startsWith('UPDATE conversation_memberships SET left_at')) {
      memberLeft = true
      return { rows: [] }
    }
    if (text.startsWith('SELECT next_message_sequence'))
      return { rows: [{ next_message_sequence: 8 }] }
    if (text.startsWith('UPDATE conversations SET next_message_sequence'))
      return { rows: [{ sequence_number: 8 }] }
    if (text.startsWith('INSERT INTO messages')) {
      const row = { kind: 'system', system_event: values[4], sequence_number: values[2] }
      notices.push(row)
      return { rows: [row] }
    }
    if (text.startsWith('SELECT cm.visible_from_sequence'))
      return { rows: [{ visible_from_sequence: options.visibleFrom ?? 8 }] }
    if (text.includes('FROM messages m LEFT JOIN'))
      return { rows: [{ sequence_number: options.visibleFrom ?? 8, kind: 'system' }] }
    return { rows: [] }
  })
  return {
    db: { pool: { connect: async () => ({ query, release: vi.fn() }), query } },
    query,
    notices,
  }
}

describe('COMM-07D group administration', () => {
  it('migrates durable roles, visibility boundary, and system message shape', async () => {
    const execute = vi.fn(async (_statement: unknown) => undefined)
    await up({ db: { execute } } as never)
    const schema = JSON.stringify(execute.mock.calls[0][0])
    expect(schema).toContain('visible_from_sequence')
    expect(schema).toContain("'admin','member'")
    expect(schema).toContain("'member','system'")
    expect(schema).toContain('system_messages_immutable')
  })

  it('returns 409 when a sole admin tries to leave a non-empty group', async () => {
    await expect(
      administerGroupConversation(groupPayload() as never, {
        siteId: site,
        conversationId: 'g',
        actorMemberId: alice,
        action: 'leave',
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'LAST_OWNER',
    } satisfies Partial<ConversationError>)
  })

  it('returns 422 for the 101st group member invite', async () => {
    await expect(
      administerGroupConversation(groupPayload({ active: 100 }) as never, {
        siteId: site,
        conversationId: 'g',
        actorMemberId: alice,
        action: 'invite',
        targetMemberId: bob,
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'GROUP_MEMBER_LIMIT',
    } satisfies Partial<ConversationError>)
  })

  it('appends immutable system notices for membership changes', async () => {
    const p = groupPayload({ active: 3, admins: 2 })
    const result = await administerGroupConversation(p as never, {
      siteId: site,
      conversationId: 'g',
      actorMemberId: alice,
      action: 'remove',
      targetMemberId: bob,
    })
    expect(result.notice).toMatchObject({ kind: 'system', system_event: 'member_removed' })
    expect(p.query.mock.calls.some(([text]) => text.startsWith('INSERT INTO messages'))).toBe(true)
  })

  it('only returns messages at or after the joining sequence boundary', async () => {
    const p = groupPayload({ visibleFrom: 8 })
    const messages = await listConversationMessages(p as never, {
      siteId: site,
      conversationId: 'g',
      memberId: bob,
    })
    expect(messages).toEqual([{ sequence_number: 8, kind: 'system' }])
    const messageQuery = p.query.mock.calls.find(([text]) =>
      text.includes('FROM messages m LEFT JOIN'),
    )
    expect(messageQuery?.[1]).toEqual(['g', 8])
  })

  it('archives the group when its final participant leaves and rejects future writes', async () => {
    const p = groupPayload({ active: 1, admins: 1 })
    await administerGroupConversation(p as never, {
      siteId: site,
      conversationId: 'g',
      actorMemberId: alice,
      action: 'leave',
    })
    expect(p.query.mock.calls.some(([text]) => text.includes("status='archived'"))).toBe(true)
  })

  it('makes an archived empty group read-only', async () => {
    const query = vi.fn(async (text: string) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] }
      if (text.includes('conversation_memberships') && text.includes('FOR SHARE'))
        return { rows: [{ status: 'archived' }] }
      return { rows: [] }
    })
    const p = { db: { pool: { connect: async () => ({ query, release: vi.fn() }) } } }
    await expect(
      sendConversationMessage(p as never, {
        siteId: site,
        conversationId: 'g',
        senderId: alice,
        body: 'nope',
        idempotencyKey: 'archived',
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONVERSATION_ARCHIVED',
    } satisfies Partial<ConversationError>)
  })
})
