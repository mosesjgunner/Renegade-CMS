'use client'
import { useEffect, useRef, useState } from 'react'

type Plan = {
  id: string
  name: string
  amountMinor: string
  currency: string
  interval: string
  intervalCount: number
  trialDays: number
  cancelPolicy: string
  available: boolean
  reason: string
  providerMode: string | null
}
type Subscription = {
  id: string
  state: string
  plan: { name?: string }
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd?: string
}
const csrf = (): Record<string, string> => {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}
const price = (plan: { amountMinor: string; currency: string }) => {
  const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.currency })
  return formatter.format(
    Number(plan.amountMinor) / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2),
  )
}

export function MemberBilling() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{
    amountMinor: string
    currency: string
    expiresAt: string
  } | null>(null)
  const checkoutKey = useRef<{ body: string; key: string } | null>(null)
  const load = async () => {
    try {
      const results = await Promise.all(
        ['/api/commerce/subscriptions/plans', '/api/commerce/subscriptions'].map(async (url) => {
          const response = await fetch(url, { cache: 'no-store' })
          const body = await response.json()
          if (!response.ok) throw new Error(body.error ?? 'Billing could not be loaded.')
          return body
        }),
      )
      setPlans(results[0].plans)
      setSubscriptions(results[1].subscriptions)
      setLoaded(true)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Billing could not be loaded.')
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const action = async (url: string, data: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const serialized = JSON.stringify(data)
      if (checkoutKey.current?.body !== serialized)
        checkoutKey.current = { body: serialized, key: crypto.randomUUID() }
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrf(),
          'Idempotency-Key': checkoutKey.current.key,
        },
        body: serialized,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Billing action failed.')
      if (body.url) {
        window.location.assign(body.url)
        return
      }
      if (body.preview) setPreview(body.preview)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Billing action failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section id="billing" aria-label="Membership billing" className="mt-8 rounded border p-4">
      <h2>Membership and billing</h2>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void load()} disabled={busy}>
        Refresh billing status
      </button>
      {!loaded && !error && <p role="status">Loading saved billing records…</p>}
      {loaded && (
        <>
          <h3>Your subscriptions</h3>
          {!subscriptions.length && <p>No subscriptions for this site.</p>}
          <ul>
            {subscriptions.map((subscription) => (
              <li key={subscription.id}>
                <strong>{subscription.plan.name ?? 'Membership'}</strong>: {subscription.state};
                period ends {subscription.currentPeriodEnd}.
                {subscription.cancelAtPeriodEnd && (
                  <p>Cancellation is scheduled for the end of this period.</p>
                )}
                {subscription.trialEnd && <p>Trial ends {subscription.trialEnd}.</p>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void action('/api/commerce/subscriptions', {
                      subscriptionId: subscription.id,
                      action: 'portal',
                    })
                  }
                >
                  Manage billing for {subscription.plan.name ?? 'membership'}
                </button>
                <label>
                  Preview a plan change{' '}
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value)
                        void action('/api/commerce/subscriptions', {
                          subscriptionId: subscription.id,
                          planRevisionId: event.target.value,
                          action: 'preview-change',
                        })
                    }}
                    disabled={busy}
                  >
                    <option value="">Choose a published plan</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
          {preview && (
            <p role="status">
              Provider change estimate: {price(preview)}; valid until {preview.expiresAt}. Confirm
              changes in the billing portal.
            </p>
          )}
          <h3>Available plans</h3>
          {!plans.length && <p>No published membership plans for this site.</p>}
          <ul>
            {plans.map((plan) => (
              <li key={plan.id}>
                <strong>{plan.name}</strong>
                <p>
                  {price(plan)} every {plan.intervalCount} {plan.interval}; cancellation:{' '}
                  {plan.cancelPolicy.replaceAll('_', ' ')}.
                </p>
                {plan.trialDays > 0 && (
                  <p>Up to {plan.trialDays} trial days, subject to eligibility.</p>
                )}
                {plan.providerMode === 'provider-test' && (
                  <p>Test provider checkout. No live payment is collected.</p>
                )}
                {plan.available ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void action('/api/commerce/subscriptions/checkout', {
                        planRevisionId: plan.id,
                      })
                    }
                  >
                    Start {plan.name}
                  </button>
                ) : (
                  <p>{plan.reason}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
