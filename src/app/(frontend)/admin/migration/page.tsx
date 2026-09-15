import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import LegacyMigrationReview from '@/modules/admin/LegacyMigrationReview'
import { PayloadLegacyMigrationStore } from '@/modules/portability/legacy-migration'

export const dynamic = 'force-dynamic'

export default async function AdminMigrationPage({
  searchParams,
}: {
  searchParams?: Promise<{ runId?: string }>
}) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!['owner', 'administrator', 'staff'].includes(String(auth.user?.role))) notFound()

  const { runId } = (await searchParams) ?? {}
  let initialReport = undefined
  if (runId) {
    const store = new PayloadLegacyMigrationStore(payload)
    initialReport = (await store.getMigrationRun(runId)) ?? undefined
  }

  return <LegacyMigrationReview initialReport={initialReport} />
}
import type { Metadata } from 'next'

export const metadata: Metadata = { robots: { index: false, follow: false } }
