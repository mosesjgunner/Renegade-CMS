'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}

export function ProfileRelationshipActions({
  siteId,
  targetMemberId,
}: {
  siteId: string
  targetMemberId: string
}) {
  const [message, setMessage] = useState('')
  const router = useRouter()
  const [state, setState] = useState({ following: false, muted: false, blocked: false })
  useEffect(() => {
    const query = new URLSearchParams({ siteId, targetMemberId })
    void fetch(`/api/community/relationships?${query}`).then(async (response) => {
      if (response.ok) setState(await response.json())
    })
  }, [siteId, targetMemberId])
  async function update(kind: 'follow' | 'block' | 'mute', active: boolean) {
    const response = await fetch('/api/community/relationships', {
      method: active ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({ siteId, targetMemberId, kind }),
    })
    const result = await response.json().catch(() => ({}))
    if (response.ok)
      setState((current) => ({
        ...current,
        [kind === 'follow' ? 'following' : kind === 'mute' ? 'muted' : 'blocked']: active,
        ...(kind === 'block' && active ? { following: false } : {}),
      }))
    if (response.ok && kind === 'block' && active) router.refresh()
    setMessage(
      response.ok
        ? `${kind === 'follow' ? 'Follow' : kind === 'block' ? 'Block' : 'Mute'} ${active ? 'enabled' : 'removed'}.`
        : (result.error ?? 'Could not update relationship.'),
    )
  }
  return (
    <section className="mt-6" aria-label="Member relationship controls">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn"
          type="button"
          onClick={() => void update('follow', !state.following)}
        >
          {state.following ? 'Unfollow' : 'Follow'}
        </button>
        <button className="btn" type="button" onClick={() => void update('mute', !state.muted)}>
          {state.muted ? 'Unmute' : 'Mute'}
        </button>
        <button className="btn" type="button" onClick={() => void update('block', !state.blocked)}>
          {state.blocked ? 'Unblock' : 'Block'}
        </button>
      </div>
      {message ? (
        <p role="status" className="mt-2">
          {message}
        </p>
      ) : null}
    </section>
  )
}
