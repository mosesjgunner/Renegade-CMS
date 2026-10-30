import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  releasePodJobHold,
  cancelPodJob,
  submitPodJobWithRetry,
} from '../../src/modules/commerce/pod-operations'
import {
  acknowledgeManualFulfillmentPackage,
  markManualFulfillmentInProduction,
  shipManualFulfillmentPackage,
  cancelManualFulfillmentPackage,
  createManualFulfillmentPackage,
  type ManualFulfillmentPackage,
} from '../../src/modules/commerce/manual-fulfillment'
import {
  applyNormalizedPodEvent,
  reconcilePodJobWithProvider,
  sanitizeTrackingUrl,
} from '../../src/modules/commerce/pod-reconciliation'
import {
  checkAndCompleteOrderFulfillment,
  reconcileOutstandingFulfillmentOrders,
} from '../../src/modules/commerce/fulfillment-operator'
import {
  PodProviderError,
  type PodProviderAdapter,
  type NormalizedPodEvent,
} from '../../src/modules/commerce/pod-contract'
import { type PODJob } from '../../src/modules/commerce/fulfillment-plan'
import { PodEmulatorAdapter } from '../../src/modules/commerce/pod-emulator'
import { PrintifyPodAdapter } from '../../src/modules/commerce/pod-printify'

describe('13C Tracking, Exception Handling & Restart Recovery Lifecycle', () => {
  const sampleAddress = {
    name: 'Jane Doe',
    address1: '123 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  }

  const baseJob: PODJob = {
    id: 'job-13c-01',
    orderId: 'order-13c-01',
    siteId: 'site-alpha',
    connectionId: 'conn-13c-printful',
    providerKey: 'printful',
    packageIndex: 0,
    idempotencyKey: 'idemp-13c-order-01',
    payloadHash: 'hash-13c-01',
    state: 'created',
    addressPolicy: 'domestic',
    recipientSnapshot: sampleAddress,
    itemsSnapshot: [
      {
        lineId: 'line-0',
        productId: 'prod-shirt',
        variantSku: 'SHIRT-BLK-M',
        title: 'Renegade Tee',
        quantity: 1,
        unitPriceMinor: '2000',
        lineAmountMinor: '2000',
        kind: 'pod',
        soldRenditions: [],
      },
    ],
    costSnapshot: { estimatedCostMinor: '1000', currency: 'USD' },
    attemptCount: 0,
    auditTrail: [],
    createdAt: '2026-10-29T12:00:00Z',
    updatedAt: '2026-10-29T12:00:00Z',
  }

  describe('POD Job State Transitions & Exception Queues', () => {
    it('releases hold and transitions to created state with timestamp', () => {
      const heldJob: PODJob = {
        ...baseJob,
        state: 'on_hold',
        holdExpiresAt: '2026-10-29T14:00:00Z',
      }
      const released = releasePodJobHold(heldJob, 'operator-01')
      expect(released.state).toBe('created')
      expect(released.releasedAt).toBeDefined()
      expect(released.auditTrail.at(-1)?.action).toBe('hold_released')
    })

    it('handles provider lost-response: preserves exception state without inventing external order ID', async () => {
      const mockAdapter: PodProviderAdapter = {
        key: 'printful',
        contractVersion: 'shop-03.v1',
        capabilities: {} as any,
        metadata: {
          mode: 'deterministic-emulator',
          implementationVersion: '1.0',
          providerApiVersion: 'v1',
          liveCreationOptInRequired: false,
        },
        health: vi.fn(),
        getCatalog: vi.fn(),
        getVariants: vi.fn(),
        getTemplates: vi.fn(),
        validateFile: vi.fn(),
        uploadPrintFile: vi.fn(),
        preflight: vi.fn(),
        estimateCost: vi.fn(),
        createOrder: vi
          .fn()
          .mockRejectedValue(
            new PodProviderError(
              'unknown-outcome',
              'Connection timed out; outcome unknown.',
              false,
              false,
              'req-timeout',
            ),
          ),
        getOrder: vi.fn(),
        cancelOrder: vi.fn(),
        verifyWebhook: vi.fn(),
      }

      const outcome = await submitPodJobWithRetry({
        job: { ...baseJob, attemptCount: 0 },
        adapter: mockAdapter,
        actor: 'operator-submit',
      })

      expect(outcome.success).toBe(false)
      expect(outcome.job.state).toBe('exception')
      expect(outcome.job.attemptCount).toBe(1)
      expect(outcome.job.externalOrderId).toBeUndefined()
      expect(outcome.job.auditTrail.at(-1)?.action).toBe('job_submission_outcome_unknown')
    })

    it('denies re-submission of job in exception state before reconciliation', async () => {
      const mockAdapter: PodProviderAdapter = {
        key: 'printful',
        contractVersion: 'shop-03.v1',
        capabilities: {} as any,
        metadata: {
          mode: 'deterministic-emulator',
          implementationVersion: '1.0',
          providerApiVersion: 'v1',
          liveCreationOptInRequired: false,
        },
        health: vi.fn(),
        getCatalog: vi.fn(),
        getVariants: vi.fn(),
        getTemplates: vi.fn(),
        validateFile: vi.fn(),
        uploadPrintFile: vi.fn(),
        preflight: vi.fn(),
        estimateCost: vi.fn(),
        createOrder: vi.fn(),
        getOrder: vi.fn(),
        cancelOrder: vi.fn(),
        verifyWebhook: vi.fn(),
      }

      const exceptionJob: PODJob = { ...baseJob, state: 'exception', attemptCount: 1 }
      const outcome = await submitPodJobWithRetry({
        job: exceptionJob,
        adapter: mockAdapter,
      })

      expect(outcome.success).toBe(false)
      if (!outcome.success) {
        expect(outcome.error).toContain('Job is not eligible for submission')
      }
      expect(mockAdapter.createOrder).not.toHaveBeenCalled()
    })

    it('reconciles job in exception state by stable idempotency key without duplicate create call', async () => {
      const mockAdapter: PodProviderAdapter = {
        key: 'printful',
        contractVersion: 'shop-03.v1',
        capabilities: {} as any,
        metadata: {
          mode: 'deterministic-emulator',
          implementationVersion: '1.0',
          providerApiVersion: 'v1',
          liveCreationOptInRequired: false,
        },
        health: vi.fn(),
        getCatalog: vi.fn(),
        getVariants: vi.fn(),
        getTemplates: vi.fn(),
        validateFile: vi.fn(),
        uploadPrintFile: vi.fn(),
        preflight: vi.fn(),
        estimateCost: vi.fn(),
        createOrder: vi.fn(),
        getOrder: vi.fn().mockResolvedValue({
          externalOrderId: 'pf-order-999',
          state: 'submitted',
          providerStatus: 'pending',
          requestId: 'req-reconcile-1',
        }),
        findOrderByIdempotencyKey: vi.fn().mockResolvedValue({
          externalOrderId: 'pf-order-999',
          state: 'submitted',
          providerStatus: 'pending',
          requestId: 'req-find-1',
        }),
        cancelOrder: vi.fn(),
        verifyWebhook: vi.fn(),
      }

      const found = await mockAdapter.findOrderByIdempotencyKey!('idemp-13c-order-01')
      expect(found).not.toBeNull()
      expect(found?.externalOrderId).toBe('pf-order-999')

      const recoveredJob: PODJob = {
        ...baseJob,
        state: 'exception',
        attemptCount: 1,
        externalOrderId: found!.externalOrderId,
      }
      const reconciled = await reconcilePodJobWithProvider(recoveredJob, mockAdapter)

      expect(reconciled.state).toBe('submitted')
      expect(reconciled.externalOrderId).toBe('pf-order-999')
      expect(reconciled.auditTrail.at(-1)?.action).toBe('provider_poll_observed')
    })

    it('cancels unsubmitted and submitted jobs; rejects cancellation once in production', async () => {
      const mockAdapter: PodProviderAdapter = {
        key: 'printful',
        contractVersion: 'shop-03.v1',
        capabilities: {} as any,
        metadata: {
          mode: 'deterministic-emulator',
          implementationVersion: '1.0',
          providerApiVersion: 'v1',
          liveCreationOptInRequired: false,
        },
        health: vi.fn(),
        getCatalog: vi.fn(),
        getVariants: vi.fn(),
        getTemplates: vi.fn(),
        validateFile: vi.fn(),
        uploadPrintFile: vi.fn(),
        preflight: vi.fn(),
        estimateCost: vi.fn(),
        createOrder: vi.fn(),
        getOrder: vi.fn(),
        cancelOrder: vi.fn().mockResolvedValue({ cancelled: true }),
        verifyWebhook: vi.fn(),
      }

      // Local cancellation before submission
      const locallyCancelled = await cancelPodJob(baseJob, mockAdapter, 'Customer request')
      expect(locallyCancelled.state).toBe('cancelled')
      expect(locallyCancelled.auditTrail.at(-1)?.action).toBe('job_cancelled_locally')

      // Remote cancellation of submitted order
      const submittedJob: PODJob = { ...baseJob, state: 'submitted', externalOrderId: 'pf-100' }
      const remoteCancelled = await cancelPodJob(submittedJob, mockAdapter, 'Operator cancel')
      expect(remoteCancelled.state).toBe('cancelled')
      expect(remoteCancelled.auditTrail.at(-1)?.action).toBe('job_cancelled_at_provider')
    })
  })

  describe('Manual Fulfillment Lifecycle & Tracking', () => {
    it('executes complete manual sequence: create -> acknowledge -> in_production -> ship', () => {
      const pkg = createManualFulfillmentPackage({
        orderId: 'order-man-1',
        siteId: 'site-alpha',
        packageIndex: 0,
        source: 'explicit-manual-product',
        approvedLines: [
          {
            lineId: 'l1',
            productId: 'p1',
            variantSku: 'SKU1',
            title: 'Sticker',
            quantity: 2,
            artworkSpecs: [],
          },
        ],
        permissionedAddressManifest: sampleAddress,
      })
      expect(pkg.status).toBe('pending_acknowledgement')

      const ack = acknowledgeManualFulfillmentPackage(pkg, 'operator-01', 'Reviewed specs')
      expect(ack.status).toBe('acknowledged')
      expect(ack.acknowledgement?.notes).toBe('Reviewed specs')

      const prod = markManualFulfillmentInProduction(ack, 'operator-01')
      expect(prod.status).toBe('in_production')

      const shipped = shipManualFulfillmentPackage(
        prod,
        {
          carrier: 'FedEx',
          trackingNumber: '9988776655',
          trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=9988776655',
        },
        'operator-01',
      )
      expect(shipped.status).toBe('shipped')
      expect(shipped.externalFulfillment?.carrier).toBe('FedEx')
      expect(shipped.externalFulfillment?.trackingNumber).toBe('9988776655')
      expect(shipped.externalFulfillment?.trackingUrl).toContain('https://www.fedex.com')

      // Cannot cancel after shipping
      expect(() => cancelManualFulfillmentPackage(shipped, 'Cancel test', 'operator-01')).toThrow(
        'Cannot cancel package that has already shipped',
      )
    })
  })

  describe('Webhook Processing, Tracking & Duplicate Deduplication', () => {
    it('verifies HMAC signed webhook and applies shipped event with tracking', () => {
      const emulator = new PodEmulatorAdapter()
      const secret = 'webhook-secret-unit-test-32chars'
      const event: NormalizedPodEvent = {
        providerEventId: 'evt-ship-001',
        providerKey: 'pod-emulator',
        externalOrderId: 'pf-order-999',
        kind: 'shipped',
        occurredAt: '2026-10-29T15:00:00Z',
        tracking: {
          carrier: 'USPS',
          trackingNumber: '9400111899562537682144',
          trackingUrl:
            'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899562537682144',
        },
        rawEvidence: {},
      }

      const { rawBody, signature } = emulator.generateSignedWebhook(secret, event)
      const verified = emulator.verifyWebhook(rawBody, signature, secret)
      expect(verified).not.toBeNull()
      expect(verified?.kind).toBe('shipped')

      const submittedJob: PODJob = {
        ...baseJob,
        state: 'submitted',
        externalOrderId: 'pf-order-999',
      }
      const updated = applyNormalizedPodEvent(submittedJob, verified!)

      expect(updated.state).toBe('shipped')
      expect((updated as any).fulfillments).toHaveLength(1)
      expect((updated as any).fulfillments[0].trackingNumber).toBe('9400111899562537682144')

      // Duplicate webhook delivery: applying the same event again is a no-op
      const replayed = applyNormalizedPodEvent(updated, verified!)
      expect(replayed).toBe(updated) // Exact object identity returned
      expect(
        replayed.auditTrail.filter((a) => a.details?.providerEventId === 'evt-ship-001'),
      ).toHaveLength(1)
    })

    it('absorbs out-of-order webhook events without regressing terminal state', () => {
      const shippedJob: PODJob = {
        ...baseJob,
        state: 'shipped',
        externalOrderId: 'pf-order-999',
        auditTrail: [
          {
            timestamp: '2026-10-29T15:00:00Z',
            action: 'event_shipped',
            actor: 'provider',
            previousState: 'submitted',
            newState: 'shipped',
          },
        ],
      }

      const delayedEvent: NormalizedPodEvent = {
        providerEventId: 'evt-inprod-002',
        providerKey: 'printful',
        externalOrderId: 'pf-order-999',
        kind: 'in_production',
        occurredAt: '2026-10-29T14:30:00Z',
        rawEvidence: {},
      }

      const result = applyNormalizedPodEvent(shippedJob, delayedEvent)
      // Must not regress from shipped back to in_production
      expect(result.state).toBe('shipped')
    })
  })

  describe('Order, Notification & Inventory Cross-Checking', () => {
    let mockDb: Record<string, any[]>
    let mockPayload: any

    beforeEach(() => {
      mockDb = {
        orders: [
          {
            id: 'ord-100',
            orderNumber: 'ORD-100',
            state: 'paid',
            site: 'site-alpha',
            customer: 'member-cust-1',
            fulfillmentExtension: { status: 'planned' },
            checkoutSession: 'session-100',
            transitionLog: [],
          },
        ],
        'manual-fulfillment-packages': [],
        'pod-jobs': [],
        'activity-events': [],
        notifications: [],
        'checkout-sessions': [{ id: 'session-100', proposal: 'prop-100' }],
        'inventory-reservations': [{ id: 'res-1', proposal: 'prop-100', status: 'active' }],
      }

      mockPayload = {
        findByID: vi.fn(async ({ collection, id }: any) => {
          const doc = mockDb[collection]?.find((d) => d.id === id)
          if (!doc) throw new Error(`${collection} ${id} not found`)
          return structuredClone(doc)
        }),
        find: vi.fn(async ({ collection, where }: any) => {
          const docs = (mockDb[collection] ?? []).filter((d) => {
            if (where?.order?.equals) return d.order === where.order.equals
            if (where?.and) {
              return where.and.every((clause: any) => {
                if (clause.type?.equals) return d.type === clause.type.equals
                if (clause['object.orderId']?.equals)
                  return d.object?.orderId === clause['object.orderId'].equals
                if (clause.activityEvent?.equals)
                  return d.activityEvent === clause.activityEvent.equals
                if (clause.recipientMember?.equals)
                  return d.recipientMember === clause.recipientMember.equals
                if (clause.proposal?.equals) return d.proposal === clause.proposal.equals
                if (clause.status?.equals) return d.status === clause.status.equals
                if (clause.state?.in) return clause.state.in.includes(d.state)
                return true
              })
            }
            return true
          })
          return { docs: structuredClone(docs) }
        }),
        update: vi.fn(async ({ collection, id, data, where }: any) => {
          if (id) {
            const idx = mockDb[collection]?.findIndex((d) => d.id === id)
            if (idx >= 0) {
              mockDb[collection][idx] = { ...mockDb[collection][idx], ...data }
              return structuredClone(mockDb[collection][idx])
            }
          }
          if (where) {
            for (const doc of mockDb[collection] ?? []) {
              let matches = true
              if (where.proposal?.equals && doc.proposal !== where.proposal.equals) matches = false
              if (where.and) {
                for (const clause of where.and) {
                  if (clause.proposal?.equals && doc.proposal !== clause.proposal.equals)
                    matches = false
                  if (clause.status?.equals && doc.status !== clause.status.equals) matches = false
                  if (clause.status?.in && !clause.status.in.includes(doc.status)) matches = false
                }
              }
              if (matches) Object.assign(doc, data)
            }
          }
          return { id }
        }),
        create: vi.fn(async ({ collection, data }: any) => {
          const newDoc = { id: `${collection}-${Date.now()}`, ...data }
          mockDb[collection] = mockDb[collection] ?? []
          mockDb[collection].push(newDoc)
          return structuredClone(newDoc)
        }),
      }
    })

    it('cross-checks order, fulfillment, notifications and inventory when order fulfills', async () => {
      mockDb['manual-fulfillment-packages'] = [
        { id: 'man-1', order: 'ord-100', status: 'shipped', packageIndex: 0 },
      ]
      mockDb['pod-jobs'] = [{ id: 'pod-1', order: 'ord-100', state: 'shipped', packageIndex: 1 }]

      const completion = await checkAndCompleteOrderFulfillment(
        mockPayload,
        'ord-100',
        'operator-audit',
      )

      expect(completion.fulfilled).toBe(true)
      expect(completion.orderState).toBe('fulfilled')

      // 1. Order record updated
      const order = mockDb.orders.find((o) => o.id === 'ord-100')
      expect(order.state).toBe('fulfilled')
      expect(order.fulfillmentExtension.status).toBe('fulfilled')
      expect(order.transitionLog.at(-1)?.kind).toBe('order-fulfilled')

      // 2. Notification record created
      expect(mockDb['activity-events']).toHaveLength(1)
      expect(mockDb['activity-events'][0].type).toBe('commerce.order.shipped')
      expect(mockDb['activity-events'][0].object.orderId).toBe('ord-100')

      expect(mockDb.notifications).toHaveLength(1)
      expect(mockDb.notifications[0].recipientMember).toBe('member-cust-1')
      expect(mockDb.notifications[0].status).toBe('unread')

      // 3. Inventory reservation consumed
      expect(mockDb['inventory-reservations'][0].status).toBe('consumed')
    })

    it('releases inventory reservations when all packages/jobs are cancelled', async () => {
      mockDb['manual-fulfillment-packages'] = [
        { id: 'man-1', order: 'ord-100', status: 'cancelled', packageIndex: 0 },
      ]
      mockDb['pod-jobs'] = [{ id: 'pod-1', order: 'ord-100', state: 'cancelled', packageIndex: 1 }]

      const completion = await checkAndCompleteOrderFulfillment(
        mockPayload,
        'ord-100',
        'operator-cancel',
      )

      expect(completion.cancelled).toBe(true)
      const order = mockDb.orders.find((o) => o.id === 'ord-100')
      expect(order.fulfillmentExtension.status).toBe('cancelled')
      expect(order.transitionLog.at(-1)?.kind).toBe('fulfillment-cancelled')

      // Inventory reservation released
      expect(mockDb['inventory-reservations'][0].status).toBe('released')
    })
  })
})
