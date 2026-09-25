import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'

import { ensureBootstrap, getInstallationReadiness } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'

import { SetupForm } from './setup-form'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const payload = await getPayload({ config })
  const runtimeConfig = loadConfig()
  const readiness = await getInstallationReadiness(payload, runtimeConfig)

  if (!readiness.ready) {
    return (
      <main className="max-w-lg mx-auto px-4 py-20">
        <div className="surface-card p-8 space-y-5 border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 font-display">
                Migration & Database Readiness Required
              </h1>
              <p className="text-xs text-stone-500">
                Database: {readiness.database} | Migrations: {readiness.appliedMigrations}/
                {readiness.totalMigrations} applied
              </p>
            </div>
          </div>
          <p className="text-sm text-stone-600 dark:text-stone-400">{readiness.recoveryAction}</p>
          {readiness.pendingMigrations.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                Pending Migrations ({readiness.pendingMigrations.length}):
              </span>
              <ul className="max-h-32 overflow-y-auto text-xs font-mono bg-stone-100 dark:bg-stone-900 p-2 rounded border border-stone-200 dark:border-stone-800 space-y-1">
                {readiness.pendingMigrations.map((m) => (
                  <li key={m} className="text-stone-600 dark:text-stone-400">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <code className="block p-3 rounded-xl bg-stone-900 text-stone-100 font-mono text-xs text-left overflow-x-auto">
            {readiness.database === 'disconnected' ? 'docker compose up -d' : 'npm run db:migrate'}
          </code>
        </div>
      </main>
    )
  }

  const status = await ensureBootstrap(payload, runtimeConfig)

  if (status.state === 'complete') {
    return (
      <main className="max-w-md mx-auto px-4 py-20">
        <div className="surface-card p-8 text-center space-y-4">
          <span className="text-3xl">✅</span>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 font-display">
            Setup Complete
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Installation is already configured and verified. Head over to the admin portal or sign
            in.
          </p>
          <div className="pt-4 flex justify-center gap-3">
            <Link href="/login" className="btn btn-secondary text-xs">
              Sign In
            </Link>
            <Link href="/admin" className="btn btn-primary text-xs">
              Admin Panel &rarr;
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (status.state !== 'incomplete') {
    return (
      <main className="max-w-md mx-auto px-4 py-20">
        <div className="surface-card p-8 text-center space-y-4 border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20">
          <span className="text-3xl">⚠️</span>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 font-display">
            Setup Unavailable
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            The installation setup window is locked. Run the local CLI recovery command to generate
            a fresh token:
          </p>
          <code className="block p-3 rounded-xl bg-stone-900 text-stone-100 font-mono text-xs text-left overflow-x-auto">
            npm run installation:recover
          </code>
        </div>
      </main>
    )
  }

  return <SetupForm initialEmail={loadConfig().ownerEmail ?? ''} appUrl={loadConfig().appUrl} />
}
import type { Metadata } from 'next'

export const metadata: Metadata = { robots: { index: false, follow: false } }
