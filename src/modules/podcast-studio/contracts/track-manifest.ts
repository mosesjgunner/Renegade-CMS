import {
  assertArray,
  assertBoolean,
  assertChecksumSha256,
  assertFiniteNumber,
  assertNonEmptyString,
  assertNonNegativeInteger,
  assertNonNegativeTime,
  assertOptionalString,
  assertPositiveInteger,
  assertPositiveNumber,
  assertRecord,
  assertVersion1,
  coerceInput,
  requireField,
} from './validation'

/**
 * TrackManifest v1 — the Podcast Studio recorded-track manifest (POD-00).
 *
 * One manifest is written when a recording session is finalized (POD-09):
 * it binds every recorded track to its session, sample rate, channel
 * layout, duration and SHA-256 checksum, and carries the head/tail sync
 * events (PT-B journal concept; PT-F conform inputs) plus an optional
 * per-track rate correction in parts per million.
 *
 * POD-17 additive extension (still v1, NO version bump): the `camera`
 * role has been part of the v1 role list since POD-00; POD-17 adds one
 * OPTIONAL field, `consent`, meaningful on camera tracks only. The
 * POD-00 versioning rule is that a bump is required only when existing
 * documents would stop parsing or change meaning — an additive
 * optional field does neither (every pre-POD-17 v1 manifest still
 * parses byte-identically), so the version stays 1, following the
 * POD-07/POD-09 precedent of additive extensions inside v1. Consent
 * semantics are FAIL-CLOSED: an absent `consent` means consent was NOT
 * granted (see `cameraTrackConsentGranted`).
 */

export type StudioTrackRole = 'program' | 'host' | 'clips' | 'guest' | 'screen' | 'camera'

export const STUDIO_TRACK_ROLES: readonly StudioTrackRole[] = [
  'program',
  'host',
  'clips',
  'guest',
  'screen',
  'camera',
]

export type TrackSyncEvent = {
  type: 'head' | 'tail'
  trackSamples: number
  timelineSamples: number
}

export type TrackManifestTrack = {
  trackId: string
  role: StudioTrackRole
  guestId?: string
  channels: number
  channelLayout: string
  durationSec: number
  checksumSha256: string
  mediaAssetId?: string
  syncEvents: TrackSyncEvent[]
  rateCorrectionPpm?: number
  /**
   * POD-17, camera tracks only: the participant's explicit opt-in to
   * camera recording. ABSENT MEANS NOT GRANTED — consent defaults OFF
   * and every consumer must read it through
   * `cameraTrackConsentGranted` (fail-closed), never as truthy-by-
   * presence. A camera track whose consent is not `true` must never
   * be recorded, rendered or published.
   */
  consent?: boolean
}

/**
 * Fail-closed consent read for a manifest track: only an explicit
 * boolean `true` grants consent. Absent, false, or any non-boolean
 * value (an unparsed document) all mean NOT granted.
 */
export const cameraTrackConsentGranted = (track: { role?: string; consent?: unknown }): boolean =>
  track.role === 'camera' && track.consent === true

export type TrackManifest = {
  version: 1
  sessionId: string
  createdAt: string
  sampleRate: number
  tracks: TrackManifestTrack[]
}

export const parseTrackManifest = (value: unknown): TrackManifest => {
  const manifest = coerceInput(value, 'TrackManifest')
  assertVersion1(manifest, 'TrackManifest')
  assertNonEmptyString(
    requireField(manifest, 'sessionId', 'TrackManifest'),
    'TrackManifest.sessionId',
  )
  assertNonEmptyString(
    requireField(manifest, 'createdAt', 'TrackManifest'),
    'TrackManifest.createdAt',
  )
  assertPositiveNumber(
    requireField(manifest, 'sampleRate', 'TrackManifest'),
    'TrackManifest.sampleRate',
  )

  const tracks = assertArray(
    requireField(manifest, 'tracks', 'TrackManifest'),
    'TrackManifest.tracks',
  )
  tracks.forEach((entry, index) => {
    const label = `TrackManifest.tracks[${index}]`
    const track = assertRecord(entry, label)
    assertNonEmptyString(requireField(track, 'trackId', label), `${label}.trackId`)
    const role = assertNonEmptyString(requireField(track, 'role', label), `${label}.role`)
    if (!STUDIO_TRACK_ROLES.includes(role as StudioTrackRole))
      throw new Error(
        `${label}.role must be one of ${STUDIO_TRACK_ROLES.join(', ')}; received "${role}".`,
      )
    assertOptionalString(track.guestId, `${label}.guestId`)
    assertPositiveInteger(requireField(track, 'channels', label), `${label}.channels`)
    assertNonEmptyString(requireField(track, 'channelLayout', label), `${label}.channelLayout`)
    assertNonNegativeTime(requireField(track, 'durationSec', label), `${label}.durationSec`)
    assertChecksumSha256(requireField(track, 'checksumSha256', label), `${label}.checksumSha256`)
    assertOptionalString(track.mediaAssetId, `${label}.mediaAssetId`)
    if (track.rateCorrectionPpm !== undefined)
      assertFiniteNumber(track.rateCorrectionPpm, `${label}.rateCorrectionPpm`)
    if (track.consent !== undefined) assertBoolean(track.consent, `${label}.consent`)

    const syncEvents = assertArray(requireField(track, 'syncEvents', label), `${label}.syncEvents`)
    syncEvents.forEach((syncEntry, syncIndex) => {
      const syncLabel = `${label}.syncEvents[${syncIndex}]`
      const sync = assertRecord(syncEntry, syncLabel)
      const type = assertNonEmptyString(requireField(sync, 'type', syncLabel), `${syncLabel}.type`)
      if (type !== 'head' && type !== 'tail')
        throw new Error(`${syncLabel}.type must be "head" or "tail"; received "${type}".`)
      assertNonNegativeInteger(
        requireField(sync, 'trackSamples', syncLabel),
        `${syncLabel}.trackSamples`,
      )
      assertNonNegativeInteger(
        requireField(sync, 'timelineSamples', syncLabel),
        `${syncLabel}.timelineSamples`,
      )
    })
  })

  return manifest as unknown as TrackManifest
}

export const assertTrackManifest = (value: unknown): TrackManifest => parseTrackManifest(value)

/** Serializes a validated track manifest to JSON; `parseTrackManifest` accepts this string directly. */
export const serializeTrackManifest = (manifest: TrackManifest): string =>
  JSON.stringify(manifest, null, 2)
