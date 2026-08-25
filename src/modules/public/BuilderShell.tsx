'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { PuckPageEditor } from './PuckPageEditor'
import { type PageLayout } from './page-builder'

function toLayout(row: Record<string, unknown>): PageLayout {
  return {
    version: 1,
    id: String(row.id),
    siteId: typeof row.site === 'string' ? row.site : '',
    spaceId: typeof row.space === 'string' ? row.space : undefined,
    path: String(row.path),
    status: row.status === 'published' ? 'published' : 'draft',
    themeId: row.themeId === 'renegade-party' ? 'renegade-party' : 'neutral-starter',
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

  useEffect(() => {
    void fetch(`/api/page-layouts/${layoutId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(toLayout)
      .then((loaded) => {
        setLayout(loaded)
        setMessage('Draft changes stay private until explicitly published.')
      })
      .catch(() => setMessage('You do not have access to this layout or it is unavailable.'))
  }, [layoutId])

  const save = async (next: PageLayout, publish = false) => {
    setBusy(true)
    setLayout(next)
    try {
      const response = await fetch(`/api/layouts/${next.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ layout: next, publish }),
      })
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

      {/* Puck Editor Canvas Container */}
      <div className="flex-1">
        <PuckPageEditor
          layout={layout}
          permissions={['layout:edit', 'layout:publish']}
          onDraft={(next) => void save(next)}
          onPublish={(next) => void save(next, true)}
        />
      </div>
    </main>
  )
}
