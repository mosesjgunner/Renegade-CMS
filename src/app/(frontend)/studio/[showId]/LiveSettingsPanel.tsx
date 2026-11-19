'use client'

/**
 * Live-stream settings — the plain-language form for a show's stream
 * profile, replacing the raw-JSON-first admin field as the primary
 * path.
 *
 * Loads from the live API's GET, which returns only the PUBLIC
 * projection (profile + hasCredential — no credential material ever
 * reaches this component), and saves through POST set-profile. The
 * source password is write-only: the field starts empty on every
 * load and after every save, and an empty field keeps the password
 * already saved. Form → payload shaping lives in the pure helper
 * `live-settings-form.ts`.
 */

import { useEffect, useState } from 'react'

import {
  buildSetProfilePayload,
  emptyLiveSettingsFormState,
  LIVE_BITRATE_OPTIONS,
  parseInitialState,
  type LiveSettingsFormState,
} from '@/modules/podcast-studio/live/live-settings-form'
import type { PublicStreamProfile } from '@/modules/podcast-studio/live/stream-profile'

export function LiveSettingsPanel({ showId }: { showId: string }) {
  const [state, setState] = useState<LiveSettingsFormState>(() => emptyLiveSettingsFormState())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    void fetch(`/api/podcast-studio/live?showId=${encodeURIComponent(showId)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          streamProfile?: PublicStreamProfile | null
          error?: string
        } | null
        if (!response.ok)
          throw new Error(body?.error ?? 'Could not load the live settings for this show.')
        return body
      })
      .then((body) => {
        if (!active) return
        setState(parseInitialState(body?.streamProfile ?? null))
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Could not load the live settings for this show.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [showId])

  const patch = (partial: Partial<LiveSettingsFormState>) =>
    setState((current) => ({ ...current, ...partial }))

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setSavedMessage(null)
    setSaveError(null)
    try {
      const response = await fetch('/api/podcast-studio/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-profile',
          showId,
          ...buildSetProfilePayload(state),
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        streamProfile?: PublicStreamProfile | null
        error?: string
      } | null
      if (!response.ok)
        throw new Error(body?.error ?? 'Could not save the live settings. Please try again.')
      // Re-seed from the returned public projection: the password
      // field clears and hasCredential reflects what is now saved.
      if (body?.streamProfile) setState(parseInitialState(body.streamProfile))
      else patch({ credential: '' })
      setSavedMessage('Live settings saved.')
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Could not save the live settings. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  const bitrateOptions: number[] = (LIVE_BITRATE_OPTIONS as readonly number[]).includes(
    state.bitrateKbps,
  )
    ? [...LIVE_BITRATE_OPTIONS]
    : [state.bitrateKbps, ...LIVE_BITRATE_OPTIONS]

  return (
    <section className="surface-card p-5 space-y-3" aria-label="Live-stream settings">
      <h2 className="text-lg font-bold">Live-stream settings</h2>
      <p className="text-sm">
        Where this show streams live. Listeners open the same server address the Studio sends the
        show to.
      </p>
      {loading ? (
        <p className="text-sm">Loading live settings…</p>
      ) : loadError ? (
        <p className="text-sm" role="alert">
          {loadError}
        </p>
      ) : (
        <form className="space-y-3" onSubmit={(event) => void save(event)}>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Server address (stream URL)</span>
            <input
              className="form-input w-full"
              type="text"
              inputMode="url"
              placeholder="http://icecast.example:8000/show-live"
              value={state.sourceUrl}
              onChange={(event) => patch({ sourceUrl: event.target.value })}
              required
            />
            <span className="block text-xs text-stone-500">
              The streaming server address, including the mount at the end (the part after the last
              /).
            </span>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Stream title</span>
            <input
              className="form-input w-full"
              type="text"
              placeholder="My Show — Live"
              value={state.title}
              onChange={(event) => patch({ title: event.target.value })}
              required
            />
            <span className="block text-xs text-stone-500">
              The name listeners see for the live stream.
            </span>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Sound quality (bitrate)</span>
            <select
              className="form-select"
              value={String(state.bitrateKbps)}
              onChange={(event) => patch({ bitrateKbps: Number(event.target.value) })}
            >
              {bitrateOptions.map((kbps) => (
                <option key={kbps} value={String(kbps)}>
                  {kbps} kbps
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
            />
            Stream enabled — this show can go live
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.nowPlayingEnabled}
              onChange={(event) => patch({ nowPlayingEnabled: event.target.checked })}
            />
            Now-playing updates — tell listeners what is playing
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Source password</span>
            <input
              className="form-input w-full"
              type="password"
              autoComplete="new-password"
              placeholder={
                state.hasCredential
                  ? 'Saved — type to replace'
                  : 'Type the streaming server source password'
              }
              value={state.credential}
              disabled={state.useEnvCredential}
              onChange={(event) => patch({ credential: event.target.value })}
            />
            <span className="block text-xs text-stone-500">
              {state.hasCredential
                ? 'A password is saved. Leave this blank to keep it, or type a new one to replace it. Saved passwords are never shown.'
                : 'The password your streaming server expects from the Studio. It is stored encrypted and never shown again.'}
            </span>
          </label>
          <details>
            <summary className="text-sm font-medium cursor-pointer">Advanced</summary>
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={state.useEnvCredential}
                  onChange={(event) =>
                    patch({
                      useEnvCredential: event.target.checked,
                      ...(event.target.checked ? { credential: '' } : {}),
                    })
                  }
                />
                Use an environment variable instead
              </label>
              {state.useEnvCredential ? (
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Environment variable name</span>
                  <input
                    className="form-input w-full"
                    type="text"
                    placeholder="PODCAST_ICECAST_SOURCE_PASSWORD"
                    value={state.credentialEnvName}
                    onChange={(event) => patch({ credentialEnvName: event.target.value })}
                  />
                  <span className="block text-xs text-stone-500">
                    Advanced override: only the NAME is saved here — the password itself stays in
                    the server&apos;s environment. Saving a name replaces any saved password.
                  </span>
                </label>
              ) : null}
            </div>
          </details>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="submit" className="btn btn-secondary" disabled={saving}>
              {saving ? 'Saving…' : 'Save live settings'}
            </button>
            {savedMessage ? (
              <p className="text-sm" role="status">
                {savedMessage}
              </p>
            ) : null}
            {saveError ? (
              <p className="text-sm" role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        </form>
      )}
    </section>
  )
}
