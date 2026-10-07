'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type EnrollmentDetails = {
  valid: boolean
  email: string
  role: string
  siteId: string | null
  expiresAt: string
}

function EnrollContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || searchParams.get('enrollmentToken') || ''

  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<EnrollmentDetails | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setErrorCode('INVALID_TOKEN')
      setErrorMessage('No enrollment token was provided in the invitation link.')
      return
    }

    let active = true
    async function verify() {
      try {
        const response = await fetch(`/api/auth/enrollment?token=${encodeURIComponent(token)}`)
        const data = await response.json()
        if (!active) return

        if (!response.ok) {
          setErrorCode(data.code || 'INVALID_TOKEN')
          setErrorMessage(data.error || 'This enrollment invitation is invalid.')
        } else {
          setDetails(data)
        }
      } catch (err) {
        if (!active) return
        setErrorCode('NETWORK_ERROR')
        setErrorMessage('Failed to connect to the enrollment service.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void verify()
    return () => {
      active = false
    }
  }, [token])

  async function handleRegisterPasskey() {
    setBusy(true)
    setErrorMessage(null)
    try {
      if (!window.PublicKeyCredential) {
        throw new Error('This browser does not support passkey (WebAuthn) registration.')
      }

      const optionsRes = await fetch('/api/auth/passkey/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'options', enrollmentToken: token }),
      })
      const optionsData = await optionsRes.json()
      if (!optionsRes.ok || !optionsData.options) {
        throw new Error(optionsData.error || 'Failed to start passkey enrollment.')
      }

      const credential = await navigator.credentials.create({
        publicKey: decodeRegistrationOptions(optionsData.options),
      })
      if (!credential) {
        throw new Error('Passkey registration was cancelled.')
      }

      const completeRes = await fetch('/api/auth/passkey/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          enrollmentToken: token,
          credential: serializeRegistrationCredential(credential),
        }),
      })
      const completeData = await completeRes.json()
      if (!completeRes.ok) {
        throw new Error(completeData.error || 'Failed to complete passkey enrollment.')
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Passkey registration failed.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <main className="max-w-md mx-auto px-4 py-16 sm:py-24 text-center">
        <div className="surface-card p-8 sm:p-10 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-2xl mx-auto animate-pulse">
            🔐
          </div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Verifying Invitation…
          </h1>
          <p className="text-xs text-stone-500">Checking your bounded staff invitation token.</p>
        </div>
      </main>
    )
  }

  if (errorCode || !details) {
    const isExpired = errorCode === 'TOKEN_EXPIRED'
    const isUsed = errorCode === 'TOKEN_ALREADY_USED'

    return (
      <main className="max-w-md mx-auto px-4 py-16 sm:py-24">
        <div className="surface-card p-8 sm:p-10 space-y-6 shadow-xl text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-2xl mx-auto">
            {isExpired ? '⏳' : isUsed ? '✅' : '⚠️'}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-950 dark:text-stone-50 font-display">
            {isExpired
              ? 'Invitation Expired'
              : isUsed
                ? 'Invitation Already Used'
                : 'Invalid Invitation'}
          </h1>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            {isExpired
              ? 'This staff enrollment invitation has expired. Contact your site owner to request a new invitation.'
              : isUsed
                ? 'This enrollment invitation has already been used to register a passkey. You can now sign in normally.'
                : errorMessage || 'This enrollment token is invalid or has been revoked.'}
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="btn btn-primary text-xs w-full py-3 inline-block text-center"
            >
              Go to Sign In &rarr;
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-md mx-auto px-4 py-16 sm:py-24">
      <div className="surface-card p-8 sm:p-10 space-y-6 shadow-xl">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 flex items-center justify-center text-2xl mx-auto">
            🔐
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-950 dark:text-stone-50 font-display">
            Staff Passkey Enrollment
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            You have been invited to join as a{' '}
            <span className="font-semibold text-stone-800 dark:text-stone-200 uppercase">
              {details.role}
            </span>
            . Register your passkey hardware below.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-stone-500">Email:</span>
            <span className="font-mono font-medium text-stone-900 dark:text-stone-100">
              {details.email}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Role:</span>
            <span className="capitalize font-medium text-stone-900 dark:text-stone-100">
              {details.role}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Expires:</span>
            <span className="text-stone-700 dark:text-stone-300">
              {new Date(details.expiresAt).toLocaleString()}
            </span>
          </div>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300"
          >
            ⚠️ {errorMessage}
          </div>
        ) : null}

        {success ? (
          <div
            role="status"
            className="p-3 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-300 text-center font-medium"
          >
            🎉 Passkey registered successfully! Redirecting to sign in…
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary text-xs w-full py-3"
            disabled={busy}
            onClick={() => void handleRegisterPasskey()}
          >
            {busy ? 'Registering hardware passkey…' : '🔑 Register Hardware Passkey'}
          </button>
        )}

        <div className="pt-4 border-t border-stone-100 dark:border-stone-800 text-center text-xs text-stone-500">
          Already registered?{' '}
          <Link
            href="/login"
            className="font-semibold text-red-600 dark:text-red-400 hover:underline"
          >
            Sign In &rarr;
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function EnrollPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-md mx-auto px-4 py-16 text-center text-xs text-stone-500">
          Loading enrollment portal…
        </main>
      }
    >
      <EnrollContent />
    </Suspense>
  )
}

function decodeRegistrationOptions(
  options: Record<string, unknown>,
): PublicKeyCredentialCreationOptions {
  const user = options.user as Record<string, unknown>
  return {
    ...options,
    challenge: fromBase64Url(String(options.challenge)),
    user: {
      ...user,
      id: fromBase64Url(String(user.id)),
      name: String(user.name ?? ''),
      displayName: String(user.displayName ?? user.name ?? ''),
    },
    excludeCredentials: Array.isArray(options.excludeCredentials)
      ? options.excludeCredentials.map((credential) => ({
          ...(credential as Record<string, unknown>),
          id: fromBase64Url(String((credential as Record<string, unknown>).id)),
        }))
      : undefined,
  } as PublicKeyCredentialCreationOptions
}

function serializeRegistrationCredential(credential: Credential): Record<string, unknown> {
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
  return Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0)).buffer
}

function toBase64Url(value: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte)
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
