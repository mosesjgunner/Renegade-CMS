import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ payload: {}, schedule: vi.fn(), allowed: vi.fn() }))
vi.mock('payload', () => ({
  getPayload: async () => mocks.payload,
  createLocalReq: async (_input: unknown, payload: unknown) => ({ payload }),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/modules/operations/operator-grants', () => ({
  checkOperatorRecordAccess: mocks.allowed,
}))
vi.mock('@/modules/editorial/persistence', () => ({
  scheduleEditorialPublication: mocks.schedule,
  cancelScheduledPublication: vi.fn(),
}))
import { NextRequest } from 'next/server'
import { POST } from '@/app/(frontend)/api/admin/calendar/schedule/route'

const request = () =>
  new NextRequest('https://local.test/api/admin/calendar/schedule', {
    method: 'POST',
    body: JSON.stringify({
      action: 'schedule',
      sourceId: 'article',
      sourceType: 'article',
      startsAt: '2030-01-01T12:00:00',
      timeZone: 'UTC',
      expectedSequence: 1,
    }),
    headers: { 'content-type': 'application/json' },
  })
describe('calendar canonical approval boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.allowed.mockResolvedValue(true)
    mocks.payload = {
      db: {
        beginTransaction: vi.fn().mockResolvedValue('transaction-1'),
        commitTransaction: vi.fn(),
        rollbackTransaction: vi.fn(),
      },
      jobs: { queue: vi.fn() },
      auth: async () => ({ user: { id: 'owner', role: 'owner' } }),
      findByID: vi.fn().mockResolvedValue({
        id: 'article',
        site: 'site',
        title: 'Article',
        lifecycle: 'approved',
        status: 'draft',
        currentRevisionSequence: 1,
      }),
      create: vi.fn().mockResolvedValue({}),
    }
  })
  it('schedules the canonical approved lifecycle even if a legacy status says draft', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(mocks.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ db: (mocks.payload as any).db }),
      expect.objectContaining({ articleId: 'article', scheduledFor: '2030-01-01T12:00:00.000Z' }),
    )
    expect((mocks.payload as any).create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'calendar-entry-audits',
        data: expect.objectContaining({ article: 'article' }),
        req: expect.objectContaining({ transactionID: 'transaction-1' }),
      }),
    )
    expect((mocks.payload as any).db.commitTransaction).toHaveBeenCalledWith('transaction-1')
  })
  it('rejects a canonical draft even if a legacy status says approved', async () => {
    ;(mocks.payload as any).findByID.mockResolvedValue({
      id: 'article',
      site: 'site',
      title: 'Article',
      lifecycle: 'draft',
      status: 'approved',
      currentRevisionSequence: 1,
    })
    expect((await POST(request())).status).toBe(422)
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
  it('rolls back rather than reporting success when its source audit fails', async () => {
    ;(mocks.payload as any).create.mockRejectedValue(new Error('actual storage failure'))
    expect((await POST(request())).status).toBe(500)
    expect((mocks.payload as any).db.rollbackTransaction).toHaveBeenCalledWith('transaction-1')
    expect((mocks.payload as any).db.commitTransaction).not.toHaveBeenCalled()
  })
})
