'use client'

import { useEffect, useState } from 'react'

type Choices = { necessary: true; analytics: boolean; personalization: boolean; marketing: boolean }
type Policy = {
  analyticsEnabled: boolean
  consentVersion: string
  respectGlobalPrivacyControl: boolean
  respectDoNotTrack: boolean
}
const empty: Choices = {
  necessary: true,
  analytics: false,
  personalization: false,
  marketing: false,
}
const ids = () => ({ anonymousId: crypto.randomUUID(), sessionId: crypto.randomUUID() })
const readCookie = (name: string) =>
  document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1)
const cookie = (name: string, value: string, maxAge?: number) => {
  document.cookie = `${name}=${value}; Path=/; SameSite=Lax${maxAge ? `; Max-Age=${maxAge}` : '; Max-Age=0'}`
}

export function ConsentManager({ siteId }: { siteId?: string }) {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [choices, setChoices] = useState<Choices | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    void fetch('/api/analytics/consent', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((value) => {
        setPolicy(value.policy)
        setChoices(value.choices)
      })
      .catch(() => setChoices(empty))
  }, [])
  const privacySignal =
    typeof navigator !== 'undefined' &&
    ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl ||
      navigator.doNotTrack === '1')
  const save = async (next: Choices) => {
    if (!siteId) return
    const response = await fetch('/api/analytics/consent', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, choices: next }),
    })
    if (!response.ok) return
    setChoices(next)
    setEditing(false)
    if (!next.analytics) {
      cookie('renegade-aid', '')
      cookie('renegade-sid', '')
    }
  }
  useEffect(() => {
    if (
      !siteId ||
      !policy ||
      !choices?.analytics ||
      (policy.respectGlobalPrivacyControl && privacySignal) ||
      !policy.analyticsEnabled
    )
      return
    const identity = {
      anonymousId: readCookie('renegade-aid') ?? ids().anonymousId,
      sessionId: readCookie('renegade-sid') ?? ids().sessionId,
    }
    cookie('renegade-aid', identity.anonymousId, 60 * 60 * 24 * 90)
    cookie('renegade-sid', identity.sessionId, 60 * 30)
    void fetch('/api/analytics/collect', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        siteId,
        eventType: 'page_view',
        path: location.pathname,
        occurredAt: new Date().toISOString(),
        ...identity,
      }),
    })
  }, [siteId, policy, choices, privacySignal])
  if (!policy || choices === undefined) return null
  if (choices && !editing)
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="fixed bottom-3 left-3 z-50 text-xs underline"
      >
        Privacy choices
      </button>
    )
  const current = choices ?? empty
  return (
    <section
      aria-label="Privacy choices"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-lg border bg-white p-4 shadow-xl dark:bg-stone-950"
    >
      <p className="font-semibold">Your privacy choices</p>
      <p className="mt-1 text-sm">
        Necessary storage keeps your consent choice. Analytics is off unless you choose it; we honor
        supported privacy signals.
      </p>
      {(['analytics', 'personalization', 'marketing'] as const).map((category) => (
        <label key={category} className="mt-3 flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={current[category]}
            onChange={(event) => setChoices({ ...current, [category]: event.target.checked })}
          />{' '}
          {category[0].toUpperCase() + category.slice(1)}
        </label>
      ))}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={() => void save(empty)}>
          Reject non-essential
        </button>
        <button type="button" onClick={() => void save(current)}>
          Save choices
        </button>
        <button
          type="button"
          onClick={() =>
            void save({ necessary: true, analytics: true, personalization: true, marketing: true })
          }
        >
          Accept all
        </button>
      </div>
    </section>
  )
}
