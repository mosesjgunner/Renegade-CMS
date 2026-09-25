'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { createMemberPasskey } from '@/modules/identity/member-passkey-browser'
import { MemberRelationshipList } from '@/modules/community/MemberRelationshipList'
import { NotificationPreferences } from '@/modules/community/NotificationPreferences'

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}

export default function MemberSettingsPage() {
  const [profile, setProfile] = useState<Record<string, unknown>>({})
  const [initialHandle, setInitialHandle] = useState('')
  const [siteId, setSiteId] = useState('')
  const [message, setMessage] = useState('')
  const [imageMessage, setImageMessage] = useState('')
  const [history, setHistory] = useState<
    Array<{ id: string; event: string; at: string; details?: { fields?: string[] } }>
  >([])
  const links = Array.isArray(profile.links)
    ? (profile.links as Array<{ label: string; url: string }>)
    : []
  function updateLink(index: number, field: 'label' | 'url', value: string) {
    setProfile({
      ...profile,
      links: links.map((link, position) =>
        position === index ? { ...link, [field]: value } : link,
      ),
    })
  }
  useEffect(() => {
    void fetch('/api/member-auth/me').then(async (r) => {
      if (!r.ok) return setMessage('Sign in required.')
      const data = await r.json()
      setProfile(data.profile ?? {})
      setInitialHandle(String(data.profile?.handle ?? ''))
      setSiteId(data.siteId ?? '')
      void fetch('/api/member-auth/profile').then(async (response) => {
        if (response.ok) setHistory((await response.json()).history ?? [])
      })
    })
  }, [])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const editable = [
      'displayName',
      'handle',
      'bio',
      'visibility',
      'fieldAudience',
      'links',
      'discoveryOptOut',
      'avatarAlt',
      'coverAlt',
      'locale',
      'timeZone',
      'relationshipNotifications',
    ]
    const changes = Object.fromEntries(
      editable
        .filter(
          (field) =>
            profile[field] !== undefined &&
            profile[field] !== null &&
            (field !== 'handle' || profile.handle !== initialHandle),
        )
        .map((field) => [field, profile[field]]),
    )
    const response = await fetch('/api/member-auth/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify(changes),
    })
    setMessage(
      response.ok ? 'Profile saved.' : ((await response.json()).error ?? 'Could not save profile.'),
    )
    if (response.ok) setInitialHandle(String(profile.handle ?? ''))
  }
  async function uploadImage(field: 'avatar' | 'cover', file: File | undefined) {
    if (!file) return
    const form = new FormData()
    form.set('field', field)
    form.set('file', file)
    form.set('altText', String(profile[field === 'avatar' ? 'avatarAlt' : 'coverAlt'] ?? ''))
    form.set('focalX', String(profile[`${field}FocalX`] ?? '0.5'))
    form.set('focalY', String(profile[`${field}FocalY`] ?? '0.5'))
    setImageMessage('Uploading image…')
    const response = await fetch('/api/member-auth/profile-media', {
      method: 'POST',
      headers: csrfHeader(),
      body: form,
    })
    const body = await response.json()
    if (!response.ok) return setImageMessage(body.error ?? 'Image upload failed.')
    setProfile((current) => ({ ...current, [field]: body.image.assetId }))
    setImageMessage('Image uploaded and awaiting media approval. It is not public yet.')
  }
  async function deactivate() {
    const response = await fetch('/api/member-auth/deactivate', {
      method: 'POST',
      headers: csrfHeader(),
    })
    setMessage(response.ok ? 'Account deactivated.' : 'Could not deactivate account.')
  }
  async function exportData() {
    setMessage('Exporting member data…')
    const response = await fetch('/api/member-auth/export')
    if (!response.ok) return setMessage('Could not export member data.')
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'member-data-export.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setMessage('Member data export downloaded.')
  }
  async function deleteAccount() {
    if (
      !window.confirm(
        'Are you sure you want to request permanent account deletion? This starts a cooling-off period before full data anonymization.',
      )
    )
      return
    const response = await fetch('/api/member-auth/delete', {
      method: 'POST',
      headers: csrfHeader(),
    })
    setMessage(
      response.ok
        ? 'Account deletion requested. You have been signed out.'
        : 'Could not request account deletion.',
    )
  }
  async function reactivateAccount() {
    const response = await fetch('/api/member-auth/reactivate', {
      method: 'POST',
      headers: csrfHeader(),
    })
    setMessage(
      response.ok ? 'Account reactivated and deletion cancelled.' : 'Could not reactivate account.',
    )
  }
  async function enrollPasskey() {
    if (!window.PublicKeyCredential)
      return setMessage('Passkeys are not supported by this browser.')
    try {
      const optionsResponse = await fetch('/api/member-auth/passkey/register/options', {
        method: 'POST',
        headers: csrfHeader(),
      })
      const optionsBody = await optionsResponse.json()
      if (!optionsResponse.ok)
        return setMessage(optionsBody.error ?? 'Could not start passkey enrollment.')
      const credential = await createMemberPasskey(optionsBody.options)
      const complete = await fetch('/api/member-auth/passkey/register/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeader() },
        body: JSON.stringify({ challengeToken: optionsBody.challengeToken, credential }),
      })
      const completeBody = await complete.json()
      setMessage(
        complete.ok ? 'Passkey enrolled.' : (completeBody.error ?? 'Passkey enrollment failed.'),
      )
    } catch {
      setMessage('Passkey enrollment was cancelled or could not be completed.')
    }
  }
  if (message === 'Sign in required.') {
    return (
      <main className="max-w-xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold">Member settings</h1>
        <div className="mt-6 p-8 rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900 text-center">
          <p className="text-base text-stone-700 dark:text-stone-300">
            Sign in is required to view and manage your member profile and settings.
          </p>
          <div className="mt-5">
            <Link
              href="/member-auth"
              className="inline-block px-5 py-2.5 rounded-lg bg-stone-900 text-white font-medium hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white transition"
            >
              Sign in or create account &rarr;
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold">Member settings</h1>
      <form onSubmit={save} className="mt-6 grid gap-4">
        <label>
          Display name
          <input
            aria-label="Display name"
            className="form-input"
            value={String(profile.displayName ?? '')}
            onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
          />
        </label>
        <label>
          Handle
          <input
            aria-label="Handle"
            className="form-input"
            value={String(profile.handle ?? '')}
            onChange={(e) => setProfile({ ...profile, handle: e.target.value })}
          />
        </label>
        <label>
          Bio
          <textarea
            aria-label="Bio"
            className="form-input"
            value={String(profile.bio ?? '')}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </label>
        <label>
          Visibility
          <select
            aria-label="Visibility"
            className="form-input"
            value={String(profile.visibility ?? 'private')}
            onChange={(e) => setProfile({ ...profile, visibility: e.target.value })}
          >
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
            <option value="members">Signed-in members</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={profile.discoveryOptOut === true}
            onChange={(e) => setProfile({ ...profile, discoveryOptOut: e.target.checked })}
          />
          Do not list my profile in member search
        </label>
        {(
          [
            ['bio', 'Bio'],
            ['avatar', 'Avatar'],
            ['cover', 'Header image'],
            ['links', 'Links'],
            ['locale', 'Locale'],
            ['timeZone', 'Time zone'],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label} audience
            <select
              className="form-input"
              value={String(
                (profile.fieldAudience as Record<string, string> | undefined)?.[field] ?? 'public',
              )}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  fieldAudience: {
                    ...((profile.fieldAudience as object) ?? {}),
                    [field]: event.target.value,
                  },
                })
              }
            >
              <option value="public">Everyone allowed to view my profile</option>
              <option value="members">Signed-in members</option>
              <option value="followers">Followers</option>
              <option value="private">Only me</option>
            </select>
          </label>
        ))}
        <label>
          Avatar description
          <input
            className="form-input"
            maxLength={240}
            value={String(profile.avatarAlt ?? '')}
            onChange={(event) => setProfile({ ...profile, avatarAlt: event.target.value })}
          />
        </label>
        <fieldset className="grid gap-2 rounded border p-3" aria-describedby="profile-image-help">
          <legend>Avatar image</legend>
          <p id="profile-image-help">
            Images use the governed media review queue. Provide a description and choose the crop
            focus with the two sliders.
          </p>
          <label>
            Upload avatar
            <input
              aria-label="Upload avatar"
              type="file"
              accept="image/*"
              onChange={(event) => void uploadImage('avatar', event.target.files?.[0])}
            />
          </label>
          <label>
            Avatar crop horizontal focus
            <input
              aria-label="Avatar crop horizontal focus"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={String(profile.avatarFocalX ?? '0.5')}
              onChange={(event) => setProfile({ ...profile, avatarFocalX: event.target.value })}
            />
          </label>
          <label>
            Avatar crop vertical focus
            <input
              aria-label="Avatar crop vertical focus"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={String(profile.avatarFocalY ?? '0.5')}
              onChange={(event) => setProfile({ ...profile, avatarFocalY: event.target.value })}
            />
          </label>
        </fieldset>
        <label>
          Header image description
          <input
            className="form-input"
            maxLength={240}
            value={String(profile.coverAlt ?? '')}
            onChange={(event) => setProfile({ ...profile, coverAlt: event.target.value })}
          />
        </label>
        <fieldset className="grid gap-2 rounded border p-3">
          <legend>Header image</legend>
          <label>
            Upload header image
            <input
              aria-label="Upload header image"
              type="file"
              accept="image/*"
              onChange={(event) => void uploadImage('cover', event.target.files?.[0])}
            />
          </label>
          <label>
            Header crop horizontal focus
            <input
              aria-label="Header crop horizontal focus"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={String(profile.coverFocalX ?? '0.5')}
              onChange={(event) => setProfile({ ...profile, coverFocalX: event.target.value })}
            />
          </label>
          <label>
            Header crop vertical focus
            <input
              aria-label="Header crop vertical focus"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={String(profile.coverFocalY ?? '0.5')}
              onChange={(event) => setProfile({ ...profile, coverFocalY: event.target.value })}
            />
          </label>
        </fieldset>
        <fieldset className="grid gap-2 rounded border p-3">
          <legend>Relationship notifications</legend>
          <p>
            These control relationship events in the community. They do not publish or reveal
            contact details.
          </p>
          {(
            [
              ['follows', 'New followers'],
              ['messages', 'Direct messages'],
              ['mentions', 'Mentions'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  (profile.relationshipNotifications as Record<string, boolean> | undefined)?.[
                    key
                  ] !== false
                }
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    relationshipNotifications: {
                      ...((profile.relationshipNotifications as object) ?? {}),
                      [key]: event.target.checked,
                    },
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label>
          Locale
          <input
            className="form-input"
            placeholder="en-US"
            value={String(profile.locale ?? '')}
            onChange={(event) => setProfile({ ...profile, locale: event.target.value })}
          />
        </label>
        <label>
          Time zone
          <input
            className="form-input"
            placeholder="America/Chicago"
            value={String(profile.timeZone ?? '')}
            onChange={(event) => setProfile({ ...profile, timeZone: event.target.value })}
          />
        </label>
        <fieldset className="grid gap-3">
          <legend>Profile links</legend>
          {links.map((link, index) => (
            <div key={index} className="grid gap-2 rounded border p-3">
              <label>
                Label
                <input
                  className="form-input"
                  maxLength={80}
                  value={String(link.label ?? '')}
                  onChange={(event) => updateLink(index, 'label', event.target.value)}
                />
              </label>
              <label>
                HTTPS URL
                <input
                  className="form-input"
                  type="url"
                  value={String(link.url ?? '')}
                  onChange={(event) => updateLink(index, 'url', event.target.value)}
                />
              </label>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  setProfile({
                    ...profile,
                    links: links.filter((_, position) => position !== index),
                  })
                }
              >
                Remove link
              </button>
            </div>
          ))}
          <button
            className="btn"
            type="button"
            disabled={links.length >= 8}
            onClick={() => setProfile({ ...profile, links: [...links, { label: '', url: '' }] })}
          >
            Add link
          </button>
        </fieldset>
        {typeof profile.handle === 'string' && profile.handle ? (
          <a href={`/members/${profile.handle}`} className="underline">
            Preview public profile
          </a>
        ) : null}
        <section className="rounded border p-4" aria-label="Profile preview">
          <h2 className="text-xl font-semibold">Profile preview</h2>
          <p className="mt-2">{String(profile.displayName ?? 'Community member')}</p>
          {profile.bio ? <p className="whitespace-pre-wrap">{String(profile.bio)}</p> : null}
          <p className="text-sm">
            Images appear here after governed media approval; private originals never appear in
            preview.
          </p>
        </section>
        <button className="btn btn-primary" type="submit">
          Save profile
        </button>
      </form>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Passkeys</h2>
        <p className="mt-2">
          Add a passkey for passwordless sign-in on this device or a synced authenticator.
        </p>
        <button className="btn mt-3" type="button" onClick={() => void enrollPasskey()}>
          Add a passkey
        </button>
      </section>
      {siteId ? <MemberRelationshipList siteId={siteId} /> : null}
      {siteId ? <NotificationPreferences siteId={siteId} /> : null}
      <section className="mt-8" aria-label="Profile revision history">
        <h2 className="text-xl font-semibold">Profile revision history</h2>
        {history.length ? (
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                {new Date(entry.at).toLocaleString()}: {entry.event}{' '}
                {entry.details?.fields?.length ? `(${entry.details.fields.join(', ')})` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No consequential profile changes recorded yet.</p>
        )}
      </section>
      <section className="mt-8 rounded border p-4" aria-label="Account lifecycle and data">
        <h2 className="text-xl font-semibold">Privacy, Data & Account</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Download a machine-readable copy of your profile, contributions, and messages, or manage
          your account lifecycle.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn" type="button" onClick={() => void exportData()}>
            Export my data (JSON)
          </button>
          <button className="btn" type="button" onClick={() => void reactivateAccount()}>
            Reactivate account
          </button>
          <button className="btn" type="button" onClick={() => void deactivate()}>
            Deactivate account
          </button>
          <button
            className="btn btn-danger text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
            type="button"
            onClick={() => void deleteAccount()}
          >
            Delete account
          </button>
        </div>
      </section>
      {message ? (
        <p role="status" className="mt-4">
          {message}
        </p>
      ) : null}
      {imageMessage ? (
        <p role="status" className="mt-4">
          {imageMessage}
        </p>
      ) : null}
    </main>
  )
}
