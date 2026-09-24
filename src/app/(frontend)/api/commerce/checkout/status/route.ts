/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { resolveCommunityActor } from '@/modules/community/service'
import { verifyGuestOrderToken } from '@/modules/commerce/payment-operations'

const relationId = (value: any) =>
  typeof value === 'object' && value !== null ? String(value.id ?? '') : String(value ?? '')

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('session') ?? ''
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(sessionId))
    return NextResponse.json({ error: 'A valid checkout session is required.' }, { status: 400 })
  const payload = await getPayload({ config })
  const db: any = payload
  const session: any = await payload
    .findByID({ collection: 'checkout-sessions', id: sessionId, depth: 1, overrideAccess: true })
    .catch(() => null)
  if (!session) return NextResponse.json({ error: 'Checkout not found.' }, { status: 404 })
  const siteId = relationId(session.site)
  const cart: any =
    typeof session.cart === 'object'
      ? session.cart
      : await payload.findByID({
          collection: 'carts',
          id: relationId(session.cart),
          depth: 0,
          overrideAccess: true,
        })
  const ownerId = relationId(cart.member ?? cart.owner)
  let authorized = false
  if (ownerId) {
    const actor = await resolveCommunityActor(payload, request.headers, siteId)
    authorized = actor.kind !== 'anonymous' && actor.memberId === ownerId
  } else {
    const cookie = request.headers.get('cookie') ?? ''
    const token = cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`renegade_checkout_${sessionId}=`))
      ?.slice(`renegade_checkout_${sessionId}=`.length)
    const secret =
      process.env.COMMERCE_GUEST_ORDER_SECRET ??
      (process.env.NODE_ENV === 'production' ? '' : 'development-commerce-guest-secret-32')
    authorized = Boolean(
      token && secret && verifyGuestOrderToken(token, { orderId: sessionId, siteId }, secret),
    )
  }
  if (!authorized)
    return NextResponse.json(
      { error: 'Checkout access denied.' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    )
  const attempts = await db.find({
    collection: 'payment-attempts',
    where: { checkoutSession: { equals: sessionId } },
    sort: '-attempt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const orders = await payload.find({
    collection: 'orders',
    where: { checkoutSession: { equals: sessionId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const attempt: any = attempts.docs[0]
  const order: any = orders.docs[0]
  return NextResponse.json(
    {
      checkout: { id: session.id, state: session.state, expiresAt: session.expiresAt },
      payment: attempt
        ? {
            state: attempt.state,
            amountMinor: attempt.amountMinor,
            currency: attempt.currency,
            lastReconciledAt: attempt.lastReconciledAt ?? null,
          }
        : null,
      order: order
        ? {
            id: order.id,
            orderNumber: order.orderNumber,
            state: order.state,
            amountMinor: order.amountMinor,
            currency: order.currency,
            receiptNumber: order.receipt?.receiptNumber ?? null,
          }
        : null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
