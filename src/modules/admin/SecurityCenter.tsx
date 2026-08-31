'use client'

import { useEffect, useState } from 'react'

type Passkey = { credential_id: string; name: string; created_at: string; last_used_at: string | null }

export default function SecurityCenter() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const response = await fetch('/api/auth/passkeys', { credentials: 'same-origin' })
    const body = (await response.json()) as Passkey[] | { error?: string }
    if (!response.ok || !Array.isArray(body)) throw new Error((body as { error?: string }).error ?? 'Could not load passkeys.')
    setPasskeys(body)
  }
  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load passkeys.')) }, [])

  async function addPasskey() {
    setBusy(true); setError(undefined)
    try {
      if (!window.PublicKeyCredential) throw new Error('This browser cannot enroll a passkey.')
      const start = await fetch('/api/auth/passkeys', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'options' }) })
      const startBody = (await start.json()) as { options?: Record<string, unknown>; error?: string }
      if (!start.ok || !startBody.options) throw new Error(startBody.error ?? 'Could not start passkey enrollment.')
      const credential = await navigator.credentials.create({ publicKey: decodeOptions(startBody.options) })
      if (!credential) throw new Error('Passkey enrollment was cancelled.')
      const complete = await fetch('/api/auth/passkeys', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'complete', name, credential: serializeCredential(credential) }) })
      if (!complete.ok) throw new Error(((await complete.json()) as { error?: string }).error ?? 'Could not save passkey.')
      setName(''); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add passkey.') } finally { setBusy(false) }
  }
  async function remove(credentialId: string) {
    if (!window.confirm('Remove this passkey? You cannot sign in with it again.')) return
    try {
      const response = await fetch('/api/auth/passkeys', { method: 'DELETE', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ credentialId }) })
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? 'Could not remove passkey.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove passkey.') }
  }
  async function logout() { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); window.location.assign('/login') }
  return <main className="gutter--left gutter--right" style={{ maxWidth: 760, margin: '0 auto' }}>
    <h1>Security</h1><p>Use at least two passkeys or retain your offline recovery codes before removing a device.</p>
    {error ? <p role="alert">{error}</p> : null}
    <section><h2>Your passkeys</h2>{passkeys.length ? <ul>{passkeys.map((passkey) => <li key={passkey.credential_id}><strong>{passkey.name}</strong> — added {new Date(passkey.created_at).toLocaleDateString()} {passkey.last_used_at ? `— last used ${new Date(passkey.last_used_at).toLocaleDateString()}` : ''} <button type="button" onClick={() => void remove(passkey.credential_id)}>Remove</button></li>)}</ul> : <p>No passkeys found. Sign out and use local installation recovery.</p>}</section>
    <section style={{ marginTop: 28 }}><h2>Add a passkey</h2><label htmlFor="passkey-name">Name (optional)</label><input id="passkey-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Work laptop" /><button type="button" onClick={() => void addPasskey()} disabled={busy}>{busy ? 'Waiting for passkey…' : 'Add passkey'}</button></section>
    <section style={{ marginTop: 28 }}><h2>Session</h2><button type="button" onClick={() => void logout()}>Sign out</button></section>
  </main>
}

function decodeOptions(options: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  return { ...options, challenge: bytes(String(options.challenge)), user: { ...(options.user as Record<string, unknown>), id: bytes(String((options.user as Record<string, unknown>).id)) }, excludeCredentials: Array.isArray(options.excludeCredentials) ? options.excludeCredentials.map((item) => ({ ...(item as Record<string, unknown>), id: bytes(String((item as Record<string, unknown>).id)) })) : undefined } as PublicKeyCredentialCreationOptions
}
function serializeCredential(credential: Credential): Record<string, unknown> { const value = credential as PublicKeyCredential; const response = value.response as AuthenticatorAttestationResponse; return { id: value.id, rawId: text(value.rawId), type: value.type, response: { clientDataJSON: text(response.clientDataJSON), attestationObject: text(response.attestationObject), transports: response.getTransports?.() }, clientExtensionResults: value.getClientExtensionResults() } }
function bytes(value: string): ArrayBuffer { return Uint8Array.from(window.atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), (character) => character.charCodeAt(0)).buffer }
function text(value: ArrayBuffer): string { return window.btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
