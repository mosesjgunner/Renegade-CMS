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
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')

  async function submitReport(e: React.FormEvent) {
    e.preventDefault()
    if (!reportReason) return
    const res = await fetch('/api/community/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({
        siteId,
        targetType: 'member_profile',
        targetId: targetMemberId,
        reason: reportReason,
        details: reportDetails,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      setMessage('Report submitted to moderators.')
      setShowReport(false)
      setReportReason('')
      setReportDetails('')
    } else {
      setMessage(body.error ?? 'Could not submit report.')
    }
  }
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
        <a
          href={`/messages?targetMemberId=${encodeURIComponent(targetMemberId)}`}
          className="btn"
        >
          Send Message
        </a>
        <button
          className="btn text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
          type="button"
          onClick={() => setShowReport(!showReport)}
        >
          {showReport ? 'Cancel Report' : 'Report Member'}
        </button>
      </div>
      {showReport ? (
        <form onSubmit={submitReport} className="mt-4 p-4 border rounded space-y-3 bg-stone-50 dark:bg-stone-900">
          <h3 className="font-semibold text-sm">Report this member</h3>
          <label className="block text-sm">
            Reason
            <select
              className="form-input block w-full mt-1"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              required
            >
              <option value="">Select reason…</option>
              <option value="spam">Spam / Advertising</option>
              <option value="harassment">Harassment or abuse</option>
              <option value="impersonation">Impersonation</option>
              <option value="inappropriate">Inappropriate profile content</option>
              <option value="other">Other policy violation</option>
            </select>
          </label>
          <label className="block text-sm">
            Details (optional)
            <textarea
              className="form-input block w-full mt-1"
              rows={2}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Provide additional context for moderators…"
            />
          </label>
          <button className="btn btn-danger text-sm" type="submit">
            Submit Report
          </button>
        </form>
      ) : null}
      {message ? (
        <p role="status" className="mt-2">
          {message}
        </p>
      ) : null}
    </section>
  )
}
