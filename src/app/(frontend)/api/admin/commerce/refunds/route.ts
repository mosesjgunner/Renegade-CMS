/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { previewRefund, receiptMessageSnapshot } from '@/modules/commerce/payment-operations'
import {
  configuredPaymentProvider,
  PaymentProviderError,
} from '@/modules/commerce/payment-provider'
import { canManageAdminSite } from '@/modules/admin/site-access'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))
const relationId = (value: any) =>
  typeof value === 'object' && value !== null ? String(value.id ?? '') : String(value ?? '')

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const db: any = payload
  const auth = await payload.auth({ headers: request.headers })
  if (!staffOnly(auth.user)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const assignedSite = new URL(request.url).searchParams.get('siteId')
  if ((auth.user as any)?.role === 'staff' && !assignedSite)
    return NextResponse.json({ error: 'Choose an assigned site.' }, { status: 400 })
  if (assignedSite && !canManageAdminSite(auth.user, assignedSite))
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
  const input = (await request.json()) as {
    action?: 'preview' | 'request' | 'approve' | 'retry'
    orderId?: string
    amountMinor?: string
    reason?: string
    refundId?: string
  }
  const actorId = String((auth.user as any)?.id ?? '')
  if (input.action === 'retry') {
    const refund: any = await db.findByID({
      collection: 'commerce-refunds',
      id: String(input.refundId ?? ''),
      depth: 1,
      overrideAccess: true,
    })
    if (!refund) return NextResponse.json({ error: 'Refund not found.' }, { status: 404 })
    if (!['failed', 'unknown'].includes(refund.state))
      return NextResponse.json(
        { error: 'Only failed or unknown refunds can be retried.' },
        { status: 409 },
      )
    const retryOrder = await db
      .findByID({
        collection: 'orders',
        id: relationId(refund.order),
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (
      !retryOrder ||
      !canManageAdminSite(auth.user, retryOrder.site) ||
      (assignedSite && relationId(retryOrder.site) !== assignedSite)
    )
      return NextResponse.json({ error: 'Order site access denied.' }, { status: 403 })
    await db.update({
      collection: 'commerce-refunds',
      id: refund.id,
      data: {
        state: 'previewed',
        auditLog: [
          ...(refund.auditLog ?? []),
          { kind: 'retry-requested', actorId, at: new Date().toISOString() },
        ],
      },
      overrideAccess: true,
    })
    return executeRefund(db, refund.id, true)
  }
  if (input.action === 'approve') {
    const refund: any = await db.findByID({
      collection: 'commerce-refunds',
      id: String(input.refundId ?? ''),
      depth: 1,
      overrideAccess: true,
    })
    if (!refund || refund.state !== 'awaiting-approval')
      return NextResponse.json({ error: 'Refund is not awaiting approval.' }, { status: 409 })
    const approvalOrder = await db
      .findByID({
        collection: 'orders',
        id: relationId(refund.order),
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (
      !approvalOrder ||
      !canManageAdminSite(auth.user, approvalOrder.site) ||
      (assignedSite && relationId(approvalOrder.site) !== assignedSite)
    )
      return NextResponse.json({ error: 'Order site access denied.' }, { status: 403 })
    if (refund.requestedBy === actorId)
      return NextResponse.json(
        { error: 'A second operator must approve this refund.' },
        { status: 409 },
      )
    await db.update({
      collection: 'commerce-refunds',
      id: refund.id,
      data: {
        approvedBy: actorId,
        state: 'previewed',
        auditLog: [
          ...(refund.auditLog ?? []),
          { kind: 'approved', actorId, at: new Date().toISOString() },
        ],
      },
      overrideAccess: true,
    })
    return executeRefund(db, refund.id)
  }
  const order: any = await payload
    .findByID({
      collection: 'orders',
      id: String(input.orderId ?? ''),
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (
    !canManageAdminSite(auth.user, order.site) ||
    (assignedSite && relationId(order.site) !== assignedSite)
  )
    return NextResponse.json({ error: 'Order site access denied.' }, { status: 403 })
  const attempts = await db.find({
    collection: 'payment-attempts',
    where: { checkoutSession: { equals: relationId(order.checkoutSession) } },
    sort: '-attempt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const attempt: any = attempts.docs[0]
  if (!attempt?.providerPaymentReference)
    return NextResponse.json(
      { error: 'No refundable provider payment is recorded.' },
      { status: 409 },
    )
  const priorRefunds = await db.find({
    collection: 'commerce-refunds',
    where: {
      and: [
        { order: { equals: order.id } },
        { state: { in: ['processing', 'succeeded', 'unknown', 'awaiting-approval'] } },
      ],
    },
    limit: 100,
    overrideAccess: true,
  })
  const refundedMinor = priorRefunds.docs
    .reduce(
      (sum: bigint, row: any) => (row.state === 'succeeded' ? sum + BigInt(row.amountMinor) : sum),
      0n,
    )
    .toString()
  let preview
  try {
    preview = previewRefund({
      capturedAmountMinor: order.amountMinor,
      alreadyRefundedAmountMinor: refundedMinor,
      requestedAmountMinor: String(input.amountMinor ?? ''),
      currency: order.currency,
      orderState: order.state,
      ...(process.env.COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR
        ? { dualControlThresholdMinor: process.env.COMMERCE_REFUND_DUAL_CONTROL_THRESHOLD_MINOR }
        : {}),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid refund.' },
      { status: 422 },
    )
  }
  if (input.action === 'preview') return NextResponse.json({ preview })
  if (!input.reason?.trim())
    return NextResponse.json({ error: 'An audited refund reason is required.' }, { status: 400 })
  const key = `refund:${order.id}:${priorRefunds.totalDocs + 1}:${preview.requestedAmountMinor}`
  const existing = await db.find({
    collection: 'commerce-refunds',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs.length) return NextResponse.json({ refund: existing.docs[0], replay: true })
  const record: any = await db.create({
    collection: 'commerce-refunds',
    data: {
      site: order.site,
      publication: order.publication,
      space: order.space,
      order: order.id,
      paymentAttempt: attempt.id,
      idempotencyKey: key,
      amountMinor: preview.requestedAmountMinor,
      currency: order.currency,
      kind: preview.outcome,
      state: preview.requiresSecondApproval ? 'awaiting-approval' : 'previewed',
      reason: input.reason.trim(),
      requestedBy: actorId,
      downstreamPolicy: {
        fulfillment: 'manual-review',
        entitlement: preview.outcome === 'full' ? 'revoke-after-provider-success' : 'retain',
      },
      auditLog: [{ kind: 'requested', actorId, at: new Date().toISOString(), preview }],
    },
    overrideAccess: true,
  })
  if (preview.requiresSecondApproval)
    return NextResponse.json({ refund: record, approvalRequired: true }, { status: 202 })
  return executeRefund(db, record.id)
}

async function executeRefund(payload: any, refundId: string, isRetry = false) {
  const refund: any = await payload.findByID({
    collection: 'commerce-refunds',
    id: refundId,
    depth: 1,
    overrideAccess: true,
  })
  if (!isRetry && ['processing', 'succeeded', 'failed', 'unknown'].includes(refund.state))
    return NextResponse.json({ refund, replay: true })
  if (isRetry && refund.state === 'succeeded') return NextResponse.json({ refund, replay: true })
  const attempt: any = refund.paymentAttempt
  const order: any = refund.order
  await payload.update({
    collection: 'commerce-refunds',
    id: refund.id,
    data: { state: 'processing' },
    overrideAccess: true,
  })
  try {
    const provider = configuredPaymentProvider(attempt.providerKey)
    const result = await provider.refund({
      providerPaymentReference: attempt.providerPaymentReference,
      amountMinor: refund.amountMinor,
      currency: refund.currency,
      idempotencyKey: refund.idempotencyKey,
      reason: 'requested_by_customer',
    })
    const state = result.state
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
    if (state === 'succeeded') {
      const all = await payload.find({
        collection: 'commerce-refunds',
        where: { and: [{ order: { equals: order.id } }, { state: { equals: 'succeeded' } }] },
        limit: 100,
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
            ...(order.transitionLog ?? []),
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
      if (full || refund.downstreamPolicy?.entitlement === 'revoke-after-provider-success') {
        const grants = await payload.find({
          collection: 'digital-delivery-grants',
          where: { order: { equals: order.id } },
          limit: 100,
          overrideAccess: true,
        })
        for (const grant of grants.docs as any[]) {
          await payload.update({
            collection: 'digital-delivery-grants',
            id: grant.id,
            data: { state: 'revoked' },
            overrideAccess: true,
          })
        }
        const entitlements = await payload.find({
          collection: 'entitlements',
          where: { source: { in: [String(order.id), String(order.orderNumber)] } },
          limit: 100,
          overrideAccess: true,
        })
        for (const entitlement of entitlements.docs as any[]) {
          await payload.update({
            collection: 'entitlements',
            id: entitlement.id,
            data: { revokedAt: new Date().toISOString() },
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
    }
    return NextResponse.json({ refund: updated })
  } catch (error) {
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
