/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { createHash } from 'node:crypto'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  applyVerifiedWebhook,
  createDevelopmentAdapter,
  finalizeVerifiedOrder,
  transitionOrder,
  validWebhookEvent,
} from '@/modules/commerce/service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const provider = (await params).provider
  if (!provider.startsWith('development-'))
    return NextResponse.json({ error: 'Adapter is not configured.' }, { status: 404 })
  const raw = await request.text()
  const event = createDevelopmentAdapter(
    provider,
    process.env.COMMERCE_TEST_WEBHOOK_SECRET ?? 'development-only',
  ).verifyWebhook(raw, request.headers.get('x-commerce-signature') ?? '')
  if (!event) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  const payload = await getPayload({ config })
  const db: any = payload
  const intent: any = await db.findByID({
    collection: 'payment-intents',
    id: event.intentId,
    depth: 1,
    overrideAccess: true,
  })
  if (!validWebhookEvent(event, intent.id))
    return NextResponse.json({ error: 'Invalid webhook event.' }, { status: 400 })
  if (intent.providerKey !== provider)
    return NextResponse.json({ error: 'Provider does not own this intent.' }, { status: 403 })
  const replay = await db.find({
    collection: 'payment-webhook-events',
    where: {
      and: [{ providerKey: { equals: provider } }, { providerEventId: { equals: event.id } }],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (replay.docs.length) return NextResponse.json({ received: true, replay: true })
  const merchantId =
    typeof intent.merchantConnection === 'string'
      ? intent.merchantConnection
      : intent.merchantConnection.id
  await db.create({
    collection: 'payment-webhook-events',
    data: {
      merchantConnection: merchantId,
      providerKey: provider,
      providerEventId: event.id,
      payloadHash: createHash('sha256').update(raw).digest('hex'),
      verifiedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  const updated = applyVerifiedWebhook(
    {
      id: intent.id,
      scope: { siteId: String(intent.site), merchantConnectionId: merchantId },
      money: {
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        quotedAt: intent.createdAt,
        quoteSource: null,
        buyerConfirmedConversion: false,
      },
      state: intent.state,
      capabilityId: intent.capabilityId,
      expiresAt: intent.expiresAt,
      financialEvents: intent.financialEvents ?? [],
    },
    event,
  )
  await db.update({
    collection: 'payment-intents',
    id: intent.id,
    data: { state: updated.state, financialEvents: updated.financialEvents },
    overrideAccess: true,
  })
  const session: any =
    typeof intent.checkoutSession === 'object'
      ? intent.checkoutSession
      : await db.findByID({
          collection: 'checkout-sessions',
          id: intent.checkoutSession,
          depth: 1,
          overrideAccess: true,
        })
  const nextState =
    event.kind === 'confirmed' ? 'completed' : event.kind === 'failed' ? 'failed' : 'cancelled'
  await db.update({
    collection: 'checkout-sessions',
    id: session.id,
    data: { state: nextState },
    overrideAccess: true,
  })
  if (event.kind === 'confirmed') {
    await finalizeVerifiedOrder(db, {
      intent: {
        ...intent,
        state: updated.state,
        financialEvents: updated.financialEvents,
      },
      session,
      merchantId,
      verifiedAt: new Date().toISOString(),
    })
    return NextResponse.json({ received: true })
  }
  const orders = await db.find({
    collection: 'orders',
    where: { checkoutSession: { equals: session.id } },
    limit: 1,
    overrideAccess: true,
  })
  const cart: any =
    typeof session.cart === 'object'
      ? session.cart
      : await db.findByID({ collection: 'carts', id: session.cart, depth: 0, overrideAccess: true })
  if (!orders.docs.length)
    await db.create({
      collection: 'orders',
      data: {
        site: session.site,
        publication: session.publication,
        space: session.space,
        checkoutSession: session.id,
        merchantConnection: merchantId,
        orderNumber: `order_${session.id}`,
        state: transitionOrder('pending-payment', event),
        currency: session.currency,
        amountMinor: session.amountMinor,
        items: cart.items,
      },
      overrideAccess: true,
    })
  else
    await db.update({
      collection: 'orders',
      id: orders.docs[0].id,
      data: { state: transitionOrder(orders.docs[0].state, event) },
      overrideAccess: true,
    })
  return NextResponse.json({ received: true })
}
