/* eslint-disable @typescript-eslint/no-explicit-any */
import configPromise from '@payload-config'
import { withExecutionLock } from '@/modules/operations/execution-lock'
import {
  configureFulfillmentMapping,
  inspectPodArtwork,
  assertFulfillmentOrderEligible,
} from '@/modules/commerce/fulfillment-mapping'
import { reconcileFulfillmentPlan, checkAndCompleteOrderFulfillment, reconcileOutstandingFulfillmentOrders } from '@/modules/commerce/fulfillment-operator'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import {
  acknowledgeManualFulfillmentPackage,
  markManualFulfillmentInProduction,
  shipManualFulfillmentPackage,
  cancelManualFulfillmentPackage,
  type ManualFulfillmentPackage,
} from '@/modules/commerce/manual-fulfillment'
import { adapterForPodConnection } from '@/modules/commerce/pod-adapters'
import { executePodOperatorAction } from '@/modules/commerce/pod-operator'
import { PodProviderError, type PodProviderAdapter } from '@/modules/commerce/pod-contract'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const auth = await payload.auth({ headers: request.headers }).catch(() => null)
  const grant = await resolveOperatorGrantContext(payload, auth?.user)
  const siteId = new URL(request.url).searchParams.get('siteId')
  if (
    !grant.authorized ||
    !siteId ||
    (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId))
  )
    return NextResponse.json({ error: 'Forbidden site.' }, { status: 403 })
  const [products, orders] = await Promise.all(
    ['products', 'orders'].map((collection) =>
      payload.find({
        collection: collection as any,
        where: { site: { equals: siteId } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      }),
    ),
  )
  return NextResponse.json({
    siteId,
    products: products.docs.map((p: any) => ({
      id: p.id,
      name: p.name,
      variants: p.variants,
      mappings: p.podMappings ?? [],
    })),
    orders: orders.docs.map((o: any) => ({
      id: o.id,
      number: o.orderNumber,
      state: o.state,
      plan: o.fulfillmentExtension ?? null,
    })),
    scope: 'Latest 100 products/orders for this site.',
    providerCreation: 'not-implied',
  })
}

const relationId = (value: any) =>
  typeof value === 'object' && value !== null ? String(value.id ?? '') : String(value ?? '')

async function resolvePodAdapter(
  payload: any,
  connectionId?: string,
  providerKey?: string,
  siteId?: string,
): Promise<PodProviderAdapter> {
  if (connectionId) {
    const conn: any = await payload.findByID({
      collection: 'pod-connections',
      id: connectionId,
      depth: 0,
      overrideAccess: true,
    })
    if (!siteId || relationId(conn.site) !== siteId)
      throw new Error('Forbidden. Provider connection belongs to another site.')
    if (providerKey && conn.providerKey !== providerKey)
      throw new PodProviderError('configuration', 'Provider does not match the job.', false, true)
    if (conn.status === 'disabled')
      throw new PodProviderError('configuration', 'Provider connection is disabled.', false, true)
    providerKey = conn.providerKey
    return adapterForPodConnection(conn)
  }
  throw new PodProviderError(
    'configuration',
    'The selected POD provider is not configured.',
    false,
    true,
  )
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  if (
    request.headers.get('origin') !== `${url.protocol}//${request.headers.get('host') ?? url.host}`
  )
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  const payload = await getPayload({ config: configPromise })
  const incomingHeaders = request.headers
  const auth = await payload.auth({ headers: incomingHeaders }).catch(() => null)
  const grant = await resolveOperatorGrantContext(payload, auth?.user)

  if (!grant.authorized) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  }

  const actorId = String((auth?.user as any)?.id ?? (auth?.user as any)?.email ?? 'operator')
  const body = await request.json().catch(() => ({}))
  const { action } = body

  if (!action) {
    return NextResponse.json({ error: 'Action is required.' }, { status: 400 })
  }

  // Helper to assert site authorization
  const assertSiteAccess = (siteId: string) => {
    if (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId)) {
      throw new Error('Forbidden. Object belongs to another site.')
    }
  }

  try {
    if (action === 'save-mapping') {
      if (!['owner', 'administrator'].includes(String((auth?.user as any)?.role)))
        return NextResponse.json(
          { error: 'Mapping review requires owner or administrator.' },
          { status: 403 },
        )
      const product: any = await payload.findByID({
        collection: 'products',
        id: body.productId,
        depth: 0,
        overrideAccess: true,
      })
      assertSiteAccess(relationId(product.site))
      const mapping = await withExecutionLock(payload, `commerce.mapping:${product.id}`, async () =>
        configureFulfillmentMapping(
          payload,
          await payload.findByID({
            collection: 'products',
            id: product.id,
            depth: 0,
            overrideAccess: true,
          }),
          body.mapping,
          actorId,
        ),
      )
      return NextResponse.json({ success: true, mapping })
    }
    if (action === 'reconcile-plan' || action === 'override-manual') {
      let orderId = body.orderId
      if (!orderId && body.checkoutSessionId) {
        const session: any = await payload.findByID({
          collection: 'checkout-sessions',
          id: body.checkoutSessionId,
          depth: 0,
          overrideAccess: true,
        })
        assertSiteAccess(relationId(session.site))
        const orders = await payload.find({
          collection: 'orders',
          where: { checkoutSession: { equals: session.id } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        orderId = orders.docs[0]?.id
        if (!orderId)
          return NextResponse.json(
            { error: 'Unsettled checkout cannot create fulfillment.' },
            { status: 409 },
          )
      }
      const order: any = await payload.findByID({
        collection: 'orders',
        id: orderId,
        depth: 0,
        overrideAccess: true,
      })
      assertSiteAccess(relationId(order.site))
      if (
        action === 'override-manual' &&
        (!['owner', 'administrator'].includes(String((auth?.user as any)?.role)) ||
          !String(body.reason ?? '').trim())
      )
        return NextResponse.json(
          { error: 'An owner/administrator and audited reason are required.' },
          { status: 403 },
        )
      const result = await withExecutionLock(
        payload,
        `commerce.fulfillment.order:${order.id}`,
        () =>
          reconcileFulfillmentPlan(
            payload,
            order.id,
            action === 'override-manual'
              ? { jobId: body.jobId, actorId, reason: body.reason }
              : undefined,
          ),
      )
      return NextResponse.json({ success: true, ...result })
    }
    if (
      ['release-pod-hold', 'submit-pod-job', 'start-production-manual', 'ship-manual'].includes(
        action,
      )
    ) {
      const collection = body.jobId ? 'pod-jobs' : 'manual-fulfillment-packages'
      const target: any = await payload.findByID({
        collection: collection as any,
        id: body.jobId ?? body.packageId,
        depth: 0,
        overrideAccess: true,
      })
      assertSiteAccess(relationId(target.site))
      const order: any = await payload.findByID({
        collection: 'orders',
        id: relationId(target.order),
        depth: 0,
        overrideAccess: true,
      })
      if (relationId(order.site) !== relationId(target.site))
        throw new Error('Forbidden. Order/site mismatch.')
      await assertFulfillmentOrderEligible(payload, order)
      if (body.jobId) {
        const connection: any = await payload.findByID({
          collection: 'pod-connections',
          id: relationId(target.connection),
          depth: 0,
          overrideAccess: true,
        })
        if (
          relationId(connection.site) !== relationId(order.site) ||
          relationId(connection.merchantConnection) !== relationId(order.merchantConnection) ||
          connection.providerKey !== target.providerKey
        )
          throw new Error('Forbidden. Provider/site/merchant binding does not match the order.')
      }
    }
    // -------------------------------------------------------------
    // MANUAL FULFILLMENT ACTIONS
    // -------------------------------------------------------------
    if (action === 'acknowledge-manual') {
      const { packageId, notes } = body
      if (!packageId) return NextResponse.json({ error: 'packageId is required.' }, { status: 400 })

      const doc: any = await payload.findByID({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        depth: 0,
        overrideAccess: true,
      })
      if (!doc) return NextResponse.json({ error: 'Package not found.' }, { status: 404 })
      assertSiteAccess(relationId(doc.site))

      const pkg: ManualFulfillmentPackage = {
        id: String(doc.id),
        orderId: relationId(doc.order),
        siteId: relationId(doc.site),
        packageIndex: Number(doc.packageIndex ?? 0),
        source: doc.source,
        status: doc.status,
        approvedLines: doc.approvedLines ?? [],
        permissionedAddressManifest: doc.permissionedAddressManifest,
        instructions: doc.instructions ?? '',
        disclaimer: doc.disclaimer,
        acknowledgement: doc.acknowledgement,
        externalFulfillment: doc.externalFulfillment,
        auditTrail: doc.auditTrail ?? [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }

      const updated = acknowledgeManualFulfillmentPackage(pkg, actorId, notes)
      const saved = await payload.update({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        data: {
          status: updated.status,
          acknowledgement: updated.acknowledgement,
          auditTrail: updated.auditTrail as any,
        },
        overrideAccess: true,
      })
      return NextResponse.json({ success: true, package: saved })
    }

    if (action === 'start-production-manual') {
      const { packageId } = body
      if (!packageId) return NextResponse.json({ error: 'packageId is required.' }, { status: 400 })

      const doc: any = await payload.findByID({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        depth: 0,
        overrideAccess: true,
      })
      if (!doc) return NextResponse.json({ error: 'Package not found.' }, { status: 404 })
      assertSiteAccess(relationId(doc.site))

      const pkg: ManualFulfillmentPackage = {
        id: String(doc.id),
        orderId: relationId(doc.order),
        siteId: relationId(doc.site),
        packageIndex: Number(doc.packageIndex ?? 0),
        source: doc.source,
        status: doc.status,
        approvedLines: doc.approvedLines ?? [],
        permissionedAddressManifest: doc.permissionedAddressManifest,
        instructions: doc.instructions ?? '',
        disclaimer: doc.disclaimer,
        acknowledgement: doc.acknowledgement,
        externalFulfillment: doc.externalFulfillment,
        auditTrail: doc.auditTrail ?? [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }

      const updated = markManualFulfillmentInProduction(pkg, actorId)
      const saved = await payload.update({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        data: {
          status: updated.status,
          auditTrail: updated.auditTrail as any,
        },
        overrideAccess: true,
      })
      return NextResponse.json({ success: true, package: saved })
    }

    if (action === 'ship-manual') {
      const { packageId, carrier, trackingNumber, trackingUrl } = body
      if (!packageId || !carrier || !trackingNumber) {
        return NextResponse.json(
          { error: 'packageId, carrier, and trackingNumber are required.' },
          { status: 400 },
        )
      }

      const doc: any = await payload.findByID({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        depth: 0,
        overrideAccess: true,
      })
      if (!doc) return NextResponse.json({ error: 'Package not found.' }, { status: 404 })
      assertSiteAccess(relationId(doc.site))

      const pkg: ManualFulfillmentPackage = {
        id: String(doc.id),
        orderId: relationId(doc.order),
        siteId: relationId(doc.site),
        packageIndex: Number(doc.packageIndex ?? 0),
        source: doc.source,
        status: doc.status,
        approvedLines: doc.approvedLines ?? [],
        permissionedAddressManifest: doc.permissionedAddressManifest,
        instructions: doc.instructions ?? '',
        disclaimer: doc.disclaimer,
        acknowledgement: doc.acknowledgement,
        externalFulfillment: doc.externalFulfillment,
        auditTrail: doc.auditTrail ?? [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }

      const updated = shipManualFulfillmentPackage(
        pkg,
        { carrier, trackingNumber, trackingUrl },
        actorId,
      )
      const saved = await payload.update({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        data: {
          status: updated.status,
          externalFulfillment: updated.externalFulfillment,
          auditTrail: updated.auditTrail as any,
        },
        overrideAccess: true,
      })

      const orderId = relationId(doc.order)
      if (orderId) {
        await checkAndCompleteOrderFulfillment(payload, orderId, actorId, { shippedPackageId: packageId })
      }
      return NextResponse.json({ success: true, package: saved })
    }

    if (action === 'cancel-manual') {
      const { packageId, reason = 'Operator cancellation' } = body
      if (!packageId) return NextResponse.json({ error: 'packageId is required.' }, { status: 400 })

      const doc: any = await payload.findByID({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        depth: 0,
        overrideAccess: true,
      })
      if (!doc) return NextResponse.json({ error: 'Package not found.' }, { status: 404 })
      assertSiteAccess(relationId(doc.site))

      const pkg: ManualFulfillmentPackage = {
        id: String(doc.id),
        orderId: relationId(doc.order),
        siteId: relationId(doc.site),
        packageIndex: Number(doc.packageIndex ?? 0),
        source: doc.source,
        status: doc.status,
        approvedLines: doc.approvedLines ?? [],
        permissionedAddressManifest: doc.permissionedAddressManifest,
        instructions: doc.instructions ?? '',
        disclaimer: doc.disclaimer,
        acknowledgement: doc.acknowledgement,
        externalFulfillment: doc.externalFulfillment,
        auditTrail: doc.auditTrail ?? [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }

      const updated = cancelManualFulfillmentPackage(pkg, reason, actorId)
      const saved = await payload.update({
        collection: 'manual-fulfillment-packages',
        id: packageId,
        data: {
          status: updated.status,
          auditTrail: updated.auditTrail as any,
        },
        overrideAccess: true,
      })
      const orderId = relationId(doc.order)
      if (orderId) await checkAndCompleteOrderFulfillment(payload, orderId, actorId)
      return NextResponse.json({ success: true, package: saved })
    }

    // -------------------------------------------------------------
    // POD JOB ACTIONS
    // -------------------------------------------------------------
    if (
      [
        'submit-pod-job',
        'retry-pod-job',
        'reconcile-pod-job',
        'cancel-pod-job',
        'release-pod-hold',
      ].includes(action)
    ) {
      if (!['owner', 'administrator'].includes(String((auth?.user as any)?.role)))
        return NextResponse.json(
          { error: 'Provider actions require owner or administrator.' },
          { status: 403 },
        )
      if (!body.jobId) return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })
      const result = await executePodOperatorAction(
        payload,
        body.jobId,
        action,
        actorId,
        assertSiteAccess,
        body.reason,
      )
      return NextResponse.json(result, {
        status: result.success ? 200 : result.retryable ? 503 : 409,
      })
    }

        if (action === 'reconcile-outstanding') {
      if (!['owner', 'administrator'].includes(String((auth?.user as any)?.role)))
        return NextResponse.json(
          { error: 'Reconciling outstanding jobs requires owner or administrator.' },
          { status: 403 },
        )
      const siteId = body.siteId
      if (!siteId) return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
      assertSiteAccess(siteId)
      const result = await reconcileOutstandingFulfillmentOrders(payload, {
        siteId,
        actor: actorId,
      })
      return NextResponse.json({ success: true, ...result })
    }

    if (action === 'check-provider-health') {
      const { connectionId } = body
      if (!connectionId)
        return NextResponse.json({ error: 'connectionId is required.' }, { status: 400 })

      const conn: any = await payload.findByID({
        collection: 'pod-connections',
        id: connectionId,
        depth: 0,
        overrideAccess: true,
      })
      if (!conn) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 })
      assertSiteAccess(relationId(conn.site))

      let health: {
        ready: boolean
        health: 'healthy' | 'degraded' | 'unavailable'
        reason?: string
      }
      try {
        const adapter = await resolvePodAdapter(
          payload,
          connectionId,
          conn.providerKey,
          relationId(conn.site),
        )
        health = await adapter.health()
      } catch {
        health = {
          ready: false,
          health: 'unavailable',
          reason:
            'Provider not configured or unavailable. Repair the connection before submission.',
        }
      }
      const saved = await payload.update({
        collection: 'pod-connections',
        id: connectionId,
        data: {
          lastHealthCheckedAt: new Date().toISOString(),
          lastHealthStatus: health.health,
          lastHealthReason: health.reason,
        },
        overrideAccess: true,
      })
      return NextResponse.json(
        {
          success: health.ready,
          connection: {
            id: saved.id,
            status: saved.status,
            lastHealthStatus: saved.lastHealthStatus,
            lastHealthReason: saved.lastHealthReason,
            lastHealthCheckedAt: saved.lastHealthCheckedAt,
          },
          health,
        },
        { status: health.ready ? 200 : 503 },
      )
    }

    if (action === 'pod-preflight') {
      const { variantId, printArea, artwork, placement, connectionId } = body
      if (!connectionId || !variantId || !printArea || !artwork || !placement)
        return NextResponse.json(
          { error: 'A connection, variant, print area, artwork and placement are required.' },
          { status: 400 },
        )
      const connection = await payload.findByID({
        collection: 'pod-connections',
        id: connectionId,
        depth: 0,
        overrideAccess: true,
      })
      const siteId = relationId(connection.site)
      assertSiteAccess(siteId)
      const adapter = await resolvePodAdapter(payload, connectionId, connection.providerKey, siteId)
      const actual = await inspectPodArtwork(payload, siteId, {
        mediaAssetId: artwork.id,
        area: printArea,
        placement,
      })
      const preflight = await adapter.preflight({
        variantId,
        printArea,
        placement,
        artwork: {
          id: actual.area.artworkRenditionId,
          hash: actual.area.artworkHash,
          mimeType: 'image/png',
          widthPx: actual.evidence.width,
          heightPx: actual.evidence.height,
          dpi: actual.frozen.effectiveDpi,
        },
      })
      return NextResponse.json({
        success: preflight.passed,
        preflight,
        evidenceClass: adapter.metadata.mode,
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Fulfillment action failed'
    return NextResponse.json(
      { error: errorMsg },
      {
        status: errorMsg.startsWith('Forbidden.')
          ? 403
          : err instanceof PodProviderError && err.code === 'configuration'
            ? 503
            : 400,
      },
    )
  }
}
