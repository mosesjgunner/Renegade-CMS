'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const optionsResponse = await fetch('/api/auth/passkey/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const optionsBody = (await optionsResponse.json()) as {
        error?: string
        options?: Record<string, unknown>
      }
      if (!optionsResponse.ok || !optionsBody.options)
        throw new Error(optionsBody.error ?? 'Could not start sign-in.')
      const credential = await navigator.credentials.get({
        publicKey: decodeOptions(optionsBody.options),
      })
      if (!credential) throw new Error('Passkey sign-in was cancelled.')
      const completeResponse = await fetch('/api/auth/passkey/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(serializeCredential(credential)),
      })
      if (!completeResponse.ok) {
        const body = (await completeResponse.json()) as { error?: string }
        throw new Error(body.error ?? 'Passkey sign-in failed.')
      }
      router.push('/admin')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Passkey sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 py-16 sm:py-24">
      <div className="surface-card p-8 sm:p-10 space-y-6 shadow-xl">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 flex items-center justify-center text-2xl mx-auto">
            🔐
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-950 dark:text-stone-50 font-display">
            Passkey Sign-in
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Sign in securely using Touch ID, Face ID, Windows Hello, or a security key.
          </p>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="form-label" htmlFor="email-input">
              Owner / Staff Email
            </label>
            <input
              id="email-input"
              className="form-input text-sm"
              required
              type="email"
              placeholder="owner@example.org"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
            {busy ? 'Verifying passkey hardware...' : '🔑 Authenticate with Passkey'}
          </button>
        </form>

        <div className="pt-4 border-t border-stone-100 dark:border-stone-800 text-center text-xs text-stone-500">
          First time setting up this instance?{' '}
          <Link
            href="/setup"
            className="font-semibold text-red-600 dark:text-red-400 hover:underline"
          >
            Complete Setup &rarr;
          </Link>
        </div>
      </div>
    </main>
  )
}

function decodeOptions(options: Record<string, unknown>): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: fromBase64Url(String(options.challenge)),
    allowCredentials: Array.isArray(options.allowCredentials)
      ? options.allowCredentials.map((credential) => ({
          ...(credential as Record<string, unknown>),
          id: fromBase64Url(String((credential as Record<string, unknown>).id)),
        }))
      : undefined,
  } as PublicKeyCredentialRequestOptions
}

function serializeCredential(credential: Credential): Record<string, unknown> {
  const publicKeyCredential = credential as PublicKeyCredential
  const response = publicKeyCredential.response as AuthenticatorAssertionResponse
  return {
    id: publicKeyCredential.id,
    rawId: toBase64Url(publicKeyCredential.rawId),
    type: publicKeyCredential.type,
    response: {
      authenticatorData: toBase64Url(response.authenticatorData),
      clientDataJSON: toBase64Url(response.clientDataJSON),
      signature: toBase64Url(response.signature),
      userHandle: response.userHandle ? toBase64Url(response.userHandle) : undefined,
    },
    clientExtensionResults: publicKeyCredential.getClientExtensionResults(),
  }
}

function fromBase64Url(value: string): ArrayBuffer {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0)).buffer
}

function toBase64Url(value: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte)
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
