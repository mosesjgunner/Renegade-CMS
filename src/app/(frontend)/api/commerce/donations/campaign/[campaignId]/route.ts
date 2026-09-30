import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { calculateDonationProgress, donationDisclosures } from '@/modules/commerce/donations'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'

const id = (value: any) => String(typeof value === 'object' && value ? value.id : (value ?? ''))

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const payload: any = await getPayload({ config })
  const { campaignId } = await params
  const campaign = await payload
    .findByID({ collection: 'donation-campaigns', id: campaignId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const siteId = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => null)
  if (!campaign || campaign.lifecycle !== 'active' || !siteId || id(campaign.site) !== siteId)
    return NextResponse.json({ error: 'Campaign unavailable.' }, { status: 404 })
  const rows = await payload.find({
    collection: 'donations',
    where: { campaign: { equals: campaignId } },
    limit: 10000,
    depth: 0,
    overrideAccess: true,
  })
  const gifts = rows.docs as any[]
  const events = await payload.find({
    collection: 'donation-events',
    where: { donation: { in: gifts.map((row) => row.id) } },
    limit: 10000,
    depth: 0,
    overrideAccess: true,
  })
  const refunded = new Map<string, bigint>()
  for (const event of events.docs as any[])
    if (event.kind === 'partially-refunded') {
      const id = String(typeof event.donation === 'object' ? event.donation.id : event.donation)
      refunded.set(
        id,
        (refunded.get(id) ?? 0n) + BigInt(String(event.evidence?.amountMinor ?? '0')),
      )
    }
  const progress = calculateDonationProgress(
    gifts.map((row) => ({
      ...row,
      reversedAmountMinor: String(refunded.get(String(row.id)) ?? 0n),
    })),
    campaign.currency,
    campaign.goalAmountMinor,
  )
  const minimum = BigInt(
    /^[0-9]+$/.test(String(campaign.donorWallMinimumMinor ?? '0'))
      ? String(campaign.donorWallMinimumMinor ?? '0')
      : '0',
  )
  const supporters = await payload.find({
    collection: 'supporters',
    where: { site: { equals: id(campaign.site) } },
    limit: 10000,
    depth: 0,
    overrideAccess: true,
  })
  const byId = new Map((supporters.docs as any[]).map((row) => [String(row.id), row]))
  const donors = gifts
    .filter((row) => {
      const supporter = byId.get(id(row.supporter))
      return (
        row.lifecycle === 'succeeded' &&
        row.currency === campaign.currency &&
        row.recognition === 'public' &&
        supporter?.visibilityPreference === 'public' &&
        String(row.publicDisplayName ?? '').trim() &&
        BigInt(row.baseAmountMinor) >= minimum
      )
    })
    .map((row) => ({
      displayName: row.publicDisplayName,
      amountMinor: row.baseAmountMinor,
      currency: row.currency,
      designation: row.designation ?? null,
    }))
  return NextResponse.json(
    {
      campaign: { id: String(campaign.id), title: campaign.title, currency: campaign.currency },
      progress,
      donorWall: donors,
      disclosures: donationDisclosures(
        campaign,
        Array.isArray(campaign.disclosures) ? campaign.disclosures : [],
      ),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
