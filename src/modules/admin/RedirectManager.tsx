'use client'

import { useEffect, useState } from 'react'

type PublicRedirectItem = {
  id: string
  fromPath: string
  toPath: string
  statusCode: string
  match: string
  preserveQuery?: boolean
  enabled?: boolean
  hitCount: number
}

export default function RedirectManager() {
  const [rules, setRules] = useState<PublicRedirectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [fromPath, setFromPath] = useState('')
  const [toPath, setToPath] = useState('')
  const [statusCode, setStatusCode] = useState('301')
  const [match, setMatch] = useState('exact')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Import State
  const [importText, setImportText] = useState('')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const loadRules = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/redirects')
      const data = await res.json()
      if (res.ok) {
        setRules(data.rules || [])
      } else {
        setError(data.error || 'Failed to load redirect rules.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network failure.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    fetch('/api/admin/redirects')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to load redirect rules.')
        }
        return res.json()
      })
      .then((data) => {
        if (!active) return
        setRules(data.rules || [])
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Network failure.')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSaving(true)

    try {
      const res = await fetch('/api/admin/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          fromPath,
          toPath,
          statusCode,
          match,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFromPath('')
        setToPath('')
        setEditingId(null)
        void loadRules()
      } else {
        setFormError(data.error || 'Failed to save redirect.')
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save request failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this redirect rule?')) return
    try {
      const res = await fetch(`/api/admin/redirects?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        void loadRules()
      } else {
        const data = await res.json()
        alert(data.error || 'Delete failed.')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  const handleEdit = (rule: PublicRedirectItem) => {
    setEditingId(rule.id)
    setFromPath(rule.fromPath)
    setToPath(rule.toPath)
    setStatusCode(rule.statusCode)
    setMatch(rule.match)
    setFormError(null)
  }

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importText.trim()) return
    setImporting(true)
    setImportStatus(null)

    try {
      const res = await fetch('/api/admin/redirects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: importText,
      })
      const data = await res.json()
      if (res.ok) {
        setImportStatus(
          `Import successful: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped.`,
        )
        setImportText('')
        void loadRules()
      } else {
        setImportStatus(`Import failed: ${data.error || 'Check CSV/JSON formatting'}`)
      }
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : 'Import request failed.')
    } finally {
      setImporting(false)
    }
  }

  const filteredRules = rules.filter(
    (r) =>
      r.fromPath.toLowerCase().includes(search.toLowerCase()) ||
      r.toPath.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div
      style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}
    >
      <header
        style={{ marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#0f172a' }}>
          Redirect Manager — Public Rules & Import/Export
        </h1>
        <p style={{ color: '#64748b', margin: '4px 0 0 0' }}>
          Manage canonical 301/302/307/308 redirects, import CSV/JSON rules, detect circular loops,
          and track hit counts.
        </p>
      </header>

      {/* Save / Edit Form */}
      <section
        style={{
          background: '#f8fafc',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginTop: 0, marginBottom: '12px' }}>
          {editingId ? 'Edit Redirect Rule' : 'Create New Redirect Rule'}
        </h2>
        {formError && (
          <div
            style={{
              padding: '8px 12px',
              background: '#fef2f2',
              color: '#991b1b',
              borderRadius: '4px',
              marginBottom: '12px',
              fontSize: '14px',
            }}
          >
            {formError}
          </div>
        )}
        <form
          onSubmit={handleSave}
          style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '600',
                color: '#475569',
                marginBottom: '4px',
              }}
            >
              From Path (Source)
            </label>
            <input
              type="text"
              placeholder="/old-path"
              value={fromPath}
              onChange={(e) => setFromPath(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '600',
                color: '#475569',
                marginBottom: '4px',
              }}
            >
              To Path (Target)
            </label>
            <input
              type="text"
              placeholder="/new-path"
              value={toPath}
              onChange={(e) => setToPath(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
            />
          </div>
          <div style={{ width: '110px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '600',
                color: '#475569',
                marginBottom: '4px',
              }}
            >
              HTTP Status
            </label>
            <select
              value={statusCode}
              onChange={(e) => setStatusCode(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
            >
              <option value="301">301 Permanent</option>
              <option value="302">302 Found</option>
              <option value="307">307 Temporary</option>
              <option value="308">308 Permanent</option>
            </select>
          </div>
          <div style={{ width: '110px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '600',
                color: '#475569',
                marginBottom: '4px',
              }}
            >
              Match Type
            </label>
            <select
              value={match}
              onChange={(e) => setMatch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
            >
              <option value="exact">Exact</option>
              <option value="prefix">Prefix</option>
              <option value="regex">Regex</option>
            </select>
          </div>
          <div>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 16px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {saving ? 'Saving...' : editingId ? 'Update Rule' : 'Add Rule'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setFromPath('')
                  setToPath('')
                  setFormError(null)
                }}
                style={{
                  marginLeft: '8px',
                  padding: '8px 12px',
                  background: '#cbd5e1',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Import / Export Workspace */}
      <section
        style={{
          background: '#ffffff',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginTop: 0, marginBottom: '12px' }}>
          Bulk CSV / JSON Import & Export
        </h2>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <form onSubmit={handleImportSubmit} style={{ flex: '1 1 400px' }}>
            <textarea
              rows={3}
              placeholder="Paste CSV (fromPath,toPath,statusCode,match) or JSON rules array..."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            />
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="submit"
                disabled={importing || !importText.trim()}
                style={{
                  padding: '6px 14px',
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {importing ? 'Importing...' : 'Import Rules'}
              </button>
              {importStatus && (
                <span style={{ fontSize: '13px', color: '#334155' }}>{importStatus}</span>
              )}
            </div>
          </form>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              justifyContent: 'center',
            }}
          >
            <a
              href="/api/admin/redirects/export?format=csv"
              download
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                background: '#3b82f6',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: '4px',
                textAlign: 'center',
                fontWeight: '600',
                fontSize: '13px',
              }}
            >
              Export CSV Rules
            </a>
            <a
              href="/api/admin/redirects/export?format=json"
              download
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                background: '#475569',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: '4px',
                textAlign: 'center',
                fontWeight: '600',
                fontSize: '13px',
              }}
            >
              Export JSON Rules
            </a>
          </div>
        </div>
      </section>

      {/* Rules Table */}
      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
            Active Redirect Rules ({filteredRules.length})
          </h2>
          <input
            type="text"
            placeholder="Search from or to path..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              width: '250px',
            }}
          />
        </div>

        {loading ? (
          <p>Loading rules...</p>
        ) : error ? (
          <div
            style={{
              padding: '12px',
              background: '#fef2f2',
              color: '#991b1b',
              borderRadius: '4px',
            }}
          >
            {error}
          </div>
        ) : filteredRules.length === 0 ? (
          <p style={{ color: '#64748b' }}>No redirect rules found.</p>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#f1f5f9',
                  borderBottom: '1px solid #e2e8f0',
                  fontSize: '13px',
                  color: '#475569',
                }}
              >
                <th style={{ padding: '10px 12px' }}>Source (fromPath)</th>
                <th style={{ padding: '10px 12px' }}>Target (toPath)</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Match</th>
                <th style={{ padding: '10px 12px' }}>Hits</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((rule) => (
                <tr key={rule.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#0f172a' }}>
                    {rule.fromPath}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#2563eb' }}>
                    {rule.toPath}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600',
                      }}
                    >
                      {rule.statusCode}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: '#64748b' }}>
                    {rule.match}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: '#64748b' }}>
                    {rule.hitCount || 0}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleEdit(rule)}
                      style={{
                        padding: '4px 8px',
                        background: '#e2e8f0',
                        border: 'none',
                        borderRadius: '4px',
                        marginRight: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void handleDelete(rule.id)}
                      style={{
                        padding: '4px 8px',
                        background: '#fee2e2',
                        color: '#991b1b',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
