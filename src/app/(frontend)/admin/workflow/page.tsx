import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import EditorialWorkflowCenter from '@/modules/admin/EditorialWorkflowCenter'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function AdminWorkflowPage() {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!['owner', 'administrator', 'staff'].includes(String(auth.user?.role))) notFound()

  return <EditorialWorkflowCenter />
}
