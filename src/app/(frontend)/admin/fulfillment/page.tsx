import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { FulfillmentCommandCenter } from '@/modules/admin/FulfillmentCommandCenter'
import type { PODJob } from '@/modules/commerce/fulfillment-plan'
import type { PublicPodConnectionProjection } from '@/modules/commerce/pod-connection'
import { getAdminSiteIDs } from '@/modules/admin/site-access'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function FulfillmentAdminPage(props?: {
  searchParams?: Promise<{ siteId?: string }>
}) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!['owner', 'administrator', 'staff'].includes(String(auth.user?.role))) notFound()
  const resolvedParams = props?.searchParams ? await props.searchParams : undefined
  const siteId = resolvedParams?.siteId
  if (auth.user?.role === 'staff' && (!siteId || !getAdminSiteIDs(auth.user).includes(siteId)))
    notFound()

  let initialJobs: PODJob[] | undefined = undefined
  let initialProviders: PublicPodConnectionProjection[] | undefined = undefined

  try {
    const jobsRes = await payload.find({
      collection: 'pod-jobs' as never,
      ...(siteId ? { where: { site: { equals: siteId } } } : {}),
      limit: 100,
      depth: 1,
      user: auth.user ?? undefined,
    })
    if (jobsRes.docs && jobsRes.docs.length > 0) {
      initialJobs = jobsRes.docs as unknown as PODJob[]
    }

    const providersRes = await payload.find({
      collection: 'pod-connections' as never,
      ...(siteId ? { where: { site: { equals: siteId } } } : {}),
      limit: 50,
      depth: 0,
      user: auth.user ?? undefined,
    })
    if (providersRes.docs && providersRes.docs.length > 0) {
      initialProviders = providersRes.docs as unknown as PublicPodConnectionProjection[]
    }
  } catch {
    // Falls back gracefully to default state if collection is empty or unseeded
  }

  return <FulfillmentCommandCenter initialJobs={initialJobs} initialProviders={initialProviders} />
}
