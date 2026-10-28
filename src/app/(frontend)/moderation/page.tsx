import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import CommunityModerationCenter from '@/modules/admin/CommunityModerationCenter'
import { communitySiteForHost } from '@/modules/community/site-scope'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Community Moderation Center',
  robots: { index: false, follow: false },
}

export default async function ModerationPage() {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const siteId = await communitySiteForHost(payload, requestHeaders.get('host')).catch(() => '')

  return (
    <main className="mx-auto max-w-5xl px-6 py-10" id="publication-main">
      <CommunityModerationCenter />
    </main>
  )
}
