/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { previewRefund } from '@/modules/commerce/payment-operations'
import { executeRefund } from '@/modules/commerce/refund-execution'
import { withExecutionLock } from '@/modules/operations/execution-lock'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

const relationId = (value: any) =>
  typeof value === 'object' && value !== null ? String(value.id ?? '') : String(value ?? '')

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const db: any = payload
  const auth = await payload.auth({ headers: request.headers })
  const grant = await resolveOperatorGrantContext(payload, auth?.user)
  if (!grant.authorized) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const input = (await request.json()) as {
    action?: 'preview' | 'request' | 'approve' | 'reconcile'
    orderId?: string
    amountMinor?: string
    reason?: string
    refundId?: string
  }
  const actorId = String((auth.user as any)?.id ?? '')
  const operate = async () => {
    if (input.action === 'approve' || input.action === 'reconcile') {
      const refund: any = await db.findByID({
        collection: 'commerce-refunds',
        id: String(input.refundId ?? ''),
        depth: 1,
        overrideAccess: true,
      })
      if (!refund) return NextResponse.json({ error: 'Refund not found.' }, { status: 404 })
      const refundSite = relationId(refund.site)
      if (!refundSite || (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(refundSite))) {
        return NextResponse.json(
          { error: 'Forbidden. Object belongs to another site.' },
          { status: 403 },
        )
      }
      if (input.action === 'reconcile') {
        if (refund.state !== 'succeeded')
          return NextResponse.json(
            { error: 'Only a confirmed refund can reconcile account updates.' },
            { status: 409 },
          )
        return executeRefund(db, refund.id)
      }
      if (refund.state !== 'awaiting-approval')
        return NextResponse.json({ error: 'Refund is not awaiting approval.' }, { status: 409 })
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
    const orderSite = relationId(order.site)
    if (!orderSite || (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(orderSite))) {
      return NextResponse.json(
        { error: 'Forbidden. Object belongs to another site.' },
        { status: 403 },
      )
    }
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
        (sum: bigint, row: any) =>
          row.state === 'succeeded' ? sum + BigInt(row.amountMinor) : sum,
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
  let lockOrderId = String(input.orderId ?? '')
  if (input.action === 'approve' || input.action === 'reconcile') {
    const target: any = await db
      .findByID({
        collection: 'commerce-refunds',
        id: String(input.refundId ?? ''),
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!target) return NextResponse.json({ error: 'Refund not found.' }, { status: 404 })
    const site = relationId(target.site)
    if (!site || (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(site)))
      return NextResponse.json(
        { error: 'Forbidden. Object belongs to another site.' },
        { status: 403 },
      )
    lockOrderId = relationId(target.order)
  }
  return withExecutionLock(payload, `commerce.refund.order:${lockOrderId}`, operate)
}
