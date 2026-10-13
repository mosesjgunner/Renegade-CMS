import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  payload: { auth: vi.fn(), findByID: vi.fn(), find: vi.fn(), update: vi.fn(), create: vi.fn() },
  grant: { authorized: true, isGlobalOwner: false, authorizedSiteIds: ['site-a'] },
  submit: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => fixture.payload }))
vi.mock('../../src/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: async () => fixture.grant,
}))
vi.mock('../../src/modules/commerce/pod-operations', async (original) => ({
  ...(await original<typeof import('../../src/modules/commerce/pod-operations')>()),
  submitPodJobWithRetry: fixture.submit,
}))

import { POST } from '../../src/app/(frontend)/api/admin/fulfillment/route'

const request = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/admin/fulfillment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const job = {
  id: 'job-a',
  site: 'site-a',
  order: 'order-a',
  providerKey: 'printful',
  connection: 'connection-a',
  state: 'created',
  auditTrail: [],
  itemsSnapshot: [],
  attemptCount: 0,
}

describe('fulfillment provider, tenant and completion boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixture.payload.auth.mockResolvedValue({ user: { id: 'operator-a', role: 'administrator' } })
    fixture.payload.update.mockImplementation(async ({ id, data }) => ({ id, ...data }))
  })

  it('rejects an unconfigured Printful connection without submitting to an emulator', async () => {
    fixture.payload.findByID.mockImplementation(async ({ collection }) =>
      collection === 'pod-jobs'
        ? job
        : { id: 'connection-a', site: 'site-a', providerKey: 'printful', status: 'active' },
    )
    const res = await POST(request({ action: 'submit-pod-job', jobId: job.id }))
    expect(res.status).toBe(503)
    expect(fixture.submit).not.toHaveBeenCalled()
    expect(fixture.payload.update).not.toHaveBeenCalled()
  })

  it('rejects a foreign provider connection even when the job belongs to the actor site', async () => {
    fixture.payload.findByID.mockImplementation(async ({ collection }) =>
      collection === 'pod-jobs'
        ? job
        : { id: 'connection-a', site: 'site-b', providerKey: 'printful', status: 'active' },
    )
    const res = await POST(request({ action: 'submit-pod-job', jobId: job.id }))
    expect(res.status).toBe(403)
    expect(fixture.submit).not.toHaveBeenCalled()
    expect(fixture.payload.update).not.toHaveBeenCalled()
  })

  it('does not manufacture artwork or placement for preflight', async () => {
    const res = await POST(request({ action: 'pod-preflight', connectionId: 'connection-a' }))
    expect(res.status).toBe(400)
    expect(fixture.payload.findByID).not.toHaveBeenCalled()
  })

  it('denies foreign preflight before an adapter can run', async () => {
    fixture.payload.findByID.mockResolvedValue({ site: 'site-b', providerKey: 'pod-emulator' })
    const res = await POST(
      request({
        action: 'pod-preflight',
        connectionId: 'connection-b',
        variantId: 'variant-b',
        printArea: 'front',
        artwork: { id: 'art-b' },
        placement: { topMm: 0 },
      }),
    )
    expect(res.status).toBe(403)
    expect(fixture.payload.update).not.toHaveBeenCalled()
  })

  it('reports submission failure as a failed HTTP operation while retaining its durable attempt', async () => {
    fixture.payload.findByID.mockImplementation(async ({ collection }) =>
      collection === 'pod-jobs'
        ? { ...job, providerKey: 'pod-emulator' }
        : { id: 'connection-a', site: 'site-a', providerKey: 'pod-emulator', status: 'active' },
    )
    fixture.submit.mockResolvedValue({
      success: false,
      retryable: true,
      handoffRequired: false,
      error: 'Temporary local provider failure',
      job: { ...job, state: 'submitting', attemptCount: 1 },
    })
    const res = await POST(request({ action: 'submit-pod-job', jobId: job.id }))
    expect(res.status).toBe(503)
    expect((await res.json()).success).toBe(false)
    expect(fixture.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pod-jobs',
        data: expect.objectContaining({ attemptCount: 1, state: 'submitting' }),
      }),
    )
  })

  it('keeps an order open when a sibling POD job failed', async () => {
    fixture.payload.findByID.mockResolvedValue({
      id: 'package-a',
      site: 'site-a',
      order: 'order-a',
      status: 'acknowledged',
      auditTrail: [],
      approvedLines: [],
    })
    fixture.payload.find.mockImplementation(async ({ collection }) => ({
      docs:
        collection === 'pod-jobs'
          ? [{ id: 'failed-job', state: 'failed' }]
          : [{ id: 'package-a', status: 'acknowledged' }],
    }))
    const res = await POST(
      request({
        action: 'ship-manual',
        packageId: 'package-a',
        carrier: 'USPS',
        trackingNumber: 'local-test-tracking',
      }),
    )
    expect(res.status).toBe(200)
    expect(fixture.payload.update.mock.calls.some(([args]) => args.collection === 'orders')).toBe(
      false,
    )
  })
  it('completes a failed POD package only after its persisted manual handoff ships', async () => {
    fixture.payload.findByID.mockImplementation(async ({ collection }) =>
      collection === 'orders'
        ? { id: 'order-a', transitionLog: [] }
        : {
            id: 'package-a',
            site: 'site-a',
            order: 'order-a',
            status: 'acknowledged',
            source: 'pod-submission-exhausted',
            packageIndex: 2,
            auditTrail: [],
            approvedLines: [],
          },
    )
    fixture.payload.find.mockImplementation(async ({ collection }) => ({
      docs:
        collection === 'pod-jobs'
          ? [{ id: 'failed-job', state: 'failed', packageIndex: 2 }]
          : [
              {
                id: 'package-a',
                source: 'pod-submission-exhausted',
                packageIndex: 2,
                status: 'acknowledged',
              },
            ],
    }))
    const res = await POST(
      request({
        action: 'ship-manual',
        packageId: 'package-a',
        carrier: 'USPS',
        trackingNumber: 'local-test-tracking',
      }),
    )
    expect(res.status).toBe(200)
    expect(fixture.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: false, limit: 0 }),
    )
    expect(fixture.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'orders',
        data: expect.objectContaining({ state: 'fulfilled' }),
      }),
    )
  })
})
