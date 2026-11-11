/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  GET,
  POST,
  DELETE,
} from '../../src/app/(frontend)/api/v1/sites/[site_id]/threads/[thread_id]/subscriptions/route'

/**
 * TA-P1-2 regression: thread subscription identity must come from the
 * resolved session actor only. The route previously fell back to a
 * caller-supplied `x-member-id` header when no session resolved, letting
 * anyone read and mutate any member's subscription state unauthenticated
 * — the only route in the tree with that pattern (the sibling comments
 * route rejects the same header with 401, as RC1-10B's spoof check
 * proves). The staff fallback referenced a `userId` the resolver never
 * sets: dead scaffolding.
 */

const { mockActor, mockIsSubscribed, mockSubscribe, mockUnsubscribe } = vi.hoisted(() => ({
  mockActor: vi.fn(),
  mockIsSubscribed: vi.fn(async () => true),
  mockSubscribe: vi.fn(async () => ({ subscribed: true })),
  mockUnsubscribe: vi.fn(async () => ({ subscribed: false })),
}))

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({})),
}))
vi.mock('@/modules/community/service', () => ({
  resolveCommunityActor: mockActor,
}))
vi.mock('@/modules/community/thread-lifecycle', () => ({
  isSubscribedToThread: mockIsSubscribed,
  subscribeToThread: mockSubscribe,
  unsubscribeFromThread: mockUnsubscribe,
}))

const context = {
  params: Promise.resolve({ site_id: 'site-a', thread_id: 'thread-1' }),
}

function request(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/v1/sites/site-a/threads/thread-1/subscriptions', {
    headers,
  })
}

const anonymous = { kind: 'anonymous', memberId: null, isStaff: false }
const member = { kind: 'member', memberId: 'member-1', isStaff: false }

describe('Thread subscriptions — session-only identity (TA-P1-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActor.mockResolvedValue(anonymous)
  })

  it('rejects a header-only read (impersonation) without touching subscription state', async () => {
    const res = await GET(request({ 'x-member-id': 'victim-9' }), context)

    expect(res.status).toBe(401)
    expect(mockIsSubscribed).not.toHaveBeenCalled()
  })

  it('rejects a header-only subscribe without writing', async () => {
    const res = await POST(request({ 'x-member-id': 'victim-9' }), context)

    expect(res.status).toBe(401)
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('rejects a header-only unsubscribe without writing', async () => {
    const res = await DELETE(request({ 'x-member-id': 'victim-9' }), context)

    expect(res.status).toBe(401)
    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })

  it('serves a session member’s own subscription state', async () => {
    mockActor.mockResolvedValue(member)

    const res = await GET(request(), context)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.memberId).toBe('member-1')
    expect(mockIsSubscribed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ memberId: 'member-1', threadId: 'thread-1' }),
    )
  })

  it('ignores the header when a session exists — the session member wins', async () => {
    mockActor.mockResolvedValue(member)

    const res = await POST(request({ 'x-member-id': 'victim-9' }), context)

    expect(res.status).toBe(200)
    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ memberId: 'member-1' }),
    )
  })
})
