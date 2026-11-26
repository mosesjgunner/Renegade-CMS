/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  adsTxtForSite,
  createPlacement,
  deliveryCounts,
  renderSlot,
} from '@/modules/monetization/ads-service'
import { earnAuth, errorResponse, requireSite } from '@/modules/monetization/route-helpers'

/**
 * First-party ad operations (CE-08): placements, explicit slot
 * rendering with a recorded delivery + decision reason, delivery
 * counts (first-party observations), and the site's ads.txt.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await earnAuth(payload, request)
  if (!auth.ok) return auth.response
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  const forbidden = requireSite(auth.grant, siteId)
  if (forbidden) return forbidden
  try {
    if (url.searchParams.get('view') === 'ads-txt')
      return new NextResponse(await adsTxtForSite(payload as any, siteId!), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    return NextResponse.json({ deliveryCounts: await deliveryCounts(payload as any, siteId!) })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await earnAuth(payload, request)
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as any
  const forbidden = requireSite(auth.grant, body.siteId ?? null)
  if (forbidden) return forbidden
  const db = payload as any
  try {
    if (body.action === 'create-placement')
      return NextResponse.json({
        placement: await createPlacement(db, body.siteId, body.data ?? {}),
      })
    if (body.action === 'render-slot')
      return NextResponse.json(await renderSlot(db, body.siteId, body.input ?? {}))
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    return errorResponse(error)
  }
}
