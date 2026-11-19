/**
 * Live-stream settings form shaping (PURE — no DOM, no fetch).
 *
 * The Studio's live settings panel edits a show's stream profile
 * through the live API's public surface only:
 *
 * - It LOADS from the public projection (`PublicStreamProfile`:
 *   profile fields + `hasCredential`). That projection never carries
 *   a credential value, an encrypted envelope, or an env var name —
 *   so the form can know THAT a credential is saved, never what it
 *   is, and never which storage shape holds it.
 * - It SAVES through `POST /api/podcast-studio/live` with
 *   `{ action: 'set-profile', showId, profile, credential? |
 *   credentialEnvName? }`. The service refuses a credential and an
 *   env reference together, so the payload built here contains at
 *   most one of them:
 *   - a typed env var name (advanced override) wins and is the only
 *     credential key sent;
 *   - otherwise a newly typed source password is the only key sent;
 *   - an empty password field sends NO credential key, which keeps
 *     the credential already saved on the show.
 *
 * The password is write-only: form state starts it empty every time,
 * and nothing here ever puts a saved credential back into state.
 */

import type { PublicStreamProfile, StreamProfile } from './stream-profile'

/** Bitrates the settings form offers, in kbps. */
export const LIVE_BITRATE_OPTIONS = [64, 96, 128, 192, 256] as const

export type LiveSettingsFormState = {
  /** Icecast mount URL listeners open and the relay publishes to. */
  sourceUrl: string
  /** Stream title listeners see before any now-playing update. */
  title: string
  bitrateKbps: number
  enabled: boolean
  nowPlayingEnabled: boolean
  /**
   * Whether a credential is already saved on the show (from the
   * public projection). A flag only — never the credential itself.
   */
  hasCredential: boolean
  /** New source password typed by the operator. '' = keep the saved one. */
  credential: string
  /** Advanced override: use the env var with this NAME instead of a saved password. */
  useEnvCredential: boolean
  /** Name of the environment variable holding the source password. */
  credentialEnvName: string
}

export type SetProfilePayload = {
  profile: StreamProfile
  credential?: string
  credentialEnvName?: string
}

/** Form state for a show with no stream profile saved yet. */
export const emptyLiveSettingsFormState = (): LiveSettingsFormState => ({
  sourceUrl: '',
  title: '',
  bitrateKbps: 128,
  enabled: true,
  nowPlayingEnabled: true,
  hasCredential: false,
  credential: '',
  useEnvCredential: false,
  credentialEnvName: '',
})

/**
 * Maps the public projection (or null, when the show has no profile
 * yet) into form state. The credential fields always start empty /
 * off: the projection cannot say which storage shape a saved
 * credential uses, and the password itself is never available.
 */
export function parseInitialState(
  publicProfile: PublicStreamProfile | null | undefined,
): LiveSettingsFormState {
  if (!publicProfile) return emptyLiveSettingsFormState()
  return {
    sourceUrl: publicProfile.sourceUrl,
    title: publicProfile.title,
    bitrateKbps: publicProfile.bitrateKbps,
    enabled: publicProfile.enabled,
    nowPlayingEnabled: publicProfile.nowPlayingEnabled,
    hasCredential: publicProfile.hasCredential,
    credential: '',
    useEnvCredential: false,
    credentialEnvName: '',
  }
}

/**
 * Shapes form state into the set-profile payload's profile +
 * credential portion (the panel adds `action` and `showId`).
 * Exactly one credential key can appear — see the header note.
 */
export function buildSetProfilePayload(state: LiveSettingsFormState): SetProfilePayload {
  const payload: SetProfilePayload = {
    profile: {
      sourceUrl: state.sourceUrl.trim(),
      title: state.title.trim(),
      bitrateKbps: state.bitrateKbps,
      enabled: state.enabled,
      nowPlayingEnabled: state.nowPlayingEnabled,
    },
  }
  const envName = state.useEnvCredential ? state.credentialEnvName.trim() : ''
  if (envName) {
    payload.credentialEnvName = envName
  } else if (state.credential) {
    payload.credential = state.credential
  }
  return payload
}
