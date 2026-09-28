import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SocialCommandCenter from '@/modules/admin/SocialCommandCenter'
import { getAdminSiteIDs } from '@/modules/admin/site-access'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function SocialAdminPage(props?: {
  searchParams?: Promise<{ siteId?: string }>
}) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!['owner', 'administrator', 'staff'].includes(String(auth.user?.role))) notFound()

  const resolvedParams = props?.searchParams ? await props.searchParams : undefined
  const siteId = resolvedParams?.siteId
  if (auth.user?.role === 'staff' && (!siteId || !getAdminSiteIDs(auth.user).includes(siteId)))
    notFound()
  return <SocialCommandCenter key={siteId} />
}
