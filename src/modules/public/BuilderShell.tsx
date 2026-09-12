'use client'

import { resolveTheme } from './contracts'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

import { VisualEditor } from '../presentation/VisualEditor'
import { type LayoutBlock, type PageLayout, type TemplateInheritanceMode } from './page-builder'

type StudioOverview = {
  pages: Array<{
    id: string
    name?: string
    path: string
    status: string
    revision: number
    themeId: string
    templateId?: string
    templateMode?: string
    templateVersion?: number
  }>
  templates: Array<{
    id: string
    name: string
    path: string
    status: string
    revision: number
    isRetired: boolean
    category: string
    usageCount: number
  }>
  globals: Array<{
    id: string
    name: string
    slot: string
    status: string
    revision: number
  }>
  patterns: Array<{
    id: string
    name: string
    category: string
    revision: number
  }>
  activeTheme: {
    id: string
    label: string
    version: string
  }
  previewPresets: Array<{
    id: string
    label: string
    width: number
  }>
}

function toLayout(row: Record<string, unknown>): PageLayout {
  return {
    version: Number(row.layoutVersion ?? 1) as PageLayout['version'],
    id: String(row.id),
    siteId:
      typeof row.site === 'string' ? row.site : String((row.site as { id?: unknown })?.id ?? ''),
    spaceId: typeof row.space === 'string' ? row.space : undefined,
    name: typeof row.name === 'string' ? row.name : undefined,
    path: String(row.path),
    status: row.status === 'published' ? 'published' : 'draft',
    themeId: resolveTheme(String(row.themeId ?? '')).id,
    surface: (row.surface as PageLayout['surface']) ?? 'page',
    slot:
      row.slot === 'header' ||
      row.slot === 'footer' ||
      row.slot === 'announcement' ||
      row.slot === 'cta'
        ? row.slot
        : 'main',
    templateId: typeof row.templateId === 'string' ? row.templateId : undefined,
    templateVersion: typeof row.templateVersion === 'number' ? row.templateVersion : undefined,
    templateMode: row.templateMode as TemplateInheritanceMode,
    isRetired: row.isRetired === true,
    category: typeof row.category === 'string' ? row.category : undefined,
    blocks: Array.isArray(row.blocks) ? (row.blocks as PageLayout['blocks']) : [],
    unknownBlocks: Array.isArray(row.unknownBlocks)
      ? (row.unknownBlocks as PageLayout['blocks'])
      : [],
    revision: Number(row.revision ?? 1),
    publishedRevision:
      typeof row.publishedRevision === 'number' ? row.publishedRevision : undefined,
  }
}

export function BuilderShell({ layoutId }: { layoutId: string }) {
  const [layout, setLayout] = useState<PageLayout | null>(null)
  const [message, setMessage] = useState('Loading draft canvas…')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState<PageLayout | null>(null)
  const [serverRevision, setServerRevision] = useState(0)

  // Studio navigation & presets state
  const [activeTab, setActiveTab] = useState<
    'canvas' | 'pages' | 'templates' | 'globals' | 'patterns'
  >('canvas')
  const [overview, setOverview] = useState<StudioOverview | null>(null)
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

  // Modal / action state
  const [newPatternName, setNewPatternName] = useState('')
  const [rollbackRev, setRollbackRev] = useState<number | ''>('')
  const [newPagePath, setNewPagePath] = useState('')
  const [newPageName, setNewPageName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedInheritanceMode, setSelectedInheritanceMode] =
    useState<TemplateInheritanceMode>('inherited')

  const refreshOverview = useCallback((siteId: string) => {
    void fetch(`/api/layouts/overview?siteId=${encodeURIComponent(siteId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setOverview(data as StudioOverview)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    void fetch(`/api/page-layouts/${layoutId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(toLayout)
      .then((loaded) => {
        setLayout(loaded)
        setServerRevision(loaded.revision)
        setDirty(false)
        setMessage('Draft changes stay private until explicitly published.')
        if (loaded.siteId) refreshOverview(loaded.siteId)
      })
      .catch(() => setMessage('You do not have access to this layout or it is unavailable.'))
  }, [layoutId, refreshOverview])

  const save = useCallback(
    async (next: PageLayout, publish = false) => {
      setBusy(true)
      setLayout(next)
      try {
        const response = await fetch(`/api/layouts/${next.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ layout: next, publish, expectedRevision: serverRevision }),
        })
        const body = (await response.json()) as {
          layout?: Record<string, unknown>
          current?: Record<string, unknown>
          error?: string
        }
        if (response.status === 409 && body.current) {
          window.sessionStorage.setItem(`renegade-layout-recovery:${next.id}`, JSON.stringify(next))
          setConflict(toLayout(body.current))
          setMessage('A newer server draft exists. Your local work is preserved for recovery.')
          return
        }
        if (response.ok && body.layout) {
          const saved = toLayout(body.layout)
          setLayout(saved)
          setServerRevision(saved.revision)
          setDirty(false)
          if (saved.siteId) refreshOverview(saved.siteId)
        }
        setMessage(
          response.ok
            ? publish
              ? '🎉 Published successfully! Live for all visitors.'
              : '💾 Draft saved locally to database.'
            : 'Could not save this layout. Verify permissions.',
        )
      } catch {
        setMessage('Network error while saving layout.')
      } finally {
        setBusy(false)
      }
    },
    [serverRevision, refreshOverview],
  )

  useEffect(() => {
    if (!layout || !dirty || busy || conflict) return
    const timer = window.setTimeout(() => void save(layout, false), 1200)
    return () => window.clearTimeout(timer)
  }, [layout, dirty, busy, conflict, save])

  // Pattern saving
  const handleSavePattern = async () => {
    if (!layout || !newPatternName.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/layouts/patterns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          siteId: layout.siteId,
          name: newPatternName.trim(),
          themeId: layout.themeId,
          blocks: layout.blocks,
        }),
      })
      if (res.ok) {
        setMessage(`Pattern "${newPatternName}" saved!`)
        setNewPatternName('')
        refreshOverview(layout.siteId)
        setActiveTab('patterns')
      } else {
        setMessage('Failed to save pattern.')
      }
    } catch {
      setMessage('Error saving pattern.')
    } finally {
      setBusy(false)
    }
  }

  // Insert pattern
  const handleInsertPattern = async (patternId: string, mode: 'snapshot' | 'linked') => {
    if (!layout) return
    setBusy(true)
    try {
      const res = await fetch('/api/layouts/patterns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'instantiate',
          siteId: layout.siteId,
          patternId,
          mode,
        }),
      })
      const data = (await res.json()) as { blocks?: LayoutBlock[] }
      if (res.ok && Array.isArray(data.blocks)) {
        const nextBlocks = [...layout.blocks, ...data.blocks]
        const updated = { ...layout, blocks: nextBlocks, revision: layout.revision + 1 }
        setLayout(updated)
        setDirty(true)
        setActiveTab('canvas')
        setMessage(`Pattern inserted as ${mode}.`)
      }
    } catch {
      setMessage('Error inserting pattern.')
    } finally {
      setBusy(false)
    }
  }

  // Rollback layout to target revision
  const handleRollback = async () => {
    if (!layout || typeof rollbackRev !== 'number') return
    setBusy(true)
    try {
      const res = await fetch(`/api/layouts/${layout.id}/rollback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetRevision: rollbackRev }),
      })
      const data = (await res.json()) as { layout?: Record<string, unknown>; error?: string }
      if (res.ok && data.layout) {
        const rolledBack = toLayout(data.layout)
        setLayout(rolledBack)
        setServerRevision(rolledBack.revision)
        setDirty(false)
        setMessage(`Rolled back to revision ${rollbackRev}.`)
        setRollbackRev('')
        setActiveTab('canvas')
      } else {
        setMessage(data.error ?? 'Rollback failed.')
      }
    } catch {
      setMessage('Error during rollback.')
    } finally {
      setBusy(false)
    }
  }

  // Create page from template
  const handleCreatePageFromTemplate = async () => {
    if (!layout || !newPagePath || !newPageName || !selectedTemplateId) return
    setBusy(true)
    try {
      const res = await fetch('/api/layouts/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create-page',
          siteId: layout.siteId,
          path: newPagePath.startsWith('/') ? newPagePath : `/${newPagePath}`,
          name: newPageName,
          templateId: selectedTemplateId,
          templateMode: selectedInheritanceMode,
        }),
      })
      const data = (await res.json()) as { page?: Record<string, unknown>; error?: string }
      if (res.ok && data.page) {
        setMessage(`Page "${newPageName}" created from template!`)
        setNewPagePath('')
        setNewPageName('')
        refreshOverview(layout.siteId)
        setActiveTab('pages')
      } else {
        setMessage(data.error ?? 'Failed to create page.')
      }
    } catch {
      setMessage('Error creating page from template.')
    } finally {
      setBusy(false)
    }
  }

  // Retire template
  const handleRetireTemplate = async (templateId: string) => {
    if (!layout) return
    setBusy(true)
    try {
      const res = await fetch('/api/layouts/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'retire',
          siteId: layout.siteId,
          templateId,
        }),
      })
      if (res.ok) {
        setMessage('Template retired.')
        refreshOverview(layout.siteId)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!layout) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-24 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto text-xl">
          🎨
        </div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">{message}</h2>
        <p className="text-xs text-stone-500 font-mono">Layout ID: {layoutId}</p>
        <div className="pt-4">
          <Link href="/" className="btn btn-secondary text-xs">
            &larr; Return to Home
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col bg-stone-100 dark:bg-stone-950">
      {/* Studio Top Navigation & Control Bar */}
      <div className="glass-panel border-b border-stone-200 dark:border-stone-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-16 z-40">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
          >
            &larr; Back
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
              {layout.name || layout.path}
            </span>
            <span
              className={`badge text-[10px] ${
                layout.status === 'published' ? 'badge-brand' : 'badge-neutral'
              }`}
            >
              {layout.status}
            </span>
            <span className="badge badge-neutral text-[10px] capitalize">
              {layout.surface ?? 'page'} : {layout.slot ?? 'main'}
            </span>
            <span className="font-mono text-xs text-stone-500">Rev #{layout.revision}</span>
          </div>
        </div>

        {/* Studio Navigator Tabs */}
        <div
          data-testid="studio-navigator"
          className="flex items-center gap-1 bg-stone-200 dark:bg-stone-800 p-1 rounded-xl text-xs"
        >
          <button
            type="button"
            onClick={() => setActiveTab('canvas')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'canvas'
                ? 'bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Canvas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pages')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'pages'
                ? 'bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Pages {overview?.pages ? `(${overview.pages.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'templates'
                ? 'bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Templates {overview?.templates ? `(${overview.templates.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('globals')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'globals'
                ? 'bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Globals {overview?.globals ? `(${overview.globals.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('patterns')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'patterns'
                ? 'bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-stone-100'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Patterns {overview?.patterns ? `(${overview.patterns.length})` : ''}
          </button>
        </div>

        {/* Controls & Actions */}
        <div className="flex items-center gap-3">
          <label className="text-xs flex items-center gap-1">
            <span className="text-stone-500">Theme:</span>
            <select
              aria-label="Compatible theme"
              value={layout.themeId}
              onChange={(event) => {
                setLayout({
                  ...layout,
                  themeId: resolveTheme(event.target.value).id,
                  revision: layout.revision + 1,
                })
                setDirty(true)
              }}
              className="text-xs bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded px-2 py-1"
            >
              <option value="neutral-starter">Neutral Starter</option>
              <option value="renegade-party">Renegade Party</option>
            </select>
          </label>

          {/* Responsive Preview Controls */}
          <div className="flex items-center gap-1 border border-stone-300 dark:border-stone-700 rounded-lg p-0.5 bg-white dark:bg-stone-900">
            <button
              type="button"
              aria-label="Desktop preview"
              onClick={() => setPreviewViewport('desktop')}
              className={`px-2 py-0.5 text-[10px] rounded ${previewViewport === 'desktop' ? 'bg-stone-200 dark:bg-stone-800 font-bold' : ''}`}
            >
              Desktop
            </button>
            <button
              type="button"
              aria-label="Tablet preview"
              onClick={() => setPreviewViewport('tablet')}
              className={`px-2 py-0.5 text-[10px] rounded ${previewViewport === 'tablet' ? 'bg-stone-200 dark:bg-stone-800 font-bold' : ''}`}
            >
              Tablet
            </button>
            <button
              type="button"
              aria-label="Mobile preview"
              onClick={() => setPreviewViewport('mobile')}
              className={`px-2 py-0.5 text-[10px] rounded ${previewViewport === 'mobile' ? 'bg-stone-200 dark:bg-stone-800 font-bold' : ''}`}
            >
              Mobile
            </button>
          </div>

          <Link
            href={`/builder/${layout.id}/preview?viewport=${previewViewport}`}
            target="_blank"
            className="btn btn-secondary text-xs px-3 py-1.5"
          >
            Exact Preview ({previewViewport})
          </Link>

          <span className="text-xs text-stone-600 dark:text-stone-400 hidden sm:inline-block font-mono">
            {message}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(layout, false)}
            className="btn btn-secondary text-xs px-3.5 py-1.5"
          >
            {busy ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(layout, true)}
            className="btn btn-primary text-xs px-4 py-1.5"
          >
            {busy ? 'Publishing...' : 'Publish Live'}
          </button>
        </div>
      </div>

      {conflict ? (
        <div
          role="alert"
          className="border-b border-amber-300 bg-amber-50 px-6 py-3 text-sm text-amber-950 flex items-center justify-between"
        >
          <span>
            Save conflict: server revision {conflict.revision} is newer. Your draft is stored in
            this browser session.
          </span>
          <button
            type="button"
            className="underline font-medium"
            onClick={() => {
              setLayout(conflict)
              setServerRevision(conflict.revision)
              setConflict(null)
              setDirty(false)
            }}
          >
            Reload server version
          </button>
        </div>
      ) : null}

      {(layout.unknownBlocks?.length ?? 0) > 0 ? (
        <div
          role="status"
          className="border-b border-rose-300 bg-rose-50 px-6 py-3 text-sm text-rose-950"
        >
          Repair required: {layout.unknownBlocks?.length} section(s) use removed or incompatible
          components. Their data is preserved and public rendering uses a safe unavailable-section
          fallback.
        </div>
      ) : null}

      {/* Pages Navigator Panel */}
      {activeTab === 'pages' ? (
        <div className="max-w-5xl mx-auto w-full p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">Site Pages</h2>
            <button
              type="button"
              onClick={() => setActiveTab('canvas')}
              className="btn btn-secondary text-xs"
            >
              Back to Canvas
            </button>
          </div>
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                <tr>
                  <th className="p-4">Path</th>
                  <th className="p-4">Title / Name</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Template Mode</th>
                  <th className="p-4">Revision</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {overview?.pages.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50">
                    <td className="p-4 font-mono font-medium">{p.path}</td>
                    <td className="p-4">{p.name || '—'}</td>
                    <td className="p-4">
                      <span
                        className={`badge text-[10px] ${p.status === 'published' ? 'badge-brand' : 'badge-neutral'}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-4">
                      {p.templateId ? (
                        <span className="badge badge-neutral text-[10px] capitalize">
                          {p.templateMode || 'inherited'} (v{p.templateVersion ?? 1})
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="p-4 font-mono">#{p.revision}</td>
                    <td className="p-4 text-right space-x-2">
                      <a href={`/builder/${p.id}`} className="btn btn-secondary btn-xs">
                        Open
                      </a>
                      <a
                        href={`/builder/${p.id}/preview`}
                        target="_blank"
                        className="btn btn-secondary btn-xs"
                      >
                        Preview
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Templates Navigator Panel */}
      {activeTab === 'templates' ? (
        <div className="max-w-5xl mx-auto w-full p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                Reusable Page Templates
              </h2>
              <p className="text-xs text-stone-500">
                Create new pages from templates with inherited, explicit, or detached composition.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('canvas')}
              className="btn btn-secondary text-xs"
            >
              Back to Canvas
            </button>
          </div>

          {/* New Page from Template Form */}
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Create New Page From Template
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <input
                type="text"
                placeholder="Page Title (e.g. Schedule)"
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                className="text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent"
              />
              <input
                type="text"
                placeholder="Path (e.g. /schedule)"
                value={newPagePath}
                onChange={(e) => setNewPagePath(e.target.value)}
                className="text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent"
              />
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent"
              >
                <option value="">Select Template…</option>
                {overview?.templates
                  .filter((t) => !t.isRetired)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (v{t.revision})
                    </option>
                  ))}
              </select>
              <select
                value={selectedInheritanceMode}
                onChange={(e) =>
                  setSelectedInheritanceMode(e.target.value as TemplateInheritanceMode)
                }
                className="text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent"
              >
                <option value="inherited">Inherited (Draft syncs)</option>
                <option value="explicit">Explicitly applied</option>
                <option value="detached">Detached (One-time clone)</option>
              </select>
            </div>
            <button
              type="button"
              disabled={busy || !newPageName || !newPagePath || !selectedTemplateId}
              onClick={() => void handleCreatePageFromTemplate()}
              className="btn btn-primary text-xs"
            >
              Create Page
            </button>
          </div>

          {/* Templates Table */}
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Version</th>
                  <th className="p-4">Used By</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {overview?.templates.map((t) => (
                  <tr key={t.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50">
                    <td className="p-4 font-medium">{t.name}</td>
                    <td className="p-4">{t.category}</td>
                    <td className="p-4">
                      {t.isRetired ? (
                        <span className="badge badge-error text-[10px]">Retired</span>
                      ) : (
                        <span className="badge badge-brand text-[10px]">Active</span>
                      )}
                    </td>
                    <td className="p-4 font-mono">v{t.revision}</td>
                    <td className="p-4 font-mono">{t.usageCount} page(s)</td>
                    <td className="p-4 text-right space-x-2">
                      <a href={`/builder/${t.id}`} className="btn btn-secondary btn-xs">
                        Edit
                      </a>
                      {!t.isRetired ? (
                        <button
                          type="button"
                          onClick={() => void handleRetireTemplate(t.id)}
                          className="btn btn-secondary btn-xs"
                        >
                          Retire
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Globals Navigator Panel */}
      {activeTab === 'globals' ? (
        <div className="max-w-5xl mx-auto w-full p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                Global Regions
              </h2>
              <p className="text-xs text-stone-500">
                Manage site-wide headers, footers, announcements, and call-to-actions with rollback.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('canvas')}
              className="btn btn-secondary text-xs"
            >
              Back to Canvas
            </button>
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                <tr>
                  <th className="p-4">Region</th>
                  <th className="p-4">Slot</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Revision</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {overview?.globals.map((g) => (
                  <tr key={g.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50">
                    <td className="p-4 font-medium">{g.name}</td>
                    <td className="p-4 font-mono uppercase">{g.slot}</td>
                    <td className="p-4">
                      <span
                        className={`badge text-[10px] ${g.status === 'published' ? 'badge-brand' : 'badge-neutral'}`}
                      >
                        {g.status}
                      </span>
                    </td>
                    <td className="p-4 font-mono">#{g.revision}</td>
                    <td className="p-4 text-right space-x-2">
                      <a href={`/builder/${g.id}`} className="btn btn-secondary btn-xs">
                        Edit
                      </a>
                      <a
                        href={`/builder/${g.id}/preview`}
                        target="_blank"
                        className="btn btn-secondary btn-xs"
                      >
                        Preview
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rollback Current Layout Form */}
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Rollback Current Document
            </h3>
            <p className="text-xs text-stone-500">
              Restore this layout to a previous revision number from its audit trail.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={layout.revision - 1}
                placeholder="Target Revision Number"
                value={rollbackRev}
                onChange={(e) => setRollbackRev(e.target.value ? Number(e.target.value) : '')}
                className="text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent w-48"
              />
              <button
                type="button"
                disabled={busy || typeof rollbackRev !== 'number'}
                onClick={() => void handleRollback()}
                className="btn btn-secondary text-xs"
              >
                Rollback Revision
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Patterns Navigator Panel */}
      {activeTab === 'patterns' ? (
        <div className="max-w-5xl mx-auto w-full p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                Reusable Patterns
              </h2>
              <p className="text-xs text-stone-500">
                Insert saved component trees into your layout as independent snapshots or linked
                instances.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('canvas')}
              className="btn btn-secondary text-xs"
            >
              Back to Canvas
            </button>
          </div>

          {/* Save Current Blocks as Pattern */}
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Save Current Canvas as Reusable Pattern
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Pattern Name (e.g. Callout + Features)"
                value={newPatternName}
                onChange={(e) => setNewPatternName(e.target.value)}
                className="text-xs border border-stone-300 dark:border-stone-700 rounded-lg p-2 bg-transparent flex-1 max-w-sm"
              />
              <button
                type="button"
                disabled={busy || !newPatternName.trim()}
                onClick={() => void handleSavePattern()}
                className="btn btn-primary text-xs"
              >
                Save as Pattern
              </button>
            </div>
          </div>

          {/* Patterns List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {overview?.patterns.map((pt) => (
              <div
                key={pt.id}
                className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
                    {pt.name}
                  </span>
                  <span className="badge badge-neutral text-[10px]">v{pt.revision}</span>
                </div>
                <p className="text-xs text-stone-500">Category: {pt.category}</p>
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleInsertPattern(pt.id, 'snapshot')}
                    className="btn btn-secondary text-xs flex-1"
                  >
                    Insert Snapshot
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInsertPattern(pt.id, 'linked')}
                    className="btn btn-primary text-xs flex-1"
                  >
                    Insert Linked
                  </button>
                </div>
              </div>
            ))}
            {(overview?.patterns.length ?? 0) === 0 ? (
              <p className="text-xs text-stone-500 col-span-3">
                No saved patterns yet. Save one above!
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Puck Editor Canvas Container */}
      {activeTab === 'canvas' ? (
        <div className="flex-1">
          <VisualEditor
            layout={layout}
            onChange={(next) => {
              setLayout(next)
              setDirty(true)
              setMessage('Unsaved changes — autosaving…')
            }}
            onPublish={(next) => void save(next, true)}
          />
        </div>
      ) : null}
    </main>
  )
}
