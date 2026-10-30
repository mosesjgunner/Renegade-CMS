/* eslint-disable @typescript-eslint/no-explicit-any */
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { adapterForPodConnection } from '@/modules/commerce/pod-adapters'
import {
  decryptPodConnectionCredentials,
  decryptCredential,
} from '@/modules/commerce/pod-connection'
import { applyNormalizedPodEvent } from '@/modules/commerce/pod-reconciliation'
import { checkAndCompleteOrderFulfillment } from '@/modules/commerce/fulfillment-operator'
import { withExecutionLock } from '@/modules/operations/execution-lock'
import { loadConfig } from '@/modules/core/config'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const connectionId =
      url.searchParams.get('connectionId') ?? request.headers.get('x-connection-id')
    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required.' }, { status: 400 })
    }

    const rawBody = await request.text()
    if (rawBody.length > 1_000_000) {
      return NextResponse.json({ error: 'Payload too large.' }, { status: 413 })
    }

    const payload = await getPayload({ config: configPromise })
    const connection: any = await payload
      .findByID({
        collection: 'pod-connections',
        id: connectionId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found.' }, { status: 404 })
    }
    if (connection.status === 'disabled') {
      return NextResponse.json({ error: 'Connection is disabled.' }, { status: 403 })
    }

    const encryptionKey =
      process.env.RENEGADE_POD_ENCRYPTION_KEY || process.env.RENEGADE_ENCRYPTION_KEY
    let webhookSecret = ''
    try {
      const raw = decryptCredential(connection.encryptedApiKey, encryptionKey)
      try {
        const parsed = JSON.parse(raw)
        webhookSecret = parsed.webhookSecret ?? parsed.secret ?? ''
      } catch {
        // raw key is plain string
      }
      if (!webhookSecret && connection.encryptedWebhookSecret) {
        webhookSecret = decryptCredential(connection.encryptedWebhookSecret, encryptionKey)
      }
    } catch (err) {
      console.error('Failed to decrypt pod credentials:', err)
      return NextResponse.json({ error: 'Invalid connection credentials.' }, { status: 500 })
    }

    const signature =
      request.headers.get('x-pod-signature') ??
      request.headers.get('x-pf-signature') ??
      request.headers.get('x-pfy-signature') ??
      request.headers.get('x-signature') ??
      request.headers.get('stripe-signature') ??
      ''

    const adapter = adapterForPodConnection(connection, 'orders')
    const event = adapter.verifyWebhook(rawBody, signature, webhookSecret)
    if (!event || !event.externalOrderId) {
      return NextResponse.json({ error: 'Invalid webhook signature or event.' }, { status: 401 })
    }

    // Correlate to job by externalOrderId or idempotencyKey
    const matchingJobs = await payload.find({
      collection: 'pod-jobs',
      where: {
        and: [
          { connection: { equals: connectionId } },
          { externalOrderId: { equals: event.externalOrderId } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    let jobDoc = matchingJobs.docs[0] as any
    if (!jobDoc) {
      const byKey = await payload.find({
        collection: 'pod-jobs',
        where: {
          and: [
            { connection: { equals: connectionId } },
            { idempotencyKey: { equals: event.externalOrderId } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      jobDoc = byKey.docs[0] as any
    }

    if (!jobDoc) {
      return NextResponse.json({ received: true, correlated: false }, { status: 202 })
    }

    const orderId =
      typeof jobDoc.order === 'object' && jobDoc.order ? jobDoc.order.id : String(jobDoc.order)

    return await withExecutionLock(payload, `commerce.fulfillment.order:${orderId}`, async () => {
      const currentJob: any = await payload.findByID({
        collection: 'pod-jobs',
        id: jobDoc.id,
        depth: 0,
        overrideAccess: true,
      })

      const auditTrail = currentJob.auditTrail ?? []
      const alreadyProcessed = auditTrail.some(
        (a: any) => a.details?.providerEventId === event.providerEventId,
      )
      if (alreadyProcessed) {
        return NextResponse.json({ received: true, replay: true })
      }

      const updatedJob = applyNormalizedPodEvent(
        {
          ...currentJob,
          orderId,
          siteId:
            typeof currentJob.site === 'object' && currentJob.site
              ? currentJob.site.id
              : String(currentJob.site),
          connectionId,
          auditTrail,
          itemsSnapshot: currentJob.itemsSnapshot ?? [],
          attemptCount: currentJob.attemptCount ?? 0,
        },
        event,
      )

      await payload.update({
        collection: 'pod-jobs',
        id: currentJob.id,
        data: {
          state: updatedJob.state,
          externalOrderId: updatedJob.externalOrderId,
          auditTrail: updatedJob.auditTrail as any,
        },
        overrideAccess: true,
      })

      const completion = await checkAndCompleteOrderFulfillment(
        payload,
        orderId,
        `webhook:${event.providerKey}`,
      )

      return NextResponse.json({
        received: true,
        replay: false,
        state: updatedJob.state,
        orderFulfilled: completion.fulfilled,
      })
    })
  } catch (error) {
    console.error('POD Webhook handler error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal webhook error' },
      { status: 500 },
    )
  }
}
