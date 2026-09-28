import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { BuilderShell } from '@/modules/public/BuilderShell'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!auth.user) redirect('/admin/login')
  if (!['owner', 'administrator', 'staff'].includes(String(auth.user.role))) notFound()

  return <BuilderShell layoutId={(await params).id} />
}
