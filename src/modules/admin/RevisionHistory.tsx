'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './RevisionHistory.module.css'

type Revision = {
  id: string
  sequence: number
  reason?: string | null
  createdAt?: string | null
  excerpt: string
}

type History = { currentRevision: string | null; revisions: Revision[] }

export default function RevisionHistory({ contentId }: { contentId: string }) {
  const [history, setHistory] = useState<History | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/admin/workflow/revisions?contentId=${encodeURIComponent(contentId)}`,
    )
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not load revision history.')
    setHistory(data)
  }, [contentId])

  useEffect(() => {
    void load().catch((cause) => setError(cause.message))
  }, [load])

  const restore = async (revision: Revision) => {
    if (!window.confirm(`Restore revision ${revision.sequence}? This creates a new revision.`))
      return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/workflow/revisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, revisionId: revision.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not restore revision.')
      await load()
      setMessage(
        `Revision ${revision.sequence} was restored as a new saved revision. Publish it in the editor to update the public page.`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore revision.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={`gutter--left gutter--right ${styles.main}`}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/admin">Dashboard</Link> / <Link href="/admin/posts">Publishing</Link> / History
      </nav>
      <h1>Saved revisions</h1>
      <p className={styles.intro}>
        Revisions preserve saved body changes. Restoring creates a new saved revision. The public
        page keeps its last published body until you set status to published and save in the editor.
      </p>
      <p className={styles.back}>
        <Link href={`/admin/collections/content/${contentId}`}>Back to editor</Link>
      </p>
      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}
      {!history && !error && <p>Loading saved revisions…</p>}
      {history?.revisions.length === 0 && <p>No saved body revisions are available.</p>}
      {history && history.revisions.length > 0 && (
        <ol className={styles.list}>
          {history.revisions.map((revision) => {
            const current = revision.id === history.currentRevision
            return (
              <li className={styles.item} key={revision.id}>
                <strong>Revision {revision.sequence}</strong> {current && <span>(current)</span>}
                <div className={styles.meta}>
                  {revision.reason || 'Saved'}
                  {revision.createdAt && ` · ${new Date(revision.createdAt).toLocaleString()}`}
                </div>
                {revision.excerpt && <p className={styles.excerpt}>{revision.excerpt}</p>}
                {!current && (
                  <button
                    className={styles.restore}
                    disabled={busy}
                    onClick={() => void restore(revision)}
                    type="button"
                  >
                    Restore revision {revision.sequence}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}
