import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ find: vi.fn(), grant: vi.fn() }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({ auth: async () => ({ user: { id: 'staff' } }), find: mocks.find }),
}))
vi.mock('../../src/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: mocks.grant,
}))
vi.mock('../../src/modules/commerce/payment-provider', () => ({
  configuredPaymentProvider: vi.fn(),
}))
import { GET } from '../../src/app/(frontend)/api/admin/commerce/dashboard/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.grant.mockResolvedValue({
    authorized: true,
    isGlobalOwner: false,
    authorizedSiteIds: ['allowed'],
  })
  mocks.find.mockImplementation(async ({ collection }) => ({
    docs: collection === 'merchant-connections' ? [{ id: 'allowed-merchant' }] : [],
    totalDocs: 0,
    hasNextPage: false,
  }))
})

it('scopes failed webhooks and quarantined cases when staff omit a site filter', async () => {
  const response = await GET(new Request('http://localhost/api/admin/commerce/dashboard'))
  expect(response.status).toBe(200)
  const calls = mocks.find.mock.calls.map(([input]) => input)
  expect(calls.find((call) => call.collection === 'payment-webhook-events').where).toEqual({
    and: [
      { processingState: { in: ['failed', 'gap'] } },
      { merchantConnection: { in: ['allowed-merchant'] } },
    ],
  })
  expect(calls.find((call) => call.collection === 'commerce-reconciliation-cases').where).toEqual({
    and: [{ site: { in: ['allowed'] } }, { status: { equals: 'quarantined' } }],
  })
})

it('rejects a foreign site before querying business records', async () => {
  expect(
    (await GET(new Request('http://localhost/api/admin/commerce/dashboard?siteId=foreign'))).status,
  ).toBe(403)
  expect(mocks.find).not.toHaveBeenCalled()
})

it('keeps a zero-merchant staff scope empty rather than removing its filter', async () => {
  mocks.find.mockResolvedValue({ docs: [], totalDocs: 0, hasNextPage: false })
  await GET(new Request('http://localhost/api/admin/commerce/dashboard'))
  const webhook = mocks.find.mock.calls
    .map(([input]) => input)
    .find((call) => call.collection === 'payment-webhook-events')
  expect(webhook.where.and[1].merchantConnection.in).toEqual([
    '00000000-0000-0000-0000-000000000000',
  ])
})
