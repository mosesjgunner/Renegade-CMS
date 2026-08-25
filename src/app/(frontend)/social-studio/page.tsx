'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { socialHash, socialIdempotencyKey, validateVariant } from '@/modules/social/contracts'

type NetworkConfig = {
  name: string
  icon: string
  limit?: number
  badge: string
  color: string
}

const networks: NetworkConfig[] = [
  {
    name: 'Bluesky',
    icon: '🦋',
    limit: 300,
    badge: 'Native API',
    color: 'text-sky-500 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800',
  },
  {
    name: 'Mastodon / ActivityPub',
    icon: '🐘',
    limit: 500,
    badge: 'Native API',
    color:
      'text-purple-500 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
  },
  {
    name: 'Threads',
    icon: '🧵',
    limit: 500,
    badge: 'Direct Scope',
    color: 'text-pink-500 bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800',
  },
  {
    name: 'X',
    icon: '𝕏',
    limit: 280,
    badge: 'Character Budget',
    color:
      'text-stone-800 dark:text-stone-200 bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-700',
  },
  {
    name: 'LinkedIn',
    icon: '💼',
    limit: 3000,
    badge: 'Professional',
    color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
  },
  {
    name: 'Facebook',
    icon: '📘',
    limit: 2000,
    badge: 'Manual Handoff',
    color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
  },
  {
    name: 'Instagram',
    icon: '📷',
    limit: 2200,
    badge: 'Manual Handoff',
    color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
  },
]

export default function SocialStudioPage() {
  const [text, setText] = useState(
    'Renegade CMS empowers independent creators to own their publication, media, and audience directly.',
  )
  const [selectedNetwork, setSelectedNetwork] = useState<string>('Bluesky')
  const [scheduledFor, setScheduledFor] = useState('')
  const [status, setStatus] = useState<string>('Draft — compose and review before dispatch.')

  const currentNetwork = networks.find((n) => n.name === selectedNetwork) ?? networks[0]
  const limit = currentNetwork.limit ?? 280
  const charsRemaining = limit - text.length
  const isOverLimit = charsRemaining < 0
  const progressPercent = Math.min(100, Math.max(0, (text.length / limit) * 100))

  const variant = useMemo(
    () => ({
      id: 'preview-variant-01',
      accountId: 'account-primary',
      network: selectedNetwork === 'Bluesky' ? ('bluesky' as const) : ('manual' as const),
      text,
      attachments: [],
      status: 'draft' as const,
      idempotencyKey: 'preview-idempotency',
    }),
    [selectedNetwork, text],
  )

  const issues = validateVariant(variant, currentNetwork.limit)

  const submit = (action: 'review' | 'publish' | 'schedule') => {
    if (issues.length) return setStatus(`Validation Error: ${issues.join(' ')}`)
    if (
      action === 'publish' &&
      selectedNetwork !== 'Bluesky' &&
      selectedNetwork !== 'Mastodon / ActivityPub'
    )
      return setStatus(
        `${selectedNetwork} is currently manual handoff only; no unsupported API call was made.`,
      )
    if (action === 'schedule' && !scheduledFor)
      return setStatus('Please select a local date and time to schedule this post.')
    const key = socialIdempotencyKey(variant.id, socialHash(variant))
    setStatus(
      action === 'review'
        ? 'Broadcast ready for review.'
        : `${action === 'schedule' ? 'Scheduled' : 'Queued for dispatch'} with idempotency proof ${key.slice(0, 24)}…`,
    )
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">💬</span>
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-950 dark:text-stone-50 font-display">
              Social Studio
            </h1>
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Author once, refine independently per channel, and preserve cryptographic dispatch keys.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/connections" className="btn btn-secondary text-xs">
            Manage Network Connections
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Composer Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Network Selector Tabs */}
          <div className="space-y-2">
            <label className="form-label">Select Network Target</label>
            <div className="flex flex-wrap gap-2">
              {networks.map((item) => {
                const isActive = item.name === selectedNetwork
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setSelectedNetwork(item.name)}
                    className={`btn text-xs px-3 py-2 rounded-xl transition-all ${
                      isActive
                        ? 'btn-primary shadow-sm'
                        : 'btn-secondary text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Post Content Textarea */}
          <div className="surface-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="post-textarea" className="form-label mb-0">
                Native Channel Post Text
              </label>
              <span
                className={`text-xs font-mono font-bold ${isOverLimit ? 'text-red-600' : 'text-stone-500 dark:text-stone-400'}`}
              >
                {charsRemaining} chars left
              </span>
            </div>

            <textarea
              id="post-textarea"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What would you like to broadcast to your followers?"
              className="form-textarea font-sans text-base leading-relaxed resize-y"
            />

            {/* Character Budget Progress Bar */}
            <div className="w-full bg-stone-100 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isOverLimit
                    ? 'bg-red-600'
                    : progressPercent > 85
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {issues.length > 0 ? (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                ⚠️ {issues.join(' ')}
              </div>
            ) : null}
          </div>

          {/* Schedule Controls */}
          <div className="surface-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Broadcast & Scheduling
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Schedule Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="form-input text-xs"
                />
              </div>
              <div>
                <label className="form-label">Idempotency Model</label>
                <div className="form-input text-xs bg-stone-50 dark:bg-stone-900 text-stone-500 font-mono truncate">
                  SHA-256 Content Hash
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => submit('review')}
                className="btn btn-secondary text-xs flex-1 sm:flex-initial"
              >
                Request Review
              </button>
              <button
                type="button"
                onClick={() => submit('schedule')}
                className="btn btn-secondary text-xs flex-1 sm:flex-initial"
              >
                📅 Schedule
              </button>
              <button
                type="button"
                onClick={() => submit('publish')}
                className="btn btn-primary text-xs flex-1 sm:flex-initial"
              >
                🚀 Publish Broadcast
              </button>
            </div>
          </div>

          {/* Status Feedback */}
          <div
            role="status"
            className="p-4 rounded-xl bg-stone-100 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 text-xs font-mono text-stone-700 dark:text-stone-300"
          >
            <strong>Status:</strong> {status}
          </div>
        </div>

        {/* Right Column: Live Network Preview Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="surface-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{currentNetwork.icon}</span>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  {currentNetwork.name} Preview
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${currentNetwork.color}`}
              >
                {currentNetwork.badge}
              </span>
            </div>

            {/* Simulated Post Card */}
            <div className="p-5 rounded-2xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3 shadow-inner">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center text-white font-bold text-sm">
                  R
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-100 leading-tight">
                    Renegade Publisher
                  </p>
                  <p className="text-xs text-stone-500 font-mono">@renegadeparty.org</p>
                </div>
              </div>

              <div className="text-sm sm:text-base leading-relaxed text-stone-800 dark:text-stone-200 whitespace-pre-wrap font-sans">
                {text || <span className="text-stone-400 italic">No content typed yet...</span>}
              </div>

              <div className="pt-2 text-[11px] text-stone-400 border-t border-stone-200/50 dark:border-stone-800/50 flex items-center justify-between font-mono">
                <span>
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>Renegade Dispatch Protocol</span>
              </div>
            </div>

            {/* Capability Honesty Callout */}
            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <p className="font-semibold">🛡️ Capability Honesty Principle</p>
              <p className="text-blue-800/80 dark:text-blue-300/80 leading-relaxed">
                Bluesky and ActivityPub connect to native APIs. Networks without connected access
                tokens use manual handoff copy flows.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
