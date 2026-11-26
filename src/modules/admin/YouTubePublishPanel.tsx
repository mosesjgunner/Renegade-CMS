'use client'

import { useCallback, useEffect, useState } from 'react'

type YouTubeAccount = {
  id: string
  site: string | null
  externalAccountId: string | null
  displayName: string | null
  credentialHealth: string | null
  capabilityState: string | null
  credentialsConfigured: boolean
}

const endpoint = '/api/admin/social/youtube-connect'

const box: React.CSSProperties = {
  marginBottom: '24px',
  padding: '14px 16px',
  backgroundColor: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: '8px',
  fontSize: '13px',
  color: '#7c2d12',
}

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '520px',
  padding: '6px 8px',
  marginTop: '2px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
}

const label: React.CSSProperties = { display: 'block', marginBottom: '8px', fontWeight: 500 }

export default function YouTubePublishPanel() {
  const [accounts, setAccounts] = useState<YouTubeAccount[]>([])
  const [siteId, setSiteId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [mediaAssetId, setMediaAssetId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('private')
  const [madeForKids, setMadeForKids] = useState<'yes' | 'no'>('no')
  const [complianceConfirmed, setComplianceConfirmed] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/social/accounts')
      if (!res.ok) return
      const data = await res.json()
      const yt = (
        (Array.isArray(data.accounts) ? data.accounts : []) as Array<
          YouTubeAccount & { network?: string }
        >
      ).filter((account) => account?.network === 'youtube')
      setAccounts(yt)
      if (yt.length) {
        setSiteId((current) => current || yt[0].site || '')
        setAccountId((current) => current || yt[0].id)
      }
    } catch {
      // The panel reports action results; a failed account load leaves it empty.
    }
  }, [])

  useEffect(() => {
    void load()
    const params = new URLSearchParams(window.location.search)
    const asset = params.get('youtubeAsset')
    const prefillTitle = params.get('youtubeTitle')
    if (asset) setMediaAssetId(asset)
    if (prefillTitle) setTitle(prefillTitle)
    const outcome = params.get('youtube')
    if (outcome === 'connected')
      setMessage('YouTube channel connected for publishing. Review the account state below.')
    if (outcome === 'failed')
      setMessage('YouTube connection could not be completed. No credential was stored.')
  }, [load])

  async function send(body: object) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Request failed.')
    return data
  }

  async function perform(operation: () => Promise<void>) {
    setBusy(true)
    setMessage(null)
    try {
      await operation()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const connected = accounts.filter(
    (account) => account.credentialsConfigured && account.credentialHealth === 'healthy',
  )

  return (
    <div style={box}>
      <div style={{ fontWeight: 600, marginBottom: '6px' }}>YouTube publishing</div>
      <p style={{ margin: '0 0 10px' }}>
        A channel owner connects their own channel with Google sign-in — there is no shared account
        and no password is ever asked for here. Uploads count as published only when YouTube
        confirms processing finished, and YouTube allows <strong>100 uploads per day</strong> on
        this authorization; the daily bucket resets at midnight UTC.
      </p>
      <p style={{ margin: '0 0 10px' }}>
        <strong>Before connecting:</strong> the Google Cloud OAuth app for this installation must be
        published to production status. While it is in “Testing” status, Google expires every
        refresh token after 7 days and the channel will silently need reconnecting each week.
      </p>
      {message && (
        <p role="status" style={{ margin: '0 0 10px', fontWeight: 500 }}>
          {message}
        </p>
      )}

      <div style={{ marginBottom: '14px' }}>
        <span style={label}>Site ID for a new connection</span>
        <input
          style={input}
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
          placeholder="Site ID"
        />
        <button
          disabled={busy || !siteId.trim()}
          onClick={() =>
            void perform(async () => {
              const data = await send({ action: 'start', siteId: siteId.trim() })
              if (!data.uploadsAuthorized)
                setMessage(
                  'Note: this installation has not enabled the YouTube upload authorization flags, so the connection will be stored but uploads stay on manual handoff until an operator enables them.',
                )
              window.location.assign(data.authorizationUrl)
            })
          }
          style={{ marginTop: '8px' }}
        >
          Connect a YouTube channel with Google
        </button>
      </div>

      {connected.length > 0 && (
        <ul style={{ margin: '0 0 14px', paddingLeft: '18px' }}>
          {connected.map((account) => (
            <li key={account.id} style={{ marginBottom: '6px' }}>
              {account.displayName || account.externalAccountId} — {account.capabilityState}
              <button
                disabled={busy}
                style={{ marginLeft: '10px' }}
                onClick={() =>
                  void perform(async () => {
                    const data = await send({ action: 'disconnect', accountId: account.id })
                    await load()
                    setMessage(
                      data.providerRevoked === false
                        ? 'Disconnected locally. Google could not confirm the revocation — remove Renegade access in Google Account settings to be certain.'
                        : 'YouTube disconnected and the grant was revoked at Google.',
                    )
                  })
                }
              >
                Disconnect and revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>Post to YouTube</div>
        <p style={{ margin: '0 0 10px' }}>
          Creates a draft for a finished Studio video. Nothing is uploaded until the draft is
          reviewed, approved and scheduled like any other post — posting is never automatic.
        </p>
        <span style={label}>
          Connected channel
          <select
            style={input}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">Choose a channel</option>
            {connected.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName || account.externalAccountId}
              </option>
            ))}
          </select>
        </span>
        <span style={label}>
          Finished video (media asset ID)
          <input
            style={input}
            value={mediaAssetId}
            onChange={(event) => setMediaAssetId(event.target.value)}
            placeholder="Media asset ID"
          />
        </span>
        <span style={label}>
          Title
          <input
            style={input}
            value={title}
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
          />
        </span>
        <span style={label}>
          Description
          <textarea
            style={input}
            value={description}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </span>
        <span style={label}>
          Privacy
          <select
            style={input}
            value={privacy}
            onChange={(event) => setPrivacy(event.target.value as typeof privacy)}
          >
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
        </span>
        <span style={label}>
          Made for kids
          <select
            style={input}
            value={madeForKids}
            onChange={(event) => setMadeForKids(event.target.value as typeof madeForKids)}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </span>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          <input
            type="checkbox"
            checked={complianceConfirmed}
            onChange={(event) => setComplianceConfirmed(event.target.checked)}
          />{' '}
          I certify I have the rights to this video and it complies with YouTube’s Community
          Guidelines.
        </label>
        <button
          disabled={
            busy || !accountId || !mediaAssetId.trim() || !title.trim() || !complianceConfirmed
          }
          onClick={() =>
            void perform(async () => {
              const account = accounts.find((entry) => entry.id === accountId)
              const data = await send({
                action: 'create-post-draft',
                siteId: account?.site || siteId.trim(),
                accountId,
                mediaAssetId: mediaAssetId.trim(),
                title: title.trim(),
                description,
                privacy,
                madeForKids,
                complianceConfirmed,
              })
              setMessage(
                `Draft created (ID: ${data.draftId}). Review and approve it above, then schedule it — approval is what authorizes the upload.`,
              )
            })
          }
        >
          Create YouTube post draft
        </button>
      </div>
    </div>
  )
}
