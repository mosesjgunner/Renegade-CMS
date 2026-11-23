'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Workspace = {
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
    const me = await fetch('/api/member-auth/me', { cache: 'no-store' })
    if (!me.ok) throw new Error('Please sign in to open your studio.')
    const response = await fetch('/api/creator-studio', { cache: 'no-store' })
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
      <h1 className="text-3xl font-bold">Creator Studio</h1>
      {workspace && (
        <p>
          <Link href="/studio/record">Record audio, camera or screen</Link>
        </p>
      )}
      {workspace && (
        <p>
          <Link href="/studio/media-edit">Edit media</Link>
        </p>
      )}
      <p>
        <Link href="/studio/portfolio">Portfolios and projects</Link>
      </p>
      <p>
        <Link href="/studio/external-video">External videos and distribution</Link>
      </p>
      <Link href="/studio/submissions">Community submissions</Link>
      {message && <p role="status">{message}</p>}
      {workspace && !workspace.space && (
        <section>
          <p>Create your Space to start a draft.</p>
          <button disabled={busy} onClick={createSpace}>
            Create Space
          </button>
        </section>
      )}
      {workspace?.space && (
        <>
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
              Save Space
            </button>
          </form>
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
