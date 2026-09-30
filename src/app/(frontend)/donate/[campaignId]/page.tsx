import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { DonationForm } from '@/modules/commerce/DonationForm'
import { donationDisclosures } from '@/modules/commerce/donations'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'

export const dynamic = 'force-dynamic'

export default async function CampaignDonationPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, (await headers()).get('host')).catch(() => null)
  if (!siteId) notFound()
  const { campaignId } = await params
  const campaign = await payload
    .findByID({ collection: 'donation-campaigns', id: campaignId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const now = Date.now()
  const campaignSite =
    typeof campaign?.site === 'object' ? String(campaign.site.id) : String(campaign?.site ?? '')
  if (
    !campaign ||
    campaignSite !== siteId ||
    campaign.lifecycle !== 'active' ||
    (campaign.startsAt && Date.parse(campaign.startsAt) > now) ||
    (campaign.endsAt && Date.parse(campaign.endsAt) <= now)
  )
    notFound()
  const recurrence = Array.isArray(campaign.recurrence)
    ? campaign.recurrence.filter((choice): choice is 'one-time' => choice === 'one-time')
    : []
  const amounts = Array.isArray(campaign.allowedAmounts)
    ? campaign.allowedAmounts.filter((amount): amount is string => typeof amount === 'string')
    : []
  const maximumAmountMinor = amounts.length
    ? amounts.reduce((max, amount) => (BigInt(amount) > BigInt(max) ? amount : max))
    : '100000000'
  const digits =
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: campaign.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1>{campaign.title}</h1>
      <p>{campaign.purpose}</p>
      {recurrence.length ? (
        <DonationForm
          campaign={{
            id: String(campaign.id),
            title: String(campaign.title),
            currency: String(campaign.currency),
            minorUnitDigits: digits,
            minimumAmountMinor: '1',
            maximumAmountMinor,
            allowedAmounts: amounts,
            recurrence,
            feeCover: campaign.feeCover as never,
            privacyDefault: campaign.privacyDefault as 'public' | 'anonymous' | 'private',
            designations: Array.isArray(campaign.designations)
              ? (campaign.designations as Array<{ key: string; label: string }>)
              : [],
            disclosures: donationDisclosures(
              {
                verifiedNonprofitStatus: campaign.verifiedNonprofitStatus === true,
                verified501c3Status: campaign.verified501c3Status === true,
                verifiedTaxDeductibility: campaign.verifiedTaxDeductibility === true,
                taxDisclaimer: campaign.taxDisclaimer ?? undefined,
              },
              Array.isArray(campaign.disclosures)
                ? campaign.disclosures.filter((text): text is string => typeof text === 'string')
                : [],
            ),
          }}
        />
      ) : (
        <p>Online checkout is not yet available for this campaign’s recurring gifts.</p>
      )}
    </main>
  )
}
