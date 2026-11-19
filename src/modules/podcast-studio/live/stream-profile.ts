/**
 * POD-16 (POD-REQ-34) — Per-show Icecast stream profile + stream
 * credential handling (PURE CORE).
 *
 * The profile lives on the podcast-shows record as the `streamProfile`
 * JSON field: { sourceUrl, bitrateKbps, title, enabled,
 * nowPlayingEnabled }. `sourceUrl` is the show's Icecast mount URL —
 * the same URL listeners connect to; the relay pushes the program to
 * it as the `source` user with the show's source password.
 *
 * The credential NEVER lives in the profile JSON (the collection
 * validator rejects credential-shaped keys in it) and never in a
 * client payload or a log line. Following the repo's secret patterns
 * it is stored one of two ways, both resolved server-side only:
 *
 * - env-referenced: `streamCredentialEnvName` names an environment
 *   variable (e.g. `PODCAST_ICECAST_SOURCE_PASSWORD_<SHOW>`) whose
 *   value is the password. The stored field is the NAME, never the
 *   value — the sovereign/self-hosted pattern: secrets stay in the
 *   operator's environment, not the database.
 * - encrypted: `streamCredentialEncrypted` holds an AES-256-GCM
 *   envelope produced by the commerce POD connection cipher
 *   (`encryptCredential`/`decryptCredential` in
 *   src/modules/commerce/pod-connection.ts, keyed from
 *   RENEGADE_POD_ENCRYPTION_KEY / RENEGADE_ENCRYPTION_KEY). The field
 *   carries Payload field-level `access.read: false`, so REST/API
 *   responses never include even the envelope.
 *
 * `publicStreamProfile` is the ONLY projection other surfaces may
 * serialize: profile fields + `hasCredential`, never a credential,
 * never an envelope, never an env VALUE (the env name is operator
 * config, not a secret, but it is still kept out of public payloads —
 * only staff projections include it).
 */

import { decryptCredential, encryptCredential } from '../../commerce/pod-connection'
import { redact } from '../../core/logging'

export type StreamProfile = {
  /** Icecast mount URL the relay publishes to and listeners open, e.g. http://icecast.example:8000/show-live */
  sourceUrl: string
  bitrateKbps: number
  /** Stream title (Icecast ice-name) listeners see before any now-playing update. */
  title: string
  enabled: boolean
  /** Per-show toggle (POD-REQ-34): now-playing follows the POD-08 played-clip log. */
  nowPlayingEnabled: boolean
}

export type StreamProfileInput = Partial<StreamProfile> & Record<string, unknown>

const CREDENTIAL_KEYS = ['password', 'credential', 'secret', 'token', 'apikey', 'apiKey']

/**
 * Validates + normalizes a raw stream profile value. Throws with a
 * named error on anything invalid — including any credential-shaped
 * key smuggled into the JSON, which is refused outright (credentials
 * have their own storage, above).
 */
export function parseStreamProfile(raw: unknown): StreamProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Stream profile must be an object.')
  const value = raw as Record<string, unknown>
  for (const key of Object.keys(value)) {
    const lowered = key.toLowerCase()
    if (CREDENTIAL_KEYS.some((bad) => lowered.includes(bad)))
      throw new Error(
        `Stream profile must not contain credential field "${key}". Stream credentials are stored via the env-referenced or encrypted credential fields, never in the profile JSON.`,
      )
  }
  const sourceUrl = typeof value.sourceUrl === 'string' ? value.sourceUrl.trim() : ''
  if (!sourceUrl) throw new Error('Stream profile requires a sourceUrl (the Icecast mount URL).')
  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  } catch {
    throw new Error(`Stream profile sourceUrl is not a valid URL: ${sourceUrl}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('Stream profile sourceUrl must be an http(s) Icecast mount URL.')
  if (parsed.username || parsed.password)
    throw new Error(
      'Stream profile sourceUrl must not embed credentials — the relay adds the source credential from the show credential fields.',
    )
  if (!parsed.pathname || parsed.pathname === '/')
    throw new Error('Stream profile sourceUrl must name a mount path, e.g. http://host:8000/live.')
  const bitrateKbps = Number(value.bitrateKbps ?? 128)
  if (!Number.isFinite(bitrateKbps) || bitrateKbps < 16 || bitrateKbps > 320)
    throw new Error('Stream profile bitrateKbps must be between 16 and 320.')
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  if (!title) throw new Error('Stream profile requires a title (the Icecast stream name).')
  return {
    sourceUrl,
    bitrateKbps: Math.round(bitrateKbps),
    title,
    enabled: value.enabled !== false,
    nowPlayingEnabled: value.nowPlayingEnabled !== false,
  }
}

export const tryParseStreamProfile = (raw: unknown): StreamProfile | null => {
  if (raw == null) return null
  try {
    return parseStreamProfile(raw)
  } catch {
    return null
  }
}

/** The mount path of a profile's source URL, e.g. `/show-live`. */
export const streamMountPath = (profile: StreamProfile): string =>
  new URL(profile.sourceUrl).pathname

// ---------------------------------------------------------------------------
// Credential storage + resolution (server-side only)
// ---------------------------------------------------------------------------

export type StreamCredentialStorage = {
  /** Name of the environment variable holding the source password. */
  envName?: string
  /** AES-256-GCM envelope of the source password (never the password). */
  encrypted?: string
}

/** Encrypts a plaintext source password into its stored envelope form. */
export const encryptStreamCredential = (plaintext: string): string => encryptCredential(plaintext)

/**
 * Resolves the show's source password from its stored credential
 * fields. Server-side only — the return value must be handed to the
 * relay and nowhere else (never serialized, never logged). Returns
 * null when no credential is configured.
 */
export function resolveStreamCredential(
  storage: StreamCredentialStorage,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (storage.envName) {
    const value = env[storage.envName]
    return value ? value : null
  }
  if (storage.encrypted) return decryptCredential(storage.encrypted)
  return null
}

/** Reads the credential storage shape off a podcast-shows document. */
export const streamCredentialStorageOf = (
  show: Record<string, unknown>,
): StreamCredentialStorage => ({
  ...(typeof show.streamCredentialEnvName === 'string' && show.streamCredentialEnvName
    ? { envName: show.streamCredentialEnvName }
    : {}),
  ...(typeof show.streamCredentialEncrypted === 'string' && show.streamCredentialEncrypted
    ? { encrypted: show.streamCredentialEncrypted }
    : {}),
})

export const showHasStreamCredential = (show: Record<string, unknown>): boolean => {
  const storage = streamCredentialStorageOf(show)
  return Boolean(storage.envName || storage.encrypted)
}

// ---------------------------------------------------------------------------
// Projections + redaction
// ---------------------------------------------------------------------------

export type PublicStreamProfile = StreamProfile & {
  hasCredential: boolean
  /** The mount listeners open (same URL the relay publishes to, minus nothing). */
  listenerUrl: string
}

/**
 * The only stream-profile projection a client payload may carry: the
 * profile itself (which by construction holds no credential) plus a
 * boolean saying a credential exists. No envelope, no env name, no
 * password — asserted by the POD-16 redaction test.
 */
export function publicStreamProfile(show: Record<string, unknown>): PublicStreamProfile | null {
  const profile = tryParseStreamProfile(show.streamProfile)
  if (!profile) return null
  return {
    ...profile,
    hasCredential: showHasStreamCredential(show),
    listenerUrl: profile.sourceUrl,
  }
}

/**
 * Scrubs a text (a log line, an ffmpeg command line, an error) of the
 * stream credential in every shape it can travel in: raw, URL-encoded
 * (as it appears inside the icecast:// URL ffmpeg is handed) and
 * base64 (as it appears in the HTTP Basic authorization the source
 * handshake sends). Built on the core log redactor for everything
 * else it already knows about.
 */
export function redactStreamSecrets(text: string, credential: string | null | undefined): string {
  let out = String(redact(text, credential ? [credential] : []))
  if (credential) {
    const encoded = encodeURIComponent(credential)
    if (encoded !== credential) out = out.split(encoded).join('[REDACTED]')
    const basic = Buffer.from(`source:${credential}`).toString('base64')
    out = out.split(basic).join('[REDACTED]')
  }
  return out
}
