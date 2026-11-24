/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'

const relationId = (value: any) =>
  typeof value === 'object' && value !== null ? String(value.id ?? '') : String(value ?? '')

/**
 * RC3-20 SHOP-UX Pass 06 — the signed-in member's order history for this
 * site, on canonical records: member → their carts → checkout sessions →
 * orders. Guests never see this list; their access stays the
 * possession-verified, expiring order link.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const db: any = payload
  const siteId = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => '')
  if (!siteId) return NextResponse.json({ error: 'Store not found.' }, { status: 404 })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return NextResponse.json({ error: 'Sign in to see your orders.' }, { status: 401 })
  const carts = await db.find({
    collection: 'carts',
    where: { and: [{ site: { equals: siteId } }, { member: { equals: memberId } }] },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const cartIds = carts.docs.map((cart: any) => String(cart.id))
  if (!cartIds.length)
    return NextResponse.json({ orders: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  const sessions = await db.find({
    collection: 'checkout-sessions',
    where: { cart: { in: cartIds } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const sessionIds = sessions.docs.map((session: any) => String(session.id))
  if (!sessionIds.length)
    return NextResponse.json({ orders: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  const orders = await db.find({
    collection: 'orders',
    where: {
      and: [{ site: { equals: siteId } }, { checkoutSession: { in: sessionIds } }],
    },
    sort: '-createdAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return NextResponse.json(
    {
      orders: orders.docs.map((order: any) => ({
        id: String(order.id),
        orderNumber: String(order.orderNumber),
        state: String(order.state),
        amountMinor: String(order.amountMinor),
        currency: String(order.currency),
        createdAt: String(order.createdAt),
        receiptNumber: order.receipt?.receiptNumber ?? null,
        sessionId: relationId(order.checkoutSession),
        itemCount: Array.isArray(order.items)
          ? order.items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 1), 0)
          : 0,
      })),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
