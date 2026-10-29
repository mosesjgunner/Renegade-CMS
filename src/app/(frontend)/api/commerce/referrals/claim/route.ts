import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import {
  captureReferral,
  referralCode,
  referralCookie,
  sameReferralOrigin,
} from '@/modules/commerce/referral-lifecycle'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => null)
  if (!siteId) return NextResponse.json({ error: 'Referral not found.' }, { status: 404 })
  const record = await referralCode(
    payload,
    siteId,
    new URL(request.url).searchParams.get('code') ?? '',
  )
  if (!record) return NextResponse.json({ error: 'Referral not found.' }, { status: 404 })
  return NextResponse.json({
    name: record.program.name,
    disclosure: record.program.terms.text,
    termsVersion: record.program.terms.version,
    windowDays: record.program.attribution.windowDays,
  })
}
export async function POST(request: Request) {
  if (!sameReferralOrigin(request))
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  const input = await request.json().catch(() => null)
  if (
    !input ||
    typeof input.code !== 'string' ||
    Object.keys(input).some((key) => !['code', 'consented'].includes(key))
  )
    return NextResponse.json({ error: 'Only code and consented are accepted.' }, { status: 400 })
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => null)
  if (!siteId) return NextResponse.json({ error: 'Referral not found.' }, { status: 404 })
  if (input.consented !== true) {
    const response = NextResponse.json({
      attributed: false,
      reason: 'CONSENT_REQUIRED',
      persisted: false,
    })
    response.cookies.set(referralCookie(siteId), '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
    })
    return response
  }
  try {
    const result = await captureReferral(payload, siteId, input.code)
    const response = NextResponse.json(
      {
        captured: true,
        persisted: true,
        claimId: result.claimId,
        commissionState: 'pending-order-payment',
        payoutState: 'not-executed',
      },
      { status: 201 },
    )
    response.cookies.set(referralCookie(siteId), result.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: new URL(request.url).protocol === 'https:',
      expires: result.expiresAt,
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Referral link unavailable.' }, { status: 404 })
  }
}
