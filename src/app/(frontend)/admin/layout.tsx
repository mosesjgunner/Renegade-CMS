import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'

import { ActiveSiteIndicator } from '@/modules/admin/ActiveSiteIndicator'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { normalizeSiteVisibility } from '@/modules/public/site-visibility'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    redirect('/login')
  }

  // Shared site context (UXI-07): every frontend admin surface names
  // the site it acts on. Resolution mirrors /api/admin/active-site —
  // the cookie's site when still authorized, else the first authorized
  // site. A failure here must never break the admin pages themselves.
  let siteName: string | null = null
  let siteVisibility: 'public' | 'coming-soon' | 'private' | undefined
  try {
    const grant = await resolveOperatorGrantContext(payload, user)
    if (grant.authorized) {
      const sites = await payload.find({
        collection: 'sites',
        where: grant.isGlobalOwner ? undefined : { id: { in: grant.authorizedSiteIds } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      } as never)
      const cookieSiteId = (await cookies()).get('renegade-active-site')?.value
      const active = sites.docs.find((site) => String(site.id) === cookieSiteId) ?? sites.docs[0]
      if (active) {
        siteName = String((active as { name?: unknown }).name ?? 'Untitled site')
        siteVisibility = normalizeSiteVisibility((active as { visibility?: unknown }).visibility)
      }
    }
  } catch {
    siteName = null
  }

  return (
    <>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6 lg:px-8">
        {siteName ? (
          <ActiveSiteIndicator siteName={siteName} visibility={siteVisibility} />
        ) : (
          <span />
        )}
        <nav aria-label="Dashboard" className="flex gap-3 text-xs">
          <Link href="/admin" className="btn btn-secondary text-xs">
            Dashboard
          </Link>
          <Link href="/guided-setup" className="btn btn-secondary text-xs">
            Guided setup
          </Link>
        </nav>
      </div>
      {children}
    </>
  )
}
