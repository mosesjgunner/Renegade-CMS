'use client'

import { useState } from 'react'
import styles from './ScheduleContentAction.module.css'

export default function ScheduleContentAction({
  articleId,
  sequence,
}: {
  articleId: string
  sequence: number
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [timeZone, setTimeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',
  )

  const schedule = async (form: FormData) => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/calendar/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule',
          sourceType: 'article',
          sourceId: articleId,
          expectedSequence: sequence,
          startsAt: form.get('startsAt'),
          timeZone,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || result.message || 'Scheduling failed.')
      window.location.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Scheduling failed.')
      setBusy(false)
    }
  }

  return (
    <details className={styles.details}>
      <summary>Schedule</summary>
      <form action={(form) => void schedule(form)} className={styles.form}>
        <label>
          Local date and time
          <input name="startsAt" required type="datetime-local" />
        </label>
        <label>
          Time zone
          <input
            name="timeZone"
            onChange={(event) => setTimeZone(event.target.value)}
            required
            value={timeZone}
          />
        </label>
        <button disabled={busy} type="submit">
          {busy ? 'Scheduling…' : 'Confirm schedule'}
        </button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  )
}
