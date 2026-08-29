'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { guidedRecipes, previewRecipe, starterRecipes } from '@/modules/public/page-builder'

const recipeIcons: Record<string, string> = {
  'independent-publication': '✍️',
  'community-forum': '💬',
  'creator-portfolio': '📸',
  'podcast-media-outlet': '🎙️',
  'nonprofit-campaign': '🏛️',
  'local-business': '🏬',
  'research-civic-project': '🔬',
  'store-supporter-site': '☕',
}

export default function GuidedSetupPage() {
  const [goal, setGoal] = useState('independent-publication')
  const [siteId, setSiteId] = useState('demo-publication')
  const [path, setPath] = useState('/')
  const [message, setMessage] = useState('Choose a purpose to inspect its tailored starter layout.')
  const [busy, setBusy] = useState(false)

  const recipeId = guidedRecipes.find(([value]) => value === goal)?.[1] ?? 'writer-blogger'
  const recipe = useMemo(() => starterRecipes.find((item) => item.id === recipeId)!, [recipeId])
  const preview = useMemo(() => previewRecipe(recipe.id, siteId || 'preview'), [recipe.id, siteId])

  const install = async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/layouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipeId, siteId, path }),
      })
      setMessage(
        response.ok
          ? 'Starter saved as a private draft! Next: personalize, preview, and publish.'
          : 'Please sign in with staff permissions and confirm a site ID before installing.',
      )
    } catch {
      setMessage('Network error during draft layout installation.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛠️</span>
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-950 dark:text-stone-50 font-display">
              Guided Setup Wizard
            </h1>
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Start with publishing essentials. Commerce, AI, social scheduling, experiments, and
            other advanced capabilities are optional and can be enabled later in Capability Center.
          </p>
        </div>
        <Link href="/admin" className="btn btn-secondary text-xs">
          Open Payload Studio
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Preset Gallery & Inputs (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <label className="form-label">Step 1: Choose Your Project Archetype</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {guidedRecipes.map(([value, id]) => {
                const targetRecipe = starterRecipes.find((item) => item.id === id)
                const isSelected = value === goal
                const icon = recipeIcons[value] ?? '📄'
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGoal(value)}
                    className={`surface-card p-4 text-left transition-all flex items-start gap-3.5 cursor-pointer ${
                      isSelected
                        ? 'ring-2 ring-red-600 border-red-500 bg-red-50/20 dark:bg-red-950/20 shadow-md'
                        : 'hover:border-stone-400'
                    }`}
                  >
                    <span className="text-2xl">{icon}</span>
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-stone-900 dark:text-stone-100 leading-snug">
                        {targetRecipe?.label}
                      </p>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 font-mono">
                        Theme: {targetRecipe?.themeId}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="surface-card p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Step 2: Publication & Route Parameters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Target Site Slug / ID</label>
                <input
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  placeholder="e.g. demo-publication"
                  className="form-input text-xs"
                />
              </div>
              <div>
                <label className="form-label">Page Destination Path</label>
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="e.g. /"
                  className="form-input text-xs"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void install()}
                className="btn btn-primary text-xs w-full sm:w-auto px-6 py-2.5"
              >
                {busy ? 'Installing draft layout...' : '🚀 Install This Draft Recipe'}
              </button>
            </div>
          </div>

          <div
            role="status"
            className="p-4 rounded-xl bg-stone-100 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 text-xs font-mono text-stone-700 dark:text-stone-300"
          >
            <strong>Status:</strong> {message}
          </div>
        </div>

        {/* Right Column: Recipe Spec & Live Block Breakdown (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="surface-card p-6 space-y-6">
            <div className="border-b border-stone-200 dark:border-stone-800 pb-4 space-y-1">
              <span className="badge badge-brand">Starter Recipe Spec</span>
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 font-display">
                {recipe.label}
              </h2>
            </div>

            {/* Enabled Capabilities */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Enabled Capabilities
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recipe.capabilities.map((cap) => (
                  <span key={cap} className="badge badge-neutral text-[11px]">
                    ✓ {cap}
                  </span>
                ))}
              </div>
            </div>

            {/* Next Steps Roadmap */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Onboarding Next Steps
              </p>
              <ol className="space-y-2 text-xs text-stone-700 dark:text-stone-300">
                {recipe.nextActions.map((action, idx) => (
                  <li key={action} className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center font-bold text-[10px] text-stone-600 dark:text-stone-300">
                      {idx + 1}
                    </span>
                    <span>{action}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Registered Blocks Layout Breakdown */}
            <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <div className="flex items-center justify-between text-xs font-bold text-stone-500 dark:text-stone-400">
                <span className="uppercase tracking-wider">Configured Sections</span>
                <span className="font-mono">{preview.blocks.length} blocks</span>
              </div>
              <ul className="space-y-1.5 divide-y divide-stone-100 dark:divide-stone-800/80">
                {preview.blocks.map((block, i) => (
                  <li
                    key={block.id}
                    className="pt-1.5 first:pt-0 flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-stone-800 dark:text-stone-200">
                      {i + 1}. {block.component}
                    </span>
                    {block.placeholder ? (
                      <span className="badge badge-info text-[10px]">Placeholder Graphic</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
