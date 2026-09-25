'use client'

import { FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'

import { themes } from '@/modules/presentation/registry'
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
    timezone:
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        : 'UTC',
    themeId: 'neutral-starter',
    starterType: 'creator-publication',
    featureProfile: 'Standard',
    optionalConnections: [],
    starterContent: true,
    publishingDefaults: {
      indexingMode: 'index',
      commentsPolicy: 'open',
      visibility: 'public',
    },
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
  function updatePublishingDefault<
    K extends keyof NonNullable<OnboardingInput['publishingDefaults']>,
  >(key: K, value: NonNullable<OnboardingInput['publishingDefaults']>[K]) {
    setForm((current) => ({
      ...current,
      publishingDefaults: {
        ...(current.publishingDefaults ?? {
          indexingMode: 'index',
          commentsPolicy: 'open',
          visibility: 'public',
        }),
        [key]: value,
      },
    }))
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
            <FeatureStep
              form={form}
              update={update}
              updatePublishingDefault={updatePublishingDefault}
              toggleConnection={toggleConnection}
            />
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
  const hasPasskeySupport = typeof window !== 'undefined' && Boolean(window.PublicKeyCredential)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2 dark:border-stone-800">
        <h2 className="font-semibold text-lg">1. Secure owner & admin creation</h2>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Ready
        </span>
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        The one-time bootstrap token proves local operator access. Your first admin account will be
        enrolled with passkey credentials after you confirm your choices.
      </p>

      <div className="p-3 rounded-xl border bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-800 space-y-1.5 text-xs">
        <div className="flex items-center justify-between font-medium">
          <span>Browser Passkey / WebAuthn Support:</span>
          {hasPasskeySupport ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              ✓ Hardware / Platform Supported
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              ⚠ Unproven / Virtual Authenticator Required
            </span>
          )}
        </div>
        <p className="text-stone-500">
          Normal admin sign-in occurs at <code className="font-mono">/login</code> via passkey.
          Emergency recovery codes will be generated at completion for fallback access.
        </p>
      </div>

      <Field label="Bootstrap token" badge="Required">
        <input
          className="form-input text-sm font-mono"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste one-time token from CLI"
        />
      </Field>
      <Field label="Owner email" badge="Required">
        <input
          className="form-input text-sm"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@example.org"
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
      <div className="flex items-center justify-between border-b pb-2 dark:border-stone-800">
        <h2 className="font-semibold text-lg">2. Site identity, domain & locale</h2>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
          Configuration
        </span>
      </div>
      <Field label="Site or publication name" badge="Required">
        <input
          className="form-input text-sm"
          required
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="e.g. Renegade Dispatch"
        />
      </Field>
      <Field label="Description" badge="Optional">
        <textarea
          className="form-input text-sm"
          rows={3}
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
          placeholder="What will this site be for?"
        />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Site slug" badge="Required">
          <input
            className="form-input text-sm font-mono"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={form.slug}
            onChange={(event) => update('slug', event.target.value.toLowerCase())}
            placeholder="renegade-dispatch"
          />
        </Field>
        <Field label="Primary URL" badge="Required">
          <input
            className="form-input text-sm"
            required
            type="url"
            value={form.primaryUrl}
            onChange={(event) => update('primaryUrl', event.target.value)}
            placeholder="https://example.org"
          />
        </Field>
        <Field label="Locale" badge="Required">
          <input
            className="form-input text-sm"
            required
            value={form.locale}
            onChange={(event) => update('locale', event.target.value)}
            placeholder="en-US"
          />
        </Field>
        <Field label="Timezone" badge="Required">
          <input
            className="form-input text-sm"
            required
            value={form.timezone}
            onChange={(event) => update('timezone', event.target.value)}
            placeholder="UTC"
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
      <div className="flex items-center justify-between border-b pb-2 dark:border-stone-800">
        <h2 className="font-semibold text-lg">3. Starter, theme & content</h2>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
          Presentation
        </span>
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Choose a theme and starter recipe. You can customize colors, fonts, and assets in Site
        Settings anytime.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {Object.values(themes).map((theme) => (
          <Choice
            key={theme.id}
            checked={form.themeId === theme.id}
            onChange={() => update('themeId', theme.id)}
            title={theme.label}
            detail={theme.description}
          />
        ))}
      </div>
      <Field label="Starter site type" badge="Required">
        <select
          className="form-input text-sm"
          value={form.starterType}
          onChange={(event) => {
            const nextType = event.target.value as OnboardingInput['starterType']
            update('starterType', nextType)
            if (nextType === 'publication-community') {
              update('themeId', 'neutral-starter')
            } else if (nextType === 'campaign-commerce') {
              update('themeId', 'renegade-party')
            }
          }}
        >
          <option value="publication-community">
            ★ Publication / Community Starter (The Vanguard Chronicle)
          </option>
          <option value="campaign-commerce">
            ★ Campaign / Commerce Starter (Forward for the People)
          </option>
          <option value="creator-publication">Creator / publication</option>
          <option value="business">Business</option>
          <option value="nonprofit-community">Nonprofit / community</option>
          <option value="portfolio">Portfolio</option>
          <option value="blank-minimal">Blank / minimal</option>
        </select>
      </Field>
      <div className="pt-2">
        <label className="flex items-start gap-3 text-sm p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/50">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.starterContent}
            onChange={(event) => update('starterContent', event.target.checked)}
          />
          <div>
            <span className="font-medium text-stone-900 dark:text-stone-100">
              Create starter pages and sample content
            </span>
            <span className="block text-xs text-stone-500">
              Provisions home, about, contact, privacy, and initial sample draft content. (Optional)
            </span>
          </div>
        </label>
      </div>
    </section>
  )
}

function FeatureStep({
  form,
  update,
  updatePublishingDefault,
  toggleConnection,
}: {
  form: OnboardingInput
  update: <K extends keyof OnboardingInput>(key: K, value: OnboardingInput[K]) => void
  updatePublishingDefault: <K extends keyof NonNullable<OnboardingInput['publishingDefaults']>>(
    key: K,
    value: NonNullable<OnboardingInput['publishingDefaults']>[K],
  ) => void
  toggleConnection: (key: (typeof optionalConnections)[number][0]) => void
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between border-b pb-2 dark:border-stone-800">
        <h2 className="font-semibold text-lg">4. Profile, providers & publishing defaults</h2>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Operations
        </span>
      </div>

      {/* Feature Profile */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="form-label">Deployment profile</span>
          <span className="text-[10px] uppercase font-bold text-red-600 bg-red-50 dark:bg-red-950/60 px-1.5 py-0.5 rounded">
            Required
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Choice
            checked={form.featureProfile === 'Lean'}
            onChange={() => update('featureProfile', 'Lean')}
            title="Lean"
            detail="Core publishing with minimal background worker footprint. Ideal for VPS, low memory (<1GB), and sovereign nodes."
          />
          <Choice
            checked={form.featureProfile === 'Standard'}
            onChange={() => update('featureProfile', 'Standard')}
            title="Standard"
            detail="Enables the standard operational profile with background queues, full automation, and scheduled workers."
          />
        </div>
      </div>

      {/* Required Providers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="form-label">Required infrastructure providers</span>
          <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
            Validated
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <div className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
              <span>PostgreSQL Database</span>
              <span>✓ Verified</span>
            </div>
            <p className="text-emerald-700 dark:text-emerald-400 mt-1 text-[11px]">
              Schema migrations fully applied (108/108). Connection pool healthy.
            </p>
          </div>
          <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <div className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
              <span>Primary Storage</span>
              <span>✓ Verified</span>
            </div>
            <p className="text-emerald-700 dark:text-emerald-400 mt-1 text-[11px]">
              Local media storage directory validated with read/write access.
            </p>
          </div>
        </div>
      </div>

      {/* Optional Providers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="form-label">Optional connections</span>
          <span className="text-[10px] uppercase font-bold text-stone-500 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">
            Skippable
          </span>
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Never show provider success before validation. These remain unconfigured and skippable
          until verified in Admin Studio.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {optionalConnections.map(([key, label]) => (
            <label
              key={key}
              className="rounded-lg border border-stone-200 dark:border-stone-700 p-2.5 text-xs flex items-center justify-between cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              <div className="flex items-center">
                <input
                  className="mr-2"
                  type="checkbox"
                  checked={form.optionalConnections.includes(key)}
                  onChange={() => toggleConnection(key)}
                />
                <span>{label}</span>
              </div>
              <span className="text-[10px] text-stone-400">Skippable</span>
            </label>
          ))}
        </div>
      </div>

      {/* Publishing Defaults */}
      <div className="space-y-3 pt-2 border-t border-stone-200 dark:border-stone-800">
        <div className="flex items-center justify-between">
          <span className="form-label">Publishing defaults</span>
          <span className="text-[10px] uppercase font-bold text-stone-500 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">
            Optional
          </span>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Search indexing" badge="Optional">
            <select
              className="form-input text-xs"
              value={form.publishingDefaults?.indexingMode ?? 'index'}
              onChange={(e) =>
                updatePublishingDefault('indexingMode', e.target.value as 'index' | 'noindex')
              }
            >
              <option value="index">Index (Search engines allowed)</option>
              <option value="noindex">No Index (Private/hidden)</option>
            </select>
          </Field>
          <Field label="Comments policy" badge="Optional">
            <select
              className="form-input text-xs"
              value={form.publishingDefaults?.commentsPolicy ?? 'open'}
              onChange={(e) =>
                updatePublishingDefault(
                  'commentsPolicy',
                  e.target.value as 'open' | 'members' | 'closed',
                )
              }
            >
              <option value="open">Open (Immediate)</option>
              <option value="members">Members only</option>
              <option value="closed">Closed (Disabled)</option>
            </select>
          </Field>
          <Field label="Site visibility" badge="Optional">
            <select
              className="form-input text-xs"
              value={form.publishingDefaults?.visibility ?? 'public'}
              onChange={(e) =>
                updatePublishingDefault('visibility', e.target.value as 'public' | 'members-only')
              }
            >
              <option value="public">Public (Open to web)</option>
              <option value="members-only">Members-only</option>
            </select>
          </Field>
        </div>
      </div>
    </section>
  )
}

function ReviewStep({ form, email }: { form: OnboardingInput; email: string }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2 dark:border-stone-800">
        <h2 className="font-semibold text-lg">5. Review & passkey enrollment</h2>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Ready to finish
        </span>
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Confirming will enroll your passkey for{' '}
        <strong className="text-stone-900 dark:text-stone-100">{email}</strong> and provision your
        site, starter content, and publishing defaults.
      </p>
      <dl className="grid grid-cols-2 gap-3 text-xs bg-stone-50 dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800">
        <div>
          <dt className="text-stone-500 font-medium">Site Name</dt>
          <dd className="font-semibold text-stone-900 dark:text-stone-100">
            {form.name || '(Default)'}
          </dd>
        </div>
        <div>
          <dt className="text-stone-500 font-medium">Primary URL</dt>
          <dd className="font-mono text-stone-900 dark:text-stone-100">{form.primaryUrl}</dd>
        </div>
        <div>
          <dt className="text-stone-500 font-medium">Profile</dt>
          <dd className="font-semibold text-stone-900 dark:text-stone-100">
            {form.featureProfile}
          </dd>
        </div>
        <div>
          <dt className="text-stone-500 font-medium">Starter Site</dt>
          <dd className="text-stone-900 dark:text-stone-100">{form.starterType}</dd>
        </div>
        <div>
          <dt className="text-stone-500 font-medium">Locale & Timezone</dt>
          <dd className="text-stone-900 dark:text-stone-100">
            {form.locale} ({form.timezone})
          </dd>
        </div>
        <div>
          <dt className="text-stone-500 font-medium">Publishing Defaults</dt>
          <dd className="text-stone-900 dark:text-stone-100">
            {form.publishingDefaults?.indexingMode ?? 'index'} /{' '}
            {form.publishingDefaults?.commentsPolicy ?? 'open'}
          </dd>
        </div>
        <div>
          <dt className="text-stone-500 font-medium">Required Providers</dt>
          <dd className="text-emerald-600 dark:text-emerald-400 font-medium">
            PostgreSQL & Storage Validated
          </dd>
        </div>
        <div>
          <dt className="text-stone-500 font-medium">Optional Connections</dt>
          <dd className="text-stone-600 dark:text-stone-400">
            {form.optionalConnections.length
              ? form.optionalConnections.join(', ')
              : 'None (Deferred)'}
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
function Field({
  label,
  badge,
  children,
}: {
  label: string
  badge?: 'Required' | 'Optional'
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between">
        <span className="form-label">{label}</span>
        {badge ? (
          <span
            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
              badge === 'Required'
                ? 'text-red-600 bg-red-50 dark:bg-red-950/60'
                : 'text-stone-500 bg-stone-100 dark:bg-stone-800'
            }`}
          >
            {badge}
          </span>
        ) : null}
      </div>
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
