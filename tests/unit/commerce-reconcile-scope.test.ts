import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ grant: vi.fn(), queue: vi.fn() }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: async () => ({ user: { id: 'staff' } }),
    jobs: { queue: mocks.queue },
  }),
}))
vi.mock('../../src/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: mocks.grant,
}))
import { POST } from '../../src/app/(frontend)/api/admin/commerce/reconcile/route'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.queue.mockResolvedValue({ id: 'job' })
})
it('queues separate bounded tasks for each staff grant', async () => {
  mocks.grant.mockResolvedValue({
    authorized: true,
    isGlobalOwner: false,
    authorizedSiteIds: ['first', 'second'],
  })
  expect(
    (await POST(new Request('http://localhost/api/admin/commerce/reconcile', { method: 'POST' })))
      .status,
  ).toBe(202)
  expect(mocks.queue.mock.calls.map(([input]) => input.input)).toEqual([
    { siteId: 'first' },
    { siteId: 'second' },
  ])
})
it('does not queue global reconciliation for revoked staff', async () => {
  mocks.grant.mockResolvedValue({ authorized: true, isGlobalOwner: false, authorizedSiteIds: [] })
  expect(
    (await POST(new Request('http://localhost/api/admin/commerce/reconcile', { method: 'POST' })))
      .status,
  ).toBe(403)
  expect(mocks.queue).not.toHaveBeenCalled()
})
