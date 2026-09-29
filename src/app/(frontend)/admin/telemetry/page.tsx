import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import TelemetryCommandCenter from '@/modules/admin/TelemetryCommandCenter'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function TelemetryAdminPage() {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (auth.user?.role !== 'owner') redirect('/admin')

  return <TelemetryCommandCenter />
}
