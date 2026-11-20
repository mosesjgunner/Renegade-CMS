import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
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
  // UXI-D14 repair (UXI-09): this page previously rendered the full
  // moderation center with no server-side authorization gate at all.
  // It now carries the same staff gate as the frontend /admin layout:
  // anyone who is not signed-in staff is sent to staff sign-in
  // (/login) — a flow that can actually lead to moderation access —
  // instead of being shown the surface. The moderation data APIs keep
  // enforcing the moderation grant exactly as before; this gate does
  // not weaken or replace that enforcement.
  const { user } = await payload.auth({ headers: requestHeaders })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    redirect('/login')
  }
  const siteId = await communitySiteForHost(payload, requestHeaders.get('host')).catch(() => '')
  void siteId

  return (
    <main className="mx-auto max-w-5xl px-6 py-10" id="publication-main">
      <CommunityModerationCenter />
    </main>
  )
}
