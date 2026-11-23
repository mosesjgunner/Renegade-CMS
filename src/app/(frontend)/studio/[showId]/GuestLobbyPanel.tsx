'use client'

/**
 * POD-10 host lobby panel: issue invites, watch lobby state, admit
 * (consent gate + bound enforced server-side), drop, revoke. Per-guest
 * fader/mute ride the POD-07 mixer strips in the mixer section (the
 * admitted guest's strip appears there once admission mirrors it into
 * the session doc). Functional-minimal; the proven layer is the API.
 */
import { useCallback, useEffect, useState } from 'react'

import { HostStage } from './HostStage'

type InviteView = {
  id: string
  state: string
  displayName: string | null
  guestId: string | null
  stripId: string
  expiresAt: string | null
  dropReason: string | null
}

export function GuestLobbyPanel({ sessionRecordId }: { sessionRecordId: string }) {
  const [invites, setInvites] = useState<InviteView[]>([])
  const [guestId, setGuestId] = useState('')
  const [issuedLink, setIssuedLink] = useState('')
  const [status, setStatus] = useState('')

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/podcast-studio/guests/invites?sessionRecordId=${encodeURIComponent(sessionRecordId)}`,
    ).catch(() => null)
    if (res?.ok) {
      const body = (await res.json()) as { invites: InviteView[] }
      setInvites(body.invites)
    }
  }, [sessionRecordId])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 5_000)
    return () => clearInterval(timer)
  }, [refresh])

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string; warnings?: string[] }
    setStatus(
      res.ok
        ? data.warnings?.join(' ') || 'Done.'
        : (data.error ?? `Request failed (${res.status}).`),
    )
    return res.ok
  }

  const issue = async () => {
    const res = await fetch('/api/podcast-studio/guests/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionRecordId, guestId: guestId.trim() || undefined }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      joinPath?: string
    }
    if (res.ok && data.joinPath) {
      setIssuedLink(`${window.location.origin}${data.joinPath}`)
      setStatus('Invite issued — send the link to your guest. It is shown once.')
    } else {
      setStatus(data.error ?? `Request failed (${res.status}).`)
    }
    void refresh()
  }

  return (
    <section className="surface-card p-5 space-y-3" aria-label="Guest lobby">
      <h2 className="text-lg font-bold">Guest lobby (host + up to 3 remote guests)</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          className="border rounded px-2 py-1"
          placeholder="Guest-book guest id (optional)"
          value={guestId}
          onChange={(event) => setGuestId(event.target.value)}
          aria-label="Guest-book guest id"
        />
        <button type="button" className="btn btn-primary" onClick={() => void issue()}>
          Issue invite
        </button>
        {status && <span role="status">{status}</span>}
      </div>
      {issuedLink && (
        <p className="text-sm break-all">
          Guest link: <code>{issuedLink}</code>
        </p>
      )}
      {invites.length === 0 && <p className="text-sm">No invites for this session yet.</p>}
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="border rounded p-3 text-sm flex flex-wrap gap-3 items-center"
        >
          <span className="font-medium">{invite.displayName ?? '(not joined)'}</span>
          <span>State: {invite.state}</span>
          <span>Strip: {invite.stripId}</span>
          {invite.dropReason && <span>Dropped: {invite.dropReason}</span>}
          {invite.state === 'waiting' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                void post('/api/podcast-studio/guests/admit', { inviteId: invite.id }).then(() =>
                  refresh(),
                )
              }
            >
              Admit
            </button>
          )}
          {(invite.state === 'waiting' || invite.state === 'admitted') && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                void post('/api/podcast-studio/guests/drop', { inviteId: invite.id }).then(() =>
                  refresh(),
                )
              }
            >
              {invite.state === 'admitted' ? 'Kick guest' : 'Decline guest'}
            </button>
          )}
          {invite.state !== 'dropped' && invite.state !== 'left' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                void post('/api/podcast-studio/guests/invites/revoke', {
                  inviteId: invite.id,
                }).then(() => refresh())
              }
            >
              Revoke
            </button>
          )}
        </div>
      ))}
      <HostStage key={sessionRecordId} sessionId={sessionRecordId} guests={invites} />
    </section>
  )
}
