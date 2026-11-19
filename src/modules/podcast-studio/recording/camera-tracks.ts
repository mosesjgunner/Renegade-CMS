/**
 * POD-17 (POD-REQ-36, bounded) — Camera track CORE (pure TypeScript,
 * no DOM / Node imports; the browser MediaRecorder adapter lives in
 * camera-browser.ts and is UNVERIFIED in a real browser).
 *
 * A camera track is a participant's video-only WebM recording made
 * ALONGSIDE the POD-09 audio tracks on the same session clock. It is
 * deliberately NOT a POD-06 PCM journal track: the journal format is
 * s16 PCM timeslices, and camera bytes are an opaque encoded stream.
 * What the camera track shares with the audio tracks is the
 * DISCIPLINE, implemented here:
 *
 * - Track model: a `CameraTrackDefinition` bound to one participant
 *   (the host, or one guest by guest id) with the POD-00 manifest role
 *   `camera` (in the v1 role list since POD-00).
 * - Consent, FAIL-CLOSED: a camera track exists only when the
 *   participant explicitly opted in (`consent === true` on the
 *   definition). Constructing a recorder for a track without consent
 *   throws the named `CAMERA_CONSENT_REQUIRED` error — there is no
 *   code path that records a camera by default, by presence, or by
 *   another participant's consent. The manifest entry carries the
 *   consent flag so the grant (or its absence) is auditable forever;
 *   consumers read it through `cameraTrackConsentGranted`.
 * - Sync bookkeeping: the track's head sync event sits at its join
 *   offset on the SHARED session clock (samples at the session rate,
 *   exactly the POD-09 convention), and the tail event is written at
 *   stop from the caller's session-clock position. Chunk records note
 *   the session-clock sample at which each MediaRecorder timeslice
 *   arrived, so a later conform/render step can see where the video
 *   sits against the audio timeline. Lip-sync on real devices is
 *   UNVERIFIED — this bookkeeping is the input a sync check needs,
 *   not a sync guarantee.
 * - Manifest: `manifestTrack()` emits a POD-00 `TrackManifestTrack`
 *   (role `camera`, checksum = SHA-256 of the concatenated chunk
 *   bytes in arrival order, duration from the session-clock span),
 *   and `withCameraTracks` merges camera entries into a session
 *   manifest and re-validates the whole document against the POD-00
 *   parser before it leaves.
 *
 * The camera stream is VIDEO-ONLY by construction (the adapter
 * requests `{ video, audio: false }` — the participant's audio is
 * the POD-06/POD-09 raw track, never a second copy inside the WebM).
 * In manifest terms the track therefore carries `channels: 1` (one
 * video stream) and `channelLayout: 'video'`.
 */

import { sha256Hex } from '../capture/journal'
import { WORKING_SAMPLE_RATE } from '../capture/capture'
import {
  cameraTrackConsentGranted,
  parseTrackManifest,
  type TrackManifest,
  type TrackManifestTrack,
  type TrackSyncEvent,
} from '../contracts/track-manifest'

export class CameraTrackError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'CameraTrackError'
    this.code = code
  }
}

export type CameraTrackDefinition = {
  trackId: string
  /** POD-00 manifest role — always 'camera'. */
  role: 'camera'
  /** The participant this camera belongs to: 'host', or a guest-book id. */
  participantId: string
  /** Set for guest cameras (mirrors the manifest track's guestId). */
  guestId?: string
  /** The participant's explicit opt-in. Anything but `true` = NOT granted. */
  consent: boolean
  /** Session-clock sample at which this track's first frame sits. */
  joinedAtSample: number
}

/** The standard camera track id for a participant (`camera-host`, `camera-guest-<id>`). */
export const cameraTrackId = (participantId: string): string =>
  participantId === 'host' ? 'camera-host' : `camera-guest-${participantId}`

export function cameraTrackDefinition(input: {
  participantId: string
  guestId?: string
  consent?: boolean
  joinedAtSample?: number
}): CameraTrackDefinition {
  if (!input.participantId) throw new Error('A camera track requires a participant id.')
  if (input.joinedAtSample !== undefined && input.joinedAtSample < 0)
    throw new Error('A camera track join offset cannot be negative.')
  return {
    trackId: cameraTrackId(input.participantId),
    role: 'camera',
    participantId: input.participantId,
    ...(input.guestId ? { guestId: input.guestId } : {}),
    // Consent defaults OFF: only an explicit boolean true is stored as true.
    consent: input.consent === true,
    joinedAtSample: input.joinedAtSample ?? 0,
  }
}

export type CameraChunkRecord = {
  index: number
  byteLength: number
  /** Session-clock sample at which this chunk arrived. */
  atTimelineSample: number
  /** SHA-256 of this chunk's bytes. */
  checksumSha256: string
}

export type CameraTrackSummary = {
  definition: CameraTrackDefinition
  totalBytes: number
  totalChunks: number
  /** SHA-256 of the concatenated chunk bytes, in arrival order. */
  checksumSha256: string
  /** Session-clock span of the track, in seconds at the session rate. */
  durationSec: number
  syncEvents: TrackSyncEvent[]
  chunks: CameraChunkRecord[]
}

/**
 * Bookkeeping for ONE participant's camera track. The adapter feeds
 * it MediaRecorder chunks (opaque bytes) plus the session-clock
 * position at each arrival; everything testable about the track —
 * consent gating, chunk chain, sync events, manifest shape — lives
 * here and is headless-tested.
 */
export class CameraTrackRecorder {
  private chunks: CameraChunkRecord[] = []
  private parts: Uint8Array[] = []
  private totalBytes = 0
  private stopped = false
  private tailTimelineSample: number | null = null

  private constructor(
    readonly definition: CameraTrackDefinition,
    readonly sampleRate: number,
  ) {}

  /**
   * Opens bookkeeping for a camera track. REFUSES — with the named
   * `CAMERA_CONSENT_REQUIRED` error — unless the definition carries
   * the participant's explicit opt-in. This is the only constructor
   * path, so an unconsented camera can never be recorded through
   * this core.
   */
  static start(
    definition: CameraTrackDefinition,
    options: { sampleRate?: number } = {},
  ): CameraTrackRecorder {
    if (!cameraTrackConsentGranted(definition))
      throw new CameraTrackError(
        'CAMERA_CONSENT_REQUIRED',
        `Camera track "${definition.trackId}" has no recorded participant consent (consent defaults OFF); recording is refused.`,
      )
    return new CameraTrackRecorder(definition, options.sampleRate ?? WORKING_SAMPLE_RATE)
  }

  /** Records one MediaRecorder chunk arriving at a session-clock position. */
  appendChunk(bytes: Uint8Array, atTimelineSample: number): CameraChunkRecord {
    if (this.stopped) throw new Error('Camera track is stopped; chunks are refused.')
    if (bytes.byteLength === 0) throw new Error('A camera chunk must carry bytes.')
    if (!Number.isInteger(atTimelineSample) || atTimelineSample < this.definition.joinedAtSample)
      throw new Error(
        'A camera chunk cannot arrive before the track join offset on the session clock.',
      )
    const record: CameraChunkRecord = {
      index: this.chunks.length,
      byteLength: bytes.byteLength,
      atTimelineSample,
      checksumSha256: sha256Hex(bytes),
    }
    this.chunks.push(record)
    this.parts.push(new Uint8Array(bytes))
    this.totalBytes += bytes.byteLength
    return record
  }

  /** Head sync event (tail is fixed at stop). */
  headSyncEvent(): TrackSyncEvent {
    return {
      type: 'head',
      trackSamples: 0,
      timelineSamples: this.definition.joinedAtSample,
    }
  }

  /**
   * Seals the track at a session-clock position. The track's own
   * sample span is the timeline span (the video clock is the session
   * clock for bookkeeping purposes — see the header's sync note).
   */
  stop(atTimelineSample: number): CameraTrackSummary {
    if (this.stopped) throw new Error('Camera track is already stopped.')
    if (!Number.isInteger(atTimelineSample) || atTimelineSample < this.definition.joinedAtSample)
      throw new Error('A camera track cannot stop before its join offset.')
    this.stopped = true
    this.tailTimelineSample = atTimelineSample
    return this.summary()
  }

  summary(): CameraTrackSummary {
    const tail = this.tailTimelineSample ?? this.lastChunkSample()
    const spanSamples = Math.max(0, tail - this.definition.joinedAtSample)
    const all = new Uint8Array(this.totalBytes)
    let offset = 0
    for (const part of this.parts) {
      all.set(part, offset)
      offset += part.byteLength
    }
    return {
      definition: this.definition,
      totalBytes: this.totalBytes,
      totalChunks: this.chunks.length,
      checksumSha256: sha256Hex(all),
      durationSec: spanSamples / this.sampleRate,
      syncEvents: [
        this.headSyncEvent(),
        { type: 'tail', trackSamples: spanSamples, timelineSamples: tail },
      ],
      chunks: [...this.chunks],
    }
  }

  private lastChunkSample(): number {
    const last = this.chunks[this.chunks.length - 1]
    return last ? last.atTimelineSample : this.definition.joinedAtSample
  }

  /**
   * The POD-00 manifest entry for this track. Carries the consent
   * flag verbatim so the grant is part of the permanent record.
   */
  manifestTrack(mediaAssetId?: string): TrackManifestTrack {
    const summary = this.summary()
    return {
      trackId: this.definition.trackId,
      role: 'camera',
      ...(this.definition.guestId ? { guestId: this.definition.guestId } : {}),
      channels: 1,
      channelLayout: 'video',
      durationSec: summary.durationSec,
      checksumSha256: summary.checksumSha256,
      ...(mediaAssetId ? { mediaAssetId } : {}),
      syncEvents: summary.syncEvents,
      consent: this.definition.consent === true,
    }
  }
}

/**
 * Merges camera entries into a session's track manifest and returns
 * the result RE-VALIDATED against the POD-00 parser. A duplicate
 * track id is refused — a manifest never carries two tracks under
 * one id.
 */
export function withCameraTracks(
  manifest: TrackManifest,
  cameraTracks: TrackManifestTrack[],
): TrackManifest {
  const ids = new Set(manifest.tracks.map((track) => track.trackId))
  for (const track of cameraTracks) {
    if (track.role !== 'camera')
      throw new Error(`Track "${track.trackId}" is not a camera track (role "${track.role}").`)
    if (ids.has(track.trackId))
      throw new Error(`Track manifest already carries a track "${track.trackId}".`)
    ids.add(track.trackId)
  }
  return parseTrackManifest({ ...manifest, tracks: [...manifest.tracks, ...cameraTracks] })
}
