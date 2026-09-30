'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { resolvePublicUrl } from '../public/semantic-url'

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}

export function ForumThreadComposer({
  siteId,
  forumId,
  forumSlug,
}: {
  siteId: string
  forumId: string
  forumSlug: string
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSubmitting(true)
    setStatus('Creating topic…')

    try {
      const res = await fetch('/api/community/threads', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeader() },
        body: JSON.stringify({
          siteId,
          forumId,
          title: title.trim(),
          body: body.trim(),
          visibility: 'public',
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus(data.error ?? 'Could not create topic.')
        setSubmitting(false)
        return
      }

      setStatus('Topic created! Opening…')
      const targetPath =
        data.discussion?.canonicalPath ?? resolvePublicUrl({ kind: 'forum', slug: forumSlug })
      router.push(targetPath)
      router.refresh()
    } catch {
      setStatus('Network error occurred. Please try again.')
      setSubmitting(false)
    }
  }

  if (!isOpen) {
    return (
      <div className="my-6">
        <button className="btn btn-primary" type="button" onClick={() => setIsOpen(true)}>
          + New Topic
        </button>
      </div>
    )
  }

  return (
    <div className="my-6 p-6 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Start a new discussion topic</h3>
        <button
          className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
          type="button"
          onClick={() => setIsOpen(false)}
        >
          Cancel
        </button>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label className="block text-sm font-medium">
          Topic Title
          <input
            className="form-input block w-full mt-1"
            placeholder="What would you like to discuss?"
            required
            maxLength={180}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Content
          <textarea
            className="form-input block w-full mt-1"
            rows={5}
            placeholder="Share your thoughts, ask questions, or provide context…"
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className="flex items-center justify-between pt-2">
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating topic…' : 'Publish Topic'}
          </button>
          {status ? (
            <span role="status" className="text-sm text-stone-600 dark:text-stone-300">
              {status}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  )
}
