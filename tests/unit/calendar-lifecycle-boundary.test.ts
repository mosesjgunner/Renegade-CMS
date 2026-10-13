import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ payload: {}, schedule: vi.fn(), allowed: vi.fn() }))
vi.mock('payload', () => ({ getPayload: async () => mocks.payload }))
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
      mocks.payload,
      expect.objectContaining({ articleId: 'article', scheduledFor: '2030-01-01T12:00:00.000Z' }),
    )
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
})
