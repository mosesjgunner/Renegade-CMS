import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createHmac } from 'node:crypto'
const mocks = vi.hoisted(() => ({ capture: vi.fn(), callback: vi.fn() }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({}) }))
vi.mock('../../src/modules/commerce/site-scope', () => ({
  catalogSiteForHost: async (_payload: unknown, host: string) => {
    if (host !== 'alpha.test') throw new Error('Unknown host')
    return 'site-alpha'
  },
}))
vi.mock('../../src/modules/commerce/referral-lifecycle', () => ({
  sameReferralOrigin: (request: Request) => request.headers.get('origin') === 'http://alpha.test',
  referralCookie: (site: string) => `referral_${site}`,
  captureReferral: mocks.capture,
  recordReferralCallback: mocks.callback,
  referralCode: vi.fn(),
}))
import { POST as conversions } from '../../src/app/(frontend)/api/commerce/affiliate/conversions/route'
import { POST as claim } from '../../src/app/(frontend)/api/commerce/referrals/claim/route'
const secret = 'local-unit-callback-secret-32-characters'
beforeEach(() => {
  vi.clearAllMocks()
  process.env.AFFILIATE_CALLBACK_SECRETS = JSON.stringify({ 'site-alpha': secret })
  mocks.capture.mockResolvedValue({
    claimId: 'claim',
    token: 'token',
    expiresAt: new Date(Date.now() + 10000),
  })
  mocks.callback.mockResolvedValue({ persisted: true, replay: false, payoutState: 'not-executed' })
})
const request = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://alpha.test${path}`, {
    method: 'POST',
    headers: {
      host: 'alpha.test',
      origin: 'http://alpha.test',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
it('requires affirmative consent without persisting a declined referral', async () => {
  const response = await claim(request('/claim', { code: 'REF', consented: false }))
  expect(await response.json()).toMatchObject({ persisted: false, reason: 'CONSENT_REQUIRED' })
  expect(mocks.capture).not.toHaveBeenCalled()
})
it('rejects fabricated program/order/owner fields', async () => {
  expect(
    (await claim(request('/claim', { code: 'REF', consented: true, program: {} }))).status,
  ).toBe(400)
  expect(mocks.capture).not.toHaveBeenCalled()
})
it('rejects foreign origins before capture', async () => {
  expect(
    (
      await claim(
        request('/claim', { code: 'REF', consented: true }, { origin: 'http://foreign.test' }),
      )
    ).status,
  ).toBe(403)
  expect(mocks.capture).not.toHaveBeenCalled()
})
it('captures a consented referral with an HttpOnly cookie through the canonical service', async () => {
  const response = await claim(request('/claim', { code: 'REF', consented: true }))
  expect(response.status).toBe(201)
  expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  expect(mocks.capture).toHaveBeenCalledWith({}, 'site-alpha', 'REF')
})
it('fails closed when callback verification is unconfigured', async () => {
  delete process.env.AFFILIATE_CALLBACK_SECRETS
  expect((await conversions(request('/callback', {}))).status).toBe(503)
  expect(mocks.callback).not.toHaveBeenCalled()
})
it('rejects forged signatures and unknown hosts', async () => {
  expect(
    (await conversions(request('/callback', {}, { 'x-referral-signature': '0'.repeat(64) })))
      .status,
  ).toBe(401)
  expect((await conversions(request('/callback', {}, { host: 'foreign.test' }))).status).toBe(404)
  expect(mocks.callback).not.toHaveBeenCalled()
})
it('passes signed evidence to canonical ingestion without asserting a payout', async () => {
  const body = {
    eventId: 'evt',
    orderId: 'order',
    kind: 'conversion',
    amountMinor: '1000',
    currency: 'USD',
  }
  const raw = JSON.stringify(body)
  const response = await conversions(
    request('/callback', body, {
      'x-referral-signature': createHmac('sha256', secret).update(raw).digest('hex'),
    }),
  )
  expect(response.status).toBe(202)
  expect(await response.json()).toMatchObject({ persisted: true, payoutState: 'not-executed' })
  expect(mocks.callback).toHaveBeenCalledWith({}, 'site-alpha', body, raw)
})
