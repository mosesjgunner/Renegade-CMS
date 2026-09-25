'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './ThemeCenter.module.css'
import { gt } from 'semver'
import type { InstalledTheme } from '../presentation/packages'
import type { ThemeState } from '../presentation/lifecycle'
import type { StarterId, StarterInstallStatus } from '../starters/contracts'

type ThemeModel = {
  site: string
  sites: { id: string; name: string }[]
  state: ThemeState
  installed: (InstalledTheme & { capabilities: string[] })[]
  tokenDefaults: Record<string, string>
}

type StarterSummary = {
  id: StarterId
  name: string
  archetype: 'publication' | 'campaign'
  version: string
  themeId: string
  summary: string
  description: string
  features: string[]
  pagesCount: number
  articlesCount: number
  templatesCount: number
  patternsCount: number
  globalsCount: number
  productsCount: number
  donationsCount: number
}

type RollbackOption = {
  id: string
  name: string
  path: string
  currentRevision: number
  history: Array<{ revision: number; savedAt?: string; action?: string }>
}

export default function ThemeCenter() {
  const [activeTab, setActiveTab] = useState<'starters' | 'themes'>('starters')
  const [model, setModel] = useState<ThemeModel>()
  const [starters, setStarters] = useState<StarterSummary[]>([])
  const [starterStatus, setStarterStatus] = useState<StarterInstallStatus | null>(null)
  const [rollbackOptions, setRollbackOptions] = useState<RollbackOption[]>([])
  const [selectedRollbackPath, setSelectedRollbackPath] = useState<string>('')
  const [selectedRollbackRev, setSelectedRollbackRev] = useState<number | ''>('')

  const [selectedTheme, setSelectedTheme] = useState('')
  const [tokens, setTokens] = useState('{}')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info')
  const [busy, setBusy] = useState(false)

  async function refresh(site?: string) {
    try {
      const siteQuery = site ? '?site=' + encodeURIComponent(site) : ''
      const [themesRes, startersRes] = await Promise.all([
        fetch('/api/admin/themes' + siteQuery),
        fetch('/api/admin/starters' + siteQuery),
      ])

      const themesData = await themesRes.json()
      if (themesRes.ok) {
        setModel(themesData)
      } else {
        setMessage(themesData.error || 'Failed to load theme state.')
        setMessageType('error')
      }

      const startersData = await startersRes.json()
      if (startersRes.ok) {
        setStarters(startersData.starters || [])
        setStarterStatus(startersData.status || null)
        setRollbackOptions(startersData.rollbackOptions || [])
        if (startersData.rollbackOptions?.length && !selectedRollbackPath) {
          setSelectedRollbackPath(startersData.rollbackOptions[0].path)
        }
      }
    } catch {
      setMessage('Failed to load discovery data. Check network and database status.')
      setMessageType('error')
    }
  }

  useEffect(() => {
    let cancelled = false
    void refresh().then(() => {
      if (!cancelled && !message) {
        setMessage('Starter Studio ready. Select an archetype or customize your theme.')
        setMessageType('info')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleStarterInstall(starterId: StarterId) {
    if (!model?.site) return
    setBusy(true)
    setMessage(`Installing ${starterId}... Creating pages, templates, patterns, and media assets.`)
    setMessageType('info')

    try {
      const res = await fetch('/api/admin/starters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'install',
          siteId: model.site,
          starterId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Installation failed.')

      setMessage(
        `✓ ${data.summary || 'Starter installed successfully! Core visitor journeys are published.'}`,
      )
      setMessageType('success')
      await refresh(model.site)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Starter installation failed.')
      setMessageType('error')
    } finally {
      setBusy(false)
    }
  }

  async function handleStarterUpgrade(starterId: StarterId) {
    if (!model?.site) return
    setBusy(true)
    setMessage(`Upgrading starter templates and patterns non-destructively...`)
    setMessageType('info')

    try {
      const res = await fetch('/api/admin/starters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upgrade',
          siteId: model.site,
          starterId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upgrade failed.')

      setMessage(`✓ ${data.message || 'Starter upgraded successfully. Custom content preserved.'}`)
      setMessageType('success')
      await refresh(model.site)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Starter upgrade failed.')
      setMessageType('error')
    } finally {
      setBusy(false)
    }
  }

  async function handleStarterRollback() {
    if (!model?.site || !selectedRollbackPath || selectedRollbackRev === '') return
    setBusy(true)
    setMessage(`Rolling back layout for ${selectedRollbackPath} to revision ${selectedRollbackRev}...`)
    setMessageType('info')

    try {
      const res = await fetch('/api/admin/starters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rollback',
          siteId: model.site,
          path: selectedRollbackPath,
          targetRevision: Number(selectedRollbackRev),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Rollback failed.')

      setMessage(`✓ ${data.message || 'Rollback completed successfully.'}`)
      setMessageType('success')
      await refresh(model.site)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Rollback failed.')
      setMessageType('error')
    } finally {
      setBusy(false)
    }
  }

  async function actTheme(action: string) {
    if (!model) return
    setBusy(true)
    try {
      const [id, version] = selectedTheme.split('@')
      const response = await fetch('/api/admin/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          site: model.site,
          revision: model.state.revision,
          id,
          version,
          tokens: action === 'draft' ? JSON.parse(tokens) : undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setMessage(
        action === 'preview'
          ? 'Preview is active for your authenticated session. Open the public site in this browser; it expires in 15 minutes.'
          : `${action} completed.`,
      )
      setMessageType('success')
      await refresh(model.site)
    } catch (error) {
      setMessage(
        error instanceof SyntaxError
          ? 'Enter valid JSON tokens.'
          : error instanceof Error
            ? error.message
            : 'Theme operation failed.',
      )
      setMessageType('error')
    } finally {
      setBusy(false)
    }
  }

  const selectedLayoutObj = rollbackOptions.find((l) => l.path === selectedRollbackPath)

  return (
    <section aria-label="Starter and Theme Lifecycle" className={styles.center}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2>Starter &amp; Theme Studio</h2>
          <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>
            Production starter experiences with complete visitor journeys, governed media, and visual builder integration.
          </p>
        </div>
      </div>

      {model && (
        <div style={{ margin: '14px 0' }}>
          <label htmlFor="theme-site-select" style={{ display: 'inline-block', marginRight: '10px' }}>
            Target Site:
          </label>
          <select
            id="theme-site-select"
            aria-label="Theme site"
            value={model.site}
            style={{ display: 'inline-block', width: 'auto', padding: '6px 12px' }}
            onChange={(e) => {
              setSelectedTheme('')
              void refresh(e.target.value)
            }}
          >
            {model.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Accessible Tab Navigation */}
      <nav role="tablist" aria-label="Studio Sections" className={styles.tabBar}>
        <button
          role="tab"
          id="tab-starters"
          aria-controls="panel-starters"
          aria-selected={activeTab === 'starters'}
          type="button"
          onClick={() => setActiveTab('starters')}
          className={`${styles.tabButton} ${activeTab === 'starters' ? styles.tabButtonActive : ''}`}
        >
          Starter Experiences (2)
        </button>
        <button
          role="tab"
          id="tab-themes"
          aria-controls="panel-themes"
          aria-selected={activeTab === 'themes'}
          type="button"
          onClick={() => setActiveTab('themes')}
          className={`${styles.tabButton} ${activeTab === 'themes' ? styles.tabButtonActive : ''}`}
        >
          Themes &amp; Design Tokens
        </button>
      </nav>

      {/* Status Feedback Banner */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          data-type={messageType}
          className={styles.statusMessage}
        >
          {message}
        </div>
      )}

      {/* Panel 1: Starters */}
      {activeTab === 'starters' && (
        <div id="panel-starters" role="tabpanel" aria-labelledby="tab-starters">
          <p style={{ fontSize: '0.9375rem' }}>
            Install either complete starter experience directly into the active site without editing code. All templates, reusable patterns, global regions, and sample content install with verified public presentation snapshots.
          </p>

          <div className={styles.startersGrid}>
            {starters.map((starter) => {
              const isActive = starterStatus?.starterId === starter.id
              return (
                <article
                  key={starter.id}
                  className={`${styles.starterCard} ${isActive ? styles.starterCardActive : ''}`}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span className={`${styles.badge} ${isActive ? styles.badgeActive : styles.badgeAvailable}`}>
                        {isActive ? '● Active Starter' : 'Available'}
                      </span>
                      <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: '#64748b' }}>
                        Theme: {starter.themeId}
                      </span>
                    </div>

                    <h3 style={{ margin: '8px 0 4px', fontSize: '1.25rem', fontWeight: 800 }}>
                      {starter.name}
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '12px' }}>
                      {starter.summary}
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '10px 0' }}>
                      <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {starter.pagesCount} Pages
                      </span>
                      <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {starter.articlesCount} Dispatches
                      </span>
                      <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {starter.templatesCount} Templates
                      </span>
                      <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {starter.patternsCount} Patterns
                      </span>
                      <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {starter.globalsCount} Globals
                      </span>
                      {starter.productsCount > 0 && (
                        <span style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                          {starter.productsCount} Products
                        </span>
                      )}
                      {starter.donationsCount > 0 && (
                        <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                          Donation Campaign
                        </span>
                      )}
                    </div>

                    <ul className={styles.featureList}>
                      {starter.features.map((feat, idx) => (
                        <li key={idx}>{feat}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className={styles.actionRow}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleStarterInstall(starter.id)}
                        className={isActive ? styles.secondaryBtn : styles.accentBtn}
                        aria-label={`Install ${starter.name} Starter`}
                      >
                        {isActive ? '↻ Reinstall Starter' : 'Install Starter'}
                      </button>

                      <Link
                        href="/builder"
                        className={styles.primaryBtn}
                        aria-label={`Customize ${starter.name} in Visual Builder`}
                      >
                        Customize Canvas →
                      </Link>

                      {isActive && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStarterUpgrade(starter.id)}
                          className={styles.secondaryBtn}
                          aria-label={`Upgrade ${starter.name} Templates`}
                        >
                          Upgrade Defaults
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {/* Rollback Section */}
          {rollbackOptions.length > 0 && (
            <div className={styles.rollbackSection}>
              <h4 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700 }}>
                Layout Revision Rollback
              </h4>
              <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '14px' }}>
                Revert any page or global region layout to an earlier revision. Changes publish immediately with immutable snapshot protection.
              </p>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <label htmlFor="rollback-path-select" style={{ margin: '0 0 4px', fontSize: '0.8125rem' }}>
                    Select Layout:
                  </label>
                  <select
                    id="rollback-path-select"
                    value={selectedRollbackPath}
                    onChange={(e) => {
                      setSelectedRollbackPath(e.target.value)
                      const found = rollbackOptions.find((l) => l.path === e.target.value)
                      setSelectedRollbackRev(found?.history[0]?.revision ?? '')
                    }}
                    style={{ margin: 0, padding: '8px 12px' }}
                  >
                    {rollbackOptions.map((opt) => (
                      <option key={opt.path} value={opt.path}>
                        {opt.name} ({opt.path}) — Current: rev {opt.currentRevision}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedLayoutObj && (
                  <div>
                    <label htmlFor="rollback-rev-select" style={{ margin: '0 0 4px', fontSize: '0.8125rem' }}>
                      Target Revision:
                    </label>
                    <select
                      id="rollback-rev-select"
                      value={selectedRollbackRev}
                      onChange={(e) => setSelectedRollbackRev(Number(e.target.value))}
                      style={{ margin: 0, padding: '8px 12px' }}
                    >
                      <option value="">Choose revision</option>
                      {selectedLayoutObj.history.map((h) => (
                        <option key={h.revision} value={h.revision}>
                          Revision {h.revision} {h.action ? `(${h.action})` : ''} {h.savedAt ? `— ${new Date(h.savedAt).toLocaleDateString()}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ alignSelf: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={busy || !selectedRollbackPath || selectedRollbackRev === ''}
                    onClick={() => void handleStarterRollback()}
                    className={styles.accentBtn}
                    style={{ margin: 0 }}
                  >
                    Roll Back Layout
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <a href="/" target="_blank" rel="noreferrer" className={styles.secondaryBtn}>
              View Live Public Site ↗
            </a>
            <Link href="/admin/collections/content" className={styles.secondaryBtn}>
              Manage Canonical Content
            </Link>
            <Link href="/admin/collections/products" className={styles.secondaryBtn}>
              Manage Products
            </Link>
          </div>
        </div>
      )}

      {/* Panel 2: Themes & Design Tokens */}
      {activeTab === 'themes' && model && (
        <div id="panel-themes" role="tabpanel" aria-labelledby="tab-themes">
          <p>
            Install first-party data packages in theme-packages, then refresh discovery. Changes affect presentation only; canonical content and URLs are preserved.
          </p>
          <p>
            Active:{' '}
            <strong>
              {model.state.active
                ? `${model.state.active.id}@${model.state.active.version}`
                : 'Legacy Site Settings theme'}
            </strong>{' '}
            · Revision {model.state.revision}
          </p>
          <p>
            Draft:{' '}
            <strong>
              {model.state.draft ? `${model.state.draft.id}@${model.state.draft.version}` : 'None'}
            </strong>{' '}
            · Previous:{' '}
            <strong>
              {model.state.previous
                ? `${model.state.previous.id}@${model.state.previous.version}`
                : 'None'}
            </strong>
          </p>
          <ul>
            {model.installed.map((item) => (
              <li key={item.directory}>
                {item.package ? `${item.package.label} ${item.package.version}` : item.directory} —{' '}
                {item.error ??
                  (item.compatible
                    ? 'Installed'
                    : 'Incompatible: install a version supporting presentation 1.0.0')}
                {item.package &&
                model.state.active?.id === item.package.id &&
                gt(item.package.version, model.state.active.version)
                  ? ' · Update available'
                  : ''}{' '}
                · {item.capabilities.join(', ')}
              </li>
            ))}
          </ul>
          <label htmlFor="draft-package-select">
            Draft package{' '}
            <select
              id="draft-package-select"
              aria-label="Draft package"
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
            >
              <option value="">Select package</option>
              {model.installed
                .filter((p) => p.compatible && !p.error)
                .map((p) => (
                  <option key={p.directory} value={`${p.package!.id}@${p.package!.version}`}>
                    {p.package!.id}@{p.package!.version}
                  </option>
                ))}
            </select>
          </label>
          <label htmlFor="token-overrides-textarea">
            Design token overrides (JSON)
            <textarea
              id="token-overrides-textarea"
              aria-label="Design token overrides"
              value={tokens}
              onChange={(e) => setTokens(e.target.value)}
              rows={5}
            />
          </label>
          <details style={{ margin: '14px 0' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Allowed design tokens and defaults</summary>
            <pre>{JSON.stringify(model.tokenDefaults, null, 2)}</pre>
          </details>
          <div>
            {['draft', 'preview', 'end-preview', 'activate', 'rollback'].map((action) => (
              <button
                type="button"
                disabled={busy}
                key={action}
                onClick={() => void actTheme(action)}
              >
                {
                  {
                    draft: 'Save theme draft',
                    preview: 'Start theme preview',
                    'end-preview': 'End theme preview',
                    activate: 'Activate theme',
                    rollback: 'Roll back theme',
                  }[action]
                }
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => void refresh(model.site)}>
              Refresh discovery
            </button>
          </div>
          <div style={{ marginTop: '16px' }}>
            <a href="/" target="_blank" rel="noreferrer" className={styles.secondaryBtn}>
              Open live public site ↗
            </a>
          </div>
        </div>
      )}
    </section>
  )
}
