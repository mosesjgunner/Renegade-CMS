import { getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { publicSiteForHost } from '@/modules/public/site-scope'
import { loadPublicHierarchy } from '@/modules/public/hierarchy'
import { HierarchyView } from '@/modules/public/HierarchyView'

export const dynamic = 'force-dynamic'
export default async function BrowsePage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>
}) {
  const payload = await getPayload({ config })
  const site = await publicSiteForHost(payload, (await headers()).get('host'))
  if (!site) notFound()
  return (
    <HierarchyView
      page={(await searchParams)?.page}
      graph={await loadPublicHierarchy(payload, site)}
    />
  )
}
