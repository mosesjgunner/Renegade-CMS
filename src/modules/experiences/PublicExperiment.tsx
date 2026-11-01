'use client'
import { useEffect, useState } from 'react'
import { PublicForm } from '../audience/PublicForm'
import type { FormField } from '../audience/contracts'
type Experiment = {
  experiment: { id: string; state: string; configurationStatus: string; goalKey: string }
  assignedVariant: { id: string; headline: string; tagline: string; ctaText: string }
  consented: boolean
  form: { id: string; fields: FormField[]; consentText?: string } | null
}
export function PublicExperiment({ siteId }: { siteId?: string }) {
  const [data, setData] = useState<Experiment | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let disposed = false
    const load = async () => {
      const response = await fetch(
        `/api/experiences/active?siteId=${encodeURIComponent(siteId ?? '')}`,
      )
      if (!response.ok) return
      const next: Experiment = await response.json()
      if (disposed) return
      setData(next)
      if (next.consented && next.experiment.state === 'running') {
        await fetch('/api/experiences/exposure', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            siteId,
            experimentId: next.experiment.id,
            variantId: next.assignedVariant.id,
          }),
        })
      }
    }
    void load().catch(() => setMessage('Reader form unavailable. Please retry.'))
    window.addEventListener('renegade:consent-changed', load)
    return () => {
      disposed = true
      window.removeEventListener('renegade:consent-changed', load)
    }
  }, [siteId])
  if (!data || data.experiment.configurationStatus !== 'configured' || !data.form) return null
  return (
    <section
      aria-label="Reader invitation"
      data-testid="public-experiment-container"
      data-variant={data.assignedVariant.id}
      className="my-10 rounded-xl border p-6"
    >
      <h3>{data.assignedVariant.headline}</h3>
      <p>{data.assignedVariant.tagline}</p>
      <PublicForm
        formId={data.form.id}
        fields={data.form.fields}
        consentText={data.form.consentText}
        onSubmitted={async (submissionId) => {
          if (!data.consented || data.experiment.state !== 'running') return
          try {
            const response = await fetch('/api/experiences/conversion', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                siteId,
                experimentId: data.experiment.id,
                variantId: data.assignedVariant.id,
                submissionId,
              }),
            })
            setMessage(response.ok ? '' : 'Your form was received; measurement is unavailable.')
          } catch {
            setMessage('Your form was received; measurement is unavailable.')
          }
        }}
      />
      {message && <p role="status">{message}</p>}
    </section>
  )
}
