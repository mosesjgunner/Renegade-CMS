'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import {
  componentRegistry,
  guidedRecipes,
  previewRecipe,
  starterRecipes,
} from '@/modules/public/page-builder'
import { ActiveSiteIndicator } from '@/modules/admin/ActiveSiteIndicator'
import { useUnsavedWorkGuard } from '@/hooks/useUnsavedWorkGuard'

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

type SiteContext = {
  id: string
  name: string
  visibility: 'public' | 'coming-soon' | 'private'
  publicOrigin: string
  starterStatus: {
    installed: boolean
    starterId: string | null
    pagesCount: number
    articlesCount: number
  } | null
  examples: {
    removableCount: number
    protectedCount: number
    removable: Array<{ title: string; path: string; kind: string }>
    protectedEdited: Array<{ title: string; path: string; kind: string }>
  } | null
}

type Plan = {
  empty: boolean
  collisions: Array<{ kind: string; key: string }>
  additions: { content: number; layouts: number; media: number }
}

const fullStarters = [
  {
    id: 'publication-community' as const,
    name: 'The Vanguard Chronicle',
    kind: 'Publication & Community',
    blurb:
      'Independent dispatches, investigative inquiries, community discussion hub, member profiles, and newsletter subscriptions.',
  },
  {
    id: 'campaign-commerce' as const,
    name: 'Forward for the People',
    kind: 'Campaign & Commerce',
    blurb:
      'Grassroots campaign hub, campaign store with merchandise, cart & checkout, donations with FEC disclosures, and volunteer team.',
  },
]

export default function GuidedSetupPage() {
  const [sites, setSites] = useState<SiteContext[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [siteId, setSiteId] = useState<string>('')
  const [goal, setGoal] = useState('independent-publication')
  const [path, setPath] = useState('/')
  const [message, setMessage] = useState('Choose a site type to see its starter design.')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pendingStarter, setPendingStarter] = useState<{
    starterId: (typeof fullStarters)[number]['id']
    plan: Plan
  } | null>(null)
  const [planConfirmed, setPlanConfirmed] = useState(false)
  const [removeArmed, setRemoveArmed] = useState(false)
  const [nextSteps, setNextSteps] = useState<{
    homeLayoutId?: string
    firstArticleId?: string
  } | null>(null)

  const { confirmContextSwitch } = useUnsavedWorkGuard(dirty)

  const loadContext = async () => {
    try {
      const response = await fetch('/api/admin/guided-setup', { credentials: 'same-origin' })
      const data = await response.json()
      if (!response.ok) {
        setLoadError(data.error || 'Guided setup is unavailable right now.')
        setSites([])
        return
      }
      setSites(data.sites as SiteContext[])
      setSiteId((current) =>
        current && (data.sites as SiteContext[]).some((site) => site.id === current)
          ? current
          : (data.activeSiteId ?? data.sites[0]?.id ?? ''),
      )
    } catch {
      setLoadError('Could not reach the server to load your sites.')
      setSites([])
    }
  }

  useEffect(() => {
    void loadContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const site = useMemo(() => sites?.find((item) => item.id === siteId) ?? null, [sites, siteId])
  const recipeId = guidedRecipes.find(([value]) => value === goal)?.[1] ?? 'writer-blogger'
  const recipe = useMemo(() => starterRecipes.find((item) => item.id === recipeId)!, [recipeId])
  const preview = useMemo(
    () => previewRecipe(recipe.id, site?.id || 'preview'),
    [recipe.id, site?.id],
  )
  const origin = site?.publicOrigin || (typeof window !== 'undefined' ? window.location.origin : '')
  const publicUrl = `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`

  const switchSite = (nextSiteId: string) => {
    if (nextSiteId === siteId) return
    if (!confirmContextSwitch()) return
    setSiteId(nextSiteId)
    // Switching sites discards this page's local selections so nothing
    // chosen for one site can be applied to another by accident.
    setGoal('independent-publication')
    setPath('/')
    setPendingStarter(null)
    setPlanConfirmed(false)
    setRemoveArmed(false)
    setNextSteps(null)
    setDirty(false)
    const next = sites?.find((item) => item.id === nextSiteId)
    setNotice(
      `Now working on ${next?.name ?? 'the selected site'}. Your earlier choices on this page were cleared so nothing carries across sites.`,
    )
    setMessage('Choose a site type to see its starter design.')
  }

  const installDraftLayout = async () => {
    if (!site) return
    setBusy(true)
    try {
      const response = await fetch('/api/layouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipeId, siteId: site.id, path }),
      })
      setMessage(
        response.ok
          ? 'Starter design saved as a private draft. Next: personalize it, preview it, and publish when you are ready.'
          : 'That page address already has a layout, or your account cannot add one to this site. Try a different page address.',
      )
      if (response.ok) setDirty(false)
    } catch {
      setMessage('Network error while saving the draft design.')
    } finally {
      setBusy(false)
    }
  }

  const requestFullStarter = async (starterId: (typeof fullStarters)[number]['id']) => {
    if (!site) return
    setBusy(true)
    try {
      // Impact preview first (UXI-06): on a site that already has
      // content, show what would be created and what already exists
      // before anything is installed.
      const response = await fetch('/api/admin/starters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'plan', siteId: site.id, starterId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not check this site.')
      const plan = data.plan as Plan
      if (plan.empty) {
        await installFullStarter(starterId)
      } else {
        setPendingStarter({ starterId, plan })
        setPlanConfirmed(false)
        setMessage(
          'This site already has content. Review what installing this starter would do, then confirm.',
        )
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not check this site.')
    } finally {
      setBusy(false)
    }
  }

  const installFullStarter = async (starterId: (typeof fullStarters)[number]['id']) => {
    if (!site) return
    setBusy(true)
    try {
      const response = await fetch('/api/admin/starters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'install', siteId: site.id, starterId }),
      })
      const data = await response.json()
      if (response.ok) {
        setMessage(`✓ ${data.summary || 'Complete starter installed.'}`)
        setNextSteps(data.nextSteps ?? null)
        setPendingStarter(null)
        setDirty(false)
        await loadContext()
      } else {
        setMessage(`Error: ${data.error || 'Failed to install starter.'}`)
      }
    } catch {
      setMessage('Network error during starter installation.')
    } finally {
      setBusy(false)
    }
  }

  const setVisibility = async (visibility: SiteContext['visibility']) => {
    if (!site) return
    setBusy(true)
    try {
      const response = await fetch('/api/admin/starters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set-visibility', siteId: site.id, visibility }),
      })
      const data = await response.json()
      if (response.ok) {
        setMessage(
          visibility === 'public'
            ? 'Your site is now public — visitors can read everything published on it.'
            : 'Saved. Visitors now see a holding page with your site name; you can still preview the real site while signed in.',
        )
        await loadContext()
      } else {
        setMessage(`Error: ${data.error || 'Could not change who can see the site.'}`)
      }
    } catch {
      setMessage('Network error while saving visibility.')
    } finally {
      setBusy(false)
    }
  }

  const removeExamples = async () => {
    if (!site) return
    setBusy(true)
    try {
      const response = await fetch('/api/admin/starters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'remove-examples', siteId: site.id }),
      })
      const data = await response.json()
      if (response.ok) {
        const removed = data.result.removed as Array<{ title: string }>
        const kept = data.result.protectedEdited as Array<{ title: string }>
        setMessage(
          `Removed ${removed.length} example item(s).` +
            (kept.length
              ? ` Kept ${kept.length} item(s) you edited — edited content is never removed as an example.`
              : ''),
        )
        setRemoveArmed(false)
        await loadContext()
      } else {
        setMessage(`Error: ${data.error || 'Could not remove examples.'}`)
      }
    } catch {
      setMessage('Network error while removing examples.')
    } finally {
      setBusy(false)
    }
  }

  if (sites === null) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16">
        <p role="status" className="text-sm text-stone-600 dark:text-stone-300">
          Loading your sites…
        </p>
      </main>
    )
  }

  if (loadError || sites.length === 0) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight font-display">Guided setup</h1>
        <p className="text-sm text-stone-600 dark:text-stone-300" role="alert">
          {loadError ??
            'Your account does not have access to any site yet, so there is nothing to set up here.'}
        </p>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Next step: sign in with the owner account, or ask the site owner to grant your account
          access. If this is a brand-new installation, finish first-run setup first.
        </p>
        <div className="flex gap-2">
          <Link href="/login" className="btn btn-primary text-xs">
            Sign in
          </Link>
          <Link href="/setup" className="btn btn-secondary text-xs">
            First-run setup
          </Link>
          <Link href="/admin" className="btn btn-secondary text-xs">
            Dashboard
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛠️</span>
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-950 dark:text-stone-50 font-display">
              Guided setup
            </h1>
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Start with publishing essentials. Commerce, AI, social scheduling, experiments, and
            other advanced capabilities are optional and can be enabled later in Capability Center.
          </p>
          {site ? (
            <div className="mt-3">
              <ActiveSiteIndicator siteName={site.name} visibility={site.visibility} />
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Link href="/admin/capabilities" className="btn btn-secondary text-xs">
            Capability Center
          </Link>
          <Link href="/admin" className="btn btn-secondary text-xs">
            Dashboard
          </Link>
        </div>
      </div>

      {notice ? (
        <p
          role="status"
          className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200"
        >
          {notice}
        </p>
      ) : null}

      {sites.length > 1 ? (
        <section aria-label="Choose a site" className="surface-card p-6 space-y-3">
          <label className="form-label" htmlFor="guided-site-picker">
            Which site are you setting up?
          </label>
          <select
            id="guided-site-picker"
            className="form-input text-sm"
            value={siteId}
            onChange={(event) => switchSite(event.target.value)}
          >
            {sites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-stone-500">
            Switching sites clears the choices below, so work for one site is never applied to
            another.
          </p>
        </section>
      ) : null}

      {site ? (
        <section aria-label="Who can see this site" className="surface-card p-6 space-y-3">
          <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
            Who can see {site.name}?
          </h2>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            {site.visibility === 'public'
              ? 'Your site is public: anyone can read its published pages.'
              : site.visibility === 'coming-soon'
                ? 'Coming soon: visitors see a holding page with your site name and no content. You can still preview the real site while signed in.'
                : 'Private: visitors see a holding page with your site name and a sign-in link. You can still preview the real site while signed in.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || site.visibility === 'public'}
              onClick={() => void setVisibility('public')}
              className="btn btn-primary text-xs"
            >
              Make site public
            </button>
            <button
              type="button"
              disabled={busy || site.visibility === 'coming-soon'}
              onClick={() => void setVisibility('coming-soon')}
              className="btn btn-secondary text-xs"
            >
              Show a coming-soon page
            </button>
            <button
              type="button"
              disabled={busy || site.visibility === 'private'}
              onClick={() => void setVisibility('private')}
              className="btn btn-secondary text-xs"
            >
              Keep working privately
            </button>
          </div>
        </section>
      ) : null}

      <section
        aria-label="Complete starter designs"
        className="p-6 rounded-2xl bg-gradient-to-r from-stone-900 to-stone-800 text-white shadow-lg space-y-4"
      >
        <div>
          <span className="text-xs uppercase tracking-widest text-red-400 font-bold">
            Recommended
          </span>
          <h2 className="text-xl font-bold mt-1">Complete starter designs</h2>
          <p className="text-xs text-stone-300 mt-1 max-w-3xl">
            Install a complete site design with realistic sample content and published visitor pages
            (home, articles, search, signup, members, and commerce/donations where they apply).
            Sample content is marked as example content and can be removed safely later.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {fullStarters.map((starter) => (
            <div
              key={starter.id}
              className="p-4 rounded-xl bg-white/10 backdrop-blur border border-white/10 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{starter.name}</span>
                  <span className="text-[10px] bg-red-600/80 px-2 py-0.5 rounded text-white">
                    {starter.kind}
                  </span>
                </div>
                <p className="text-xs text-stone-300 mt-1">{starter.blurb}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void requestFullStarter(starter.id)}
                className="btn btn-primary text-xs w-full py-2"
              >
                {busy ? 'Working…' : `Install ${starter.name} →`}
              </button>
            </div>
          ))}
        </div>
        {pendingStarter ? (
          <div className="p-4 rounded-xl bg-white text-stone-900 space-y-3" role="alert">
            <h3 className="font-bold text-sm">Before you install on a site that has content</h3>
            <p className="text-xs text-stone-700">
              Installing would add {pendingStarter.plan.additions.content} new page(s) and post(s),{' '}
              {pendingStarter.plan.additions.layouts} new design section(s), and{' '}
              {pendingStarter.plan.additions.media} new image(s).{' '}
              {pendingStarter.plan.collisions.length
                ? `${pendingStarter.plan.collisions.length} item(s) from this starter already exist on your site (${pendingStarter.plan.collisions
                    .slice(0, 5)
                    .map((collision) => collision.key)
                    .join(
                      ', ',
                    )}${pendingStarter.plan.collisions.length > 5 ? ', …' : ''}). Existing content is preserved — a starter never overwrites what you already have; install on an empty site or use the starter upgrade from the Dashboard instead if you only want the new design pieces.`
                : 'Nothing on your site overlaps this starter.'}
            </p>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={planConfirmed}
                onChange={(event) => setPlanConfirmed(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand this adds the new items above and preserves everything already on my
                site.
              </span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !planConfirmed}
                onClick={() => void installFullStarter(pendingStarter.starterId)}
                className="btn btn-primary text-xs"
              >
                Install with these changes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPendingStarter(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {nextSteps ? (
        <section aria-label="Next steps" className="surface-card p-6 space-y-3">
          <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Next steps</h2>
          <div className="flex flex-wrap gap-2">
            {nextSteps.homeLayoutId ? (
              <Link href={`/builder/${nextSteps.homeLayoutId}`} className="btn btn-primary text-xs">
                Edit your homepage
              </Link>
            ) : null}
            <Link
              href="/admin/collections/content/create?contentType=article"
              className="btn btn-secondary text-xs"
            >
              Write your first post
            </Link>
            {nextSteps.firstArticleId ? (
              <Link
                href={`/admin/collections/content/${nextSteps.firstArticleId}`}
                className="btn btn-secondary text-xs"
              >
                Open the sample post
              </Link>
            ) : null}
            <a href={publicUrl} className="btn btn-secondary text-xs">
              View your site
            </a>
          </div>
        </section>
      ) : null}

      {site?.examples && site.examples.removableCount + site.examples.protectedCount > 0 ? (
        <section aria-label="Example content" className="surface-card p-6 space-y-3">
          <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Example content</h2>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            This site still has {site.examples.removableCount} example item(s) installed by a
            starter. Removing examples deletes only those untouched items — anything you edited (
            {site.examples.protectedCount} item(s)) is kept and is never removed as an example.
          </p>
          {!removeArmed ? (
            <button
              type="button"
              disabled={busy || site.examples.removableCount === 0}
              onClick={() => setRemoveArmed(true)}
              className="btn btn-secondary text-xs"
            >
              Review example content to remove
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold">
                These {site.examples.removableCount} item(s) will be removed:
              </p>
              <ul className="text-xs space-y-1 list-disc pl-5">
                {site.examples.removable.map((item) => (
                  <li key={`${item.kind}-${item.path}`}>
                    {item.title} <span className="text-stone-500">({item.path})</span>
                  </li>
                ))}
              </ul>
              {site.examples.protectedEdited.length ? (
                <>
                  <p className="text-xs font-semibold">These edited items will be kept:</p>
                  <ul className="text-xs space-y-1 list-disc pl-5">
                    {site.examples.protectedEdited.map((item) => (
                      <li key={`${item.kind}-${item.path}`}>
                        {item.title} <span className="text-stone-500">({item.path})</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeExamples()}
                  className="btn btn-primary text-xs"
                >
                  Remove these examples
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRemoveArmed(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <span className="form-label">Step 1: Choose your site type</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {guidedRecipes.map(([value, id]) => {
                const targetRecipe = starterRecipes.find((item) => item.id === id)
                const isSelected = value === goal
                const icon = recipeIcons[value] ?? '📄'
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setGoal(value)
                      setDirty(true)
                    }}
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
                      <p className="text-[11px] text-stone-500 dark:text-stone-400">
                        Starter design included
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="surface-card p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Step 2: Where should this page live?
            </h3>
            <div>
              <label className="form-label" htmlFor="guided-page-address">
                Page address
              </label>
              <input
                id="guided-page-address"
                value={path}
                onChange={(event) => {
                  setPath(event.target.value)
                  setDirty(true)
                }}
                placeholder="e.g. /"
                className="form-input text-xs"
              />
              <p className="mt-2 text-xs text-stone-500">
                Visitors will see it at <span className="font-mono">{publicUrl}</span>
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void installDraftLayout()}
                className="btn btn-primary text-xs w-full sm:w-auto px-6 py-2.5"
              >
                {busy ? 'Saving…' : '🚀 Save this starter design as a draft page'}
              </button>
            </div>
          </div>

          <div
            role="status"
            className="p-4 rounded-xl bg-stone-100 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300"
          >
            <strong>Status:</strong> {message}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="surface-card p-6 space-y-6">
            <div className="border-b border-stone-200 dark:border-stone-800 pb-4 space-y-1">
              <span className="badge badge-brand">Starter design</span>
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 font-display">
                {recipe.label}
              </h2>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                What this site type includes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recipe.capabilities.map((cap) => (
                  <span key={cap} className="badge badge-neutral text-[11px]">
                    ✓ {cap}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Your next steps
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
            <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <div className="flex items-center justify-between text-xs font-bold text-stone-500 dark:text-stone-400">
                <span className="uppercase tracking-wider">Sections on the page</span>
                <span>{preview.blocks.length} sections</span>
              </div>
              <ul className="space-y-1.5 divide-y divide-stone-100 dark:divide-stone-800/80">
                {preview.blocks.map((block, i) => (
                  <li
                    key={block.id}
                    className="pt-1.5 first:pt-0 flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-stone-800 dark:text-stone-200">
                      {i + 1}. {componentRegistry[block.component]?.label ?? block.component}
                    </span>
                    {block.placeholder ? (
                      <span className="badge badge-info text-[10px]">Welcome image</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <details className="pt-2 border-t border-stone-100 dark:border-stone-800">
              <summary className="text-xs font-semibold cursor-pointer">Advanced details</summary>
              <div className="mt-2 space-y-1 text-[11px] font-mono text-stone-500">
                <p>Design theme: {recipe.themeId}</p>
                {preview.blocks.map((block) => (
                  <p key={block.id}>
                    {block.id}: {block.component} v{block.componentVersion}
                  </p>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>
    </main>
  )
}
