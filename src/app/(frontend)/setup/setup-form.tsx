'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'

type RegistrationOptions = Omit<
  PublicKeyCredentialCreationOptions,
  'challenge' | 'excludeCredentials' | 'user'
> & {
  challenge: string
  user: PublicKeyCredentialUserEntity & { id: string }
  excludeCredentials?: { id: string; transports?: AuthenticatorTransport[]; type: 'public-key' }[]
}

export function SetupForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string>()
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      if (!window.PublicKeyCredential) throw new Error('This browser cannot enroll a passkey.')
      const optionsResponse = await fetch('/api/setup/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, token }),
      })
      const optionsBody = await readJson(optionsResponse)
      if (!optionsResponse.ok)
        throw new Error(optionsBody.error ?? 'Could not start passkey enrollment.')
      const credential = await navigator.credentials.create({
        publicKey: decodeOptions(optionsBody.options as RegistrationOptions),
      })
      if (!credential) throw new Error('Passkey enrollment was cancelled.')

      const completeResponse = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ credential: serializeCredential(credential), name, slug, token }),
      })
      const completeBody = await readJson(completeResponse)
      if (!completeResponse.ok)
        throw new Error(completeBody.error ?? 'Setup could not be completed.')
      setRecoveryCodes(completeBody.recoveryCodes)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Setup could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  if (recoveryCodes) {
    return (
      <main className="max-w-lg mx-auto px-4 py-16 sm:py-24">
        <div className="surface-card p-8 sm:p-10 space-y-6 shadow-xl border-emerald-300 dark:border-emerald-800/80">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-2xl mx-auto">
              🔑
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-950 dark:text-stone-50 font-display">
              Save Emergency Recovery Codes
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
              Store these offline in a secure password manager. They allow recovery if your passkey
              device is lost.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-2">
            <ul className="grid grid-cols-2 gap-2 font-mono text-xs text-stone-900 dark:text-stone-100">
              {recoveryCodes.map((code) => (
                <li
                  key={code}
                  className="p-2 rounded bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-center font-bold tracking-wider"
                >
                  {code}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-stone-500 text-center">
            Setup is complete and cannot be reopened from the browser.
          </p>

          <div className="pt-2">
            <Link href="/admin" className="btn btn-primary text-xs w-full py-3">
              Go to Admin Studio &rarr;
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-16 sm:py-24">
      <div className="surface-card p-8 sm:p-10 space-y-6 shadow-xl">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 flex items-center justify-center text-2xl mx-auto">
            🚀
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-950 dark:text-stone-50 font-display">
            Install Renegade CMS
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Initialize your autonomous publication node with owner credentials and hardware passkey.
          </p>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="form-label" htmlFor="bootstrap-token">
              Bootstrap Token
            </label>
            <input
              id="bootstrap-token"
              className="form-input text-sm font-mono"
              required
              placeholder="Issued during initial startup"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="owner-email">
              Owner Email Address
            </label>
            <input
              id="owner-email"
              className="form-input text-sm"
              required
              type="email"
              placeholder="admin@example.org"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="site-name">
              Publication Name
            </label>
            <input
              id="site-name"
              className="form-input text-sm"
              required
              placeholder="e.g. The Renegade Journal"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="site-slug">
              Site Slug
            </label>
            <input
              id="site-slug"
              className="form-input text-sm font-mono"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="renegade-journal"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300"
            >
              ⚠️ {error}
            </div>
          ) : null}

          <button className="btn btn-primary text-xs w-full py-3" disabled={busy} type="submit">
            {busy ? 'Enrolling Hardware Passkey...' : '🛡️ Enroll Passkey & Create Publication'}
          </button>
        </form>
      </div>
    </main>
  )
}

async function readJson(
  response: Response,
): Promise<{ error?: string; options?: RegistrationOptions; recoveryCodes?: string[] }> {
  return response.json() as Promise<{
    error?: string
    options?: RegistrationOptions
    recoveryCodes?: string[]
  }>
}

function decodeOptions(options: RegistrationOptions): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: fromBase64Url(options.challenge),
    user: { ...options.user, id: fromBase64Url(options.user.id) },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      ...credential,
      id: fromBase64Url(credential.id),
    })),
  }
}

function serializeCredential(credential: Credential): Record<string, unknown> {
  const publicKeyCredential = credential as PublicKeyCredential
  const response = publicKeyCredential.response as AuthenticatorAttestationResponse
  return {
    id: publicKeyCredential.id,
    rawId: toBase64Url(publicKeyCredential.rawId),
    type: publicKeyCredential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      attestationObject: toBase64Url(response.attestationObject),
      transports: response.getTransports?.(),
    },
    clientExtensionResults: publicKeyCredential.getClientExtensionResults(),
  }
}

function fromBase64Url(value: string): ArrayBuffer {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = window.atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer
}

function toBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
