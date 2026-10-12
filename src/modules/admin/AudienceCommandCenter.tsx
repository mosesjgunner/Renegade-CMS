'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Intake = {
  communityDeliveries: { id: string; status: string; attempts: number; error?: string }[]
  siteId: string
  counts: { received: number; held: number; triaged: number }
  submissions: { id: string; status: string; actionState?: { status: string; error?: string }[] }[]
}

function AudienceIntakeView() {
  const [intake, setIntake] = useState<Intake | null>(null)
  const [status, setStatus] = useState('Loading saved intake state.')

  async function refresh() {
    try {
      const response = await fetch('/api/admin/audience/intake')
      const body = await response.json()
      if (response.ok) {
        setIntake(body)
        setStatus('')
      } else {
        setIntake(null)
        setStatus(body.error ?? 'Saved intake could not be loaded.')
      }
    } catch {
      setIntake(null)
      setStatus('Saved intake could not be loaded.')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function retryEmail(id: string) {
    try {
      const response = await fetch('/api/admin/audience/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deliveryId: id }),
      })
      const body = await response.json()
      const message =
        response.ok && body.queued
          ? 'Community email queued for recovery.'
          : (body.error ?? 'This outcome cannot be safely retried.')
      await refresh()
      setStatus(message)
    } catch {
      setStatus('Community email recovery could not be requested.')
    }
  }

  async function retry(id: string) {
    try {
      const response = await fetch('/api/admin/audience/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submissionId: id }),
      })
      const body = await response.json()
      if (response.ok) {
        await refresh()
        setStatus(body.message)
      } else setStatus(body.error)
    } catch {
      setStatus('Intake recovery could not be requested.')
    }
  }

  return (
    <main className="gutter--left gutter--right">
      <h1>Audience intake</h1>
      <AudienceSavedSummary />
      <p>
        Saved form submissions and bounded create-contact/create-task execution. General-purpose
        audience automations and telecom operator dispatch remain unavailable.
      </p>
      <p>
        <Link href="/admin/collections/form-definitions">Manage forms</Link> |{' '}
        <Link href="/admin/collections/form-schemas">Manage schema versions and consent</Link> |{' '}
        <Link href="/admin/collections/form-submissions">
          Inspect submissions and execution evidence
        </Link>{' '}
        | <Link href="/admin/collections/automation-definitions">Manage automations</Link> |{' '}
        <Link href="/admin/collections/telecom-messages">Inspect telecom messages</Link>
      </p>
      {intake ? (
        <>
          <p>
            Received: {intake.counts.received} | Held: {intake.counts.held} | Triaged:{' '}
            {intake.counts.triaged}
          </p>
          <ul>
            {intake.submissions.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/collections/form-submissions/${row.id}`}>{row.id}</Link> |{' '}
                {row.status}
                {row.actionState
                  ?.filter((action) => action.status === 'failed')
                  .map((action, index) => (
                    <p key={index}>{action.error}</p>
                  ))}
                {row.actionState?.some((action) => action.status === 'failed') ? (
                  <button type="button" onClick={() => void retry(row.id)}>
                    Retry failed intake steps
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {intake ? (
        <section>
          <h2>Community email outcomes</h2>
          <p>
            Accepted means transport acceptance. Unknown outcomes require reconciliation before
            retry.
          </p>
          <ul>
            {intake.communityDeliveries.map((row) => (
              <li key={row.id}>
                {row.id}: {row.status} ({row.attempts} attempts) {row.error}
                {row.status === 'failed' ? (
                  <button type="button" onClick={() => void retryEmail(row.id)}>
                    Retry community email
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p role="status">{status}</p>
      <p>
        Community email and digests require member opt-in and a verified sign-in email. Local
        transport acceptance does not prove production inbox delivery.
      </p>
      <p>
        <Link href="/admin/capabilities">Review capabilities and connections</Link>
      </p>
    </main>
  )
}

// ============================================================================
type Summary = {
  siteId: string
  subscribers: number | null
  emailOutcomes: Array<{ status: string; count: number }> | null
  telecomOutcomes: Array<{ status: string; count: number }> | null
  messages: Array<{ id: string; subject: string; status: string }> | null
  telecomMessages: Array<{ id: string; title: string; channel: string; status: string }> | null
  automations: Array<{ id: string; name: string; status: string; version: string }> | null
  experiments: Array<{ id: string; title: string; status: string }> | null
  source: string
}

function AudienceSavedSummary() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  async function refresh() {
    setError('')
    try {
      const response = await fetch('/api/admin/audience/command-center')
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error ?? 'Saved audience reporting could not be loaded.')
      setSummary(body)
    } catch (cause) {
      setSummary(null)
      setError(
        cause instanceof Error ? cause.message : 'Saved audience reporting could not be loaded.',
      )
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  return (
    <section aria-label="Saved audience reporting">
      <h2>Saved audience reporting</h2>
      {error && <p role="alert">{error}</p>}
      {!summary && !error && <p>Loading saved reporting.</p>}
      {summary && (
        <>
          <p>
            Site: {summary.siteId}. Subscriber records:{' '}
            {summary.subscribers ?? 'module unavailable'}.
          </p>
          <p>{summary.source}</p>
          <h3>Email outcomes</h3>
          {summary.emailOutcomes === null ? (
            <p>Email module unavailable.</p>
          ) : summary.emailOutcomes.length ? (
            <ul>
              {summary.emailOutcomes.map((outcome) => (
                <li key={outcome.status}>
                  {outcome.status}: {outcome.count}
                </li>
              ))}
            </ul>
          ) : (
            <p>No saved email outcomes.</p>
          )}
          <p>
            Provider configuration does not prove connection health, domain authentication,
            delivery, opens or conversions.
          </p>
          <h3>Telecom delivery outcomes</h3>
          {summary.telecomOutcomes === null ? (
            <p>Telecom deliveries unavailable.</p>
          ) : summary.telecomOutcomes.length ? (
            <ul>
              {summary.telecomOutcomes.map((outcome) => (
                <li key={outcome.status}>
                  {outcome.status}: {outcome.count}
                </li>
              ))}
            </ul>
          ) : (
            <p>No saved telecom deliveries.</p>
          )}
          <p>
            SMS and RCS gateway acceptance does not establish end-user handset delivery or reading.
          </p>
          <h3>Saved email messages</h3>
          {summary.messages === null ? (
            <p>Email module unavailable.</p>
          ) : (
            <>
              <Link href="/admin/email-composer">Compose email</Link>
              {summary.messages.length ? (
                <ul>
                  {summary.messages.map((message) => (
                    <li key={message.id}>
                      <Link href={'/admin/collections/email-messages/' + message.id}>
                        {message.subject}
                      </Link>
                      : {message.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No saved messages.</p>
              )}
            </>
          )}
          <h3>Saved telecom dispatches</h3>
          {summary.telecomMessages === null ? (
            <p>Telecom module unavailable.</p>
          ) : (
            <>
              <Link href="/admin/collections/telecom-messages">Manage telecom messages</Link>
              {summary.telecomMessages.length ? (
                <ul>
                  {summary.telecomMessages.map((message) => (
                    <li key={message.id}>
                      <Link href={'/admin/collections/telecom-messages/' + message.id}>
                        {message.title}
                      </Link>{' '}
                      ({message.channel}): {message.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No saved telecom messages.</p>
              )}
            </>
          )}
          <h3>Saved automations</h3>
          {summary.automations === null ? (
            <p>Automations unavailable.</p>
          ) : (
            <>
              <Link href="/admin/collections/automation-definitions">
                Manage automation definitions
              </Link>
              {summary.automations.length ? (
                <ul>
                  {summary.automations.map((automation) => (
                    <li key={automation.id}>
                      <Link href={'/admin/collections/automation-definitions/' + automation.id}>
                        {automation.name} (v{automation.version})
                      </Link>
                      : {automation.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No saved automation definitions.</p>
              )}
            </>
          )}
          <h3>Saved experiment definitions</h3>
          {summary.experiments === null ? (
            <p>Experiments module unavailable.</p>
          ) : (
            <>
              <Link href="/admin/collections/audience-experiments">
                Manage experiment definitions
              </Link>
              <p>
                Saved status does not establish allocation, statistical significance or a deployed
                winner.
              </p>
              {summary.experiments.length ? (
                <ul>
                  {summary.experiments.map((experiment) => (
                    <li key={experiment.id}>
                      <Link href={'/admin/collections/audience-experiments/' + experiment.id}>
                        {experiment.title}
                      </Link>
                      : {experiment.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No saved definitions.</p>
              )}
            </>
          )}
        </>
      )}
      <button type="button" onClick={() => void refresh()}>
        Refresh saved reporting
      </button>
    </section>
  )
}

export default function AudienceCommandCenter() {
  return <AudienceIntakeView />
}
