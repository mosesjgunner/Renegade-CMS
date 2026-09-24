/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { receiptMessageSnapshot } from '@/modules/commerce/payment-operations'

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!['owner', 'administrator', 'staff'].includes(String((auth.user as any)?.role)))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  const order: any = await payload
    .findByID({ collection: 'orders', id: (await params).orderId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!order?.receipt?.receiptNumber)
    return NextResponse.json({ error: 'Issued receipt not found.' }, { status: 404 })
  const email = String(order.partySnapshot?.email ?? '')
  if (!email)
    return NextResponse.json(
      { error: 'The immutable order snapshot has no receipt address.' },
      { status: 409 },
    )
  const originalKey = `commerce-receipt:${order.id}:${order.receipt.receiptNumber}`
  const messages = await payload.find({
    collection: 'email-messages',
    where: { idempotencyKey: { equals: originalKey } },
    limit: 1,
    overrideAccess: true,
  })
  const message: any = messages.docs[0]
  if (!message)
    return NextResponse.json({ error: 'Canonical receipt message not found.' }, { status: 409 })
  const audit = Array.isArray(order.transitionLog) ? order.transitionLog : []
  const resendNumber = audit.filter((entry: any) => entry.kind === 'receipt-resent').length + 1
  const key = `${originalKey}:resend:${resendNumber}`
  const existing = await payload.find({
    collection: 'email-deliveries',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs.length)
    return NextResponse.json({ deliveryId: existing.docs[0].id, replay: true })
  const snapshot = receiptMessageSnapshot({
    orderNumber: order.orderNumber,
    receiptNumber: order.receipt.receiptNumber,
    recipientEmail: email,
    amountMinor: order.amountMinor,
    currency: order.currency,
  })
  const delivery: any = await payload.create({
    collection: 'email-deliveries',
    data: {
      message: message.id,
      recipientEmail: email,
      idempotencyKey: key,
      status: 'queued',
      messageSnapshot: snapshot,
      outcome: { auditedResend: true, orderId: order.id },
    },
    overrideAccess: true,
  })
  await (payload.jobs as any).queue({
    task: 'audience-email-delivery',
    input: { deliveryId: String(delivery.id) },
    queue: 'operations',
  })
  await payload.update({
    collection: 'orders',
    id: order.id,
    data: {
      transitionLog: [
        ...audit,
        {
          kind: 'receipt-resent',
          deliveryId: delivery.id,
          actorId: String((auth.user as any).id),
          at: new Date().toISOString(),
        },
      ],
    },
    overrideAccess: true,
  })
  return NextResponse.json({ deliveryId: delivery.id, queued: true }, { status: 202 })
}
