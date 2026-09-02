import type { ReactNode } from 'react'
import Link from 'next/link'
import { Inter, Newsreader, JetBrains_Mono } from 'next/font/google'

import './styles.css'
import { PublicNavigationBar } from '@/modules/public/PublicNavigation'
import { normalizeNavigation } from '@/modules/public/navigation'
import config from '@payload-config'
import { getPayload } from 'payload'
import { ConsentManager } from '@/modules/analytics/ConsentManager'

import { resolveSiteSettings } from '@/modules/core/site-settings'

// Public navigation and branding are PostgreSQL-backed. They must be read at
// request time so an image build never tries to contact a deployment database.
export const dynamic = 'force-dynamic'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  style: ['normal', 'italic'],
  variable: '--font-serif',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
})

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  let siteName = 'Renegade CMS'
  let siteDescription = ''
  let logoUrl: string | null = null
  let footerText: string | null = null
  let navigation = normalizeNavigation([])
  let siteId: string | undefined

  try {
    const payload = await getPayload({ config })
    const settings = await resolveSiteSettings(payload)
    siteName = settings.siteName
    siteDescription = settings.siteDescription
    logoUrl = settings.logoUrl
    footerText = settings.footerText

    const publications = await payload.find({
      collection: 'publications',
      where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
      depth: 1,
      limit: 1,
      overrideAccess: true,
    } as never)
    const publication = publications.docs[0] as unknown as Record<string, unknown> | undefined
    if (publication) {
      if (typeof publication.name === 'string' && publication.name.trim()) {
        // publication name supplements siteName if set specifically
      }
      navigation = normalizeNavigation(publication.navigation)
      siteId =
        typeof publication.site === 'string'
          ? publication.site
          : (publication.site as { id?: string } | undefined)?.id
    }
  } catch {
    // The public shell remains usable before first-run setup and during recovery.
  }

  const currentYear = new Date().getFullYear()

  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen flex flex-col font-sans antialiased selection:bg-red-600 selection:text-white">
        <PublicNavigationBar siteName={siteName} logoUrl={logoUrl} navigation={navigation} />

        {/* Main Content Viewport */}
        <div className="flex-1">{children}</div>
        <ConsentManager siteId={siteId} />

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
                  © {currentYear} {siteName}. All rights reserved.
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
      </body>
    </html>
  )
}
