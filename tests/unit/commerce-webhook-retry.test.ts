import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ access: vi.fn(), queue: vi.fn(), find: vi.fn() }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: async () => ({ user: { id: 'operator' } }),
    findByID: mocks.find,
    jobs: { queue: mocks.queue },
  }),
}))
vi.mock('../../src/modules/operations/operator-grants', () => ({
  checkOperatorSiteAccess: mocks.access,
}))
import { POST } from '../../src/app/(frontend)/api/admin/commerce/webhooks/[eventId]/retry/route'
const request = () =>
  POST(
    new Request('http://localhost/api/admin/commerce/webhooks/event/retry', { method: 'POST' }),
    { params: Promise.resolve({ eventId: 'event' }) },
  )
beforeEach(() => {
  vi.clearAllMocks()
  mocks.access.mockResolvedValue(true)
  mocks.queue.mockResolvedValue({ id: 'job' })
  mocks.find.mockImplementation(async ({ collection }) =>
    collection === 'payment-webhook-events'
      ? {
          id: 'event',
          merchantConnection: 'merchant',
          verifiedAt: '2026-10-08',
          payloadHash: 'verified-hash',
          processingState: 'failed',
          sanitizedEvidence: { attemptId: 'attempt' },
        }
      : collection === 'merchant-connections'
        ? { id: 'merchant', site: 'site' }
        : { id: 'attempt', site: 'site', merchantConnection: 'merchant' },
  )
})
it('queues the verified event without changing its payment records', async () => {
  expect((await request()).status).toBe(202)
  expect(mocks.queue).toHaveBeenCalledWith({
    task: 'commerce-process-payment-event',
    input: { webhookEventId: 'event', requestedBy: 'operator' },
    queue: 'commerce',
  })
})
it('denies a foreign operator before queueing', async () => {
  mocks.access.mockResolvedValue(false)
  expect((await request()).status).toBe(403)
  expect(mocks.queue).not.toHaveBeenCalled()
})
it('rejects a mismatched payment attempt', async () => {
  const original = mocks.find.getMockImplementation()!
  mocks.find.mockImplementation(async (input) =>
    input.collection === 'payment-attempts'
      ? { site: 'foreign', merchantConnection: 'merchant' }
      : original(input),
  )
  expect((await request()).status).toBe(409)
  expect(mocks.queue).not.toHaveBeenCalled()
})
it('does not replay a processed event', async () => {
  const original = mocks.find.getMockImplementation()!
  mocks.find.mockImplementation(async (input) =>
    input.collection === 'payment-webhook-events'
      ? { ...(await original(input)), processingState: 'processed' }
      : original(input),
  )
  expect((await request()).status).toBe(409)
  expect(mocks.queue).not.toHaveBeenCalled()
})
