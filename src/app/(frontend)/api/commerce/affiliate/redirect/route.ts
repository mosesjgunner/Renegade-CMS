import { NextRequest, NextResponse } from 'next/server'
import { resolveOutboundRedirect } from '../../../../../../modules/commerce/affiliate-service'
import type { AffiliateOffer } from '../../../../../../modules/commerce/affiliate-referral-contracts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const offerId = searchParams.get('offerId')
    const destination = searchParams.get('destination')

    if (!offerId && !destination) {
      return NextResponse.json({ error: 'Missing offerId or destination' }, { status: 400 })
    }

    // Example/fixture offer or database lookup
    const offer: AffiliateOffer = {
      id: offerId ?? 'sample-offer',
      siteId: searchParams.get('siteId') ?? 'default-site',
      slug: searchParams.get('slug') ?? 'partner-offer',
      name: 'Partner Offer',
      destinationUrl: destination ?? 'https://partner.example.com/item?source=renegade',
      status: 'active',
      disclosure: {
        text: 'We may earn a commission from links on this page.',
        required: true,
        placement: 'inline',
      },
      networkReference: {
        network: 'custom',
      },
      pricingFreshness: {
        observedAt: new Date().toISOString(),
        freshnessHours: 24,
        source: 'manual',
      },
      regions: ['global'],
      linkHealth: {
        status: 'healthy',
        consecutiveFailures: 0,
      },
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      undefined

    const result = resolveOutboundRedirect({
      offer,
      searchParams,
      headers: request.headers,
      ip: clientIp,
      userAgent: request.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.redirect(result.destinationUrl, {
      status: 307,
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Redirect failed'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
