'use client'
import { useEffect, useState } from 'react'
import styles from './ThemeCenter.module.css'
import { gt } from 'semver'
import type { InstalledTheme } from '../presentation/packages'
import type { ThemeState } from '../presentation/lifecycle'
type Model = {
  site: string
  sites: { id: string; name: string }[]
  state: ThemeState
  installed: (InstalledTheme & { capabilities: string[] })[]
  tokenDefaults: Record<string, string>
}
export default function ThemeCenter() {
  const [model, setModel] = useState<Model>()
  const [selected, setSelected] = useState('')
  const [tokens, setTokens] = useState('{}')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh(site?: string) {
    const response = await fetch(
      '/api/admin/themes' + (site ? '?site=' + encodeURIComponent(site) : ''),
    )
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error)
      return
    }
    setModel(data)
  }
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/themes')
      .then(async (response) => {
        const data = await response.json()
        if (!cancelled) {
          if (response.ok) setModel(data)
          else setMessage(data.error)
        }
      })
      .catch(() => {
        if (!cancelled)
          setMessage('Theme discovery unavailable. Check database migrations and retry.')
      })
    return () => {
      cancelled = true
    }
  }, [])
  async function act(action: string) {
    if (!model) return
    setBusy(true)
    try {
      const [id, version] = selected.split('@')
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
      await refresh(model.site)
    } catch (error) {
      setMessage(
        error instanceof SyntaxError
          ? 'Enter valid JSON tokens.'
          : error instanceof Error
            ? error.message
            : 'Theme operation failed.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="Theme lifecycle" className={styles.center}>
      <h2>Themes</h2>
      <p>
        Install first-party data packages in theme-packages, then refresh discovery. Changes affect
        presentation only.
      </p>
      <p role="status">{message}</p>
      {model && (
        <>
          <label>
            Site{' '}
            <select
              aria-label="Theme site"
              value={model.site}
              onChange={(e) => {
                setSelected('')
                void refresh(e.target.value)
              }}
            >
              {model.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            Active:{' '}
            {model.state.active
              ? `${model.state.active.id}@${model.state.active.version}`
              : 'Legacy Site Settings theme'}{' '}
            · Revision {model.state.revision}
          </p>
          <p>
            Draft:{' '}
            {model.state.draft ? `${model.state.draft.id}@${model.state.draft.version}` : 'None'} ·
            Previous:{' '}
            {model.state.previous
              ? `${model.state.previous.id}@${model.state.previous.version}`
              : 'None'}
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
          <label>
            Draft package{' '}
            <select
              aria-label="Draft package"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
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
          <label>
            Design token overrides (JSON)
            <textarea
              aria-label="Design token overrides"
              value={tokens}
              onChange={(e) => setTokens(e.target.value)}
              rows={5}
            />
          </label>
          <details>
            <summary>Allowed design tokens and defaults</summary>
            <pre>{JSON.stringify(model.tokenDefaults, null, 2)}</pre>
          </details>
          <div>
            {['draft', 'preview', 'end-preview', 'activate', 'rollback'].map((action) => (
              <button type="button" disabled={busy} key={action} onClick={() => void act(action)}>
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
          <a href="/" target="_blank" rel="noreferrer">
            Open public site
          </a>
        </>
      )}
    </section>
  )
}
