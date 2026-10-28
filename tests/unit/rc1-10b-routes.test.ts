import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ findByID: vi.fn(), addComment: vi.fn(), getPayload: vi.fn() }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: state.getPayload }))
vi.mock('@/modules/identity/member-identity', () => ({
  verifyCsrf: (headers: Headers) => headers.get('x-member-csrf') === 'valid',
}))
vi.mock('@/modules/community/discussion-operations', () => ({
  discussionRequestSite: async () => true,
}))
vi.mock('@/modules/public/registered-collections', () => ({ isRegisteredCollection: () => true }))
vi.mock('@/modules/community/service', () => ({
  resolveCommunityActor: async () => ({ kind: 'member', memberId: 'alice' }),
  addComment: state.addComment,
  CommunityError: class extends Error {},
}))

import { POST as comment } from '@/app/(frontend)/api/community/comments/route'
import { POST as reply } from '@/app/(frontend)/api/community/posts/route'
import { POST as thread } from '@/app/(frontend)/api/community/threads/route'

beforeEach(() => {
  vi.clearAllMocks()
  state.getPayload.mockResolvedValue({ findByID: state.findByID })
})

describe('discussion HTTP boundaries', () => {
  it.each([reply, thread])(
    'rejects a missing CSRF token before loading the database',
    async (handler) => {
      const response = await handler(new Request('http://localhost', { method: 'POST' }))
      expect(response.status).toBe(403)
      expect(state.getPayload).not.toHaveBeenCalled()
    },
  )

  it.each(['draft', 'archived'])('rejects %s article comments before writing', async (status) => {
    state.findByID.mockResolvedValue({ site: 'site-a', status, commentsPolicy: 'open' })
    const response = await comment(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'x-member-csrf': 'valid', 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 'site-a', attachedToId: 'article-a', body: 'comment' }),
      }),
    )
    expect(response.status).toBe(404)
    expect(state.addComment).not.toHaveBeenCalled()
  })
})
