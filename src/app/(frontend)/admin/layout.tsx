import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { AdminHeader } from '@/modules/admin/AdminHeader'
import PublishingLinks from '@/modules/admin/PublishingLinks'
import { canAccessAdminRole } from '@/modules/admin/access-policy'
import { getAdminSiteIDs } from '@/modules/admin/site-access'
import styles from './AdminShell.module.css'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const payload = await getPayload({ config })
  const incomingHeaders = await headers()
  const auth = await payload.auth({ headers: incomingHeaders }).catch(() => null)

  if (!auth?.user || !canAccessAdminRole(auth.user.role)) {
    redirect('/admin/login')
  }

  const siteIds = getAdminSiteIDs(auth.user)
  const siteResult = await payload.find({
    collection: 'sites',
    ...(auth.user.role === 'staff' ? { where: { id: { in: siteIds } } } : {}),
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const sites = siteResult.docs.map((site) => ({
    id: String(site.id),
    name: String(site.name ?? site.id),
  }))

  return (
    <div
      data-admin-role={String(auth.user.role)}
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--theme-elevation-0, #09090b)',
        color: 'var(--theme-elevation-900, #f4f4f5)',
      }}
    >
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>
      <Suspense fallback={null}>
        <AdminHeader
          user={{ email: auth.user.email, role: String(auth.user.role) }}
          sites={sites}
        />
      </Suspense>
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Admin navigation">
          <Suspense fallback={null}>
            <PublishingLinks initialRole={String(auth.user.role)} />
          </Suspense>
        </aside>
        <main id="main-content" className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  )
}
