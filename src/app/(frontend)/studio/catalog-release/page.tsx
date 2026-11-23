'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { captureRequest } from '@/modules/creator-studio/capture-sync'

const endpoint = '/api/creator-studio/catalog-releases'
type Report = {
  id: string
  published: boolean
  path?: string
  drafts?: { channel: string; state: string }[]
}

export default function CatalogReleaseWorkspace() {
  const [release, setRelease] = useState('')
  const [releases, setReleases] = useState<{ id: string; title: string; published: boolean }[]>([])
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    void captureRequest<typeof releases>(endpoint)
      .then((items) => {
        if (active) setReleases(items)
      })
      .catch((error) => {
        if (active) setMessage(error.message)
      })
    return () => {
      active = false
    }
  }, [])
  const [report, setReport] = useState<Report>()
  const [busy, setBusy] = useState(false)

  async function run(action: 'create' | 'publish' | 'withdraw' | 'report', data?: object) {
    setBusy(true)
    setMessage('')
    try {
      const result =
        action === 'report'
          ? await captureRequest<Report>(endpoint + '?release=' + encodeURIComponent(release))
          : await captureRequest<Report>(endpoint, 'POST', {
              action,
              release: release.trim(),
              ...data,
            })
      setReport(result)
      setRelease(result.id)
      if (action !== 'report') setReleases(await captureRequest<typeof releases>(endpoint))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Release request failed.')
    } finally {
      setBusy(false)
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (key: string) => String(data.get(key) ?? '').trim()
    const downloadProduct = value('downloadProduct')
    void run('create', {
      title: value('title'),
      plannedInstant: value('planned') ? new Date(value('planned')).toISOString() : undefined,
      source: { kind: value('sourceKind'), id: value('source') },
      trailer: value('trailer'),
      recording: value('recording'),
      recordingAccess: value('access'),
      downloadProduct,
      products: [
        downloadProduct,
        ...value('products')
          .split(/\s*,\s*/)
          .filter(Boolean),
      ],
      socialAccount: value('socialAccount') || undefined,
      announcement: value('announcement'),
      newsletter: value('newsletter'),
      clip: value('clip') || undefined,
      graphic: value('graphic') || undefined,
    })
  }

  const field = 'block w-full rounded border border-current/30 bg-transparent p-2'
  const button = 'rounded border border-current/30 px-3 py-2 disabled:opacity-50'
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/studio">Creator Studio</Link>
      <h1 className="text-3xl font-bold">Catalog release</h1>
      <form onSubmit={create}>
        <fieldset disabled={busy} className="space-y-3">
          <label className="block">
            Release title
            <input className={field} required maxLength={120} name="title" />
          </label>
          <label className="block">
            Source type
            <select className={field} name="sourceKind">
              <option value="albums">Portfolio</option>
              <option value="creator-projects">Project</option>
              <option value="podcast-episodes">Podcast episode</option>
              <option value="videos">Video replay</option>
            </select>
          </label>
          <label className="block">
            Published source ID
            <input className={field} required name="source" />
          </label>
          <label className="block">
            Free trailer asset ID
            <input className={field} required name="trailer" />
          </label>
          <label className="block">
            Full recording asset ID
            <input className={field} required name="recording" />
          </label>
          <label className="block">
            Recording access
            <select className={field} name="access">
              <option value="member">Site members</option>
              <option value="paid">Paid access</option>
            </select>
          </label>
          <label className="block">
            Digital download product ID
            <input className={field} required name="downloadProduct" />
          </label>
          <label className="block">
            Related product IDs (comma-separated)
            <input className={field} name="products" />
          </label>
          <label className="block">
            Social Studio account ID (optional)
            <input className={field} name="socialAccount" />
          </label>
          <label className="block">
            Social announcement draft
            <textarea className={field} name="announcement" maxLength={1500} />
          </label>
          <label className="block">
            Promotion clip asset ID
            <input className={field} name="clip" />
          </label>
          <label className="block">
            Promotion graphic asset ID
            <input className={field} name="graphic" />
          </label>
          <label className="block">
            Newsletter excerpt draft
            <textarea className={field} name="newsletter" maxLength={3000} />
          </label>
          <label className="block">
            Calendar planning time (local)
            <input type="datetime-local" name="planned" className={field} />
          </label>
          <button className={button} type="submit">
            Create draft release
          </button>
        </fieldset>
      </form>
      <section className="space-y-3 border-t pt-4">
        {releases.length > 0 && (
          <label className="block">
            My releases
            <select
              className={field}
              value={releases.some(({ id }) => id === release) ? release : ''}
              onChange={(event) => {
                setRelease(event.target.value)
                setReport(undefined)
              }}
            >
              <option value="">Choose a release</option>
              {releases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} ? {item.published ? 'Published' : 'Private'}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          Release ID
          <input
            className={field}
            value={release}
            onChange={(event) => setRelease(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            type="button"
            disabled={busy || !release}
            onClick={() => void run('report')}
          >
            Refresh report
          </button>
          <button
            className={button}
            type="button"
            disabled={busy || !release}
            onClick={() => void run('publish')}
          >
            Release catalog and prepare drafts
          </button>
          <button
            className={button}
            type="button"
            disabled={busy || !release}
            onClick={() => void run('withdraw')}
          >
            Withdraw catalog
          </button>
        </div>
        {message && <p role="alert">{message}</p>}
        {report && (
          <div role="status">
            <p>Catalog {report.published ? 'published' : 'private'}</p>
            {report.published && report.path && (
              <Link className="underline" href={report.path}>
                View catalog release
              </Link>
            )}
            {report.drafts && (
              <ul>
                {report.drafts.map((draft) => (
                  <li key={draft.channel}>
                    {draft.channel} · {draft.state}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
