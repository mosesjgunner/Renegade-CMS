/* eslint-disable @typescript-eslint/no-explicit-any */
/** Subscription purchases use canonical orders and checkout sessions, never redirect success. */
export async function ensureSubscriptionOrder(payload: any, sub: any, merchantId: string) {
  const orderNumber = `SUB-${sub.id}`
  const found = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: orderNumber } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (found.docs[0]) return found.docs[0]
  const scope = { site: sub.site, owner: sub.owner, merchantConnection: merchantId }
  const items = [
    {
      planRevisionId: String(sub.planSnapshot.id),
      subscriptionId: String(sub.id),
      quantity: 1,
      amountMinor: sub.planSnapshot.amountMinor,
      currency: sub.planSnapshot.currency,
    },
  ]
  const carts = await payload.find({
    collection: 'carts',
    where: { idempotencyKey: { equals: orderNumber } },
    limit: 1,
    overrideAccess: true,
  })
  const cart =
    carts.docs[0] ??
    (await payload.create({
      collection: 'carts',
      data: {
        ...scope,
        member: sub.owner,
        currency: sub.planSnapshot.currency,
        items,
        state: 'converted',
        idempotencyKey: orderNumber,
      },
      overrideAccess: true,
    }))
  const sessions = await payload.find({
    collection: 'checkout-sessions',
    where: { bindingKey: { equals: orderNumber } },
    limit: 1,
    overrideAccess: true,
  })
  const session =
    sessions.docs[0] ??
    (await payload.create({
      collection: 'checkout-sessions',
      data: {
        ...scope,
        cart: cart.id,
        currency: sub.planSnapshot.currency,
        amountMinor: sub.planSnapshot.amountMinor,
        state: 'pending',
        bindingKey: orderNumber,
      },
      overrideAccess: true,
    }))
  return payload.create({
    collection: 'orders',
    data: {
      ...scope,
      checkoutSession: session.id,
      orderNumber,
      currency: sub.planSnapshot.currency,
      amountMinor: sub.planSnapshot.amountMinor,
      state: 'pending-payment',
      items,
      sourceSnapshot: {
        subscriptionId: String(sub.id),
        planRevisionId: String(sub.planSnapshot.id),
        providerMode: 'test',
      },
      termsSnapshot: sub.planSnapshot,
    },
    overrideAccess: true,
  })
}

export async function settleSubscriptionOrder(payload: any, sub: any, event: any) {
  // Only an invoice confirms a collected payment. Trials/activation alone do not.
  if (event.kind !== 'invoice_paid') return
  const found = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: `SUB-${sub.id}` } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const order = found.docs[0]
  if (!order || order.state !== 'pending-payment') return
  await payload.update({
    collection: 'orders',
    id: order.id,
    data: {
      state: 'paid',
      transitionLog: [
        {
          kind: 'subscription-invoice-paid',
          providerEventId: event.providerEventId,
          occurredAt: event.occurredAt,
        },
      ],
    },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'checkout-sessions',
    id: order.checkoutSession,
    data: { state: 'completed' },
    overrideAccess: true,
  })
}
