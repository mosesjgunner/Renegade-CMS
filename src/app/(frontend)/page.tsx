import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'

import { toPublicSite } from '@/modules/publications/publication'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  let site = null
  try {
    const payload = await getPayload({ config })
    const result = await payload.find({
      collection: 'sites',
      where: {
        and: [{ lifecycle: { equals: 'active' } }, { slug: { equals: 'demo-publication' } }],
      },
      limit: 1,
    })
    site = result.docs[0] ? toPublicSite(result.docs[0]) : null
  } catch {
    // Database may be pending initial migration/seed; fallback gracefully
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 space-y-20">
      {/* Hero Section */}
      <section className="relative text-center max-w-4xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-700 dark:text-red-300">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
          <span>Renegade Publishing Platform v0.1</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-stone-950 dark:text-stone-50 font-display">
          Publish Freely. <br />
          <span className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 bg-clip-text text-transparent">
            Own Your Platform.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-stone-600 dark:text-stone-300 max-w-2xl mx-auto leading-relaxed">
          {site?.description ??
            'A free, portable, self-hosted publishing system engineered for independent creators, journalists, and communities with direct audience ownership.'}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link href="/social-studio" className="btn btn-primary text-sm px-6 py-3">
            Open Social Studio
          </Link>
          <Link href="/guided-setup" className="btn btn-secondary text-sm px-6 py-3">
            Guided Setup Wizard
          </Link>
          <Link href="/admin" className="btn btn-ghost text-sm px-5 py-3">
            Payload Studio &rarr;
          </Link>
        </div>
      </section>

      {/* Quick Launch Features Grid */}
      <section className="space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Engineered for Sovereignty
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Portable data representations, passkey authentication, and zero-compromise privacy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: Social Studio */}
          <Link
            href="/social-studio"
            className="surface-card p-6 flex flex-col justify-between group hover:-translate-y-1 transition-all"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 flex items-center justify-center text-xl text-red-600 dark:text-red-400">
                💬
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 group-hover:text-red-600 transition-colors">
                  Social Studio
                </h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  Compose once and cross-post natively to Bluesky, Mastodon, Threads, and X with
                  independent previews and character counts.
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs font-semibold text-red-600 dark:text-red-400">
              <span>Compose post</span>
              <span>&rarr;</span>
            </div>
          </Link>

          {/* Card 2: Guided Setup */}
          <Link
            href="/guided-setup"
            className="surface-card p-6 flex flex-col justify-between group hover:-translate-y-1 transition-all"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-xl text-blue-600 dark:text-blue-400">
                🛠️
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 group-hover:text-blue-600 transition-colors">
                  Guided Setup Wizard
                </h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  Pick from custom recipes (Blogger, Forum, Portfolio, Non-profit) to launch a fully
                  configured starter draft in seconds.
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
              <span>Select starter recipe</span>
              <span>&rarr;</span>
            </div>
          </Link>

          {/* Card 3: Connections */}
          <Link
            href="/connections"
            className="surface-card p-6 flex flex-col justify-between group hover:-translate-y-1 transition-all"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-xl text-amber-600 dark:text-amber-400">
                ⚡
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 group-hover:text-amber-600 transition-colors">
                  Connections Center
                </h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  Manage third-party integrations with strict capability isolation, health checks,
                  and verified credentials.
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400">
              <span>View integrations</span>
              <span>&rarr;</span>
            </div>
          </Link>

          {/* Card 4: Passkey Auth */}
          <Link
            href="/login"
            className="surface-card p-6 flex flex-col justify-between group hover:-translate-y-1 transition-all"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-xl text-emerald-600 dark:text-emerald-400">
                🔐
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 group-hover:text-emerald-600 transition-colors">
                  Passkey Authentication
                </h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  WebAuthn passkeys and emergency offline recovery codes replace vulnerable
                  passwords.
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span>Passkey sign-in</span>
              <span>&rarr;</span>
            </div>
          </Link>

          {/* Card 5: Page Builder */}
          <div className="surface-card p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-xl text-purple-600 dark:text-purple-400">
                🎨
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Visual Puck Editor
                </h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  Drag-and-drop canvas over clean portable JSON Intermediate Representation without
                  vendor lock-in.
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs font-semibold text-purple-600 dark:text-purple-400">
              <span>Layout engine</span>
              <span>Enabled</span>
            </div>
          </div>

          {/* Card 6: Payload CMS */}
          <Link
            href="/admin"
            className="surface-card p-6 flex flex-col justify-between group hover:-translate-y-1 transition-all"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-xl text-rose-600 dark:text-rose-400">
                ⚙️
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 group-hover:text-rose-600 transition-colors">
                  Payload Admin Panel
                </h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  Manage collections, media, users, taxonomies, and editorial revisions via Payload
                  3.x.
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs font-semibold text-rose-600 dark:text-rose-400">
              <span>Enter admin</span>
              <span>&rarr;</span>
            </div>
          </Link>
        </div>
      </section>

      {/* Publication System Banner */}
      <section className="surface-card p-8 sm:p-10 border-stone-300 dark:border-stone-800 bg-gradient-to-br from-stone-50 via-white to-stone-100 dark:from-stone-900 dark:via-stone-900/90 dark:to-stone-950">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <span className="badge badge-brand">Active Publication Node</span>
            <h3 className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 font-display">
              {site?.name ?? 'Renegade Autonomous Space'}
            </h3>
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              Every publication maintains cryptographic proofs, granular consent-aware analytics,
              and portable backup archives.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Link href="/setup" className="btn btn-secondary text-sm">
              Installation Setup
            </Link>
            <Link href="/social-studio" className="btn btn-primary text-sm">
              Create New Broadcast &rarr;
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
