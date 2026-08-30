import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'

import { ensureBootstrap } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'

import { SetupForm } from './setup-form'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const payload = await getPayload({ config })
  const status = await ensureBootstrap(payload, loadConfig())

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
