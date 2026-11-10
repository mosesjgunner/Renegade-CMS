'use client'

import { useEffect, useState } from 'react'

type SiteItem = {
  id: string
  name: string
  slug: string
}

/**
 * GUI-03C — authoritative site context.
 *
 * The displayed site is the server-persisted selection, never an
 * optimistic guess: the switcher only updates after the POST succeeds,
 * a failed switch keeps the previous site and explains itself, and a
 * failed load shows an error instead of silently vanishing. Tenant
 * policy is unchanged — the server still decides what may be selected.
 */
export default function SiteSwitcher() {
  const [sites, setSites] = useState<SiteItem[]>([])
  const [activeSiteId, setActiveSiteId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    fetch('/api/admin/active-site')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then((data) => {
        if (data?.sites?.length) {
          setSites(data.sites)
          setActiveSiteId(data.activeSiteId || data.sites[0].id)
        }
      })
      .catch(() => setError('Site list could not be loaded. Reload to retry.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (error && !sites.length) {
    return (
      <p role="alert" style={{ fontSize: '0.8125rem', padding: '0.5rem 0.875rem' }}>
        {error}
      </p>
    )
  }
  if (sites.length <= 1) return null

  const handleSwitch = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSiteId = e.target.value
    const previousSiteId = activeSiteId
    setError('')
    setPending(true)
    try {
      const res = await fetch('/api/admin/active-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: newSiteId }),
      })
      if (!res.ok) throw new Error('switch rejected')
      setActiveSiteId(newSiteId)
      window.location.reload()
    } catch {
      setActiveSiteId(previousSiteId)
      setPending(false)
      setError('That site switch did not save. You are still on the previous site.')
    }
  }

  return (
    <div
      style={{
        padding: '0.625rem 0.875rem',
        marginBottom: '0.75rem',
        backgroundColor: 'var(--theme-elevation-100)',
        borderRadius: '6px',
        border: '1px solid var(--theme-border-color)',
      }}
    >
      <label
        htmlFor="admin-site-select"
        style={{
          display: 'block',
          fontSize: '0.6875rem',
          color: 'var(--theme-text)',
          opacity: 0.7,
          marginBottom: '0.25rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
        }}
      >
        Active Site
      </label>
      <select
        id="admin-site-select"
        aria-label="Active Site"
        value={activeSiteId}
        onChange={handleSwitch}
        disabled={pending}
        aria-busy={pending}
        style={{
          width: '100%',
          padding: '0.375rem 0.5rem',
          backgroundColor: 'var(--theme-input-bg)',
          color: 'var(--theme-text)',
          border: '1px solid var(--theme-border-color)',
          borderRadius: '4px',
          fontSize: '0.8125rem',
          cursor: 'pointer',
        }}
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.slug})
          </option>
        ))}
      </select>
      {pending ? (
        <p aria-live="polite" style={{ fontSize: '0.75rem', margin: '0.375rem 0 0' }}>
          Switching site…
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ fontSize: '0.75rem', margin: '0.375rem 0 0' }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
