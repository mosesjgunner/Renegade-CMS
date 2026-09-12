'use client'

import { resolveTheme } from './contracts'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

import { VisualEditor } from '../presentation/VisualEditor'
import { type PageLayout } from './page-builder'

function toLayout(row: Record<string, unknown>): PageLayout {
  return {
    version: Number(row.layoutVersion ?? 1) as PageLayout['version'],
    id: String(row.id),
    siteId: typeof row.site === 'string' ? row.site : '',
    spaceId: typeof row.space === 'string' ? row.space : undefined,
    path: String(row.path),
    status: row.status === 'published' ? 'published' : 'draft',
    themeId: resolveTheme(String(row.themeId ?? '')).id,
    surface: row.surface === 'global' ? 'global' : 'page',
    slot: row.slot === 'header' || row.slot === 'footer' ? row.slot : 'main',
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

  useEffect(() => {
    void fetch(`/api/page-layouts/${layoutId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(toLayout)
      .then((loaded) => {
        setLayout(loaded)
        setServerRevision(loaded.revision)
        setDirty(false)
        setMessage('Draft changes stay private until explicitly published.')
      })
      .catch(() => setMessage('You do not have access to this layout or it is unavailable.'))
  }, [layoutId])

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
    [serverRevision],
  )

  useEffect(() => {
    if (!layout || !dirty || busy || conflict) return
    const timer = window.setTimeout(() => void save(layout, false), 1200)
    return () => window.clearTimeout(timer)
  }, [layout, dirty, busy, conflict, save])

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
      {/* Studio Top Control Bar */}
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
              Page Builder Studio
            </span>
            <span
              className={`badge text-[10px] ${
                layout.status === 'published' ? 'badge-brand' : 'badge-neutral'
              }`}
            >
              {layout.status}
            </span>
            <span className="font-mono text-xs text-stone-500">Rev #{layout.revision}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs">
            Theme{' '}
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
            >
              <option value="neutral-starter">Neutral Starter</option>
              <option value="renegade-party">Renegade Party</option>
            </select>
          </label>
          <Link
            href={`/builder/${layout.id}/preview`}
            target="_blank"
            className="btn btn-secondary text-xs px-3.5 py-1.5"
          >
            Authenticated Preview
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
          className="border-b border-amber-300 bg-amber-50 px-6 py-3 text-sm text-amber-950"
        >
          Save conflict: server revision {conflict.revision} is newer. Your draft is stored in this
          browser session.{' '}
          <button
            type="button"
            className="underline"
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

      {/* Puck Editor Canvas Container */}
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
    </main>
  )
}
