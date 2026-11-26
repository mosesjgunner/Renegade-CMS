/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  getProfile,
  listConnections,
  statementForSite,
  upsertConnection,
  upsertProfile,
} from '@/modules/monetization/earn-service'
import { earnAuth, errorResponse, requireSite } from '@/modules/monetization/route-helpers'

/**
 * Earn Center summary + profile/connection writes (CE-02/CE-04).
 * The summary assembles only durable state: profile, connections,
 * and the CE-03 statement. Blocked providers appear with their gate,
 * never as if connected.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await earnAuth(payload, request)
  if (!auth.ok) return auth.response
  const siteId = new URL(request.url).searchParams.get('siteId')
  const forbidden = requireSite(auth.grant, siteId)
  if (forbidden) return forbidden
  try {
    const [profile, connections, statement] = await Promise.all([
      getProfile(payload as any, siteId!),
      listConnections(payload as any, siteId!),
      statementForSite(payload as any, siteId!),
    ])
    return NextResponse.json({ profile, connections, statement })
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
  try {
    if (body.action === 'upsert-profile') {
      const { action: _action, siteId: _siteId, ...data } = body
      const profile = await upsertProfile(payload as any, body.siteId, data)
      return NextResponse.json({ profile })
    }
    if (body.action === 'upsert-connection') {
      const connection = await upsertConnection(payload as any, body.siteId, body.connection ?? {})
      return NextResponse.json({ connection })
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    return errorResponse(error)
  }
}
