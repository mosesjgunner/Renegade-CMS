'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const endpoint = '/api/creator-studio/submissions'
type Target = { key: string; title: string; kind: string }
type Submission = {
  id: string
  title: string
  filename: string
  state: string
  reviewStatus?: string
  reason?: string
  target: string
  targetTitle?: string
  altText?: string
  caption?: string
  kind?: string
  preview?: string
  receivedBytes: number
  expectedSize: number
  chunkSize: number
  manifest?: Record<string, string>
  expiresAt: string
  history?: { state: string; reason: string; at: string }[]
}
type Draft = {
  key: string
  file: File
  title: string
  altText: string
  caption: string
  message?: string
}
type Workspace = { mine: Submission[]; queue: Submission[]; uploads: boolean; targets: Target[] }

async function api<T>(path = '', init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.method && init.method !== 'GET') {
    const csrf = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('renegade-member-csrf='))
      ?.split('=')[1]
    if (csrf) headers.set('x-member-csrf', decodeURIComponent(csrf))
  }
  const response = await fetch(endpoint + path, { ...init, headers, cache: 'no-store' })
  if (response.status === 204) return undefined as T
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Submission request failed.')
  return data
}

const post = <T,>(path: string, body: object, signal?: AbortSignal) =>
  api<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

export function SubmissionPreview({
  url,
  kind,
  altText,
  title,
}: {
  url: string
  kind?: string
  altText?: string
  title: string
}) {
  if (kind === 'image')
    return <img src={url} alt={altText || title} className="max-h-64 max-w-full" /> // eslint-disable-line @next/next/no-img-element
  if (kind === 'audio') return <audio src={url} controls preload="none" />
  if (kind === 'video')
    return <video src={url} controls preload="none" className="max-h-64 max-w-full" />
  return <a href={url}>Download document preview</a>
}

function SubmissionCard({
  item,
  review,
  refresh,
}: {
  item: Submission
  review: boolean
  refresh: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [altText, setAltText] = useState(item.altText ?? '')
  const [caption, setCaption] = useState(item.caption ?? '')
  async function act(action: string) {
    setBusy(true)
    setMessage('')
    try {
      if (action === 'cancel') await api('/' + item.id, { method: 'DELETE' })
      else await post('/' + item.id, { action, reason, title, altText, caption })
      setReason('')
      setEditing(false)
      await refresh()
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const actions: [string, string][] = review
    ? ['approved', 'published'].includes(item.reviewStatus ?? '')
      ? [['withdraw', 'Withdraw']]
      : [
          ['approve', 'Approve'],
          ['reject', 'Reject'],
        ]
    : item.reviewStatus === 'approved'
      ? [['publish', 'Publish']]
      : item.reviewStatus === 'rejected' &&
          !item.history?.some((entry) => entry.state === 'appealed')
        ? [['appeal', 'Appeal']]
        : ['open', 'failed', 'finalizing'].includes(item.state) &&
            item.reviewStatus !== 'quarantined'
          ? [['cancel', 'Cancel upload']]
          : []
  return (
    <li className="space-y-2 rounded border p-3">
      <p>
        <strong>{item.title}</strong> · {item.reviewStatus ?? item.state}
      </p>
      {item.targetTitle && <p className="text-sm">Destination · {item.targetTitle}</p>}
      {item.state !== 'completed' && (
        <p>
          {item.receivedBytes} / {item.expectedSize} bytes received
        </p>
      )}
      {item.reason && <p>{item.reason}</p>}
      {item.history && item.history.length > 1 && (
        <details>
          <summary>Review history</summary>
          <ul>
            {item.history.map((event, index) => (
              <li key={index}>
                {event.state}
                {event.reason ? ` · ${event.reason}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {item.preview && (
        <button type="button" onClick={() => setPreview(!preview)}>
          {preview ? 'Hide preview' : 'Preview'}
        </button>
      )}
      {item.preview && preview && (
        <SubmissionPreview
          url={item.preview}
          kind={item.kind}
          altText={item.altText ?? undefined}
          title={item.title}
        />
      )}
      {item.reviewStatus === 'published' && (
        <p>
          <Link href={`/studio/submissions?target=${encodeURIComponent(item.target)}`}>
            View published submissions
          </Link>
        </p>
      )}
      {!review && item.reviewStatus === 'pending' && (
        <button type="button" onClick={() => setEditing(!editing)}>
          Edit metadata
        </button>
      )}
      {editing && (
        <div className="space-y-2">
          <label className="block">
            Title{' '}
            <input
              maxLength={180}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block">
            Alt text{' '}
            <input
              maxLength={500}
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
            />
          </label>
          <label className="block">
            Caption{' '}
            <textarea
              maxLength={2000}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void act('metadata')}
          >
            Save metadata
          </button>
        </div>
      )}
      {(review || actions.some(([action]) => action === 'appeal')) && (
        <label className="block">
          Reason{' '}
          <textarea
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      )}
      <div className="flex gap-3">
        {actions.map(([action, label]) => (
          <button
            key={action}
            type="button"
            disabled={busy || ((review || action === 'appeal') && !reason.trim())}
            onClick={() => void act(action)}
          >
            {label}
          </button>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
    </li>
  )
}

export function SubmissionWorkspace({
  publicTarget,
  destination,
}: {
  publicTarget?: string
  destination?: string
}) {
  const [workspace, setWorkspace] = useState<Workspace>()
  const [published, setPublished] = useState<{
    target: Target
    items: (Submission & { url: string })[]
  }>()
  const [target, setTarget] = useState(destination ?? '')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    if (publicTarget) {
      setPublished(await api(`?target=${encodeURIComponent(publicTarget)}`))
    } else {
      const next = await api<Workspace>()
      setWorkspace(next)
      setTarget((current) =>
        next.targets.some(({ key }) => key === current) ? current : (next.targets[0]?.key ?? ''),
      )
    }
  }, [publicTarget])
  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message))
    return () => controller.current?.abort()
  }, [refresh])
  function select(files: FileList | null) {
    if (!files || busy) return
    const selected = Array.from(files).map((file) => ({
      key: crypto.randomUUID(),
      file,
      title: file.name.slice(0, 180),
      altText: '',
      caption: '',
    }))
    setDrafts((current) => [...current, ...selected].slice(0, 20))
  }
  function edit(key: string, changes: Partial<Draft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...changes } : draft)),
    )
  }
  async function upload() {
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setMessage('')
    for (const draft of drafts) {
      if (abort.signal.aborted) break
      const { file, title, altText, caption } = draft
      const savedKey = `renegade.upload:${JSON.stringify([target, file.name, file.size, file.lastModified])}`
      try {
        const key = localStorage.getItem(savedKey) ?? draft.key
        localStorage.setItem(savedKey, key)
        const session = await post<Submission>(
          '',
          {
            key,
            filename: file.name,
            size: file.size,
            mimeType: file.type,
            title,
            altText,
            caption,
            target,
          },
          abort.signal,
        )
        if (
          session.state !== 'completed' &&
          (['expired', 'cancelled'].includes(session.state) ||
            Date.parse(session.expiresAt) <= Date.now())
        ) {
          localStorage.removeItem(savedKey)
          throw new Error('Previous upload closed. Select Upload batch to start again.')
        }
        if (session.state !== 'completed') {
          const count = Math.ceil(file.size / session.chunkSize)
          for (let index = 0; index < count; index++) {
            if (abort.signal.aborted) throw new Error('Paused.')
            const start = index * session.chunkSize
            const end = Math.min(file.size, start + session.chunkSize)
            const part = file.slice(start, end)
            const recorded = session.manifest?.[index]
            if (recorded) {
              const digest = new Uint8Array(
                await crypto.subtle.digest('SHA-256', await part.arrayBuffer()),
              )
              const hash =
                'sha256:' +
                Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
              if (recorded !== hash)
                throw new Error('Reselect the original file to resume this upload.')
            } else
              await api('/' + session.id, {
                method: 'PATCH',
                headers: {
                  'content-range': `bytes ${start}-${end - 1}/${file.size}`,
                  'x-upload-chunk-index': String(index),
                },
                body: part,
                signal: abort.signal,
              })
            edit(draft.key, { message: `${index + 1} / ${count} chunks uploaded` })
          }
          await post('/' + session.id, { action: 'finalize' }, abort.signal)
        }
        localStorage.removeItem(savedKey)
        setDrafts((current) => current.filter((entry) => entry.key !== draft.key))
      } catch (error) {
        edit(draft.key, {
          message: abort.signal.aborted
            ? 'Paused. Upload again to resume.'
            : (error as Error).message,
        })
      }
    }
    setBusy(false)
    controller.current = null
    await refresh().catch((error: Error) => setMessage(error.message))
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">{published?.target.title ?? 'Community submissions'}</h1>
      {message && <p role="status">{message}</p>}
      {published && (
        <ul className="space-y-4">
          {published.items.map((item) => (
            <li key={item.id}>
              <h2 className="font-semibold">{item.title}</h2>
              <SubmissionPreview
                url={item.url}
                kind={item.kind}
                altText={item.altText ?? undefined}
                title={item.title}
              />
              {item.caption && <p>{item.caption}</p>}
            </li>
          ))}
          {!published.items.length && <li>No submissions have been published.</li>}
        </ul>
      )}
      {published && (
        <Link
          className="underline"
          href={`/studio/submissions?destination=${encodeURIComponent(published.target.key)}`}
        >
          Submit files
        </Link>
      )}
      {workspace?.uploads && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Upload files</h2>
          <label className="block">
            Submit to{' '}
            <select
              disabled={busy}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              {!workspace.targets.length && <option value="">No destinations available</option>}
              {workspace.targets.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.title} ({entry.kind})
                </option>
              ))}
            </select>
          </label>
          {target && (
            <div
              className="rounded border border-dashed p-5"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                select(event.dataTransfer.files)
              }}
            >
              <label className="block">
                Drop files here or choose files
                <input
                  type="file"
                  multiple
                  disabled={busy}
                  accept="image/png,image/jpeg,image/gif,image/webp,audio/*,video/mp4,video/webm,video/quicktime,application/pdf,.vtt"
                  className="block"
                  onChange={(event) => {
                    select(event.target.files)
                    event.target.value = ''
                  }}
                />
              </label>
            </div>
          )}
          {drafts.map((draft) => (
            <fieldset key={draft.key} disabled={busy} className="space-y-2 rounded border p-3">
              <legend>{draft.file.name}</legend>
              <label className="block">
                Title{' '}
                <input
                  maxLength={180}
                  value={draft.title}
                  onChange={(event) => edit(draft.key, { title: event.target.value })}
                />
              </label>
              <label className="block">
                Alt text for images{' '}
                <input
                  maxLength={500}
                  value={draft.altText}
                  onChange={(event) => edit(draft.key, { altText: event.target.value })}
                />
              </label>
              <label className="block">
                Caption{' '}
                <textarea
                  maxLength={2000}
                  value={draft.caption}
                  onChange={(event) => edit(draft.key, { caption: event.target.value })}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setDrafts((current) => current.filter(({ key }) => key !== draft.key))
                }
              >
                Remove from batch
              </button>
              {draft.message && <p role="status">{draft.message}</p>}
            </fieldset>
          ))}
          <button
            type="button"
            disabled={
              busy || !target || !drafts.length || drafts.some((draft) => !draft.title.trim())
            }
            onClick={() => void upload()}
          >
            Upload batch
          </button>
          {busy && (
            <button type="button" onClick={() => controller.current?.abort()}>
              Pause batch
            </button>
          )}
        </section>
      )}
      {workspace?.uploads && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">My submissions</h2>
          <button
            type="button"
            onClick={() => void refresh().catch((error: Error) => setMessage(error.message))}
          >
            Refresh status
          </button>
          <ul className="space-y-2">
            {workspace.mine.map((item) => (
              <SubmissionCard key={item.id} item={item} review={false} refresh={refresh} />
            ))}
          </ul>
        </section>
      )}
      {workspace?.queue.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Moderation queue</h2>
          <ul className="space-y-2">
            {workspace.queue.map((item) => (
              <SubmissionCard key={item.id} item={item} review refresh={refresh} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
