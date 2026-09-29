'use client'

import { useEffect, useState } from 'react'
import { MediaPicker, type PickableMedia } from '../media/MediaPicker'
import { MediaUploader } from '../media/MediaUploader'

type Kind = 'article' | 'page'
type Content = {
  id: string
  title: string
  slug: string
  body: string
  summary: string
  status: string
  canonicalPath: string
  updatedAt: string
  heroMediaId: string | null
}

export function PublishingCenterClient({ kind }: { kind: Kind }) {
  const label = kind === 'page' ? 'Page' : 'Post'
  const [items, setItems] = useState<Content[]>([])
  const [editing, setEditing] = useState<Content | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [body, setBody] = useState('')
  const [summary, setSummary] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [scheduleKey, setScheduleKey] = useState('')
  const [siteId, setSiteId] = useState('')
  const [selectedMedia, setSelectedMedia] = useState<PickableMedia | null>(null)
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0)

  const load = async () => {
    const requestedSiteId = new URLSearchParams(window.location.search).get('siteId')
    const response = await fetch(
      `/api/admin/editorial?kind=${kind}${
        requestedSiteId ? `&siteId=${encodeURIComponent(requestedSiteId)}` : ''
      }`,
    )
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `Could not load ${label.toLowerCase()}s.`)
    setItems(data.content)
    setSiteId(data.siteId)
  }
  useEffect(() => {
    load().catch((error) => setMessage(error.message))
  }, [kind])
  const begin = async (content?: Content) => {
    let source = content
    if (content) {
      const response = await fetch(
        `/api/admin/editorial?kind=${kind}&id=${encodeURIComponent(content.id)}&siteId=${encodeURIComponent(siteId)}`,
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Could not load this ${label.toLowerCase()}.`)
      source = data.content
    }
    setEditing(source ?? 'new')
    setTitle(source?.title ?? '')
    setSlug(source?.slug ?? '')
    setBody(source?.body ?? '')
    setSummary(source?.summary ?? '')
    setSelectedMedia(
      source?.heroMediaId
        ? {
            id: source.heroMediaId,
            title: 'Attached media',
            altText: '',
            caption: '',
            mimeType: '',
            sizeBytes: 0,
            processingState: 'ready',
            url: `/media/${source.heroMediaId}`,
          }
        : null,
    )
    setMessage('')
  }
  const save = async (action: 'save' | 'request-review' | 'approve' | 'schedule' | 'publish') => {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/editorial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          kind,
          siteId,
          id: editing && typeof editing === 'object' ? editing.id : undefined,
          title,
          slug,
          body,
          summary,
          heroMediaId: selectedMedia?.id,
          ...(action === 'schedule'
            ? {
                scheduledFor: new Date(Date.now() + 60_000).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                idempotencyKey: `schedule:${editing && typeof editing === 'object' ? editing.id : 'new'}:${Date.now()}`,
              }
            : action === 'publish'
              ? { idempotencyKey: scheduleKey }
              : {}),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save content.')
      setEditing(data.content)
      setTitle(data.content.title)
      setSlug(data.content.slug)
      if (data.content.heroMediaId && selectedMedia?.id !== data.content.heroMediaId) {
        setSelectedMedia({
          id: data.content.heroMediaId,
          title: 'Attached media',
          altText: '',
          caption: '',
          mimeType: '',
          sizeBytes: 0,
          processingState: 'ready',
          url: `/media/${data.content.heroMediaId}`,
        })
      }
      setMessage(
        action === 'publish' ? `${label} published.` : `${label} ${action.replace('-', ' ')}.`,
      )
      if (data.scheduledKey) setScheduleKey(data.scheduledKey)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save content.')
    } finally {
      setBusy(false)
    }
  }
  const preview = async () => {
    const id = editing && typeof editing === 'object' ? editing.id : undefined
    if (!id) {
      setMessage('Save the draft before previewing it.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/editorial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', kind, id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not create preview.')
      window.open(data.previewUrl, '_blank', 'noopener,noreferrer')
      setMessage('Preview opened in a new tab.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create preview.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="gutter--left gutter--right" aria-label={`${label} editor`}>
      <h1>{label}s</h1>
      <p>Write in the canonical content collection. Drafts stay private until published.</p>
      {message ? <p role="status">{message}</p> : null}
      {editing === null ? (
        <>
          <button
            type="button"
            onClick={() => void begin().catch((error) => setMessage(error.message))}
          >
            Create {label}
          </button>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void begin(item).catch((error) => setMessage(error.message))}
                >
                  {item.title || `Untitled ${label}`}
                </button>{' '}
                <span>{item.status}</span>
              </li>
            ))}
          </ul>
          {!items.length ? <p>No {label.toLowerCase()}s yet.</p> : null}
        </>
      ) : (
        <section aria-label={`Edit ${label}`}>
          <p>
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setMessage('')
              }}
            >
              Back to {label}s
            </button>
          </p>
          {editing && typeof editing === 'object' && siteId ? (
            <section aria-label="Post media">
              <h2>Hero media</h2>
              <p>Upload a new image or select a site asset, then save the draft to attach it.</p>
              <MediaUploader
                siteId={siteId}
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onComplete={() => setMediaRefreshKey((key) => key + 1)}
              />
              <MediaPicker
                siteId={siteId}
                selectedId={selectedMedia?.id}
                refreshKey={mediaRefreshKey}
                onSelect={setSelectedMedia}
              />
              {selectedMedia ? (
                <p role="status">Selected hero media: {selectedMedia.title || selectedMedia.id}</p>
              ) : (
                <p>No hero media attached.</p>
              )}
              <button type="button" disabled={busy || !selectedMedia} onClick={() => save('save')}>
                Attach selected media
              </button>
            </section>
          ) : null}
          <p>
            <label>
              Title
              <input
                aria-label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
          </p>
          <p>
            <label>
              URL slug
              <input
                aria-label="URL slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </label>
          </p>
          <p>
            <label>
              Body
              <textarea
                aria-label="Body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={12}
              />
            </label>
          </p>
          <p>
            <label>
              Summary
              <input
                aria-label="Summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
          </p>
          {editing && typeof editing === 'object' && editing.canonicalPath ? (
            <p>
              Canonical URL:{' '}
              <a href={editing.canonicalPath} target="_blank" rel="noreferrer">
                {editing.canonicalPath}
              </a>
            </p>
          ) : null}
          <button type="button" disabled={busy} onClick={() => save('save')}>
            Save draft
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => save('request-review')}>
            Request review
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => save('approve')}>
            Approve
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => save('schedule')}>
            Schedule
          </button>{' '}
          <button type="button" disabled={busy} onClick={preview}>
            Preview
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => save('publish')}>
            Publish
          </button>
        </section>
      )}
    </main>
  )
}
