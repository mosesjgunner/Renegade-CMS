'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ExternalVideoPlayer } from './ExternalVideoPlayer'
import type { ExternalProvider, VideoSnapshot } from './video-providers'

const endpoint = '/api/creator-studio/external-video'
type Source = {
  id: string
  contentId: string
  path: string
  title: string
  displayTitle: string
  status: string
  provider: ExternalProvider
  availability: string
  snapshot: VideoSnapshot | null
}
type Workspace = { configured: boolean; connected: boolean; canManage: boolean; items: Source[] }
type CatalogPage = { items: VideoSnapshot[]; nextPage: string | null }

export function ExternalVideoWorkspace({
  spaceId,
  oauthResult,
  exports,
}: {
  spaceId: string | null
  oauthResult?: string
  exports: Array<{ id: string; title: string }>
}) {
  const [workspace, setWorkspace] = useState<Workspace>()
  const [catalog, setCatalog] = useState<CatalogPage>()
  const [message, setMessage] = useState(
    oauthResult === 'failed' ? 'YouTube authorization could not be completed.' : '',
  )
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string>()
  const [download, setDownload] = useState('')

  async function load() {
    const response = await fetch(endpoint)
    if (!response.ok) throw new Error('Sign in to manage external videos.')
    setWorkspace(await response.json())
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message))
  }, [])

  async function send<T>(data: object): Promise<T> {
    const csrf = document.cookie
      .split('; ')
      .find((item) => item.startsWith('renegade-member-csrf='))
      ?.split('=')[1]
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-member-csrf': decodeURIComponent(csrf ?? ''),
      },
      body: JSON.stringify(data),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error)
    return result
  }

  async function perform(operation: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await operation()
    } catch (error) {
      setCatalog(undefined)
      setPreview(undefined)
      setMessage((error as Error).message)
      await load().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      {message && <p role="status">{message}</p>}
      {workspace && (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">YouTube channel</h2>
            {workspace.connected ? (
              <>
                <div className="flex flex-wrap gap-4">
                  <button
                    disabled={busy || !workspace.canManage}
                    onClick={() =>
                      void perform(async () => setCatalog(await send({ action: 'catalog' })))
                    }
                  >
                    Load channel videos
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        const result = await send<{ providerRevoked: boolean | null }>({
                          action: 'disconnect',
                        })
                        setCatalog(undefined)
                        setPreview(undefined)
                        await load()
                        setMessage(
                          result.providerRevoked === false
                            ? 'Disconnected locally. Remove Renegade access in Google Account settings.'
                            : 'YouTube disconnected. Stored provider metadata has been cleared.',
                        )
                      })
                    }
                  >
                    Disconnect and clear YouTube data
                  </button>
                </div>
              </>
            ) : workspace.configured ? (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const { authorizationUrl } = await send<{ authorizationUrl: string }>({
                      action: 'connect',
                    })
                    window.location.assign(authorizationUrl)
                  })
                }
              >
                Authorize read-only YouTube access
              </button>
            ) : (
              <p>YouTube authorization is unavailable on this installation.</p>
            )}
            <a href="https://security.google.com/settings/security/permissions" rel="noreferrer">
              Manage access in Google Account settings
            </a>
            {catalog && (
              <>
                <ul className="space-y-2">
                  {catalog.items.map((item) => (
                    <li key={item.externalId} className="flex flex-wrap items-center gap-3">
                      <span>
                        {item.title || `Video ${item.externalId}`} ({item.availability})
                      </span>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await send({
                              action: 'import',
                              externalId: item.externalId,
                              spaceId: spaceId || undefined,
                            })
                            await load()
                            setMessage('Source linked to a video draft.')
                          })
                        }
                      >
                        Import draft
                      </button>
                    </li>
                  ))}
                </ul>
                {catalog.nextPage && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        setCatalog(await send({ action: 'catalog', cursor: catalog.nextPage }))
                      })
                    }
                  >
                    Next page
                  </button>
                )}
              </>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Add an external video</h2>
            {workspace.canManage ? (
              <form
                className="grid max-w-xl gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const form = event.currentTarget
                  const fields = Object.fromEntries(new FormData(form))
                  void perform(async () => {
                    await send({ action: 'manual', spaceId: spaceId || undefined, ...fields })
                    form.reset()
                    await load()
                    setMessage('Source linked to a video draft.')
                  })
                }}
              >
                <label>
                  Source{' '}
                  <select name="provider">
                    <option value="vimeo">Public Vimeo</option>
                    <option value="direct-video">Direct MP4 or WebM</option>
                    <option value="custom-https">Approved HTTPS embed</option>
                  </select>
                </label>
                <label>
                  Title <input name="title" required maxLength={200} />
                </label>
                <label>
                  Video URL <input name="url" type="url" required maxLength={1500} />
                </label>
                <button disabled={busy}>Add to a draft</button>
              </form>
            ) : (
              <p>External provider access is required.</p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Linked videos</h2>
            {workspace.items.length === 0 && <p>No sources linked yet.</p>}
            <ul className="space-y-4">
              {workspace.items.map((item) => (
                <li key={item.id} className="space-y-2 border-b pb-4">
                  <p className="font-semibold">{item.displayTitle}</p>
                  {item.snapshot?.title && item.snapshot.title !== item.displayTitle && (
                    <p>YouTube title ?{item.snapshot.title}?</p>
                  )}
                  <p>
                    {item.provider} · {item.availability} · {item.status}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {item.status === 'draft' ? (
                      <Link href={`/studio?draft=${item.contentId}`}>Edit Renegade draft</Link>
                    ) : item.status === 'published' || item.status === 'updated' ? (
                      <Link href={item.path}>Open video page</Link>
                    ) : null}
                    {item.snapshot?.url && (
                      <button onClick={() => setPreview(preview === item.id ? undefined : item.id)}>
                        {preview === item.id ? 'Close preview' : 'Preview player'}
                      </button>
                    )}
                    {item.provider === 'youtube' && workspace.connected && item.snapshot && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await send({ action: 'sync', id: item.id })
                            await load()
                          })
                        }
                      >
                        Refresh metadata
                      </button>
                    )}
                    {item.snapshot && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await send({ action: 'detach', id: item.id })
                            await load()
                          })
                        }
                      >
                        Detach source
                      </button>
                    )}
                  </div>
                  {preview === item.id && item.snapshot?.url && (
                    <ExternalVideoPlayer
                      provider={item.provider}
                      url={item.snapshot.url}
                      title={item.title}
                    />
                  )}
                  {item.snapshot?.description && (
                    <details>
                      <summary>YouTube description</summary>
                      <p className="whitespace-pre-wrap">{item.snapshot.description}</p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {exports.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Export for manual upload</h2>
          <p>Download your original, then upload it in the destination’s own dashboard.</p>
          <label>
            Owned video{' '}
            <select value={download} onChange={(event) => setDownload(event.target.value)}>
              <option value="">Choose a video</option>
              {exports.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          {download && (
            <a className="block" href={`${endpoint}?download=${encodeURIComponent(download)}`}>
              Download video
            </a>
          )}
        </section>
      )}
    </div>
  )
}
