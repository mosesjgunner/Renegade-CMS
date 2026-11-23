'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { captureRequest } from '@/modules/creator-studio/capture-sync'

export default function GoLivePage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const room = await captureRequest<{ id: string }>('/api/creator-studio/live-room', 'POST', {
        action: 'create',
        mode: 'theater',
        title: values.get('title'),
        accessPolicy: values.get('audience'),
      })
      router.push('/rooms/' + encodeURIComponent(room.id))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not open the live room.')
      setBusy(false)
    }
  }
  const field = 'block w-full rounded border p-2'
  return (
    <main className="mx-auto max-w-xl space-y-5 p-4 sm:p-6">
      <h1 className="text-3xl font-bold">Go Live</h1>
      <p>Open your room to check your camera and microphone before you start broadcasting.</p>
      <form onSubmit={create}>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">
            Room name
            <input className={field} required maxLength={120} name="title" />
          </label>
          <label className="block">
            Who can watch?
            <select className={field} name="audience" defaultValue="members">
              <option value="members">Site members</option>
              <option value="public">Everyone</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit">
            {busy ? 'Opening room…' : 'Open live room'}
          </button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
