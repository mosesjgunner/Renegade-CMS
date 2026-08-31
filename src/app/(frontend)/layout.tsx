import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Inter, Newsreader, JetBrains_Mono } from 'next/font/google'

import './styles.css'
import { PublicNavigationBar } from '@/modules/public/PublicNavigation'
import { normalizeNavigation } from '@/modules/public/navigation'
import config from '@payload-config'
import { getPayload } from 'payload'
import { ConsentManager } from '@/modules/analytics/ConsentManager'

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

export const metadata: Metadata = {
  title: 'Renegade CMS — Portable Publishing & Brand Platform',
  description: 'A free, self-hosted, portable publishing and personal-brand platform.',
}

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  let siteName = 'Renegade CMS'
  let navigation = normalizeNavigation([])
  let siteId: string | undefined
  try {
    const payload = await getPayload({ config })
    const publications = await payload.find({
      collection: 'publications',
      where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
      depth: 1,
      limit: 1,
      overrideAccess: true,
    } as never)
    const publication = publications.docs[0] as unknown as Record<string, unknown> | undefined
    if (publication) {
      siteName = typeof publication.name === 'string' ? publication.name : siteName
      navigation = normalizeNavigation(publication.navigation)
      siteId = typeof publication.site === 'string' ? publication.site : (publication.site as { id?: string } | undefined)?.id
    }
  } catch {
    // The public shell remains usable before first-run setup and during recovery.
  }
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen flex flex-col font-sans antialiased selection:bg-red-600 selection:text-white">
        <PublicNavigationBar siteName={siteName} navigation={navigation} />

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
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Free, portable publishing and personal-brand platform under AGPL-3.0.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-stone-600 dark:text-stone-400">
              <Link href="/" className="hover:text-red-600 transition-colors">
                Home
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
              <Link href="/admin" className="hover:text-red-600 transition-colors">
                Payload Studio
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
