import type { Metadata } from 'next'

import GuidedOperationsPanel from '@/modules/admin/GuidedOperationsPanel'
import TaskReadinessPanel from '@/modules/admin/TaskReadinessPanel'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function OperationsAdminPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold font-display">Operations</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Live task readiness from the shared readiness service — the same states the setup flow
          computes.
        </p>
      </header>
      <TaskReadinessPanel />
      <GuidedOperationsPanel />
    </main>
  )
}
