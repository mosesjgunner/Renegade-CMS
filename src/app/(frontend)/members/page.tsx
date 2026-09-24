import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { MemberDirectory } from '@/modules/community/MemberDirectory'
import { communitySiteForHost } from '@/modules/community/site-scope'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Community members', robots: { index: false, follow: false } }

export default async function MembersPage() {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const siteId = await communitySiteForHost(payload, requestHeaders.get('host')).catch(() => '')
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">Community members</h1>
      <p className="mt-2">Search profiles that members have chosen to list.</p>
      {siteId ? <MemberDirectory siteId={siteId} /> : <p>Directory unavailable.</p>}
    </main>
  )
}
