'use client'

import { useEffect, useState } from 'react'

type SiteItem = {
  id: string
  name: string
  slug: string
}

export default function SiteSwitcher() {
  const [sites, setSites] = useState<SiteItem[]>([])
  const [activeSiteId, setActiveSiteId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/active-site')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.sites?.length) {
          setSites(data.sites)
          setActiveSiteId(data.activeSiteId || data.sites[0].id)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || sites.length <= 1) return null

  const handleSwitch = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSiteId = e.target.value
    setActiveSiteId(newSiteId)
    try {
      await fetch('/api/admin/active-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: newSiteId }),
      })
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }

  return (
    <div
      style={{
        padding: '0.625rem 0.875rem',
        marginBottom: '0.75rem',
        backgroundColor: '#1e293b',
        borderRadius: '6px',
        border: '1px solid #334155',
      }}
    >
      <label
        htmlFor="admin-site-select"
        style={{
          display: 'block',
          fontSize: '0.6875rem',
          color: '#94a3b8',
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
        style={{
          width: '100%',
          padding: '0.375rem 0.5rem',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #475569',
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
    </div>
  )
}
