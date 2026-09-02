'use client'

import { FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'

import type { OnboardingInput } from '@/modules/operations/onboarding'

type RegistrationOptions = Omit<
  PublicKeyCredentialCreationOptions,
  'challenge' | 'excludeCredentials' | 'user'
> & {
  challenge: string
  user: PublicKeyCredentialUserEntity & { id: string }
  excludeCredentials?: { id: string; transports?: AuthenticatorTransport[]; type: 'public-key' }[]
}

type SetupResult = {
  recoveryCodes?: string[]
  onboarding?: {
    publicUrl: string
    adminUrl: string
    configuredCapabilities: string[]
    needsConfiguration: string[]
    availableLater: string[]
    systemHealth: string
  }
}

const steps = ['Secure owner', 'Site identity', 'Brand & starter', 'Features', 'Finish']
const optionalConnections = [
  ['email', 'Email'],
  ['ai', 'AI'],
  ['social', 'Social'],
  ['commerce', 'Commerce'],
  ['analytics', 'Analytics'],
  ['networking', 'Networking'],
] as const

export function SetupForm({ initialEmail, appUrl }: { initialEmail: string; appUrl: string }) {
  const [step, setStep] = useState(0)
  const [email, setEmail] = useState(initialEmail)
  const [token, setToken] = useState('')
  const [form, setForm] = useState<OnboardingInput>({
    name: '',
    slug: '',
    description: '',
    primaryUrl: appUrl,
    locale: 'en-US',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    themeId: 'neutral-starter',
    starterType: 'creator-publication',
    featureProfile: 'Standard',
    optionalConnections: [],
    starterContent: true,
  })
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<SetupResult>()
  const [busy, setBusy] = useState(false)
  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(token && email)
    if (step === 1)
      return Boolean(form.name && form.slug && form.primaryUrl && form.locale && form.timezone)
    return true
  }, [email, form, step, token])

  function update<K extends keyof OnboardingInput>(key: K, value: OnboardingInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  function toggleConnection(connection: (typeof optionalConnections)[number][0]) {
    update(
      'optionalConnections',
      form.optionalConnections.includes(connection)
        ? form.optionalConnections.filter((item) => item !== connection)
        : [...form.optionalConnections, connection],
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step < steps.length - 1) {
      setStep((value) => value + 1)
      return
    }
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
        body: JSON.stringify({ credential: serializeCredential(credential), onboarding: form }),
      })
      const completeBody = await readJson(completeResponse)
      if (!completeResponse.ok)
        throw new Error(completeBody.error ?? 'Setup could not be completed.')
      setResult(completeBody)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Setup could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  if (result?.recoveryCodes && result.onboarding)
    return (
      <Completion
        result={
          result as SetupResult & {
            recoveryCodes: string[]
            onboarding: NonNullable<SetupResult['onboarding']>
          }
        }
      />
    )

  return (
    <main className="max-w-2xl mx-auto px-4 py-12 sm:py-20">
      <div className="surface-card p-6 sm:p-10 space-y-7 shadow-xl">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-700 dark:text-red-300">
            Renegade CMS setup
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-stone-950 dark:text-stone-50 font-display">
            Make this site yours.
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            A few choices now create a usable site, private starter content, and a secure owner
            account. Provider credentials can always wait.
          </p>
          <ol
            className="grid grid-cols-5 gap-1 text-[10px] sm:text-xs text-stone-500"
            aria-label="Setup progress"
          >
            {steps.map((label, index) => (
              <li
                key={label}
                className={index <= step ? 'font-semibold text-red-700 dark:text-red-300' : ''}
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </header>
        <form className="space-y-5" onSubmit={submit}>
          {step === 0 ? (
            <OwnerStep email={email} setEmail={setEmail} token={token} setToken={setToken} />
          ) : null}
          {step === 1 ? <IdentityStep form={form} update={update} /> : null}
          {step === 2 ? <BrandStep form={form} update={update} /> : null}
          {step === 3 ? (
            <FeatureStep form={form} update={update} toggleConnection={toggleConnection} />
          ) : null}
          {step === 4 ? <ReviewStep form={form} email={email} /> : null}
          {error ? (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          ) : null}
          <div className="flex gap-3 pt-2">
            {step > 0 ? (
              <button
                className="btn btn-secondary text-xs"
                type="button"
                onClick={() => setStep((value) => value - 1)}
                disabled={busy}
              >
                Back
              </button>
            ) : null}
            <button
              className="btn btn-primary text-xs flex-1 py-3"
              disabled={!canContinue || busy}
              type="submit"
            >
              {step === steps.length - 1
                ? busy
                  ? 'Creating your site-'
                  : 'Enroll passkey & create site'
                : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

function OwnerStep({
  email,
  setEmail,
  token,
  setToken,
}: {
  email: string
  setEmail: (value: string) => void
  token: string
  setToken: (value: string) => void
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Secure owner access</h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        The one-time token proves local operator access. Your passkey is enrolled only after you
        confirm these choices.
      </p>
      <Field label="Bootstrap token">
        <input
          className="form-input text-sm font-mono"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </Field>
      <Field label="Owner email">
        <input
          className="form-input text-sm"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
    </section>
  )
}
function IdentityStep({
  form,
  update,
}: {
  form: OnboardingInput
  update: <K extends keyof OnboardingInput>(key: K, value: OnboardingInput[K]) => void
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Site identity</h2>
      <Field label="Site or publication name">
        <input
          className="form-input text-sm"
          required
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
        />
      </Field>
      <Field label="Description">
        <textarea
          className="form-input text-sm"
          rows={3}
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
          placeholder="What will this site be for?"
        />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Site slug">
          <input
            className="form-input text-sm font-mono"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={form.slug}
            onChange={(event) => update('slug', event.target.value.toLowerCase())}
          />
        </Field>
        <Field label="Primary URL">
          <input
            className="form-input text-sm"
            required
            type="url"
            value={form.primaryUrl}
            onChange={(event) => update('primaryUrl', event.target.value)}
          />
        </Field>
        <Field label="Locale">
          <input
            className="form-input text-sm"
            required
            value={form.locale}
            onChange={(event) => update('locale', event.target.value)}
          />
        </Field>
        <Field label="Timezone">
          <input
            className="form-input text-sm"
            required
            value={form.timezone}
            onChange={(event) => update('timezone', event.target.value)}
          />
        </Field>
      </div>
    </section>
  )
}
function BrandStep({
  form,
  update,
}: {
  form: OnboardingInput
  update: <K extends keyof OnboardingInput>(key: K, value: OnboardingInput[K]) => void
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Brand and starting point</h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Choose an existing theme. Upload or select a logo later in Site Settings when media is
        available.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Choice
          checked={form.themeId === 'neutral-starter'}
          onChange={() => update('themeId', 'neutral-starter')}
          title="Neutral starter"
          detail="Clean, readable and adaptable."
        />
        <Choice
          checked={form.themeId === 'renegade-party'}
          onChange={() => update('themeId', 'renegade-party')}
          title="Renegade Party"
          detail="A more editorial, high-contrast voice."
        />
      </div>
      <Field label="Starter site type">
        <select
          className="form-input text-sm"
          value={form.starterType}
          onChange={(event) =>
            update('starterType', event.target.value as OnboardingInput['starterType'])
          }
        >
          <option value="creator-publication">Creator / publication</option>
          <option value="business">Business</option>
          <option value="nonprofit-community">Nonprofit / community</option>
          <option value="portfolio">Portfolio</option>
          <option value="blank-minimal">Blank / minimal</option>
        </select>
      </Field>
      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.starterContent}
          onChange={(event) => update('starterContent', event.target.checked)}
        />
        <span>Create editable home, about, contact, privacy, and sample draft content.</span>
      </label>
    </section>
  )
}
function FeatureStep({
  form,
  update,
  toggleConnection,
}: {
  form: OnboardingInput
  update: <K extends keyof OnboardingInput>(key: K, value: OnboardingInput[K]) => void
  toggleConnection: (key: (typeof optionalConnections)[number][0]) => void
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Feature profile and connections</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <Choice
          checked={form.featureProfile === 'Lean'}
          onChange={() => update('featureProfile', 'Lean')}
          title="Lean"
          detail="Core publishing with lighter operational work."
        />
        <Choice
          checked={form.featureProfile === 'Standard'}
          onChange={() => update('featureProfile', 'Standard')}
          title="Standard"
          detail="Enables the normal operations profile."
        />
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Enable only the areas you expect to configure. No credentials are requested here and every
        connection is skippable.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {optionalConnections.map(([key, label]) => (
          <label
            key={key}
            className="rounded-lg border border-stone-200 dark:border-stone-700 p-3 text-sm"
          >
            <input
              className="mr-2"
              type="checkbox"
              checked={form.optionalConnections.includes(key)}
              onChange={() => toggleConnection(key)}
            />
            {label}
          </label>
        ))}
      </div>
    </section>
  )
}
function ReviewStep({ form, email }: { form: OnboardingInput; email: string }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Ready to create your site</h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        A passkey will be enrolled for {email}. We-ll create {form.name || 'your site'}, its
        canonical Site, Publication, and Space records, plus the selected starter content.
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-stone-500">URL</dt>
          <dd>{form.primaryUrl}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Profile</dt>
          <dd>{form.featureProfile}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Starter</dt>
          <dd>{form.starterType}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Connections</dt>
          <dd>
            {form.optionalConnections.length ? form.optionalConnections.join(', ') : 'None yet'}
          </dd>
        </div>
      </dl>
    </section>
  )
}
function Completion({
  result,
}: {
  result: SetupResult & {
    recoveryCodes: string[]
    onboarding: NonNullable<SetupResult['onboarding']>
  }
}) {
  const { onboarding } = result
  return (
    <main className="max-w-2xl mx-auto px-4 py-12 sm:py-20">
      <div className="surface-card p-8 sm:p-10 space-y-7 shadow-xl">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            Setup complete
          </p>
          <h1 className="text-3xl font-bold font-display">Your site is ready to shape.</h1>
        </header>
        <section className="grid sm:grid-cols-2 gap-4 text-sm">
          <a className="rounded-xl border p-4 hover:border-red-400" href={onboarding.publicUrl}>
            Public site
            <br />
            <span className="text-stone-500">{onboarding.publicUrl}</span>
          </a>
          <Link className="rounded-xl border p-4 hover:border-red-400" href="/admin">
            Admin Studio
            <br />
            <span className="text-stone-500">{onboarding.adminUrl}</span>
          </Link>
        </section>
        <section>
          <h2 className="font-semibold mb-2">System health</h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">{onboarding.systemHealth}</p>
        </section>
        <Summary title="Enabled capabilities" items={onboarding.configuredCapabilities} />
        <Summary
          title="Connections that need configuration"
          items={onboarding.needsConfiguration}
        />
        <Summary title="Available whenever you are ready" items={onboarding.availableLater} />
        <section>
          <h2 className="font-semibold mb-2">Save emergency recovery codes</h2>
          <p className="text-sm text-stone-600 dark:text-stone-400 mb-3">
            Store these offline. Browser setup is now permanently locked.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-xs">
            {result.recoveryCodes.map((code) => (
              <li key={code} className="rounded border p-2 text-center">
                {code}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-semibold mb-2">Production HTTPS boundary</h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Renegade listens on its private loopback port. Put Caddy, Nginx, Traefik, or an
            equivalent reverse proxy in front of it for TLS, and in trusted proxy mode have that
            proxy replace forwarded headers before sending requests to Renegade. Do not expose the
            application listener directly to the internet.
          </p>
        </section>
        <div className="flex gap-3">
          <Link href="/admin" className="btn btn-primary text-xs">
            Open Admin Studio
          </Link>
          <a href={onboarding.publicUrl} className="btn btn-secondary text-xs">
            View your site
          </a>
        </div>
      </div>
    </main>
  )
}
function Summary({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h2 className="font-semibold mb-2">{title}</h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {items.length ? items.join(' - ') : 'None'}
      </p>
    </section>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="form-label">{label}</span>
      {children}
    </label>
  )
}
function Choice({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean
  onChange: () => void
  title: string
  detail: string
}) {
  return (
    <label
      className={`rounded-xl border p-4 cursor-pointer ${checked ? 'border-red-500 bg-red-50/60 dark:bg-red-950/20' : 'border-stone-200 dark:border-stone-700'}`}
    >
      <input className="mr-2" type="radio" checked={checked} onChange={onChange} />{' '}
      <span className="font-medium">{title}</span>
      <span className="block text-xs text-stone-500 mt-1">{detail}</span>
    </label>
  )
}
async function readJson(
  response: Response,
): Promise<{ error?: string; options?: RegistrationOptions } & SetupResult> {
  return response.json() as Promise<{ error?: string; options?: RegistrationOptions } & SetupResult>
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
