'use client'

import { FormEvent, useState } from 'react'

type Entry = {
  id: string
  handle: string
  displayName: string
  bio?: string
  avatarUrl?: string
  avatarAlt?: string
}

export function MemberDirectory({ siteId }: { siteId: string }) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [message, setMessage] = useState('Search by handle or display name.')
  async function search(event?: FormEvent<HTMLFormElement>, nextPage = 1) {
    event?.preventDefault()
    const params = new URLSearchParams({ siteId, q: query.trim(), page: String(nextPage) })
    const response = await fetch(`/api/community/directory?${params}`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(data.error ?? 'Directory unavailable.')
      return
    }
    setEntries(data.profiles ?? [])
    setPage(nextPage)
    setHasNext(data.hasNextPage === true)
    setMessage(data.profiles?.length ? '' : 'No listed members found.')
  }
  return (
    <section className="mt-6">
      <form onSubmit={(event) => void search(event)} className="flex gap-2">
        <label className="flex-1">
          Search members
          <input
            className="form-input mt-1 w-full"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            minLength={2}
            maxLength={60}
          />
        </label>
        <button className="btn btn-primary self-end" type="submit">
          Search
        </button>
      </form>
      {message ? (
        <p role="status" className="mt-4">
          {message}
        </p>
      ) : null}
      <ul className="mt-6 grid gap-4">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded border p-4">
            <a className="font-semibold underline" href={`/members/${entry.handle}`}>
              {entry.displayName}
            </a>
            {entry.bio ? <p className="mt-1 line-clamp-2">{entry.bio}</p> : null}
          </li>
        ))}
      </ul>
      {page > 1 || hasNext ? (
        <nav className="mt-5 flex gap-2" aria-label="Directory pages">
          <button
            className="btn"
            disabled={page <= 1}
            onClick={() => void search(undefined, page - 1)}
          >
            Previous
          </button>
          <button
            className="btn"
            disabled={!hasNext}
            onClick={() => void search(undefined, page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  )
}
