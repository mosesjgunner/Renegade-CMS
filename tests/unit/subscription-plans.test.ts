import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  member: vi.fn(),
  site: vi.fn(),
  find: vi.fn(),
  readiness: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find: mocks.find }) }))
vi.mock('../../src/modules/identity/member-identity', () => ({
  currentMember: mocks.member,
  readMemberSession: () => 'session',
}))
vi.mock('../../src/modules/commerce/site-scope', () => ({ catalogSiteForHost: mocks.site }))
vi.mock('../../src/modules/commerce/payment-provider', () => ({
  configuredPaymentProvider: () => ({ readiness: mocks.readiness }),
  recurringProvider: (provider: unknown) => provider,
}))
import { GET } from '../../src/app/(frontend)/api/commerce/subscriptions/plans/route'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.member.mockResolvedValue('member')
  mocks.site.mockResolvedValue('site')
  mocks.readiness.mockResolvedValue({ ready: false, reason: 'missing-test-secrets' })
  mocks.find.mockImplementation(async ({ collection }) => ({
    docs:
      collection === 'plan-revisions'
        ? [
            {
              id: 'plan',
              name: 'Membership',
              amountMinor: '1200',
              currency: 'USD',
              providerMappings: { 'stripe-test': 'price_test' },
            },
          ]
        : [{ providerKey: 'stripe-test' }],
  }))
})
it('rejects anonymous access before listing plans', async () => {
  mocks.member.mockResolvedValue(null)
  expect((await GET(new Request('http://localhost/api/commerce/subscriptions/plans'))).status).toBe(
    401,
  )
  expect(mocks.find).not.toHaveBeenCalled()
})
it('reads only published plans and active merchants for the host site', async () => {
  const response = await GET(new Request('http://localhost/api/commerce/subscriptions/plans'))
  const body = await response.json()
  expect(mocks.find.mock.calls.map(([input]) => input.where)).toEqual([
    { and: [{ site: { equals: 'site' } }, { lifecycle: { equals: 'published' } }] },
    { and: [{ site: { equals: 'site' } }, { status: { equals: 'active' } }] },
  ])
  expect(body.plans[0]).toMatchObject({ available: false, reason: 'missing-test-secrets' })
  expect(body.plans[0]).not.toHaveProperty('providerMappings')
})
it('does not fall back to another tenant when host resolution fails', async () => {
  mocks.site.mockRejectedValue(new Error('Unknown host'))
  expect((await GET(new Request('http://foreign/api/commerce/subscriptions/plans'))).status).toBe(
    503,
  )
  expect(mocks.find).not.toHaveBeenCalled()
})
