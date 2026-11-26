/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  cancelServiceBooking,
  createSlot,
  reserveSeats,
} from '@/modules/monetization/booking-service'
import { earnAuth, errorResponse, requireSite } from '@/modules/monetization/route-helpers'

/**
 * Service & event bookings (CE-02): slots with authoritative
 * capacity, atomic seat reservation, and cancellation that releases
 * seats in the same transaction.
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
      case 'create-slot':
        return NextResponse.json({ slot: await createSlot(db, body.siteId, body.data ?? {}) })
      case 'reserve-seats':
        return NextResponse.json(await reserveSeats(db, body.siteId, body.data ?? {}))
      case 'cancel-booking':
        await cancelServiceBooking(db, body.siteId, body.bookingId)
        return NextResponse.json({ cancelled: true })
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (error) {
    return errorResponse(error)
  }
}
