/* eslint-disable @typescript-eslint/no-explicit-any */
import { createLocalReq } from 'payload'
import { NextResponse } from 'next/server'
import { transactionPayload } from '../core/transaction-payload'
import { receiptMessageSnapshot } from './payment-operations'
import { configuredPaymentProvider, PaymentProviderError } from './payment-provider'
import { reverseDonation } from './donation-ingestion'
const relationId = (value: any) =>
  typeof value === 'object' && value !== null ? String(value.id ?? '') : String(value ?? '')
async function persistRefundEffects(
  root: any,
  refund: any,
  attempt: any,
  order: any,
  correctionReceipt: any,
  providerRefundReference: string,
) {
  const transactionID = await root.db.beginTransaction()
  if (!transactionID) throw new Error('Refund reconciliation transaction unavailable.')
  const req = await createLocalReq({}, root)
  req.transactionID = transactionID
  const payload = transactionPayload(root, req)
  try {
    const all = await payload.find({
      collection: 'commerce-refunds',
      where: { and: [{ order: { equals: order.id } }, { state: { equals: 'succeeded' } }] },
      pagination: false,
      overrideAccess: true,
    })
    const refunded = all.docs.reduce((sum: bigint, row: any) => sum + BigInt(row.amountMinor), 0n)
    const full = refunded >= BigInt(order.amountMinor)
    await payload.update({
      collection: 'orders',
      id: order.id,
      data: {
        state: full ? 'refunded' : order.state,
        refundExtension: {
          refundedAmountMinor: refunded.toString(),
          state: full ? 'full' : 'partial',
        },
        transitionLog: [
          ...(order.transitionLog ?? []).filter((entry: any) => entry.refundId !== refund.id),
          {
            kind: full ? 'full-refund' : 'partial-refund',
            refundId: refund.id,
            amountMinor: refund.amountMinor,
            at: new Date().toISOString(),
          },
        ],
      },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'payment-attempts',
      id: attempt.id,
      data: {
        state: full ? 'refunded' : 'partially-refunded',
        refundedAmountMinor: refunded.toString(),
      },
      overrideAccess: true,
    })
    const intentId = relationId(attempt.paymentIntent)
    const intent = intentId
      ? await payload.findByID({
          collection: 'payment-intents',
          id: intentId,
          depth: 0,
          overrideAccess: true,
        })
      : null
    if (intent)
      await payload.update({
        collection: 'payment-intents',
        id: intentId,
        data: {
          ...(full ? { state: 'refunded' } : {}),
          financialEvents: [
            ...(Array.isArray(intent.financialEvents) ? intent.financialEvents : []).filter(
              (entry: any) => entry.refundId !== refund.id,
            ),
            {
              kind: 'refunded',
              refundId: refund.id,
              amountMinor: refund.amountMinor,
              currency: refund.currency,
              providerReference: providerRefundReference,
              occurredAt: new Date().toISOString(),
            },
          ],
        },
        overrideAccess: true,
      })
    const gifts = await payload.find({
      collection: 'donations',
      where: { paymentIntent: { equals: relationId(attempt.paymentIntent) } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    for (const gift of gifts.docs)
      await reverseDonation(payload, {
        donationId: String(gift.id),
        eventKey: `operator-refund:${refund.id}`,
        kind: full ? 'refunded' : 'partially-refunded',
        occurredAt: new Date().toISOString(),
        amountMinor: String(refund.amountMinor),
        evidence: {
          refundId: String(refund.id),
          providerRefundReference,
        },
      })
    if (full) {
      const matchingEntitlements = await payload.find({
        collection: 'entitlements',
        where: { source: { equals: `order:${order.id}` } },
        pagination: false,
        overrideAccess: true,
      })
      const nowIso = new Date().toISOString()
      for (const ent of matchingEntitlements.docs) {
        const grants = await payload.find({
          collection: 'digital-delivery-grants',
          where: { entitlement: { equals: ent.id } },
          pagination: false,
          overrideAccess: true,
        })
        for (const grant of grants.docs)
          await payload.update({
            collection: 'digital-delivery-grants',
            id: grant.id,
            data: { revokedAt: nowIso },
            overrideAccess: true,
          })
        await payload.update({
          collection: 'entitlements',
          id: ent.id,
          data: {
            revokedAt: nowIso,
            endsAt: nowIso,
          },
          overrideAccess: true,
        })
      }
    }
    if (correctionReceipt?.recipient) {
      const key = `commerce-refund-receipt:${refund.id}`
      const messages = await payload.find({
        collection: 'email-messages',
        where: { idempotencyKey: { equals: key } },
        limit: 1,
        overrideAccess: true,
      })
      const message =
        messages.docs[0] ??
        (await payload.create({
          collection: 'email-messages',
          data: {
            site: relationId(order.site),
            subject: correctionReceipt.subject,
            purpose: correctionReceipt.purpose,
            kind: 'transactional',
            status: 'queued',
            blocks: [
              { type: 'heading', text: correctionReceipt.subject },
              {
                type: 'text',
                text: `Refund ${refund.amountMinor} ${refund.currency} for order ${order.orderNumber}.`,
              },
            ],
            idempotencyKey: key,
          },
          overrideAccess: true,
        }))
      const deliveries = await payload.find({
        collection: 'email-deliveries',
        where: { idempotencyKey: { equals: key } },
        limit: 1,
        overrideAccess: true,
      })
      if (!deliveries.docs.length) {
        const delivery = await payload.create({
          collection: 'email-deliveries',
          data: {
            message: message.id,
            recipientEmail: correctionReceipt.recipient,
            idempotencyKey: key,
            status: 'queued',
            messageSnapshot: correctionReceipt,
          },
          overrideAccess: true,
        })
        await payload.jobs.queue({
          task: 'audience-email-delivery',
          input: { deliveryId: String(delivery.id) },
          queue: 'operations',
        })
      }
    }

    await payload.update({
      collection: 'commerce-refunds',
      id: refund.id,
      data: {
        providerEvidence: {
          ...(refund.providerEvidence ?? {}),
          localReconciliationRequired: false,
        },
      },
      overrideAccess: true,
    })
    await root.db.commitTransaction(transactionID)
  } catch (error) {
    await root.db.rollbackTransaction(transactionID)
    throw error
  }
}

async function reconciliationPending(payload: any, refundId: string) {
  const current = await payload.findByID({
    collection: 'commerce-refunds',
    id: refundId,
    depth: 0,
    overrideAccess: true,
  })
  if (current.state === 'succeeded')
    await payload.update({
      collection: 'commerce-refunds',
      id: refundId,
      data: {
        providerEvidence: {
          ...(current.providerEvidence ?? {}),
          localReconciliationRequired: true,
        },
      },
      overrideAccess: true,
    })
  return NextResponse.json(
    {
      refund: current,
      reconcileRequired: true,
      providerOutcome: 'succeeded',
      message: 'Refund confirmed; account and receipt updates require operator reconciliation.',
    },
    { status: 202 },
  )
}

export async function executeRefund(payload: any, refundId: string) {
  const refund: any = await payload.findByID({
    collection: 'commerce-refunds',
    id: refundId,
    depth: 1,
    overrideAccess: true,
  })
  if (refund.state === 'succeeded') {
    try {
      await persistRefundEffects(
        payload,
        refund,
        refund.paymentAttempt,
        refund.order,
        refund.correctionReceipt,
        refund.providerRefundReference,
      )
    } catch {
      return reconciliationPending(payload, refund.id)
    }
    return NextResponse.json({
      refund: await payload.findByID({
        collection: 'commerce-refunds',
        id: refund.id,
        depth: 0,
        overrideAccess: true,
      }),
      replay: true,
    })
  }
  if (['processing', 'failed', 'unknown'].includes(refund.state))
    return NextResponse.json({ refund, replay: true })
  const attempt: any = refund.paymentAttempt
  const order: any = refund.order
  await payload.update({
    collection: 'commerce-refunds',
    id: refund.id,
    data: { state: 'processing' },
    overrideAccess: true,
  })
  let providerSucceeded = false
  try {
    const provider = configuredPaymentProvider(attempt.providerKey)
    const result = await provider.refund({
      providerPaymentReference: attempt.providerPaymentReference,
      amountMinor: refund.amountMinor,
      currency: refund.currency,
      idempotencyKey: refund.idempotencyKey,
      reason: 'requested_by_customer',
    })
    if (result.state === 'succeeded' && result.amountMinor !== refund.amountMinor)
      throw new PaymentProviderError(
        'refund-amount-mismatch',
        'Provider refund amount requires reconciliation.',
        false,
        false,
      )
    const state = result.state
    providerSucceeded = state === 'succeeded'
    const correctionReceipt =
      state === 'succeeded'
        ? receiptMessageSnapshot({
            orderNumber: order.orderNumber,
            receiptNumber: `${order.receipt?.receiptNumber ?? order.orderNumber}-R${refund.id}`,
            recipientEmail: String(order.partySnapshot?.email ?? ''),
            amountMinor: refund.amountMinor,
            currency: refund.currency,
            correctionOf: String(order.receipt?.receiptNumber ?? ''),
          })
        : null
    const updated = await payload.update({
      collection: 'commerce-refunds',
      id: refund.id,
      data: {
        state,
        providerRefundReference: result.providerRefundReference,
        providerEvidence: { state: result.state, amountMinor: result.amountMinor },
        correctionReceipt,
        auditLog: [
          ...(refund.auditLog ?? []),
          { kind: `provider-${state}`, at: new Date().toISOString() },
        ],
      },
      overrideAccess: true,
    })
    if (state === 'succeeded')
      await persistRefundEffects(
        payload,
        updated,
        attempt,
        order,
        correctionReceipt,
        result.providerRefundReference,
      )
    return NextResponse.json({ refund: updated })
  } catch (error) {
    if (providerSucceeded) return reconciliationPending(payload, refund.id)
    const unknown = error instanceof PaymentProviderError && !error.outcomeKnown
    const updated = await payload.update({
      collection: 'commerce-refunds',
      id: refund.id,
      data: {
        state: unknown ? 'unknown' : 'failed',
        providerEvidence: {
          code: error instanceof PaymentProviderError ? error.code : 'provider-error',
          message: error instanceof Error ? error.message.slice(0, 300) : 'failed',
        },
        auditLog: [
          ...(refund.auditLog ?? []),
          { kind: unknown ? 'provider-unknown' : 'provider-failed', at: new Date().toISOString() },
        ],
      },
      overrideAccess: true,
    })
    return NextResponse.json(
      { refund: updated, reconcileRequired: unknown },
      { status: unknown ? 202 : 502 },
    )
  }
}
