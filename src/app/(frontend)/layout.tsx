import { tokenStyle } from '@/modules/presentation/tokens'
import type { Configuration } from '@/modules/presentation/lifecycle'
import type { ReactNode } from 'react'
import { Inter, Newsreader, JetBrains_Mono } from 'next/font/google'

import './styles.css'
import { resolveTheme } from '@/modules/presentation/registry'
import { shellRegistry, themeStyle } from '@/modules/presentation/runtime'
import { DEFAULT_SITE_NAME } from '@/modules/presentation/themes/identity'
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
  let siteName = DEFAULT_SITE_NAME
  let themeId: string | undefined
  let themeConfiguration: Configuration | null | undefined
  let siteDescription = ''
  let logoUrl: string | null = null
  let footerText: string | null = null
  let navigation = normalizeNavigation([])
  let siteId: string | undefined

  try {
    const payload = await getPayload({ config })
    const settings = await resolveSiteSettings(payload)
    themeId = settings.themeId
    themeConfiguration = settings.themeConfiguration
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

  const theme = resolveTheme(themeId)
  const StarterShell = shellRegistry[theme.globalRegions.header]
  const currentYear = new Date().getFullYear()

  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body
        data-theme={themeConfiguration?.id ?? theme.id}
        data-theme-version={themeConfiguration?.version ?? theme.version}
        style={{ ...themeStyle(theme), ...tokenStyle(themeConfiguration?.tokens ?? {}) }}
        className="min-h-screen flex flex-col font-sans antialiased selection:bg-red-600 selection:text-white"
      >
        <StarterShell
          consent={<ConsentManager siteId={siteId} />}
          siteName={siteName}
          siteDescription={siteDescription}
          logoUrl={logoUrl}
          footerText={footerText}
          navigation={navigation}
          year={currentYear}
        >
          {children}
        </StarterShell>
      </body>
    </html>
  )
}
