import { describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260922_020000_comm_04d_forum_topic_operations'

describe('COMM-04D: staff topic operations/search synchronization schema', () => {
  it('adds durable redirects, audit records, ACL projection metadata, and idempotent sync keys', async () => {
    const execute = vi.fn(async (_statement: unknown) => undefined)
    await up({ db: { execute } } as never)
    await down({ db: { execute } } as never)
    const schema = JSON.stringify(execute.mock.calls[0]?.[0])
    expect(schema).toContain('forum_topic_redirects')
    expect(schema).toContain('forum_merge_audit')
    expect(schema).toContain('idempotency_key')
    expect(schema).toContain('acl_metadata')
    expect(schema).toContain("current_setting('renegade.forum_operation'")
  })
})
