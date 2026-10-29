import config from '@payload-config'
import { getPayload } from 'payload'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { recordReferralCallback } from '@/modules/commerce/referral-lifecycle'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => null)
  if (!siteId) return NextResponse.json({ error: 'Unknown site.' }, { status: 404 })
  let secrets: Record<string, string>
  try {
    secrets = JSON.parse(process.env.AFFILIATE_CALLBACK_SECRETS ?? '{}')
  } catch {
    secrets = {}
  }
  const secret = secrets[siteId]
  if (!secret || secret.length < 32)
    return NextResponse.json(
      { error: 'Referral callback verification is not configured.' },
      { status: 503 },
    )
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 16384)
    return NextResponse.json({ error: 'Callback too large.' }, { status: 413 })
  const signature = request.headers.get('x-referral-signature') ?? ''
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  if (
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  try {
    const body = JSON.parse(raw)
    if (
      Object.keys(body).some(
        (key) => !['eventId', 'orderId', 'kind', 'amountMinor', 'currency'].includes(key),
      )
    )
      return NextResponse.json({ error: 'Unsupported callback fields.' }, { status: 400 })
    return NextResponse.json(await recordReferralCallback(payload, siteId, body, raw), {
      status: 202,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Callback rejected.' },
      { status: 409 },
    )
  }
}
