'use client'

import { useEffect, useState, type FormEvent } from 'react'

type Invitation = { enrollmentUrl: string; enrollmentToken: string; expiresAt: string }

export default function StaffInvitations() {
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([])
  const [siteId, setSiteId] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [invitation, setInvitation] = useState<Invitation>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [owner, setOwner] = useState(false)

  useEffect(() => {
    let active = true
    void fetch('/api/admin/staff/invite')
      .then(async (response) => {
        if (response.status === 403 || !active) return
        if (!response.ok) throw new Error('Could not load invitation sites.')
        const body = (await response.json()) as { sites: Array<{ id: string; name: string }> }
        if (active) {
          setOwner(true)
          setSites(body.sites)
          setSiteId(body.sites[0]?.id ?? '')
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load invitations.')
      })
    return () => {
      active = false
    }
  }, [])

  async function invite(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setInvitation(undefined)
    try {
      const response = await fetch('/api/admin/staff/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role, siteId }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not create invitation.')
      setInvitation(body)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create invitation.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!invitation) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/staff/invite', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: invitation.enrollmentToken }),
      })
      if (!response.ok)
        throw new Error((await response.json()).error ?? 'Could not revoke invitation.')
      setInvitation(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke invitation.')
    } finally {
      setBusy(false)
    }
  }

  if (!owner) return error ? <p role="alert">{error}</p> : null
  return (
    <section style={{ marginTop: 28 }}>
      <h2>Invite staff</h2>
      <p>Create a one-use passkey invitation. Send the private link to the intended colleague.</p>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={(event) => void invite(event)}>
        <label htmlFor="staff-email">Staff email</label>
        <input
          id="staff-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="staff-role">Staff role</label>
        <select id="staff-role" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="staff">Staff</option>
          <option value="administrator">Administrator</option>
        </select>
        <label htmlFor="staff-site">Staff site</label>
        <select
          id="staff-site"
          required
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy || !siteId}>
          {busy ? 'Creating invitation…' : 'Create staff invitation'}
        </button>
      </form>
      {invitation && (
        <div role="status">
          <p>Invitation expires {new Date(invitation.expiresAt).toLocaleString()}.</p>
          <label htmlFor="staff-invitation-link">Private enrollment link</label>
          <input
            id="staff-invitation-link"
            readOnly
            value={invitation.enrollmentUrl}
            onFocus={(event) => event.target.select()}
          />
          <button type="button" disabled={busy} onClick={() => void revoke()}>
            Revoke invitation
          </button>
        </div>
      )}
    </section>
  )
}
