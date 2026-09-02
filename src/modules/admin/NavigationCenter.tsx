'use client'

import React, { useEffect, useState } from 'react'

type MenuItem = {
  label: string
  href: string
  children?: MenuItem[]
}

type NavigationData = {
  primary: MenuItem[]
  secondary: MenuItem[]
  footer: MenuItem[]
}

type Target = {
  id: string
  title: string
  canonicalPath: string
  contentType: string
}

export default function NavigationCenter() {
  const [navigation, setNavigation] = useState<NavigationData>({
    primary: [],
    secondary: [],
    footer: [],
  })
  const [targets, setTargets] = useState<Target[]>([])
  const [publicationId, setPublicationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetch('/api/admin/navigation')
      .then((res) => res.json())
      .then((data) => {
        if (data.navigation) setNavigation(data.navigation)
        if (data.targets) setTargets(data.targets)
        if (data.publicationId) setPublicationId(data.publicationId)
      })
      .catch((err) => setMessage({ text: err.message, type: 'error' }))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/navigation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicationId, navigation }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save navigation.')
      setMessage({ text: 'Navigation saved and revalidated immediately.', type: 'success' })
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Save failed.',
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const addItem = (section: keyof NavigationData) => {
    setNavigation((prev) => ({
      ...prev,
      [section]: [...prev[section], { label: 'New Link', href: '/', children: [] }],
    }))
  }

  const removeItem = (section: keyof NavigationData, index: number) => {
    setNavigation((prev) => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== index),
    }))
  }

  const moveItem = (section: keyof NavigationData, index: number, direction: 'up' | 'down') => {
    setNavigation((prev) => {
      const list = [...prev[section]]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= list.length) return prev
      const temp = list[index]!
      list[index] = list[target]!
      list[target] = temp
      return { ...prev, [section]: list }
    })
  }

  const updateItem = (
    section: keyof NavigationData,
    index: number,
    field: 'label' | 'href',
    value: string,
  ) => {
    setNavigation((prev) => {
      const list = [...prev[section]]
      list[index] = { ...list[index]!, [field]: value }
      return { ...prev, [section]: list }
    })
  }

  const addChildItem = (section: keyof NavigationData, parentIndex: number) => {
    setNavigation((prev) => {
      const list = [...prev[section]]
      const parent = list[parentIndex]!
      const children = parent.children ? [...parent.children] : []
      children.push({ label: 'Sub-link', href: '/' })
      list[parentIndex] = { ...parent, children }
      return { ...prev, [section]: list }
    })
  }

  const removeChildItem = (
    section: keyof NavigationData,
    parentIndex: number,
    childIndex: number,
  ) => {
    setNavigation((prev) => {
      const list = [...prev[section]]
      const parent = list[parentIndex]!
      const children = (parent.children || []).filter((_, i) => i !== childIndex)
      list[parentIndex] = { ...parent, children }
      return { ...prev, [section]: list }
    })
  }

  const updateChildItem = (
    section: keyof NavigationData,
    parentIndex: number,
    childIndex: number,
    field: 'label' | 'href',
    value: string,
  ) => {
    setNavigation((prev) => {
      const list = [...prev[section]]
      const parent = list[parentIndex]!
      const children = [...(parent.children || [])]
      children[childIndex] = { ...children[childIndex]!, [field]: value }
      list[parentIndex] = { ...parent, children }
      return { ...prev, [section]: list }
    })
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Loading navigation menus…</p>
      </div>
    )
  }

  const sections: Array<{ key: keyof NavigationData; title: string; description: string }> = [
    {
      key: 'primary',
      title: 'Primary Navigation',
      description: 'Main header menu displayed on desktop and tablet.',
    },
    {
      key: 'secondary',
      title: 'Secondary / Mobile Navigation',
      description: 'Utility header menu and links for mobile drawer.',
    },
    {
      key: 'footer',
      title: 'Footer Navigation',
      description: 'Links rendered in the global site footer.',
    },
  ]

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>Site Navigation</h1>
          <p style={{ color: '#666', marginTop: '0.25rem' }}>
            Manage site menus, ordering, internal/external targets, and nested links.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '0.625rem 1.5rem',
            backgroundColor: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {message ? (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            backgroundColor: message.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            fontWeight: 500,
          }}
        >
          {message.text}
        </div>
      ) : null}

      {sections.map(({ key, title, description }) => (
        <section
          key={key}
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '2rem',
            backgroundColor: '#fafafa',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: '1rem',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>{title}</h2>
              <p style={{ color: '#666', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                {description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => addItem(key)}
              style={{
                padding: '0.375rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              + Add Item
            </button>
          </div>

          {navigation[key].length === 0 ? (
            <p style={{ color: '#888', fontStyle: 'italic', fontSize: '0.875rem' }}>
              No links in this menu.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {navigation[key].map((item, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => moveItem(key, index, 'up')}
                        disabled={index === 0}
                        title="Move Up"
                        style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(key, index, 'down')}
                        disabled={index === navigation[key].length - 1}
                        title="Move Down"
                        style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                      >
                        ▼
                      </button>
                    </div>

                    <label style={{ display: 'flex', flexDirection: 'column', flex: '1 1 180px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' }}>
                        Label
                      </span>
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => updateItem(key, index, 'label', e.target.value)}
                        style={{
                          padding: '0.375rem 0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                        }}
                      />
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', flex: '2 1 240px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' }}>
                        URL / Path
                      </span>
                      <input
                        type="text"
                        value={item.href}
                        onChange={(e) => updateItem(key, index, 'href', e.target.value)}
                        placeholder="/about or https://..."
                        style={{
                          padding: '0.375rem 0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                        }}
                      />
                    </label>

                    {targets.length > 0 ? (
                      <label
                        style={{ display: 'flex', flexDirection: 'column', flex: '1 1 160px' }}
                      >
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' }}>
                          Select Page
                        </span>
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              updateItem(key, index, 'href', e.target.value)
                              const targetDoc = targets.find(
                                (t) => t.canonicalPath === e.target.value,
                              )
                              if (targetDoc && item.label === 'New Link') {
                                updateItem(key, index, 'label', targetDoc.title)
                              }
                            }
                          }}
                          value={item.href}
                          style={{
                            padding: '0.375rem 0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                          }}
                        >
                          <option value="">-- Custom URL --</option>
                          {targets.map((t) => (
                            <option key={t.id} value={t.canonicalPath}>
                              [{t.contentType}] {t.title} ({t.canonicalPath})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                      <button
                        type="button"
                        onClick={() => addChildItem(key, index)}
                        style={{
                          padding: '0.375rem 0.5rem',
                          fontSize: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          backgroundColor: '#f3f4f6',
                          cursor: 'pointer',
                        }}
                      >
                        + Sub-item
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(key, index)}
                        style={{
                          padding: '0.375rem 0.5rem',
                          fontSize: '0.75rem',
                          color: '#dc2626',
                          border: '1px solid #fee2e2',
                          borderRadius: '4px',
                          backgroundColor: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Nested Sub-items (1 Level) */}
                  {item.children && item.children.length > 0 ? (
                    <div
                      style={{
                        marginTop: '0.75rem',
                        paddingLeft: '1.5rem',
                        borderLeft: '2px solid #e5e7eb',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Sub-navigation Items (Level 1)
                      </span>
                      {item.children.map((child, childIndex) => (
                        <div
                          key={childIndex}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            backgroundColor: '#f9fafb',
                            padding: '0.5rem',
                            borderRadius: '4px',
                          }}
                        >
                          <input
                            type="text"
                            placeholder="Sub-item Label"
                            value={child.label}
                            onChange={(e) =>
                              updateChildItem(key, index, childIndex, 'label', e.target.value)
                            }
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.875rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              flex: '1 1 140px',
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Sub-item Path (/about or https://...)"
                            value={child.href}
                            onChange={(e) =>
                              updateChildItem(key, index, childIndex, 'href', e.target.value)
                            }
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.875rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              flex: '2 1 200px',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeChildItem(key, index, childIndex)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              color: '#dc2626',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
