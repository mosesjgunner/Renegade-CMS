import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: string },
  find: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
  reconcile: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: async () => ({ user: state.user }),
    find: state.find,
    findByID: state.findByID,
    update: state.update,
  }),
}))
vi.mock('../../src/modules/public/site-scope', () => ({ samePublicOrigin: async () => true }))
vi.mock('../../src/modules/editorial/scheduler', () => ({
  sanitizeErrorLog: (value: unknown) => value,
  reconcileScheduleWorkerJobs: state.reconcile,
}))
import { GET, POST } from '../../src/app/(frontend)/api/admin/schedule-health/route'
import { NextRequest } from 'next/server'

beforeEach(() => {
  state.user = null
  state.find.mockReset().mockResolvedValue({ docs: [] })
  state.findByID.mockReset()
  state.update.mockReset()
  state.reconcile.mockReset().mockResolvedValue({ processedCount: 0 })
})
const request = (body: object) =>
  new NextRequest('http://localhost/api/admin/schedule-health', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
describe('schedule recovery authorization', () => {
  it('denies anonymous reads and mutations before querying jobs', async () => {
    expect((await GET(new NextRequest('http://localhost/api/admin/schedule-health'))).status).toBe(
      403,
    )
    expect((await POST(request({ action: 'reconcile' }))).status).toBe(403)
    expect(state.find).not.toHaveBeenCalled()
    expect(state.reconcile).not.toHaveBeenCalled()
  })
  it('uses site-scoped collection access for operator listing and reconciliation', async () => {
    state.user = { id: 'admin-a', role: 'administrator' }
    const response = await GET(new NextRequest('http://localhost/api/admin/schedule-health'))
    expect(response.status).toBe(200)
    expect((await response.json()).workerHealth).toMatchObject({
      status: 'unknown',
      activeWorkerId: null,
      lastHeartbeat: null,
    })
    expect(state.find).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, user: state.user }),
    )
    expect((await POST(request({ action: 'reconcile', workerId: 'forged' }))).status).toBe(200)
    expect(state.reconcile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        user: state.user,
        workerId: expect.not.stringMatching(/^forged$/),
      }),
    )
  })
  it('rejects staff mutation and a foreign job that collection access denies', async () => {
    state.user = { id: 'staff-a', role: 'staff' }
    expect((await POST(request({ action: 'retry', jobId: 'foreign' }))).status).toBe(403)
    state.user = { id: 'admin-a', role: 'administrator' }
    state.findByID.mockRejectedValue(new Error('forbidden'))
    expect((await POST(request({ action: 'retry', jobId: 'foreign' }))).status).toBe(404)
    expect(state.update).not.toHaveBeenCalled()
  })
  it('refuses to reset a completed job', async () => {
    state.user = { id: 'owner', role: 'owner' }
    state.findByID.mockResolvedValue({ status: 'completed' })
    expect((await POST(request({ action: 'retry', jobId: 'done' }))).status).toBe(409)
    expect(state.update).not.toHaveBeenCalled()
  })
})
