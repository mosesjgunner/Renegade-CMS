'use client'

import React, { useEffect, useState } from 'react'

interface VariantData {
  id: string
  name: string
  isControl?: boolean
  registeredComponent: string
  headline: string
  tagline: string
  ctaText: string
  badge: string
}

interface ExperimentResponse {
  experiment: {
    id: string
    name: string
    description: string
    state: string
    goalKey: string
    winnerDecision?: {
      selectedVariantId?: string
      reason?: string
      decidedAt?: string
    } | null
  }
  assignedVariant: VariantData
  assignment: {
    experimentId: string
    variantId: string
    subjectKey: string
    isDefault: boolean
    dedupeKey: string
  }
  consented: boolean
  privacyMode: string
  reason: string
}

export function PublicExperiment({ siteId }: { siteId?: string }) {
  const [data, setData] = useState<ExperimentResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [converted, setConverted] = useState(false)
  const [email, setEmail] = useState('')
  const [exposureRecorded, setExposureRecorded] = useState(false)

  // 1. Fetch active experiment & deterministic variant assignment
  useEffect(() => {
    let unmounted = false
    const load = async () => {
      try {
        const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : ''
        const res = await fetch(`/api/experiences/active${query}`, { credentials: 'same-origin' })
        if (res.ok) {
          const json: ExperimentResponse = await res.json()
          if (!unmounted) {
            setData(json)
            setLoading(false)

            // 2. Automatically record exposure if consented and not yet recorded
            if (json.consented && json.assignment) {
              const exposureKey = `renegade_exp_exposure_${json.assignment.dedupeKey}`
              if (!sessionStorage.getItem(exposureKey)) {
                void fetch('/api/experiences/exposure', {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    experimentId: json.experiment.id,
                    variantId: json.assignedVariant.id,
                    assignmentKey: json.assignment.dedupeKey,
                    siteId,
                  }),
                }).then((r) => {
                  if (r.ok || r.status === 202) {
                    sessionStorage.setItem(exposureKey, '1')
                    setExposureRecorded(true)
                  }
                }).catch(() => {})
              } else {
                setExposureRecorded(true)
              }
            }
          }
        }
      } catch {
        if (!unmounted) setLoading(false)
      }
    }
    void load()
    return () => {
      unmounted = true
    }
  }, [siteId])

  const handleConversion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data || converting || converted) return
    setConverting(true)

    try {
      const conversionKey = `renegade_exp_conversion_${data.assignment.dedupeKey}`
      if (data.consented) {
        await fetch('/api/experiences/conversion', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            experimentId: data.experiment.id,
            variantId: data.assignedVariant.id,
            goalKey: data.experiment.goalKey,
            assignmentKey: data.assignment.dedupeKey,
            siteId,
          }),
        })
      }
      sessionStorage.setItem(conversionKey, '1')
      setConverted(true)
    } catch {
      // Graceful UI fallback
      setConverted(true)
    } finally {
      setConverting(false)
    }
  }

  if (loading) {
    return (
      <div className="my-8 rounded-xl border border-stone-200 bg-stone-50/50 p-6 text-center animate-pulse dark:border-stone-800 dark:bg-stone-900/50">
        <p className="text-xs text-stone-400">Loading reader onboarding…</p>
      </div>
    )
  }

  if (!data) return null

  const { assignedVariant, consented, privacyMode, experiment } = data
  const isWinner = experiment.state === 'winner-selected'

  return (
    <section
      aria-label="Reader Experiment Showcase"
      data-testid="public-experiment-container"
      className="my-10 overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-b from-white to-stone-50 p-6 shadow-sm dark:border-stone-800 dark:from-stone-900 dark:to-stone-950 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-4 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isWinner
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                : assignedVariant.isControl
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
            }`}
          >
            {isWinner ? '★ Approved Winner' : assignedVariant.badge}
          </span>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            Experiment: {experiment.name}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              consented ? 'bg-emerald-500' : 'bg-stone-400'
            }`}
          />
          <span className="text-stone-600 dark:text-stone-300">
            {consented ? 'Consented Session' : 'Privacy Default (Tracking Off)'}
          </span>
          {exposureRecorded && (
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-mono text-stone-500 dark:bg-stone-800 dark:text-stone-400">
              Exposure Logged
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 max-w-2xl">
        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-white">
          {assignedVariant.headline}
        </h3>
        <p className="mt-2 text-base text-stone-600 dark:text-stone-300">
          {assignedVariant.tagline}
        </p>
      </div>

      {converted ? (
        <div
          data-testid="experiment-conversion-success"
          className="mt-6 rounded-xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">✓</span>
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-200 text-sm">
                Subscription Confirmed!
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                Conversion recorded for goal: <code className="font-mono">{experiment.goalKey}</code>.
                {consented
                  ? ' Attributed under first-party consent.'
                  : ' Completed in privacy mode without tracking.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleConversion} className="mt-6 flex flex-col sm:flex-row gap-3 max-w-lg">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            aria-label="Email for dispatch subscription"
            className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white dark:placeholder-stone-500"
          />
          <button
            type="submit"
            disabled={converting}
            data-testid="experiment-cta-button"
            className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 transition disabled:opacity-50"
          >
            {converting ? 'Verifying…' : assignedVariant.ctaText}
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-400 dark:text-stone-500">
        <span>Component: <code>{assignedVariant.registeredComponent}</code></span>
        <span>•</span>
        <span>Variant ID: <code>{assignedVariant.id}</code></span>
        <span>•</span>
        <span>Assignment Key: <code>{data.assignment.dedupeKey.slice(0, 32)}…</code></span>
        <span>•</span>
        <span>Privacy Status: <em>{privacyMode}</em></span>
      </div>
    </section>
  )
}
