'use client'

import { useState } from 'react'
import styles from './ScheduleContentAction.module.css'
import { FormField, SaveStateIndicator } from './forms'
import { saveHttpError, useSaveState } from './forms/useSaveState'

export default function ScheduleContentAction({
  articleId,
  sequence,
}: {
  articleId: string
  sequence: number
}) {
  const [timeZone, setTimeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',
  )
  // UXI-08: scheduling goes through the shared save-state machine. The
  // schedule API answers 409 when the item's sequence has moved on —
  // that lands in the conflict state (work preserved, reload offered),
  // never a generic failure, and nothing claims success before the
  // server acknowledges.
  const { state: saveState, save, isSaving } = useSaveState()

  const schedule = async (form: FormData) => {
    const outcome = await save(async () => {
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
      if (!response.ok)
        throw saveHttpError(response.status, result.error || result.message || 'Scheduling failed.')
      return result as Record<string, unknown>
    })
    if (outcome.ok) window.location.reload()
  }

  return (
    <details className={styles.details}>
      <summary>Schedule</summary>
      <form action={(form) => void schedule(form)} className={styles.form}>
        <FormField fieldId={`schedule-starts-at-${articleId}`} label="Local date and time" required>
          {(ariaProps) => <input {...ariaProps} name="startsAt" required type="datetime-local" />}
        </FormField>
        <FormField fieldId={`schedule-time-zone-${articleId}`} label="Time zone" required>
          {(ariaProps) => (
            <input
              {...ariaProps}
              name="timeZone"
              onChange={(event) => setTimeZone(event.target.value)}
              required
              value={timeZone}
            />
          )}
        </FormField>
        <button disabled={isSaving} type="submit">
          {isSaving ? 'Scheduling…' : 'Confirm schedule'}
        </button>
        {saveState.status !== 'idle' ? (
          <SaveStateIndicator
            state={saveState}
            onResolveConflict={() => window.location.reload()}
            resolveConflictLabel="Reload to see the latest version"
          />
        ) : null}
      </form>
    </details>
  )
}
