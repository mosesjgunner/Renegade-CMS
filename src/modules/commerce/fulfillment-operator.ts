/* eslint-disable @typescript-eslint/no-explicit-any -- canonical transactional operator workflow */
import { sql } from 'drizzle-orm'
import { commerceTransactionPayload } from './transactions'
import { persistOrderFulfillment } from './fulfillment-persistence'
import {
  assertFulfillmentOrderEligible,
  assertFrozenFulfillment,
  fulfillmentId,
} from './fulfillment-mapping'
import { createManualFulfillmentPackage } from './manual-fulfillment'

export async function reconcileFulfillmentPlan(
  payload: any,
  orderId: string,
  override?: { jobId: string; actorId: string; reason: string },
) {
  const tx = await payload.db.beginTransaction()
  if (!tx) throw new Error('Fulfillment transaction unavailable.')
  const db: any = commerceTransactionPayload(payload, tx)
  try {
    await payload.db.sessions[tx].db.execute(
      sql`SELECT id FROM orders WHERE id=${orderId}::uuid FOR UPDATE`,
    )
    const order = await db.findByID({
      collection: 'orders',
      id: orderId,
      depth: 0,
      overrideAccess: true,
    })
    await assertFulfillmentOrderEligible(db, order)
    await assertFrozenFulfillment(db, order, order.items ?? [])
    const session = await db.findByID({
      collection: 'checkout-sessions',
      id: fulfillmentId(order.checkoutSession),
      depth: 0,
      overrideAccess: true,
    })
    let result
    if (override) {
      const job = await db.findByID({
        collection: 'pod-jobs',
        id: override.jobId,
        depth: 0,
        overrideAccess: true,
      })
      if (
        fulfillmentId(job.order) !== orderId ||
        fulfillmentId(job.site) !== fulfillmentId(order.site) ||
        job.externalOrderId ||
        !['on_hold', 'created', 'cancelled'].includes(job.state)
      )
        throw new Error('Only an unsubmitted matching held job can be overridden.')
      const packages = await db.find({
        collection: 'manual-fulfillment-packages',
        where: {
          and: [{ order: { equals: orderId } }, { packageIndex: { equals: job.packageIndex } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (job.state === 'cancelled' && !packages.docs[0])
        throw new Error('Cancelled job is not an active override candidate.')
      const pkg = createManualFulfillmentPackage({
        orderId,
        siteId: fulfillmentId(order.site),
        packageIndex: job.packageIndex,
        source: 'pod-provider-fallback',
        approvedLines: job.itemsSnapshot.map((line: any) => ({
          lineId: line.lineId,
          productId: line.productId,
          variantSku: line.variantSku,
          title: line.title,
          quantity: line.quantity,
          artworkSpecs: (line.soldRenditions ?? []).map((a: any) => ({
            area: a.printArea,
            artworkId: a.mediaAssetId,
            artworkHash: a.hash,
            placement: a.placement,
            downloadUrl: '',
          })),
        })),
        permissionedAddressManifest: job.recipientSnapshot,
        actor: override.actorId,
        instructions: `Authorized manual override: ${override.reason}. No provider submission performed.`,
      })
      const manual =
        packages.docs[0] ??
        (await db.create({
          collection: 'manual-fulfillment-packages',
          data: {
            site: order.site,
            order: order.id,
            packageIndex: job.packageIndex,
            source: pkg.source,
            status: pkg.status,
            approvedLines: pkg.approvedLines,
            permissionedAddressManifest: pkg.permissionedAddressManifest,
            instructions: pkg.instructions,
            auditTrail: [
              ...pkg.auditTrail,
              {
                timestamp: new Date().toISOString(),
                action: 'operator_override',
                actor: override.actorId,
                details: { jobId: job.id, reason: override.reason },
              },
            ],
          },
          overrideAccess: true,
        }))
      if (!packages.docs[0]) {
        await db.update({
          collection: 'pod-jobs',
          id: job.id,
          data: {
            state: 'cancelled',
            auditTrail: [
              ...(job.auditTrail ?? []),
              {
                timestamp: new Date().toISOString(),
                action: 'manual_override',
                actor: override.actorId,
                newState: 'cancelled',
                details: { reason: override.reason, manualPackageId: manual.id },
              },
            ],
          },
          overrideAccess: true,
        })
        await db.update({
          collection: 'orders',
          id: order.id,
          data: {
            fulfillmentExtension: {
              ...order.fulfillmentExtension,
              activePodJobsCount: Math.max(
                0,
                Number(
                  order.fulfillmentExtension?.activePodJobsCount ??
                    order.fulfillmentExtension?.podJobsCount ??
                    0,
                ) - 1,
              ),
              activeManualPackagesCount:
                Number(
                  order.fulfillmentExtension?.activeManualPackagesCount ??
                    order.fulfillmentExtension?.manualPackagesCount ??
                    0,
                ) + 1,
              overrides: [
                ...(order.fulfillmentExtension?.overrides ?? []),
                {
                  jobId: job.id,
                  manualPackageId: manual.id,
                  reason: override.reason,
                  actor: override.actorId,
                },
              ],
            },
          },
          overrideAccess: true,
        })
      }
      result = { package: manual, replay: Boolean(packages.docs[0]) }
    } else
        result = {
          order: await persistOrderFulfillment(db, { order, session, lines: order.items ?? [] }),
          replay: Boolean(order.fulfillmentExtension?.planId),
        }
      await payload.db.commitTransaction(tx)
      return result
    } catch (error) {
      await payload.db.rollbackTransaction(tx)
      throw error
    }
  }

export async function checkAndCompleteOrderFulfillment(
  payload: any,
  orderId: string,
  actor = 'fulfillment_operator',
  options?: { shippedPackageId?: string; shippedJobId?: string },
): Promise<{ orderState: string; fulfilled: boolean; cancelled: boolean }> {
  const [siblingManualRes, siblingPodRes] = await Promise.all([
    payload.find({
      collection: 'manual-fulfillment-packages',
      where: { order: { equals: orderId } },
      depth: 0,
      pagination: false,
      limit: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'pod-jobs',
      where: { order: { equals: orderId } },
      depth: 0,
      pagination: false,
      limit: 0,
      overrideAccess: true,
    }),
  ])

  const manualDocs = siblingManualRes.docs as any[]
  const podDocs = siblingPodRes.docs as any[]

  if (manualDocs.length === 0 && podDocs.length === 0) {
    return { orderState: 'unplanned', fulfilled: false, cancelled: false }
  }

  const allManualShippedOrCancelled = manualDocs.every(
    (m: any) => m.id === options?.shippedPackageId || m.status === 'shipped' || m.status === 'cancelled',
  )
  const allPodShippedOrCancelled = podDocs.every(
    (p: any) =>
      p.id === options?.shippedJobId || p.state === 'shipped' ||
      p.state === 'delivered' ||
      p.state === 'cancelled' ||
      (p.state === 'failed' &&
        manualDocs.some(
          (m: any) =>
            (m.source === 'pod-submission-exhausted' || m.source === 'pod-provider-fallback') &&
            m.packageIndex === p.packageIndex &&
            (m.id === options?.shippedPackageId || m.status === 'shipped' || m.status === 'cancelled'),
        )),
  )

  const hasAnyShipped =
    Boolean(options?.shippedPackageId || options?.shippedJobId) ||
    manualDocs.some((m: any) => m.status === 'shipped') ||
    podDocs.some((p: any) => p.state === 'shipped' || p.state === 'delivered')

  const allCancelled =
    manualDocs.length + podDocs.length > 0 &&
    manualDocs.every((m: any) => m.status === 'cancelled') &&
    podDocs.every((p: any) => p.state === 'cancelled')

  if (allManualShippedOrCancelled && allPodShippedOrCancelled && hasAnyShipped) {
    const orderDoc: any = await payload.findByID({
      collection: 'orders',
      id: orderId,
      depth: 0,
      overrideAccess: true,
    })
    if (orderDoc && orderDoc.state !== 'fulfilled') {
      const currentLog = Array.isArray(orderDoc?.transitionLog) ? orderDoc.transitionLog : []
      await payload.update({
        collection: 'orders',
        id: orderId,
        data: {
          state: 'fulfilled',
          fulfillmentExtension: {
            ...(orderDoc.fulfillmentExtension ?? {}),
            status: 'fulfilled',
          },
          transitionLog: [
            ...currentLog,
            { kind: 'order-fulfilled', at: new Date().toISOString(), actor },
          ],
        },
        overrideAccess: true,
      })

      // Cross-check notifications: emit activity-event and notification for customer
      const siteId =
        typeof orderDoc.site === 'object' && orderDoc.site ? orderDoc.site.id : orderDoc.site
      try {
        const existingActivity = await payload.find({
          collection: 'activity-events',
          where: {
            and: [
              { type: { equals: 'commerce.order.shipped' } },
              { 'object.orderId': { equals: orderId } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (!existingActivity.docs.length) {
          const activity = await payload.create({
            collection: 'activity-events',
            data: {
              site: siteId,
              type: 'commerce.order.shipped',
              actor: { system: true },
              object: {
                orderId,
                orderNumber: orderDoc.orderNumber,
                title: 'Order shipped',
                message: `Order #${orderDoc.orderNumber ?? orderId} has been fulfilled.`,
                href: `/account/orders/${orderId}`,
              },
              occurredAt: new Date().toISOString(),
            },
            overrideAccess: true,
          })

          const recipientMember =
            typeof orderDoc.customer === 'object' && orderDoc.customer
              ? orderDoc.customer.id
              : orderDoc.customer || orderDoc.partySnapshot?.memberId
          if (recipientMember) {
            await payload.create({
              collection: 'notifications',
              data: {
                activityEvent: activity.id,
                recipientMember,
                status: 'unread',
                channels: ['in-app'],
              },
              overrideAccess: true,
            })
          }
        }
      } catch {
        // Notification emission is non-fatal to order fulfillment
      }

      // Cross-check inventory: verify/consume active reservations
      try {
        if (orderDoc.checkoutSession) {
          const session = await payload.findByID({
            collection: 'checkout-sessions',
            id:
              typeof orderDoc.checkoutSession === 'object'
                ? orderDoc.checkoutSession.id
                : orderDoc.checkoutSession,
            depth: 0,
            overrideAccess: true,
          })
          if (session?.proposal) {
            const proposalId =
              typeof session.proposal === 'object' ? session.proposal.id : session.proposal
            await payload.update({
              collection: 'inventory-reservations',
              where: {
                and: [{ proposal: { equals: proposalId } }, { status: { equals: 'active' } }],
              },
              data: { status: 'consumed' },
              overrideAccess: true,
            })
          }
        }
      } catch {
        // Non-fatal
      }
    }
    return { orderState: 'fulfilled', fulfilled: true, cancelled: false }
  } else if (allCancelled) {
    const orderDoc: any = await payload.findByID({
      collection: 'orders',
      id: orderId,
      depth: 0,
      overrideAccess: true,
    })
    if (orderDoc && orderDoc.fulfillmentExtension?.status !== 'cancelled') {
      const currentLog = Array.isArray(orderDoc?.transitionLog) ? orderDoc.transitionLog : []
      await payload.update({
        collection: 'orders',
        id: orderId,
        data: {
          fulfillmentExtension: {
            ...(orderDoc.fulfillmentExtension ?? {}),
            status: 'cancelled',
          },
          transitionLog: [
            ...currentLog,
            { kind: 'fulfillment-cancelled', at: new Date().toISOString(), actor },
          ],
        },
        overrideAccess: true,
      })

      // Release inventory reservations
      try {
        if (orderDoc.checkoutSession) {
          const session = await payload.findByID({
            collection: 'checkout-sessions',
            id:
              typeof orderDoc.checkoutSession === 'object'
                ? orderDoc.checkoutSession.id
                : orderDoc.checkoutSession,
            depth: 0,
            overrideAccess: true,
          })
          if (session?.proposal) {
            const proposalId =
              typeof session.proposal === 'object' ? session.proposal.id : session.proposal
            await payload.update({
              collection: 'inventory-reservations',
              where: {
                and: [
                  { proposal: { equals: proposalId } },
                  { status: { in: ['active', 'consumed'] } },
                ],
              },
              data: { status: 'released' },
              overrideAccess: true,
            })
          }
        }
      } catch {
        // Non-fatal
      }
    }
    return { orderState: orderDoc?.state ?? 'paid', fulfilled: false, cancelled: true }
  }

  return { orderState: 'in_progress', fulfilled: false, cancelled: false }
}

export async function reconcileOutstandingFulfillmentOrders(
  payload: any,
  options?: { siteId?: string; actor?: string },
): Promise<{ reconciledJobsCount: number; completedOrdersCount: number; errors: string[] }> {
  const { adapterForPodConnection } = await import('./pod-adapters')
  const { reconcilePodJobWithProvider } = await import('./pod-reconciliation')
  const { withExecutionLock } = await import('../operations/execution-lock')
  const actor = options?.actor ?? 'worker_fulfillment_reconciliation'
  const siteFilter = options?.siteId ? { site: { equals: options.siteId } } : {}
  const outstandingJobs = await payload.find({
    collection: 'pod-jobs',
    where: {
      and: [
        siteFilter,
        {
          state: {
            in: ['exception', 'submitting', 'submitted', 'in_production', 'partially_shipped'],
          },
        },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  let reconciledJobsCount = 0
  let completedOrdersCount = 0
  const errors: string[] = []
  const touchedOrderIds = new Set<string>()

  for (const jobDoc of outstandingJobs.docs) {
    try {
      const orderId = fulfillmentId(jobDoc.order)
      const connectionId = fulfillmentId(jobDoc.connection)

      const result = await withExecutionLock(
        payload,
        `commerce.fulfillment.order:${orderId}`,
        async () => {
          const freshJobDoc: any = await payload.findByID({
            collection: 'pod-jobs',
            id: jobDoc.id,
            depth: 0,
            overrideAccess: true,
          })
          const connection = await payload.findByID({
            collection: 'pod-connections',
            id: connectionId,
            depth: 0,
            overrideAccess: true,
          })
          if (connection.status === 'disabled') return null
          const adapter = adapterForPodConnection(connection, 'orders')
          let recovered = {
            ...freshJobDoc,
            orderId,
            siteId: fulfillmentId(freshJobDoc.site),
            connectionId,
            auditTrail: freshJobDoc.auditTrail ?? [],
            itemsSnapshot: freshJobDoc.itemsSnapshot ?? [],
            attemptCount: freshJobDoc.attemptCount ?? 0,
          }
          if (!freshJobDoc.externalOrderId) {
            if (adapter.findOrderByIdempotencyKey) {
              const found = await adapter.findOrderByIdempotencyKey(freshJobDoc.idempotencyKey)
              if (found) {
                recovered = { ...recovered, externalOrderId: found.externalOrderId }
              }
            }
          }
          if (recovered.externalOrderId) {
            const updated = await reconcilePodJobWithProvider(recovered, adapter)
            const saved = await payload.update({
              collection: 'pod-jobs',
              id: freshJobDoc.id,
              depth: 0,
              data: {
                state: updated.state,
                externalOrderId: updated.externalOrderId,
                attemptCount: updated.attemptCount,
                lastError: updated.lastError ?? null,
                auditTrail: updated.auditTrail,
                fulfillments: (updated as any).fulfillments ?? [],
              },
              overrideAccess: true,
            })
            return { saved, orderId }
          }
          return null
        },
      )
      if (result) {
        reconciledJobsCount++
        touchedOrderIds.add(result.orderId)
      }
    } catch (err: unknown) {
      errors.push(`Job ${jobDoc.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  for (const orderId of touchedOrderIds) {
    const status = await checkAndCompleteOrderFulfillment(payload, orderId, actor)
    if (status.fulfilled) {
      completedOrdersCount++
    }
  }

  return { reconciledJobsCount, completedOrdersCount, errors }
}
