import config from '@payload-config'
import { getPayload } from 'payload'
import { NextRequest, NextResponse } from 'next/server'
import { resolveOutboundRedirect } from '@/modules/commerce/affiliate-service'
import {
  storedAffiliateOffer,
  persistAffiliateClick,
} from '@/modules/commerce/affiliate-offers-runtime'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { sameReferralOrigin } from '@/modules/commerce/referral-lifecycle'
export const dynamic = 'force-dynamic'
async function lookup(request: Request, offerId: string) {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, request.headers.get('host'))
  const offer = await storedAffiliateOffer(payload, siteId, offerId)
  if (!offer) throw new Error('Offer unavailable.')
  return { payload, offer }
}
export async function GET(request: NextRequest) {
  if (['destination', 'siteId', 'slug'].some((key) => request.nextUrl.searchParams.has(key)))
    return NextResponse.json(
      { error: 'Only stored, owning-site offers are supported.' },
      { status: 400 },
    )
  try {
    const { offer } = await lookup(request, request.nextUrl.searchParams.get('offerId') ?? '')
    if (request.nextUrl.searchParams.get('details') === '1')
      return NextResponse.json({
        name: offer.name,
        disclosure: offer.disclosure.text,
        destination: new URL(offer.destinationUrl).hostname,
      })
    // A plain link never implies consent and never stores a tracked interaction.
    const result = resolveOutboundRedirect({
      offer,
      trackingConsent: false,
      headers: request.headers,
    })
    return NextResponse.redirect(result.destinationUrl, {
      status: 307,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Offer unavailable.' }, { status: 404 })
  }
}
export async function POST(request: Request) {
  if (!sameReferralOrigin(request))
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (
    !body ||
    typeof body.offerId !== 'string' ||
    Object.keys(body).some((key) => !['offerId', 'consented'].includes(key))
  )
    return NextResponse.json({ error: 'Only offerId and consented are accepted.' }, { status: 400 })
  try {
    const { payload, offer } = await lookup(request, body.offerId)
    const result = resolveOutboundRedirect({
      offer,
      trackingConsent: body.consented === true,
      headers: request.headers,
      userAgent: request.headers.get('user-agent') ?? undefined,
    })
    const click = result.click
    await persistAffiliateClick(payload, offer, click)
    return NextResponse.json({
      destinationUrl: result.destinationUrl,
      persisted: click.trackingAllowed,
      trackingAllowed: click.trackingAllowed,
    })
  } catch {
    return NextResponse.json({ error: 'Offer unavailable.' }, { status: 404 })
  }
}
