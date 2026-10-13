/* eslint-disable @typescript-eslint/no-explicit-any */
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import {
  acknowledgeManualFulfillmentPackage,
  markManualFulfillmentInProduction,
  shipManualFulfillmentPackage,
  cancelManualFulfillmentPackage,
  handoffFailedPodJobToManual,
  type ManualFulfillmentPackage,
} from '@/modules/commerce/manual-fulfillment'
import {
  releasePodJobHold,
  cancelPodJob,
  submitPodJobWithRetry,
} from '@/modules/commerce/pod-operations'
import { PodEmulatorAdapter } from '@/modules/commerce/pod-emulator'
import { PrintfulPodAdapter } from '@/modules/commerce/pod-real-provider'
import { decryptCredential } from '@/modules/commerce/pod-connection'
import { PodProviderError, type PodProviderAdapter } from '@/modules/commerce/pod-contract'
import type { PODJob } from '@/modules/commerce/fulfillment-plan'

export const dynamic = 'force-dynamic'

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
    if (providerKey === 'printful' && conn.encryptedApiKey) {
      const apiKey = decryptCredential(conn.encryptedApiKey)
      return new PrintfulPodAdapter({
        apiKey,
        storeId: conn.remoteStoreId,
      })
    }
  }
  if (providerKey === 'pod-emulator') return new PodEmulatorAdapter()
  throw new PodProviderError(
    'configuration',
    'The selected POD provider is not configured.',
    false,
    true,
  )
}

export async function POST(request: Request) {
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

      // Check if all packages/jobs for parent order are fulfilled
      const orderId = relationId(doc.order)
      if (orderId) {
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

        const allManualShippedOrCancelled = siblingManualRes.docs.every(
          (m: any) => m.id === packageId || m.status === 'shipped' || m.status === 'cancelled',
        )
        const allPodShippedOrCancelled = siblingPodRes.docs.every(
          (p: any) =>
            p.state === 'shipped' ||
            p.state === 'delivered' ||
            p.state === 'cancelled' ||
            (p.state === 'failed' &&
              siblingManualRes.docs.some(
                (m: any) =>
                  m.source === 'pod-submission-exhausted' &&
                  m.packageIndex === p.packageIndex &&
                  (m.id === packageId || m.status === 'shipped'),
              )),
        )

        if (allManualShippedOrCancelled && allPodShippedOrCancelled) {
          const orderDoc: any = await payload.findByID({
            collection: 'orders',
            id: orderId,
            depth: 0,
            overrideAccess: true,
          })
          const currentLog = Array.isArray(orderDoc?.transitionLog) ? orderDoc.transitionLog : []
          await payload.update({
            collection: 'orders',
            id: orderId,
            data: {
              state: 'fulfilled',
              transitionLog: [
                ...currentLog,
                { kind: 'order-fulfilled', at: new Date().toISOString(), actor: actorId },
              ],
            },
            overrideAccess: true,
          })
        }
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
      return NextResponse.json({ success: true, package: saved })
    }

    // -------------------------------------------------------------
    // POD JOB ACTIONS
    // -------------------------------------------------------------
    if (action === 'release-pod-hold') {
      const { jobId } = body
      if (!jobId) return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })

      const doc: any = await payload.findByID({
        collection: 'pod-jobs',
        id: jobId,
        depth: 0,
        overrideAccess: true,
      })
      if (!doc) return NextResponse.json({ error: 'POD job not found.' }, { status: 404 })
      assertSiteAccess(relationId(doc.site))

      const job: PODJob = {
        id: String(doc.id),
        orderId: relationId(doc.order),
        siteId: relationId(doc.site),
        connectionId: relationId(doc.connection),
        providerKey: doc.providerKey,
        packageIndex: doc.packageIndex ?? 0,
        idempotencyKey: doc.idempotencyKey,
        payloadHash: doc.payloadHash,
        state: doc.state,
        addressPolicy: doc.addressPolicy,
        recipientSnapshot: doc.recipientSnapshot,
        itemsSnapshot: doc.itemsSnapshot ?? [],
        costSnapshot: doc.costSnapshot ?? { estimatedCostMinor: '0', currency: 'USD' },
        attemptCount: doc.attemptCount ?? 0,
        externalOrderId: doc.externalOrderId,
        holdExpiresAt: doc.holdExpiresAt,
        releasedAt: doc.releasedAt,
        auditTrail: doc.auditTrail ?? [],
        lastError: doc.lastError,
        lastReconciledAt: doc.lastReconciledAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }

      const updated = releasePodJobHold(job, actorId)
      const saved = await payload.update({
        collection: 'pod-jobs',
        id: jobId,
        data: {
          state: updated.state,
          releasedAt: updated.releasedAt,
          auditTrail: updated.auditTrail as any,
        },
        overrideAccess: true,
      })
      return NextResponse.json({ success: true, job: saved })
    }

    if (action === 'submit-pod-job') {
      const { jobId } = body
      if (!jobId) return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })

      const doc: any = await payload.findByID({
        collection: 'pod-jobs',
        id: jobId,
        depth: 0,
        overrideAccess: true,
      })
      if (!doc) return NextResponse.json({ error: 'POD job not found.' }, { status: 404 })
      assertSiteAccess(relationId(doc.site))

      const job: PODJob = {
        id: String(doc.id),
        orderId: relationId(doc.order),
        siteId: relationId(doc.site),
        connectionId: relationId(doc.connection),
        providerKey: doc.providerKey,
        packageIndex: doc.packageIndex ?? 0,
        idempotencyKey: doc.idempotencyKey,
        payloadHash: doc.payloadHash,
        state: doc.state,
        addressPolicy: doc.addressPolicy,
        recipientSnapshot: doc.recipientSnapshot,
        itemsSnapshot: doc.itemsSnapshot ?? [],
        costSnapshot: doc.costSnapshot ?? { estimatedCostMinor: '0', currency: 'USD' },
        attemptCount: doc.attemptCount ?? 0,
        externalOrderId: doc.externalOrderId,
        holdExpiresAt: doc.holdExpiresAt,
        releasedAt: doc.releasedAt,
        auditTrail: doc.auditTrail ?? [],
        lastError: doc.lastError,
        lastReconciledAt: doc.lastReconciledAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }

      const adapter = await resolvePodAdapter(
        payload,
        job.connectionId,
        job.providerKey,
        job.siteId,
      )
      const outcome = await submitPodJobWithRetry({ job, adapter, actor: actorId })

      if (outcome.success) {
        const saved = await payload.update({
          collection: 'pod-jobs',
          id: jobId,
          data: {
            state: outcome.job.state,
            externalOrderId: outcome.job.externalOrderId,
            attemptCount: outcome.job.attemptCount,
            auditTrail: outcome.job.auditTrail as any,
          },
          overrideAccess: true,
        })
        return NextResponse.json({ success: true, job: saved })
      } else {
        const savedJob = await payload.update({
          collection: 'pod-jobs',
          id: jobId,
          data: {
            state: outcome.job.state,
            attemptCount: outcome.job.attemptCount,
            lastError: outcome.job.lastError,
            auditTrail: outcome.job.auditTrail as any,
          },
          overrideAccess: true,
        })

        let manualHandoff: any = null
        if (outcome.handoffRequired) {
          const manualPkg = handoffFailedPodJobToManual(
            outcome.job,
            outcome.error,
            undefined,
            actorId,
          )
          manualHandoff = await payload.create({
            collection: 'manual-fulfillment-packages',
            data: {
              site: outcome.job.siteId,
              order: outcome.job.orderId,
              packageIndex: manualPkg.packageIndex,
              source: manualPkg.source,
              status: manualPkg.status,
              approvedLines: manualPkg.approvedLines as any,
              permissionedAddressManifest: manualPkg.permissionedAddressManifest,
              instructions: manualPkg.instructions,
              auditTrail: manualPkg.auditTrail as any,
            },
            overrideAccess: true,
          })
        }

        return NextResponse.json(
          {
            success: false,
            error: outcome.error,
            job: savedJob,
            manualHandoff,
          },
          { status: outcome.retryable ? 503 : 409 },
        )
      }
    }

    if (action === 'cancel-pod-job') {
      const { jobId, reason = 'Operator cancellation' } = body
      if (!jobId) return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })

      const doc: any = await payload.findByID({
        collection: 'pod-jobs',
        id: jobId,
        depth: 0,
        overrideAccess: true,
      })
      if (!doc) return NextResponse.json({ error: 'POD job not found.' }, { status: 404 })
      assertSiteAccess(relationId(doc.site))

      const job: PODJob = {
        id: String(doc.id),
        orderId: relationId(doc.order),
        siteId: relationId(doc.site),
        connectionId: relationId(doc.connection),
        providerKey: doc.providerKey,
        packageIndex: doc.packageIndex ?? 0,
        idempotencyKey: doc.idempotencyKey,
        payloadHash: doc.payloadHash,
        state: doc.state,
        addressPolicy: doc.addressPolicy,
        recipientSnapshot: doc.recipientSnapshot,
        itemsSnapshot: doc.itemsSnapshot ?? [],
        costSnapshot: doc.costSnapshot ?? { estimatedCostMinor: '0', currency: 'USD' },
        attemptCount: doc.attemptCount ?? 0,
        externalOrderId: doc.externalOrderId,
        holdExpiresAt: doc.holdExpiresAt,
        releasedAt: doc.releasedAt,
        auditTrail: doc.auditTrail ?? [],
        lastError: doc.lastError,
        lastReconciledAt: doc.lastReconciledAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }

      const adapter = await resolvePodAdapter(
        payload,
        job.connectionId,
        job.providerKey,
        job.siteId,
      )
      const updated = await cancelPodJob(job, adapter, reason, actorId)
      const saved = await payload.update({
        collection: 'pod-jobs',
        id: jobId,
        data: {
          state: updated.state,
          auditTrail: updated.auditTrail as any,
        },
        overrideAccess: true,
      })
      return NextResponse.json({ success: true, job: saved })
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

      const adapter = await resolvePodAdapter(
        payload,
        connectionId,
        conn.providerKey,
        relationId(conn.site),
      )
      const health = await adapter.health()
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
      return NextResponse.json({ success: true, connection: saved, health })
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
      const preflight = await adapter.preflight({
        variantId,
        printArea,
        artwork,
        placement,
      })
      return NextResponse.json({ success: true, preflight })
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
