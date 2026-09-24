import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST as dispatchPost } from '@/app/(frontend)/api/admin/social/dispatch/route'
import { GET as accountsGet } from '@/app/(frontend)/api/admin/social/accounts/route'
import { GET as analyticsGet } from '@/app/(frontend)/api/admin/social/analytics/route'

vi.mock('@payload-config', () => ({
  default: Promise.resolve({}),
}))

let mockUser: { id: string; role: string } | null = { id: 'usr-admin-1', role: 'administrator' }
let mockFindDocs: any[] = []

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    auth: vi.fn(async () => ({ user: mockUser })),
    find: vi.fn(async () => ({ docs: mockFindDocs })),
  })),
}))

describe('Social Distribution Admin API Routes', () => {
  beforeEach(() => {
    mockUser = { id: 'usr-admin-1', role: 'administrator' }
    mockFindDocs = []
  })

  describe('POST /api/admin/social/dispatch', () => {
    it('rejects unauthenticated requests with 403', async () => {
      mockUser = null
      const req = new Request('http://localhost:3000/api/admin/social/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseCopy: 'Test' }),
      })
      const res = await dispatchPost(req)
      expect(res.status).toBe(403)
    })

    it('rejects empty copy payload with 400', async () => {
      const req = new Request('http://localhost:3000/api/admin/social/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseCopy: '' }),
      })
      const res = await dispatchPost(req)
      expect(res.status).toBe(400)
    })

    it('creates canonical post and stages deliveries across target networks', async () => {
      const req = new Request('http://localhost:3000/api/admin/social/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Spring Campaign Launch',
          baseCopy: 'Exciting announcement across all networks!',
          canonicalUrl: 'https://renegadeparty.org/post-1',
          variants: [
            { accountId: 'acc-mastodon-1', network: 'mastodon' },
            {
              accountId: 'acc-bsky-1',
              network: 'bluesky',
              customCopy: 'Short bsky copy',
              isOverridden: true,
            },
            { accountId: 'acc-fb-1', network: 'facebook' },
          ],
        }),
      })

      const res = await dispatchPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.canonicalPost.title).toBe('Spring Campaign Launch')
      expect(data.canonicalPost.variantsCount).toBe(3)
      expect(data.stagedDeliveries).toHaveLength(3)
      expect(data.stagedDeliveries[0].status).toBe('pending')
    })
  })

  describe('GET /api/admin/social/accounts', () => {
    it('returns registered social accounts for staff users', async () => {
      mockFindDocs = [
        {
          id: 'acc-1',
          displayName: 'Mastodon Main',
          network: 'mastodon',
          capabilityState: 'available',
        },
        {
          id: 'acc-2',
          displayName: 'LinkedIn Page',
          network: 'linkedin',
          capabilityState: 'available',
        },
      ]

      const req = new Request('http://localhost:3000/api/admin/social/accounts')
      const res = await accountsGet(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.accounts).toHaveLength(2)
      expect(data.accounts[0].network).toBe('mastodon')
    })

    it('enforces staff role requirement', async () => {
      mockUser = { id: 'usr-subscriber', role: 'subscriber' }
      const req = new Request('http://localhost:3000/api/admin/social/accounts')
      const res = await accountsGet(req)
      expect(res.status).toBe(403)
    })
  })

  describe('GET /api/admin/social/analytics', () => {
    it('aggregates analytics across tracked external posts', async () => {
      mockFindDocs = [
        {
          id: 'post-del-1',
          network: 'bluesky',
          remoteId: 'at://did:plc:123/app.bsky.feed.post/abc',
          metrics: { impressions: 500, likes: 25, comments: 5, shares: 10, clicks: 15 },
        },
        {
          id: 'post-del-2',
          network: 'mastodon',
          remoteId: 'masto-status-999',
          metrics: { impressions: 1500, likes: 75, comments: 15, shares: 30, clicks: 45 },
        },
      ]

      const req = new Request(
        'http://localhost:3000/api/admin/social/analytics?canonicalPostId=canon-1',
      )
      const res = await analyticsGet(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.canonicalPostId).toBe('canon-1')
      expect(data.trackedDeliveriesCount).toBe(2)
      expect(data.aggregate.totalImpressions).toBe(2000)
      expect(data.aggregate.totalLikes).toBe(100)
      expect(data.aggregate.totalComments).toBe(20)
      expect(data.aggregate.totalShares).toBe(40)
      expect(data.aggregate.totalClicks).toBe(60)
      // Total engagements: 100 + 20 + 40 + 60 = 220 / 2000 * 100 = 11%
      expect(data.aggregate.overallEngagementRate).toBe(11)
    })
  })
})
