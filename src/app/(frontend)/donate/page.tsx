import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'

export const dynamic = 'force-dynamic'

export default async function DonatePage() {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, (await headers()).get('host')).catch(() => null)
  if (!siteId) notFound()
  const campaigns = await payload.find({
    collection: 'donation-campaigns',
    where: { and: [{ site: { equals: siteId } }, { lifecycle: { equals: 'active' } }] },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const now = Date.now()
  const available = campaigns.docs.filter(
    (campaign) =>
      (!campaign.startsAt || Date.parse(campaign.startsAt) <= now) &&
      (!campaign.endsAt || Date.parse(campaign.endsAt) > now),
  )
  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1>Support our work</h1>
      {available.length ? (
        <ul>
          {available.map((campaign) => (
            <li key={campaign.id}>
              <Link href={`/donate/${encodeURIComponent(String(campaign.id))}`}>
                {campaign.title}
              </Link>
              <p>{campaign.purpose}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No donation campaigns are accepting gifts right now.</p>
      )}
    </main>
  )
}
