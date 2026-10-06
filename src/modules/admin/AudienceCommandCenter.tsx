'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
type Intake = {
  communityDeliveries: { id: string; status: string; attempts: number; error?: string }[]
  siteId: string
  counts: { received: number; held: number; triaged: number }
  submissions: { id: string; status: string; actionState?: { status: string; error?: string }[] }[]
}
export default function AudienceCommandCenter() {
  const [intake, setIntake] = useState<Intake | null>(null),
    [status, setStatus] = useState('Loading saved intake state.')
  async function refresh() {
    const response = await fetch('/api/admin/audience/intake')
    const body = await response.json()
    if (response.ok) {
      setIntake(body)
      setStatus('')
    } else setStatus(body.error)
  }
  useEffect(() => {
    void refresh()
  }, [])
  async function retryEmail(id: string) {
    const response = await fetch('/api/admin/audience/intake', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deliveryId: id }),
    })
    const body = await response.json()
    setStatus(
      body.queued
        ? 'Community email queued for recovery.'
        : 'This outcome cannot be safely retried.',
    )
    await refresh()
  }
  async function retry(id: string) {
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
  }
  return (
    <main className="gutter--left gutter--right">
      <h1>Audience intake</h1>
      <p>
        Saved form submissions and bounded create-contact/create-task execution. General-purpose
        audience automations and telecom operator dispatch remain unavailable.
      </p>
      <p>
        <Link href="/admin/collections/form-definitions">Manage forms</Link> |{' '}
        <Link href="/admin/collections/form-schemas">Manage schema versions and consent</Link> |{' '}
        <Link href="/admin/collections/form-submissions">
          Inspect submissions and execution evidence
        </Link>
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
