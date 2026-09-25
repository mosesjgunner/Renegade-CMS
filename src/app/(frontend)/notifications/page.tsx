'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}

type NotificationItem = {
  id: string
  kind?: string
  targetType?: string
  targetId?: string
  snapshot?: Record<string, unknown>
  readAt?: string | null
  createdAt?: string
  read?: boolean
  title?: string
  message?: string
}

export default function NotificationsPage() {
  const [siteId, setSiteId] = useState('')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusMessage, setStatusMessage] = useState('')

  const loadNotifications = useCallback(async (currentSiteId: string) => {
    try {
      const res = await fetch(`/api/community/notifications?siteId=${encodeURIComponent(currentSiteId)}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        if (res.status === 401) {
          setStatusMessage('Sign in is required to view notifications.')
        } else {
          setStatusMessage('Could not load notifications.')
        }
        setLoading(false)
        return
      }

      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(Number(data.unreadCount ?? 0))
      setLoading(false)
    } catch {
      setStatusMessage('Network error loading notifications.')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetch('/api/member-auth/me').then(async (res) => {
      if (!res.ok) {
        setStatusMessage('Sign in is required to view notifications.')
        setLoading(false)
        return
      }
      const data = await res.json()
      const site = String(data.siteId ?? '')
      if (!site) {
        setStatusMessage('No active site selected.')
        setLoading(false)
        return
      }
      setSiteId(site)
      void loadNotifications(site)
    })
  }, [loadNotifications])

  async function markRead(notificationId?: string) {
    try {
      const res = await fetch('/api/community/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeader() },
        body: JSON.stringify({
          siteId,
          notificationId,
        }),
      })

      if (res.ok) {
        if (notificationId) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString(), read: true } : n)),
          )
          setUnreadCount((c) => Math.max(0, c - 1))
        } else {
          setNotifications((prev) =>
            prev.map((n) => ({ ...n, readAt: new Date().toISOString(), read: true })),
          )
          setUnreadCount(0)
        }
      }
    } catch {
      // Ignored
    }
  }

  return (
    <main className="container mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between pb-6 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Updates on mentions, replies, messages, and community activity.
          </p>
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void markRead()}
          >
            Mark all read
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <div className="mt-6 p-4 rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900 text-center">
          <p className="text-sm text-stone-700 dark:text-stone-300">{statusMessage}</p>
          {statusMessage.includes('Sign in') ? (
            <div className="mt-3">
              <Link href="/member-auth" className="btn btn-primary btn-sm">
                Sign in &rarr;
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="py-12 text-center text-stone-500">Loading notifications…</div>
      ) : notifications.length === 0 && !statusMessage ? (
        <div className="mt-8 p-8 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 text-center text-stone-500">
          You are all caught up! No notifications yet.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {notifications.map((n) => {
            const isRead = Boolean(n.readAt || n.read)
            const dateStr = n.createdAt ? new Date(n.createdAt).toLocaleString() : ''
            const text =
              n.message ||
              n.title ||
              (n.snapshot && typeof n.snapshot.body === 'string' ? n.snapshot.body : null) ||
              `${n.kind || n.targetType || 'Notification'} update`

            return (
              <article
                key={n.id}
                className={`p-4 rounded-xl border transition flex items-start justify-between gap-4 ${
                  isRead
                    ? 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
                    : 'border-blue-300 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      {n.kind || n.targetType || 'Update'}
                    </span>
                    {!isRead ? (
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-600" aria-label="Unread" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-stone-800 dark:text-stone-200 line-clamp-2">
                    {text}
                  </p>
                  {dateStr ? (
                    <time dateTime={n.createdAt} className="mt-2 block text-xs text-stone-400">
                      {dateStr}
                    </time>
                  ) : null}
                </div>

                {!isRead ? (
                  <button
                    type="button"
                    className="btn btn-sm text-xs"
                    onClick={() => void markRead(n.id)}
                  >
                    Mark read
                  </button>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
