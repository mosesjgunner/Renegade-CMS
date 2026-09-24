import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const auth = vi.fn()
vi.mock('payload', () => ({ getPayload: async () => ({ auth }) }))
vi.mock('@payload-config', () => ({ default: {} }))

import { POST } from '../../src/app/(frontend)/api/admin/commerce/affiliate/route'

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/commerce/affiliate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('SHOP-08 affiliate command boundary', () => {
  beforeEach(() => auth.mockReset())

  it('rejects anonymous projections before reading the body', async () => {
    auth.mockResolvedValue({ user: null })
    const response = await POST(request({ action: 'summarize', ledgers: [] }))
    expect(response.status).toBe(403)
  })

  it('requires administrator authority for approval and export', async () => {
    auth.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
    for (const action of ['approve-batch', 'export-batch']) {
      const response = await POST(request({ action }))
      expect(response.status).toBe(403)
    }
  })

  it('uses the authenticated actor and labels caller supplied approval as projection only', async () => {
    auth.mockResolvedValue({ user: { id: 'owner-1', role: 'owner' } })
    const response = await POST(
      request({
        action: 'approve-batch',
        operatorUser: { id: 'forged-operator', role: 'owner' },
        batch: {
          id: 'batch-1',
          siteId: 'site-1',
          batchNumber: 'BAT-USD-1',
          currency: 'USD',
          totalAmountMinor: '100',
          entriesCount: 1,
          status: 'pending_approval',
          createdAt: '2026-09-23T00:00:00.000Z',
        },
      }),
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.batch.approvedBy).toBe('owner-1')
    expect(body.projectionOnly).toBe(true)
  })

  it('cannot assert an external payout result from client data', async () => {
    auth.mockResolvedValue({ user: { id: 'owner-1', role: 'owner' } })
    const response = await POST(request({ action: 'reconcile-batch', success: true }))
    expect(response.status).toBe(409)
  })
})
