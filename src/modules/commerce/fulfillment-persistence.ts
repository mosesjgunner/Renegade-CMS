/* eslint-disable @typescript-eslint/no-explicit-any -- canonical fulfillment snapshots */
import {
  buildFulfillmentPlan,
  createPodJobAfterPaidAcceptance,
  DEFAULT_HOLD_WINDOW_MS,
  validateShippingAddressForPod,
  type FulfillmentLineItem,
} from './fulfillment-plan'
import { createManualFulfillmentPackage } from './manual-fulfillment'
import type { PodConnectionRecord } from './pod-connection'
import { assertFulfillmentOrderEligible, assertFrozenFulfillment } from './fulfillment-mapping'

export async function persistOrderFulfillment(
  db: any,
  args: { order: any; session: any; lines: any[]; downloads?: any[] },
) {
  let order = args.order
  const input = { session: args.session }
  const downloads = args.downloads ?? []
  const lines = args.lines
  await assertFulfillmentOrderEligible(db, order)
  await assertFrozenFulfillment(db, order, lines)
  const alreadySettled = Boolean(order.fulfillmentExtension?.planId)
  if (!alreadySettled || !order.fulfillmentExtension?.planId) {
    const storedShipping = order.addressSnapshot?.shipping ?? null
    const rawShipping = storedShipping?.normalized ?? storedShipping
    const recipientAddress = rawShipping
      ? {
          name: String(rawShipping.name ?? order.partySnapshot?.name ?? ''),
          address1: String(rawShipping.address1 ?? rawShipping.line1 ?? rawShipping.street ?? ''),
          address2:
            rawShipping.address2 || rawShipping.line2
              ? String(rawShipping.address2 ?? rawShipping.line2)
              : undefined,
          city: String(rawShipping.city ?? ''),
          state: rawShipping.state ? String(rawShipping.state) : undefined,
          postalCode: String(rawShipping.postalCode ?? rawShipping.zip ?? ''),
          country: String(rawShipping.country ?? ''),
          phone: rawShipping.phone ? String(rawShipping.phone) : undefined,
          email: rawShipping.email ? String(rawShipping.email) : undefined,
        }
      : undefined

    const podConnectionsResult = await db.find({
      collection: 'pod-connections',
      where: { site: { equals: input.session.site } },
      limit: 100,
      overrideAccess: true,
    })
    const connectionsByProviderKey = new Map<string, PodConnectionRecord>()
    for (const conn of podConnectionsResult.docs) {
      connectionsByProviderKey.set(conn.providerKey, conn as unknown as PodConnectionRecord)
    }

    const fulfillmentItems: FulfillmentLineItem[] = lines.map((line: any, idx: number) => {
      const frozen = line.fulfillmentSnapshot
      const isDigital = line.kind === 'digital' || Boolean(line.entitlement)
      if (!isDigital && !frozen)
        throw new Error(
          'Physical checkout has no frozen approved instructions; operator review is required.',
        )
      return {
        lineId: line.lineId ?? `line_${idx}`,
        productId: String(line.productId),
        variantSku: String(line.variantSku),
        title: String(line.title ?? 'Item'),
        quantity: Number(line.quantity),
        unitPriceMinor: String(line.unitPriceMinor ?? line.unitAmountMinor ?? '0'),
        lineAmountMinor: String(line.lineAmountMinor ?? '0'),
        kind: isDigital ? 'digital' : frozen?.mode === 'pod' ? 'pod' : 'physical',
        podMapping: frozen?.mode === 'pod' ? frozen : undefined,
        soldRenditions: frozen?.soldRenditions,
      }
    })
    for (const line of fulfillmentItems) {
      if (!line.podMapping) continue
      const mapping = line.podMapping as any
      const connection = podConnectionsResult.docs.find(
        (c: any) => String(c.id) === mapping.connectionId,
      )
      if (
        !connection ||
        String(connection.site?.id ?? connection.site) !==
          String(input.session.site?.id ?? input.session.site) ||
        connection.status !== 'active' ||
        connection.providerKey !== mapping.providerKey ||
        String(connection.merchantConnection?.id ?? connection.merchantConnection) !==
          String(order.merchantConnection?.id ?? order.merchantConnection)
      )
        throw new Error('Frozen POD provider/site/merchant binding is unavailable.')
      connectionsByProviderKey.set(mapping.connectionId, {
        ...connection,
        siteId: String(connection.site?.id ?? connection.site),
      })
    }

    const plan = buildFulfillmentPlan({
      orderId: String(order.id),
      siteId: String(input.session.site),
      currency: String(input.session.currency),
      recipientAddress,
      items: fulfillmentItems,
      connectionsByProviderKey,
    })

    if (plan.providerJobs.length || plan.manualPackages.length) {
      const address = validateShippingAddressForPod(recipientAddress, true)
      if (!address.valid)
        throw new Error(
          `Shipping address requires operator reconciliation: ${address.issues.join(' ')}`,
        )
    }

    for (const plannedPod of plan.providerJobs) {
      if (!recipientAddress)
        throw new Error(
          'Shipping address is missing. Fulfillment requires operator reconciliation.',
        )
      const podJob = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: plannedPod.packageIndex,
        orderPaymentState: order.state,
        holdWindowMs: DEFAULT_HOLD_WINDOW_MS,
        actor: 'commerce_settlement',
      })
      const existingJob = await db.find({
        collection: 'pod-jobs',
        where: { idempotencyKey: { equals: podJob.idempotencyKey } },
        limit: 1,
        overrideAccess: true,
      })
      if (!existingJob.docs.length) {
        await db.create({
          collection: 'pod-jobs',
          data: {
            site: input.session.site,
            order: order.id,
            connection: plannedPod.connectionId,
            providerKey: plannedPod.providerKey,
            packageIndex: plannedPod.packageIndex,
            idempotencyKey: podJob.idempotencyKey,
            payloadHash: podJob.payloadHash,
            state: podJob.state,
            addressPolicy: podJob.addressPolicy,
            recipientSnapshot: podJob.recipientSnapshot,
            itemsSnapshot: podJob.itemsSnapshot,
            costSnapshot: {
              ...podJob.costSnapshot,
              basis: 'observed-item-estimate',
              shipping: 'unquoted',
              providerQuote: false,
              providerMode: (plannedPod.items[0]?.podMapping as any)?.providerMode,
            },
            attemptCount: podJob.attemptCount,
            holdExpiresAt: podJob.holdExpiresAt,
            auditTrail: podJob.auditTrail,
          },
          overrideAccess: true,
        })
      }
    }

    for (const plannedManual of plan.manualPackages) {
      if (!recipientAddress)
        throw new Error(
          'Shipping address is missing. Fulfillment requires operator reconciliation.',
        )
      const existingManual = await db.find({
        collection: 'manual-fulfillment-packages',
        where: {
          and: [
            { order: { equals: order.id } },
            { packageIndex: { equals: plannedManual.packageIndex } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      if (!existingManual.docs.length) {
        const manualPkg = createManualFulfillmentPackage({
          orderId: String(order.id),
          siteId: String(input.session.site),
          packageIndex: plannedManual.packageIndex,
          source:
            plannedManual.reason === 'explicit-manual'
              ? 'explicit-manual-product'
              : 'pod-provider-fallback',
          approvedLines: plannedManual.items.map((it) => ({
            lineId: it.lineId,
            productId: it.productId,
            variantSku: it.variantSku,
            title: it.title,
            quantity: it.quantity,
            artworkSpecs: [],
          })),
          permissionedAddressManifest: recipientAddress,
        })
        await db.create({
          collection: 'manual-fulfillment-packages',
          data: {
            site: input.session.site,
            order: order.id,
            packageIndex: manualPkg.packageIndex,
            source: manualPkg.source,
            status: manualPkg.status,
            approvedLines: manualPkg.approvedLines,
            permissionedAddressManifest: manualPkg.permissionedAddressManifest,
            instructions: manualPkg.instructions,
            auditTrail: manualPkg.auditTrail,
          },
          overrideAccess: true,
        })
      }
    }

    const currentFulfillmentExt = order.fulfillmentExtension ?? {}
    order = await db.update({
      collection: 'orders',
      id: order.id,
      data: {
        fulfillmentExtension: {
          ...currentFulfillmentExt,
          planId: plan.id,
          plan,
          status: 'planned',
          error: null,
          podJobsCount: plan.providerJobs.length,
          manualPackagesCount: plan.manualPackages.length,
          activePodJobsCount: plan.providerJobs.length,
          activeManualPackagesCount: plan.manualPackages.length,
          downloads: downloads.length ? downloads : (currentFulfillmentExt.downloads ?? []),
        },
      },
      overrideAccess: true,
    })
  } else if (downloads.length) {
    order = await db.update({
      collection: 'orders',
      id: order.id,
      data: { fulfillmentExtension: { ...(order.fulfillmentExtension ?? {}), downloads } },
      overrideAccess: true,
    })
  }
  return order
}
