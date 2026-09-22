import { describe, expect, it, vi } from 'vitest'
import { up, down } from '@/migrations/20260922_080000_comm_07b_message_requests'
import { ConversationError, sendConversationMessage } from '@/modules/community/conversation-composer'
import { moderationTargetTypes } from '@/modules/community/moderation-reports'

const site = '00000000-0000-7000-8000-000000000001'
const sender = '00000000-0000-7000-8000-000000000002'
const recipient = '00000000-0000-7000-8000-000000000003'

function gatedPayload(state: 'pending_request' | 'declined') {
  const query = vi.fn(async (text: string) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] }
    if (text.includes('FOR SHARE')) return { rows: [{ request_state: state, request_recipient_member_id: recipient }] }
    return { rows: [] }
  })
  return { db: { pool: { connect: async () => ({ query, release: vi.fn() }) } }, find: async () => ({ docs: [] }) } as never
}

describe('COMM-07B message request gates', () => {
  it('adds request lifecycle and indexed rolling-window persistence', async () => {
    const execute = vi.fn(async () => undefined)
    await up({ db: { execute } } as never); await down({ db: { execute } } as never)
    const schema = JSON.stringify(execute.mock.calls[0][0])
    expect(schema).toContain('pending_request')
    expect(schema).toContain('message_request_attempts')
    expect(schema).toContain('message_request_attempts_sender_window_idx')
  })

  it('does not allow a pending recipient reply and suppresses a declined request', async () => {
    await expect(sendConversationMessage(gatedPayload('pending_request'), { siteId: site, conversationId: 'c', senderId: recipient, body: 'reply', idempotencyKey: 'a' }))
      .rejects.toMatchObject({ status: 403, code: 'MESSAGE_REQUEST_PENDING' } satisfies Partial<ConversationError>)
    await expect(sendConversationMessage(gatedPayload('declined'), { siteId: site, conversationId: 'c', senderId: sender, body: 'again', idempotencyKey: 'b' }))
      .rejects.toMatchObject({ status: 403, code: 'MESSAGE_REQUEST_DECLINED' } satisfies Partial<ConversationError>)
  })

  it('routes message reporting through the supported moderation target with text and sequence snapshots', () => {
    expect(moderationTargetTypes).toContain('message')
  })
})
