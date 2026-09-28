import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.fn()
const find = vi.fn()
const findByID = vi.fn()
const create = vi.fn()
const update = vi.fn()
const count = vi.fn()
const queue = vi.fn().mockResolvedValue({ id: 'job-reconcile-1' })

const mockPayload = {
  auth,
  find,
  findByID,
  create,
  update,
  count,
  jobs: {
    queue,
  },
}

vi.mock('payload', () => ({
  getPayload: async () => mockPayload,
}))

vi.mock('@payload-config', () => ({
  default: {},
}))

const mockProviderRefund = vi.fn().mockResolvedValue({
  providerRefundReference: 'ref-ext-101',
  state: 'succeeded',
  amountMinor: '2500',
})

vi.mock('@/modules/commerce/payment-provider', () => ({
  configuredPaymentProvider: vi.fn(() => ({
    readiness: async () => ({
      ready: true,
      health: 'healthy',
      mode: 'sandbox',
      limitations: 'Test environment: no real fiat settlement.',
    }),
    refund: mockProviderRefund,
  })),
  PaymentProviderError: class extends Error {
    code: string
    retryable: boolean
    outcomeKnown: boolean
    constructor(code: string, message: string, retryable = false, outcomeKnown = true) {
      super(message)
      this.code = code
      this.retryable = retryable
      this.outcomeKnown = outcomeKnown
    }
  },
}))

import { GET as dashboardGet } from '../../src/app/(frontend)/api/admin/commerce/dashboard/route'
import { POST as reconcilePost } from '../../src/app/(frontend)/api/admin/commerce/reconcile/route'
import { POST as refundsPost } from '../../src/app/(frontend)/api/admin/commerce/refunds/route'
import {
  GET as disputesGet,
  PATCH as disputesPatch,
} from '../../src/app/(frontend)/api/admin/commerce/disputes/route'
import {
  GET as fulfillmentGet,
  POST as fulfillmentPost,
} from '../../src/app/(frontend)/api/admin/commerce/fulfillment/route'

describe('COMMERCE-OPERATIONS-STATES: 1.0 Admin Workflow Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queue.mockResolvedValue({ id: 'job-reconcile-1' })
  })

  describe('1. Dashboard Authorization & Invariants', () => {
    it('rejects unauthorized requests with 403', async () => {
      auth.mockResolvedValue({ user: null })
      const request = new Request('http://localhost/api/admin/commerce/dashboard')
      const response = await dashboardGet(request)
      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized.')
    })

    it('rejects non-staff roles with 403', async () => {
      auth.mockResolvedValue({ user: { id: 'u-1', role: 'member' } })
      const request = new Request('http://localhost/api/admin/commerce/dashboard')
      const response = await dashboardGet(request)
      expect(response.status).toBe(403)
    })

    it('returns dashboard data for staff and includes non-settlement disclaimer', async () => {
      auth.mockResolvedValue({
        user: { id: 'staff-1', role: 'staff', adminSites: [{ id: 'site-1' }] },
      })
      find.mockImplementation(async ({ collection }: { collection: string }) => {
        if (collection === 'payment-attempts') {
          return {
            docs: [
              {
                id: 'attempt-1',
                state: 'succeeded',
                amountMinor: '2500',
                currency: 'USD',
                createdAt: new Date().toISOString(),
                providerKey: 'stripe',
                lastReconciledAt: new Date().toISOString(),
              },
              {
                id: 'attempt-2',
                state: 'unknown',
                amountMinor: '5000',
                currency: 'USD',
                createdAt: new Date().toISOString(),
                providerKey: 'stripe',
              },
            ],
            totalDocs: 2,
            hasNextPage: false,
          }
        }
        return { docs: [], totalDocs: 0, hasNextPage: false }
      })

      const request = new Request('http://localhost/api/admin/commerce/dashboard?siteId=site-1')
      const response = await dashboardGet(request)
      expect(response.status).toBe(200)
      const body = await response.json()

      // Mandatory non-settlement disclosure invariant
      expect(body.disclaimer).toContain('Operational ledger totals')
      expect(body.disclaimer).toContain('not certified accounting or provider settlement balances')

      // Verifies provider health
      expect(body.health).toEqual([
        expect.objectContaining({
          providerKey: 'stripe',
          ready: true,
          health: 'healthy',
        }),
      ])

      // Verifies unknown attempt generates safe action: reconcile
      expect(body.pendingActions).toEqual([
        expect.objectContaining({
          id: 'attempt-2',
          state: 'unknown',
          safeActions: ['reconcile'],
        }),
      ])
    })
  })

  describe('2. State Categorization & Distinctions', () => {
    it('distinguishes local, pending, provider-confirmed, failed, refunded, and reversed states', async () => {
      auth.mockResolvedValue({ user: { id: 'owner-1', role: 'owner' } })
      find.mockImplementation(async ({ collection }: { collection: string }) => {
        if (collection === 'payment-attempts') {
          return {
            docs: [
              {
                id: 'att-1',
                state: 'draft',
                amountMinor: '1000',
                currency: 'USD',
                createdAt: new Date().toISOString(),
                providerKey: 'offline',
              },
              {
                id: 'att-2',
                state: 'processing',
                amountMinor: '2000',
                currency: 'USD',
                createdAt: new Date().toISOString(),
                providerKey: 'stripe',
              },
              {
                id: 'att-3',
                state: 'succeeded',
                amountMinor: '3000',
                currency: 'USD',
                createdAt: new Date().toISOString(),
                providerKey: 'stripe',
              },
              {
                id: 'att-4',
                state: 'failed',
                amountMinor: '4000',
                currency: 'USD',
                createdAt: new Date().toISOString(),
                providerKey: 'stripe',
              },
              {
                id: 'att-5',
                state: 'refunded',
                amountMinor: '1500',
                currency: 'USD',
                createdAt: new Date().toISOString(),
                providerKey: 'stripe',
              },
              {
                id: 'att-6',
                state: 'disputed',
                amountMinor: '5000',
                currency: 'USD',
                createdAt: new Date().toISOString(),
                providerKey: 'stripe',
              },
            ],
            totalDocs: 6,
            hasNextPage: false,
          }
        }
        if (collection === 'commerce-refunds') {
          return {
            docs: [
              {
                id: 'ref-1',
                state: 'settled',
                amountMinor: '1500',
                currency: 'USD',
                createdAt: new Date().toISOString(),
              },
            ],
            totalDocs: 1,
          }
        }
        if (collection === 'commerce-disputes') {
          return {
            docs: [
              {
                id: 'disp-1',
                state: 'open',
                amountMinor: '5000',
                currency: 'USD',
                deadlineAt: '2026-10-01T00:00:00.000Z',
              },
            ],
            totalDocs: 1,
          }
        }
        return { docs: [], totalDocs: 0, hasNextPage: false }
      })

      const request = new Request('http://localhost/api/admin/commerce/dashboard')
      const response = await dashboardGet(request)
      const body = await response.json()

      expect(body.summary.counts['draft']).toBe(1)
      expect(body.summary.counts['processing']).toBe(1)
      expect(body.summary.counts['succeeded']).toBe(1)
      expect(body.summary.counts['failed']).toBe(1)
      expect(body.summary.counts['refunded']).toBe(1)
      expect(body.summary.counts['disputed']).toBe(1)

      expect(body.refunds.length).toBe(1)
      expect(body.disputes.length).toBe(1)
      expect(body.disputes[0].state).toBe('open')
    })
  })

  describe('3. Disclosures, Constraints & Scope Reporting', () => {
    it('discloses tax/deductibility constraints, analytics latency, and provider limitations', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      find.mockImplementation(async ({ collection }: { collection: string }) => {
        if (collection === 'payment-attempts') {
          return {
            docs: [
              {
                id: 'att-1',
                state: 'failed',
                amountMinor: '1000',
                currency: 'USD',
                createdAt: new Date().toISOString(),
                providerKey: 'stripe-test',
              },
            ],
            totalDocs: 1,
            hasNextPage: false,
          }
        }
        return { docs: [], totalDocs: 0, hasNextPage: false }
      })

      const request = new Request('http://localhost/api/admin/commerce/dashboard?dateRange=7d')
      const response = await dashboardGet(request)
      expect(response.status).toBe(200)
      const body = await response.json()

      // Scope validation
      expect(body.summaryScope.dateRange).toBe('7d')
      expect(body.summaryScope.dateFrom).toBeDefined()
      expect(body.summaryScope.dateTo).toBeDefined()

      // Detailed Disclosures
      expect(body.disclosures.nonSettlement).toContain('Operational ledger totals')
      expect(body.disclosures.taxAndDeductibility).toContain(
        'Direct donations, memberships, and digital orders are not tax-deductible',
      )
      expect(body.disclosures.analyticsLatency).toContain(
        'Attribution funnels and conversion rollups reflect pipeline batching latency',
      )
      expect(body.disclosures.providerLimitations).toContain('Provider sandbox mode enabled')

      // Failed attempt provides inspect & retry actions
      expect(body.pendingActions[0].safeActions).toEqual(['retry', 'inspect'])
    })
  })

  describe('4. Reconciliation & Webhook Replay', () => {
    it('queues general reconciliation when requested by staff', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      const request = new Request('http://localhost/api/admin/commerce/reconcile', {
        method: 'POST',
      })
      const response = await reconcilePost(request)
      expect(response.status).toBe(202)
      const body = await response.json()
      expect(body.queued).toBe(true)
      expect(body.jobId).toBeDefined()
    })

    it('queues single-attempt reconciliation', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      findByID.mockResolvedValueOnce({
        id: 'att-target-1',
        site: 'site-1',
      })

      const request = new Request('http://localhost/api/admin/commerce/reconcile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attemptId: 'att-target-1' }),
      })
      const response = await reconcilePost(request)
      expect(response.status).toBe(202)
      const body = await response.json()
      expect(body.queued).toBe(true)
      expect(body.attemptId).toBe('att-target-1')
      expect(queue).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'commerce-reconcile-payments',
          input: expect.objectContaining({ attemptId: 'att-target-1' }),
        }),
      )
    })

    it('replays failed webhook event by resetting state and queuing task', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      findByID.mockResolvedValueOnce({
        id: 'wh-failed-1',
        processingState: 'failed',
        merchantConnection: { site: 'site-1' },
      })

      const request = new Request('http://localhost/api/admin/commerce/reconcile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ webhookEventId: 'wh-failed-1' }),
      })
      const response = await reconcilePost(request)
      expect(response.status).toBe(202)
      const body = await response.json()
      expect(body.queued).toBe(true)
      expect(body.webhookEventId).toBe('wh-failed-1')

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'payment-webhook-events',
          id: 'wh-failed-1',
          data: { processingState: 'received', lastError: null },
        }),
      )
      expect(queue).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'commerce-process-payment-event',
          input: { webhookEventId: 'wh-failed-1' },
        }),
      )
    })
  })

  describe('5. Refund Retries, Dual Control & Entitlement Revocation', () => {
    it('executes full refund and revokes digital delivery grants and entitlements', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      findByID.mockImplementation(async ({ collection }: { collection: string }) => {
        if (collection === 'orders') {
          return {
            id: 'ord-100',
            orderNumber: 'ORD-100',
            amountMinor: '2500',
            currency: 'USD',
            state: 'paid',
            site: 'site-1',
            checkoutSession: 'cs-1',
            receipt: { receiptNumber: 'RCP-100' },
            partySnapshot: { email: 'buyer@example.com' },
          }
        }
        if (collection === 'commerce-refunds') {
          return {
            id: 'ref-100',
            order: {
              id: 'ord-100',
              orderNumber: 'ORD-100',
              amountMinor: '2500',
              currency: 'USD',
              state: 'paid',
              site: 'site-1',
              receipt: { receiptNumber: 'RCP-100' },
              partySnapshot: { email: 'buyer@example.com' },
            },
            paymentAttempt: {
              id: 'att-100',
              providerKey: 'stripe-test',
              providerPaymentReference: 'pi_test_123',
            },
            amountMinor: '2500',
            currency: 'USD',
            idempotencyKey: 'refund:ord-100:1:2500',
            state: 'previewed',
            downstreamPolicy: { entitlement: 'revoke-after-provider-success' },
          }
        }
        return null
      })

      find.mockImplementation(
        async ({ collection, where }: { collection: string; where?: any }) => {
          if (collection === 'payment-attempts') {
            return {
              docs: [
                {
                  id: 'att-100',
                  providerPaymentReference: 'pi_test_123',
                  providerKey: 'stripe-test',
                },
              ],
            }
          }
          if (collection === 'commerce-refunds') {
            if (where?.and?.some((w: any) => w?.state?.equals === 'succeeded')) {
              return {
                docs: [{ id: 'ref-100', amountMinor: '2500', state: 'succeeded' }],
                totalDocs: 1,
              }
            }
            return { docs: [], totalDocs: 0 }
          }
          if (collection === 'digital-delivery-grants') {
            return { docs: [{ id: 'ddg-1', order: 'ord-100', state: 'active' }], totalDocs: 1 }
          }
          if (collection === 'entitlements') {
            return {
              docs: [{ id: 'ent-1', source: 'ord-100', capability: 'download' }],
              totalDocs: 1,
            }
          }
          return { docs: [], totalDocs: 0 }
        },
      )

      create.mockResolvedValue({ id: 'ref-100', state: 'previewed' })
      update.mockImplementation(async ({ data }: any) => ({ ...data, id: 'ref-100' }))

      const request = new Request('http://localhost/api/admin/commerce/refunds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'request',
          orderId: 'ord-100',
          amountMinor: '2500',
          reason: 'Customer return requested',
        }),
      })

      const response = await refundsPost(request)
      expect(response.status).toBe(200)

      // Verifies entitlement revocation
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'digital-delivery-grants',
          id: 'ddg-1',
          data: { state: 'revoked' },
        }),
      )
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'entitlements',
          id: 'ent-1',
          data: expect.objectContaining({ revokedAt: expect.any(String) }),
        }),
      )
    })

    it('retries a previously failed or unknown refund', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      findByID.mockImplementation(async ({ collection }: { collection: string }) => {
        if (collection === 'commerce-refunds') {
          return {
            id: 'ref-failed-1',
            state: 'failed',
            order: { id: 'ord-1', amountMinor: '2500', currency: 'USD', site: 'site-1' },
            paymentAttempt: {
              id: 'att-1',
              providerKey: 'stripe-test',
              providerPaymentReference: 'pi_123',
            },
            amountMinor: '2500',
            currency: 'USD',
            idempotencyKey: 'refund:ord-1:1:2500',
          }
        }
        if (collection === 'orders') {
          return { id: 'ord-1', site: 'site-1' }
        }
        return null
      })
      find.mockResolvedValue({ docs: [], totalDocs: 0 })
      update.mockImplementation(async ({ data }: any) => ({ ...data, id: 'ref-failed-1' }))

      const request = new Request('http://localhost/api/admin/commerce/refunds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'retry',
          refundId: 'ref-failed-1',
        }),
      })

      const response = await refundsPost(request)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.refund).toBeDefined()
      expect(mockProviderRefund).toHaveBeenCalled()
    })
  })

  describe('6. Disputes Lifecycle & Resolution', () => {
    it('lists disputes and submits operator evidence', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      find.mockResolvedValueOnce({
        docs: [
          {
            id: 'disp-1',
            state: 'open',
            amountMinor: '5000',
            currency: 'USD',
            providerDisputeReference: 'dp_123',
            site: 'site-1',
          },
        ],
        totalDocs: 1,
      })

      const getReq = new Request('http://localhost/api/admin/commerce/disputes?siteId=site-1')
      const getRes = await disputesGet(getReq)
      expect(getRes.status).toBe(200)
      const getBody = await getRes.json()
      expect(getBody.disputes.length).toBe(1)
      expect(getBody.disputes[0].state).toBe('open')

      findByID.mockResolvedValueOnce({
        id: 'disp-1',
        state: 'open',
        site: 'site-1',
        auditLog: [],
      })
      update.mockResolvedValueOnce({
        id: 'disp-1',
        state: 'under-review',
      })

      const patchReq = new Request('http://localhost/api/admin/commerce/disputes?siteId=site-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          disputeId: 'disp-1',
          action: 'submit-evidence',
          evidenceText:
            'Customer received verified digital download with IP matching billing address.',
        }),
      })
      const patchRes = await disputesPatch(patchReq)
      expect(patchRes.status).toBe(200)
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'commerce-disputes',
          id: 'disp-1',
          data: expect.objectContaining({
            state: 'under-review',
          }),
        }),
      )
    })

    it('resolves won dispute by restoring paid order state', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      findByID.mockImplementation(async ({ collection }: { collection: string }) => {
        if (collection === 'commerce-disputes') {
          return {
            id: 'disp-1',
            state: 'under-review',
            site: 'site-1',
            order: 'ord-1',
            auditLog: [],
          }
        }
        if (collection === 'orders') {
          return { id: 'ord-1', state: 'exception', site: 'site-1', transitionLog: [] }
        }
        return null
      })
      update.mockImplementation(async ({ data }: any) => ({ ...data, id: 'updated-1' }))

      const request = new Request('http://localhost/api/admin/commerce/disputes?siteId=site-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          disputeId: 'disp-1',
          action: 'update-status',
          state: 'won',
        }),
      })
      const response = await disputesPatch(request)
      expect(response.status).toBe(200)
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'orders',
          id: 'ord-1',
          data: expect.objectContaining({ state: 'paid', exception: null }),
        }),
      )
    })
  })

  describe('7. Distribution Jobs (POD & Manual Fulfillment)', () => {
    it('lists fulfillment jobs and allows hold release and job retries', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      find.mockImplementation(async ({ collection }: { collection: string }) => {
        if (collection === 'pod-jobs') {
          return {
            docs: [{ id: 'job-1', state: 'on_hold', site: 'site-1' }],
            totalDocs: 1,
          }
        }
        if (collection === 'manual-fulfillment-packages') {
          return {
            docs: [{ id: 'pkg-1', status: 'pending_acknowledgement', site: 'site-1' }],
            totalDocs: 1,
          }
        }
        if (collection === 'pod-connections') {
          return {
            docs: [{ id: 'conn-1', providerKey: 'pod-emulator', status: 'active' }],
            totalDocs: 1,
          }
        }
        return { docs: [], totalDocs: 0 }
      })

      const getReq = new Request('http://localhost/api/admin/commerce/fulfillment?siteId=site-1')
      const getRes = await fulfillmentGet(getReq)
      expect(getRes.status).toBe(200)
      const getBody = await getRes.json()
      expect(getBody.jobs.length).toBe(1)
      expect(getBody.manualPackages.length).toBe(1)
      expect(getBody.connections.length).toBe(1)

      // Test release hold
      findByID.mockResolvedValueOnce({
        id: 'job-1',
        state: 'on_hold',
        site: 'site-1',
        auditTrail: [],
      })
      update.mockResolvedValueOnce({
        id: 'job-1',
        state: 'created',
      })

      const releaseReq = new Request(
        'http://localhost/api/admin/commerce/fulfillment?siteId=site-1',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'release-hold',
            jobId: 'job-1',
          }),
        },
      )
      const releaseRes = await fulfillmentPost(releaseReq)
      expect(releaseRes.status).toBe(200)
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'pod-jobs',
          id: 'job-1',
          data: expect.objectContaining({ state: 'created', releasedAt: expect.any(String) }),
        }),
      )
    })

    it('acknowledges and ships manual fulfillment package with carrier tracking', async () => {
      auth.mockResolvedValue({ user: { id: 'admin-1', role: 'administrator' } })
      findByID.mockResolvedValue({
        id: 'pkg-1',
        status: 'acknowledged',
        site: 'site-1',
        auditTrail: [],
      })
      update.mockImplementation(async ({ data }: any) => ({ ...data, id: 'pkg-1' }))

      const shipReq = new Request('http://localhost/api/admin/commerce/fulfillment?siteId=site-1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'ship-manual',
          packageId: 'pkg-1',
          carrier: 'USPS',
          trackingNumber: '9400100000000000000000',
        }),
      })
      const shipRes = await fulfillmentPost(shipReq)
      expect(shipRes.status).toBe(200)
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'manual-fulfillment-packages',
          id: 'pkg-1',
          data: expect.objectContaining({
            status: 'shipped',
            externalFulfillment: expect.objectContaining({
              carrier: 'USPS',
              trackingNumber: '9400100000000000000000',
            }),
          }),
        }),
      )
    })
  })
})
