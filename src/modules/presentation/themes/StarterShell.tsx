import type { ReactNode } from 'react'
import Link from 'next/link'
import { PublicNavigationBar } from '../../public/PublicNavigation'
import type { normalizeNavigation } from '../../public/navigation'

export type ShellProps = {
  children: ReactNode
  /** Published, snapshot-backed regions supplied by the public runtime. */
  globalHeader?: ReactNode
  globalAnnouncement?: ReactNode
  globalCta?: ReactNode
  globalFooter?: ReactNode
  consent?: ReactNode
  siteName: string
  siteDescription: string
  logoUrl: string | null
  footerText: string | null
  navigation: ReturnType<typeof normalizeNavigation>
  year: number
}
export function StarterShell({
  children,
  globalHeader,
  globalAnnouncement,
  globalCta,
  globalFooter,
  consent,
  siteName,
  siteDescription,
  logoUrl,
  footerText,
  navigation,
  year,
}: ShellProps) {
  return (
    <>
      <PublicNavigationBar siteName={siteName} logoUrl={logoUrl} navigation={navigation} />
      {globalHeader}
      {globalAnnouncement}

      {/* Main Content Viewport */}
      <div className="flex-1">{children}</div>
      {globalCta}
      {consent}
      {globalFooter}

      {/* Global Footer */}
      <footer className="border-t border-stone-200 dark:border-stone-800 bg-stone-100/50 dark:bg-stone-950/50 py-12 mt-20 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <p className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {siteName}
            </p>
            {footerText ? (
              <p className="text-xs text-stone-500 dark:text-stone-400">{footerText}</p>
            ) : siteDescription ? (
              <p className="text-xs text-stone-500 dark:text-stone-400">{siteDescription}</p>
            ) : (
              <p className="text-xs text-stone-500 dark:text-stone-400">
                © {year} {siteName}. All rights reserved.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-stone-600 dark:text-stone-400">
            <Link href="/" className="hover:text-red-600 transition-colors">
              Home
            </Link>
            <Link href="/articles" className="hover:text-red-600 transition-colors">
              Articles
            </Link>
            <Link href="/search" className="hover:text-red-600 transition-colors">
              Search
            </Link>
            {navigation.footer.map((item) =>
              item.href.startsWith('/') ? (
                <Link
                  key={`${item.label}:${item.href}`}
                  href={item.href}
                  className="hover:text-red-600 transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={`${item.label}:${item.href}`}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-red-600 transition-colors"
                >
                  {item.label}
                </a>
              ),
            )}
          </div>
        </div>
      </footer>
    </>
  )
}
