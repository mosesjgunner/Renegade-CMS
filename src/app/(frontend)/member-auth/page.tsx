'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getMemberPasskey } from '@/modules/identity/member-passkey-browser'

/** Public member entry point. It never reads or writes Payload admin credentials. */
export default function MemberAuthPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [message, setMessage] = useState('')
  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The form is noValidate: validation errors are owned here so they are
    // exposed programmatically (aria-invalid + aria-describedby + alert),
    // not only as a native browser bubble (UXI-12/UXI-13).
    const value = email.trim()
    if (!value) {
      setEmailError('Enter your email address.')
      document.getElementById('member-auth-email')?.focus()
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError('Enter a valid email address, like name@example.com.')
      document.getElementById('member-auth-email')?.focus()
      return
    }
    setEmailError('')
    const response = await fetch('/api/member-auth/magic-link/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: value }),
    })
    const body = await response.json().catch(() => ({}))
    setMessage(body.status ?? body.error ?? 'Could not request a sign-in link.')
  }
  async function signInWithPasskey() {
    if (!window.PublicKeyCredential)
      return setMessage('Passkeys are not supported by this browser.')
    try {
      const optionsResponse = await fetch('/api/member-auth/passkey/login/options', {
        method: 'POST',
      })
      const optionsBody = await optionsResponse.json()
      if (!optionsResponse.ok)
        return setMessage(optionsBody.error ?? 'Could not start passkey sign-in.')
      const credential = await getMemberPasskey(optionsBody.options)
      const complete = await fetch('/api/member-auth/passkey/login/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeToken: optionsBody.challengeToken, credential }),
      })
      const completeBody = await complete.json()
      setMessage(
        complete.ok
          ? 'Signed in. Opening your settings…'
          : (completeBody.error ?? 'Passkey sign-in failed.'),
      )
      if (complete.ok) router.push('/members/settings')
    } catch {
      setMessage('Passkey sign-in was cancelled or could not be completed.')
    }
  }
  return (
    <main className="max-w-xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold">Community sign in</h1>
      <p className="mt-3">
        Use your email to sign in or create a member account. This is not administrator access.
      </p>
      <form onSubmit={requestLink} className="mt-6 grid gap-4" noValidate>
        <label>
          Email address
          <input
            required
            id="member-auth-email"
            type="email"
            autoComplete="email"
            aria-label="Email address"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? 'member-auth-email-error' : undefined}
            className="form-input"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (emailError) setEmailError('')
            }}
          />
        </label>
        {emailError ? (
          <p role="alert" id="member-auth-email-error" className="text-sm text-red-700">
            {emailError}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={!ready}>
          Email me a sign-in link
        </button>
      </form>
      <div className="mt-6">
        <button
          className="btn"
          type="button"
          disabled={!ready}
          onClick={() => void signInWithPasskey()}
        >
          Sign in with a passkey
        </button>
      </div>
      {message ? (
        <p role="status" className="mt-4">
          {message}
        </p>
      ) : null}
    </main>
  )
}
