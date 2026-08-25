import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Inter, Newsreader, JetBrains_Mono } from 'next/font/google'

import './styles.css'

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

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen flex flex-col font-sans antialiased selection:bg-red-600 selection:text-white">
        {/* Navigation Header */}
        <header className="sticky top-0 z-50 glass-panel border-b border-stone-200 dark:border-stone-800 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2.5 group">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white font-black text-lg shadow-sm shadow-red-500/20 group-hover:scale-105 transition-transform">
                  R
                </span>
                <div className="flex flex-col">
                  <span className="font-bold text-base tracking-tight leading-tight group-hover:text-red-600 transition-colors">
                    Renegade CMS
                  </span>
                  <span className="text-[10px] font-medium tracking-widest uppercase text-stone-500 dark:text-stone-400">
                    Publishing Studio
                  </span>
                </div>
              </Link>

              <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-stone-200 dark:border-stone-800">
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-stone-600 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors"
                >
                  Home
                </Link>
                <Link
                  href="/social-studio"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-stone-600 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors"
                >
                  Social Studio
                </Link>
                <Link
                  href="/guided-setup"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-stone-600 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors"
                >
                  Guided Setup
                </Link>
                <Link
                  href="/connections"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-stone-600 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors"
                >
                  Connections
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Self-Hosted</span>
              </div>
              <Link
                href="/login"
                className="btn btn-ghost text-xs font-semibold px-3 py-1.5 rounded-lg"
              >
                Sign in
              </Link>
              <Link
                href="/admin"
                className="btn btn-primary text-xs font-semibold px-3.5 py-1.5 rounded-lg"
              >
                Admin Panel &rarr;
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content Viewport */}
        <div className="flex-1">{children}</div>

        {/* Global Footer */}
        <footer className="border-t border-stone-200 dark:border-stone-800 bg-stone-100/50 dark:bg-stone-950/50 py-12 mt-20 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col items-center md:items-start gap-1">
              <p className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                Renegade CMS
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Free, portable publishing and personal-brand platform under AGPL-3.0.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-stone-600 dark:text-stone-400">
              <Link href="/" className="hover:text-red-600 transition-colors">
                Home
              </Link>
              <Link href="/guided-setup" className="hover:text-red-600 transition-colors">
                Setup Wizard
              </Link>
              <Link href="/social-studio" className="hover:text-red-600 transition-colors">
                Social Studio
              </Link>
              <Link href="/connections" className="hover:text-red-600 transition-colors">
                Integrations
              </Link>
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
