/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  createLicenseOffer,
  createRightsRecord,
  issueGrantForOrder,
  recordDistributionSubmission,
  redeemGrantDelivery,
} from '@/modules/monetization/rights-service'
import { earnAuth, errorResponse, requireSite } from '@/modules/monetization/route-helpers'

/**
 * Rights & licensing operations (CE-10/CE-11): rights records,
 * validated license offers, grant issuance from paid orders,
 * one-time delivery redemption, and distribution submission records.
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
      case 'create-record':
        return NextResponse.json({
          record: await createRightsRecord(db, body.siteId, body.data ?? {}),
        })
      case 'create-offer':
        return NextResponse.json({
          offer: await createLicenseOffer(db, body.siteId, body.data ?? {}),
        })
      case 'issue-grant': {
        const { grant, deliveryToken } = await issueGrantForOrder(db, body.siteId, body.data ?? {})
        return NextResponse.json({ grant, deliveryToken })
      }
      case 'redeem-delivery':
        return NextResponse.json({
          grant: await redeemGrantDelivery(db, body.siteId, body.grantId, String(body.token ?? '')),
        })
      case 'record-submission':
        return NextResponse.json({
          submission: await recordDistributionSubmission(db, body.siteId, body.data ?? {}),
        })
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (error) {
    return errorResponse(error)
  }
}
