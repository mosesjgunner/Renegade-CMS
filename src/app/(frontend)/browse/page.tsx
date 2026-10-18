import { getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { publicSiteForHost } from '@/modules/public/site-scope'
import { loadPublicHierarchy } from '@/modules/public/hierarchy'
import { HierarchyView } from '@/modules/public/HierarchyView'

export const dynamic = 'force-dynamic'
export default async function BrowsePage() {
  const payload = await getPayload({ config })
  const site = await publicSiteForHost(payload, (await headers()).get('host'))
  if (!site) notFound()
  return <HierarchyView graph={await loadPublicHierarchy(payload, site)} />
}
