'use client'

import { useEffect, useState } from 'react'

type Edge = { kind: 'follow' | 'block' | 'mute'; targetMemberId: string; siteId: string }

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}

export function MemberRelationshipList({ siteId }: { siteId: string }) {
  const [edges, setEdges] = useState<Edge[]>([])
  const [message, setMessage] = useState('')
  useEffect(() => {
    void fetch(`/api/community/relationships?siteId=${encodeURIComponent(siteId)}`).then(
      async (response) => {
        if (response.ok) setEdges((await response.json()).relationships)
      },
    )
  }, [siteId])
  async function remove(edge: Edge) {
    const response = await fetch('/api/community/relationships', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({ ...edge, siteId, kind: edge.kind }),
    })
    if (response.ok) setEdges((current) => current.filter((item) => item !== edge))
    else setMessage('Could not remove relationship.')
  }
  return (
    <section className="mt-8" aria-label="My relationships">
      <h2 className="text-xl font-semibold">Following, muted and blocked members</h2>
      {edges.length ? (
        <ul className="mt-3 grid gap-2">
          {edges.map((edge, index) => (
            <li
              key={`${edge.kind}:${edge.targetMemberId}:${index}`}
              className="flex items-center gap-3"
            >
              <span>
                {edge.kind}: {edge.targetMemberId}
              </span>
              <button type="button" className="btn" onClick={() => void remove(edge)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2">No active relationships.</p>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  )
}
