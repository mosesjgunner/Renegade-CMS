'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import StaffInvitations from './StaffInvitations'

type Passkey = {
  credential_id: string
  name: string
  created_at: string
  last_used_at: string | null
}

export default function SecurityCenter() {
  const router = useRouter()
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [rotatedCodes, setRotatedCodes] = useState<string[]>()
  const [rotating, setRotating] = useState(false)
  const [codesCopied, setCodesCopied] = useState(false)
  const load = async () => {
    const response = await fetch('/api/auth/passkeys', { credentials: 'same-origin' })
    const body = (await response.json()) as Passkey[] | { error?: string }
    if (!response.ok || !Array.isArray(body))
      throw new Error((body as { error?: string }).error ?? 'Could not load passkeys.')
    setPasskeys(body)
  }
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void load().catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load passkeys.')
      })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [])

  async function addPasskey() {
    setBusy(true)
    setError(undefined)
    try {
      if (!window.PublicKeyCredential) throw new Error('This browser cannot enroll a passkey.')
      const start = await fetch('/api/auth/passkeys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'options' }),
      })
      const startBody = (await start.json()) as {
        options?: Record<string, unknown>
        error?: string
      }
      if (!start.ok || !startBody.options)
        throw new Error(startBody.error ?? 'Could not start passkey enrollment.')
      const credential = await navigator.credentials.create({
        publicKey: decodeOptions(startBody.options),
      })
      if (!credential) throw new Error('Passkey enrollment was cancelled.')
      const complete = await fetch('/api/auth/passkeys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'complete',
          name,
          credential: serializeCredential(credential),
        }),
      })
      if (!complete.ok)
        throw new Error(
          ((await complete.json()) as { error?: string }).error ?? 'Could not save passkey.',
        )
      setName('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add passkey.')
    } finally {
      setBusy(false)
    }
  }
  async function remove(credentialId: string) {
    if (!window.confirm('Remove this passkey? You cannot sign in with it again.')) return
    try {
      const response = await fetch('/api/auth/passkeys', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ credentialId }),
      })
      if (!response.ok)
        throw new Error(
          ((await response.json()) as { error?: string }).error ?? 'Could not remove passkey.',
        )
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove passkey.')
    }
  }
  async function rotateRecoveryCodes() {
    if (
      !window.confirm(
        'Generate a new set of recovery codes? Your current unused codes stop working immediately, and other signed-in sessions are signed out. This session stays signed in.',
      )
    )
      return
    setRotating(true)
    setError(undefined)
    try {
      const response = await fetch('/api/auth/recovery/rotate', {
        method: 'POST',
        credentials: 'same-origin',
      })
      const body = (await response.json()) as { recoveryCodes?: string[]; error?: string }
      if (!response.ok || !body.recoveryCodes)
        throw new Error(body.error ?? 'Could not generate new recovery codes.')
      setRotatedCodes(body.recoveryCodes)
      setCodesCopied(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate new recovery codes.')
    } finally {
      setRotating(false)
    }
  }
  async function copyRotatedCodes() {
    if (!rotatedCodes) return
    try {
      await navigator.clipboard.writeText(rotatedCodes.join('\n'))
      setCodesCopied(true)
    } catch {
      setCodesCopied(false)
    }
  }
  function downloadRotatedCodes() {
    if (!rotatedCodes) return
    const blob = new Blob(
      [
        'Renegade CMoS emergency recovery codes\n',
        'Each code signs you in once if you lose your passkey device.\n',
        'Store this file in your password manager. Treat it like a password.\n\n',
        rotatedCodes.join('\n'),
        '\n',
      ],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'renegade-recovery-codes.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    router.push('/login')
  }
  return (
    <main className="gutter--left gutter--right" style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1>Security</h1>
      <p>
        Use at least two passkeys or retain your offline recovery codes before removing a device.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <section>
        <h2>Your passkeys</h2>
        {passkeys.length ? (
          <ul>
            {passkeys.map((passkey) => (
              <li key={passkey.credential_id}>
                <strong>{passkey.name}</strong> — added{' '}
                {new Date(passkey.created_at).toLocaleDateString()}{' '}
                {passkey.last_used_at
                  ? `— last used ${new Date(passkey.last_used_at).toLocaleDateString()}`
                  : ''}{' '}
                <button type="button" onClick={() => void remove(passkey.credential_id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No passkeys found. Sign out and use local installation recovery.</p>
        )}
      </section>
      <section style={{ marginTop: 28 }}>
        <h2>Add a passkey</h2>
        <label htmlFor="passkey-name">Name (optional)</label>
        <input
          id="passkey-name"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="Work laptop"
        />
        <button type="button" onClick={() => void addPasskey()} disabled={busy}>
          {busy ? 'Waiting for passkey…' : 'Add passkey'}
        </button>
      </section>
      <section style={{ marginTop: 28 }}>
        <h2>Recovery codes</h2>
        <p>
          Recovery codes are the fallback if you lose every passkey device. If you lost the set
          shown at setup — or never saved it — generate a fresh set here. The old unused codes stop
          working immediately, other signed-in sessions are signed out, and the new codes are shown
          only once.
        </p>
        <button type="button" onClick={() => void rotateRecoveryCodes()} disabled={rotating}>
          {rotating ? 'Generating…' : 'Generate new recovery codes'}
        </button>
        {rotatedCodes ? (
          <div style={{ marginTop: 16 }}>
            <p role="status">
              <strong>Save these codes now.</strong> They will not be shown again.
            </p>
            <ul
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                fontFamily: 'monospace',
                listStyle: 'none',
                padding: 0,
              }}
            >
              {rotatedCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <button type="button" onClick={() => void copyRotatedCodes()}>
              {codesCopied ? 'Copied ✓' : 'Copy all codes'}
            </button>{' '}
            <button type="button" onClick={downloadRotatedCodes}>
              Download as file
            </button>
          </div>
        ) : null}
      </section>
      <StaffInvitations />
      <section style={{ marginTop: 28 }}>
        <h2>Session</h2>
        <button type="button" onClick={() => void logout()}>
          Sign out
        </button>
      </section>
    </main>
  )
}

function decodeOptions(options: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: bytes(String(options.challenge)),
    user: {
      ...(options.user as Record<string, unknown>),
      id: bytes(String((options.user as Record<string, unknown>).id)),
    },
    excludeCredentials: Array.isArray(options.excludeCredentials)
      ? options.excludeCredentials.map((item) => ({
          ...(item as Record<string, unknown>),
          id: bytes(String((item as Record<string, unknown>).id)),
        }))
      : undefined,
  } as PublicKeyCredentialCreationOptions
}
function serializeCredential(credential: Credential): Record<string, unknown> {
  const value = credential as PublicKeyCredential
  const response = value.response as AuthenticatorAttestationResponse
  return {
    id: value.id,
    rawId: text(value.rawId),
    type: value.type,
    response: {
      clientDataJSON: text(response.clientDataJSON),
      attestationObject: text(response.attestationObject),
      transports: response.getTransports?.(),
    },
    clientExtensionResults: value.getClientExtensionResults(),
  }
}
function bytes(value: string): ArrayBuffer {
  return Uint8Array.from(
    window.atob(
      value
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '='),
    ),
    (character) => character.charCodeAt(0),
  ).buffer
}
function text(value: ArrayBuffer): string {
  return window
    .btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
