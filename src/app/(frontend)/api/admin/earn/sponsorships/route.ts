/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  createAdvertiser,
  createBooking,
  createInventory,
  recordCollection,
  transitionBooking,
  upsertAgreement,
} from '@/modules/monetization/sponsorship-service'
import { discoverCoPromotion } from '@/modules/monetization/copromotion-service'
import { earnAuth, errorResponse, requireSite } from '@/modules/monetization/route-helpers'

/**
 * Sponsorship operations (CE-06/CE-07): advertisers, inventory,
 * bookings with conflict-checked transitions and IO versioning,
 * representation agreements, and explicit collection recording —
 * the only path that turns a booking into collected money.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await earnAuth(payload, request)
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as any
  const forbidden = requireSite(auth.grant, body.siteId ?? null)
  if (forbidden) return forbidden
  const db = payload as any
  try {
    switch (body.action) {
      case 'create-advertiser':
        return NextResponse.json({
          advertiser: await createAdvertiser(db, body.siteId, body.data ?? {}),
        })
      case 'create-inventory':
        return NextResponse.json({
          inventory: await createInventory(db, body.siteId, body.data ?? {}),
        })
      case 'create-booking':
        return NextResponse.json({ booking: await createBooking(db, body.siteId, body.data ?? {}) })
      case 'transition-booking':
        return NextResponse.json({
          booking: await transitionBooking(
            db,
            body.siteId,
            body.bookingId,
            body.to,
            body.patch ?? {},
          ),
        })
      case 'record-collection':
        return NextResponse.json({
          booking: await recordCollection(
            db,
            body.siteId,
            body.bookingId,
            String(body.collectedMinor ?? ''),
            String(body.collectedAt ?? new Date().toISOString()),
          ),
        })
      case 'create-agreement':
        return NextResponse.json({
          agreement: await upsertAgreement(db, body.siteId, body.data ?? {}),
        })
      case 'discover-copromotion':
        return NextResponse.json(await discoverCoPromotion(db, body.siteId, body.inventoryId))
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (error) {
    return errorResponse(error)
  }
}
