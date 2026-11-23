'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { StudioOverview } from './StudioOverview'
import type { studioOverview } from './studio-overview'

type Workspace = {
  overview: Awaited<ReturnType<typeof studioOverview>>
  handle: string
  space: { id: string; description: string } | null
  drafts: Array<{ id: string; title: string }>
}
function csrf(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((item) => item.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}

export function CreatorWorkspace({ handle }: { handle?: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [message, setMessage] = useState('Loading studio…')
  const [draftId, setDraftId] = useState<string | undefined>()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const response = await fetch('/api/creator-studio', { cache: 'no-store' })
    if (response.status === 401) throw new Error('Please sign in to open your studio.')
    if (!response.ok)
      throw new Error('Studio access is not available for this account on this site.')
    const data: Workspace = await response.json()
    if (handle && data.handle !== handle) throw new Error('This studio is unavailable.')
    setWorkspace(data)
    setDescription(data.space?.description ?? '')
    setMessage('')
  }, [handle])
  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message))
  }, [load])
  async function send(data: object) {
    const response = await fetch('/api/creator-studio', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrf() },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error('Could not save. Check your access and try again.')
    return response.json()
  }
  async function createSpace() {
    setBusy(true)
    try {
      await send({ action: 'create-space' })
      await load()
      setMessage('Space created.')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function saveSpace(event: React.FormEvent) {
    event.preventDefault()
    if (!workspace?.space) return
    setBusy(true)
    try {
      await send({ action: 'save-space', spaceId: workspace.space.id, description })
      await load()
      setMessage('Space saved.')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const openDraft = useCallback(async (id: string) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/creator-studio?draft=${encodeURIComponent(id)}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Draft unavailable.')
      const draft = await response.json()
      setDraftId(draft.id)
      setTitle(draft.title)
      setText(draft.text)
      setMessage('')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('draft')
    if (id && workspace?.space?.id) void openDraft(id)
  }, [workspace?.space?.id, openDraft])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!workspace?.space) return
    setBusy(true)
    try {
      const result = await send({
        action: 'save-draft',
        spaceId: workspace.space.id,
        draftId,
        title,
        text,
      })
      setDraftId(result.id)
      await load()
      setMessage('Draft saved.')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">My Studio</h1>
      {message && <p role="status">{message}</p>}
      {workspace && (
        <>
          <StudioOverview overview={workspace.overview} />
          <div className="flex flex-wrap gap-4">
            <Link className="underline" href="/studio/catalog-release">
              Catalog releases
            </Link>
            <Link className="underline" href="/studio/media-edit">
              Edit and export projects
            </Link>
            <Link className="underline" href="/studio/portability">
              Export my Studio data
            </Link>
          </div>
        </>
      )}
      {workspace && !workspace.space && (
        <section>
          <p>Start a writing draft by opening your personal space.</p>
          <button disabled={busy} onClick={createSpace}>
            Open my writing space
          </button>
        </section>
      )}
      {workspace?.space && (
        <>
          <details>
            <summary>About my space</summary>
            <form onSubmit={saveSpace} className="space-y-2">
              <label className="block">
                About my Space
                <textarea
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="block w-full border p-2"
                />
              </label>
              <button disabled={busy} type="submit">
                Save description
              </button>
            </form>
          </details>
          <section>
            <h2 className="text-xl font-semibold">My drafts</h2>
            <button
              type="button"
              onClick={() => {
                setDraftId(undefined)
                setTitle('')
                setText('')
              }}
            >
              New draft
            </button>
            <ul>
              {workspace.drafts.map((draft) => (
                <li key={draft.id}>
                  <button type="button" disabled={busy} onClick={() => void openDraft(draft.id)}>
                    {draft.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <form onSubmit={save} className="space-y-4">
            <label className="block">
              Title
              <input
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="block w-full border p-2"
              />
            </label>
            <label className="block">
              Draft
              <textarea
                maxLength={100000}
                rows={16}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="block w-full border p-2"
              />
            </label>
            <button disabled={busy} type="submit">
              Save draft
            </button>
          </form>
        </>
      )}
    </main>
  )
}
