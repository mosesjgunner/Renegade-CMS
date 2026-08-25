import Link from 'next/link'

import type { ConnectionGroup, ConnectionRecord } from './contracts'

const groups: readonly ConnectionGroup[] = [
  'Social',
  'Media',
  'AI',
  'Payments & Support',
  'Commerce',
  'Fulfillment',
  'Email',
  'Analytics',
  'Identity',
  'Messaging',
  'Security',
]

const groupIcons: Record<ConnectionGroup, string> = {
  Social: '💬',
  Media: '🎬',
  AI: '🧠',
  'Payments & Support': '💳',
  Commerce: '🛍️',
  Fulfillment: '📦',
  Email: '✉️',
  Analytics: '📊',
  Identity: '🆔',
  Messaging: '📨',
  Security: '🔒',
}

export function ConnectionsCenter({
  connections,
  groupFor,
}: {
  connections: readonly ConnectionRecord[]
  groupFor: (providerKey: string) => ConnectionGroup
}) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-950 dark:text-stone-50 font-display">
              Connections Center
            </h1>
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            External integrations with zero secret leakage. Explicit scopes dictate permitted system
            operations.
          </p>
        </div>
        <Link href="/admin" className="btn btn-secondary text-xs">
          Manage in Payload Studio
        </Link>
      </div>

      {/* Security & Isolation Callout */}
      <div className="p-5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3.5">
        <span className="text-2xl">🛡️</span>
        <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-bold">Zero-Secret Exposure Contract</p>
          <p className="text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
            API keys, OAuth client secrets, and access tokens are strictly verified server-side. No
            sensitive credentials are ever delivered to the browser runtime.
          </p>
        </div>
      </div>

      {/* Category Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group) => {
          const items = connections.filter(
            (connection) => groupFor(connection.providerKey) === group,
          )
          const icon = groupIcons[group] ?? '⚡'
          return (
            <section
              key={group}
              className="surface-card p-6 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{icon}</span>
                    <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                      {group}
                    </h2>
                  </div>
                  <span className="font-mono text-xs text-stone-400">
                    {items.length} {items.length === 1 ? 'service' : 'services'}
                  </span>
                </div>

                {items.length === 0 ? (
                  <div className="py-6 text-center text-xs text-stone-400 dark:text-stone-500 italic">
                    No active providers configured in this category.
                  </div>
                ) : (
                  <ul className="space-y-3 divide-y divide-stone-100 dark:divide-stone-800">
                    {items.map((connection) => (
                      <li key={connection.id} className="pt-3 first:pt-0 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                            {connection.label}
                          </span>
                          <span
                            className={`badge text-[10px] ${
                              connection.status === 'active' || connection.status === 'configured'
                                ? 'badge-brand'
                                : 'badge-neutral'
                            }`}
                          >
                            {connection.status}
                          </span>
                        </div>

                        {connection.scopes.length ? (
                          <div className="flex flex-wrap gap-1">
                            {connection.scopes.map((scope) => (
                              <span
                                key={scope}
                                className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 font-mono text-[10px] text-stone-600 dark:text-stone-300"
                              >
                                {scope}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono">
                          <span>Health: {connection.lastHealthCheckAt ?? 'pending'}</span>
                          {connection.expiresAt ? <span>Exp: {connection.expiresAt}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-3 border-t border-stone-100 dark:border-stone-800 text-right">
                <Link
                  href="/admin"
                  className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1"
                >
                  Configure provider &rarr;
                </Link>
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
