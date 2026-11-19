/**
 * POD-09 — Multitrack recorder CORE (pure TypeScript, no DOM / Node
 * imports; storage-agnostic over the POD-06 `ChunkStorage` interface).
 *
 * One journal per session: every track is a chunk stream in the POD-06
 * journal (one `ChunkJournal` per track, all sharing the session id),
 * timestamped in samples from ONE session clock — track-local sample 0
 * of a track that exists from the start IS timeline sample 0, and a
 * late-joiner track's sample 0 is its join offset on that same clock.
 * A head sync event is recorded for every track at start
 * ({ trackSamples: 0, timelineSamples: joinedAtSample }); the finalizer
 * (assemble.ts) writes those events into the POD-00 track manifest.
 *
 * Raw-track rules, enforced HERE in the track definitions and write
 * paths (reference manual ch.10 behaviour):
 * - ISO tracks (host, clips, guests) are RAW: the only transform the
 *   core ever applies at write time is the strip's fader gain / mute,
 *   read from strip state at the moment of the write. Processing
 *   (gate / EQ / compressor) is structurally excluded — there is no
 *   processing parameter anywhere on the ISO write path; POD-07's
 *   `gateForSend` exists precisely so sends get gated COPIES while ISO
 *   keeps the raw signal.
 * - The PROGRAM track is post-chain by construction: the caller writes
 *   the POD-07 program bus output (already mixed, mastered, limited).
 * - TALKBACK IS NEVER A TRACK. The track-kind union below has no
 *   'talkback' member, so a talkback track cannot be defined, opened
 *   or written — the same structural exclusion POD-07's routing uses.
 *
 * Gaps are first-class: `noteGap` records an explicit gap range on a
 * track (silence is journalled so chunk alignment stays trivial, and
 * the gap RECORD is what the finalizer turns into a manifest gap —
 * audio is never shifted to hide a hole).
 */

import { TIMESLICE_FRAMES, WORKING_SAMPLE_RATE } from '../capture/capture'
import { ChunkJournal, type ChunkStorage, type RecordingMeta } from '../capture/journal'
import { dbToLinear } from '../mixer/processing'
import type { StudioTrackRole, TrackSyncEvent } from '../contracts/track-manifest'

/**
 * Recordable track kinds. Deliberately NO 'talkback': the talkback send
 * (host → guests) is not a source and can never become a track.
 */
export type RecordingTrackKind = 'program' | 'host' | 'clips' | 'guest'

export const RECORDING_TRACK_KINDS: readonly RecordingTrackKind[] = [
  'program',
  'host',
  'clips',
  'guest',
]

export type TrackDefinition = {
  trackId: string
  kind: RecordingTrackKind
  /** POD-00 manifest role (guest tracks carry role 'guest' + guestId). */
  role: StudioTrackRole
  channels: number
  channelLayout: string
  /** Mixer strip this track taps (ISO gain/mute source); null for program. */
  stripId: string | null
  guestId?: string
  /** Session-clock sample at which this track's sample 0 sits. */
  joinedAtSample: number
}

const layoutFor = (channels: number): string => (channels === 2 ? 'stereo' : 'mono')

/** The standard desk track set: program + host ISO + clips ISO + one slot per guest. */
export const defaultTrackDefinitions = (guestIds: string[] = []): TrackDefinition[] => [
  {
    trackId: 'program',
    kind: 'program',
    role: 'program',
    channels: 2,
    channelLayout: 'stereo',
    stripId: null,
    joinedAtSample: 0,
  },
  {
    trackId: 'host',
    kind: 'host',
    role: 'host',
    channels: 1,
    channelLayout: 'mono',
    stripId: 'host',
    joinedAtSample: 0,
  },
  {
    trackId: 'clips',
    kind: 'clips',
    role: 'clips',
    channels: 2,
    channelLayout: 'stereo',
    stripId: 'clips',
    joinedAtSample: 0,
  },
  ...guestIds.map(
    (guestId): TrackDefinition => ({
      trackId: `guest-${guestId}`,
      kind: 'guest',
      role: 'guest',
      channels: 1,
      channelLayout: 'mono',
      stripId: guestId,
      guestId,
      joinedAtSample: 0,
    }),
  ),
]

export const guestTrackDefinition = (guestId: string, joinedAtSample: number): TrackDefinition => ({
  trackId: `guest-${guestId}`,
  kind: 'guest',
  role: 'guest',
  channels: 1,
  channelLayout: 'mono',
  stripId: guestId,
  guestId,
  joinedAtSample,
})

/** The journal recording id for one track of a session. */
export const sessionRecordingId = (sessionId: string, trackId: string): string =>
  `${sessionId}__${trackId}`

export type TrackGap = {
  trackId: string
  /** Track-local first silent sample of the gap. */
  fromSample: number
  frames: number
  reason: 'explicit' | 'late-join'
}

export type TrackHealth = {
  trackId: string
  kind: RecordingTrackKind
  chunksJournaled: number
  framesWritten: number
  /** Session-clock sample of the end of the last write (join offset + frames). */
  lastWriteSample: number
  gaps: TrackGap[]
}

export type TrackStopSummary = {
  definition: TrackDefinition
  totalFrames: number
  totalChunks: number
  checksum: string
  syncEvents: TrackSyncEvent[]
  gaps: TrackGap[]
}

type TrackRuntime = {
  definition: TrackDefinition
  journal: ChunkJournal
  pending: Float32Array[]
  pendingFrames: number
  gaps: TrackGap[]
}

const assertTrackKind = (kind: string): RecordingTrackKind => {
  if (!(RECORDING_TRACK_KINDS as readonly string[]).includes(kind))
    throw new Error(
      `Unknown recording track kind "${kind}". Recordable kinds are ${RECORDING_TRACK_KINDS.join(', ')} — talkback is a send, never a track.`,
    )
  return kind as RecordingTrackKind
}

export class MultitrackRecorder {
  private tracks = new Map<string, TrackRuntime>()
  private stopped = false

  private constructor(
    private readonly storage: ChunkStorage,
    readonly sessionId: string,
    readonly sampleRate: number,
  ) {}

  static async start(
    storage: ChunkStorage,
    input: { sessionId: string; sampleRate?: number; tracks: TrackDefinition[] },
  ): Promise<MultitrackRecorder> {
    const recorder = new MultitrackRecorder(
      storage,
      input.sessionId,
      input.sampleRate ?? WORKING_SAMPLE_RATE,
    )
    for (const definition of input.tracks) await recorder.addTrack(definition)
    return recorder
  }

  /**
   * Opens a track's journal. Late joiners pass a definition whose
   * `joinedAtSample` is their offset on the session clock; the offset
   * is recorded as a leading gap — never backfilled with fake audio.
   */
  async addTrack(definition: TrackDefinition): Promise<void> {
    if (this.stopped) throw new Error('Recorder is stopped; no new tracks can be added.')
    assertTrackKind(definition.kind)
    if (this.tracks.has(definition.trackId))
      throw new Error(`Track "${definition.trackId}" already exists in this session.`)
    if (definition.joinedAtSample < 0) throw new Error('A track join offset cannot be negative.')
    const journal = await ChunkJournal.open(this.storage, {
      recordingId: sessionRecordingId(this.sessionId, definition.trackId),
      sessionId: this.sessionId,
      trackId: definition.trackId,
      channels: definition.channels,
      sampleRate: this.sampleRate,
    } satisfies RecordingMeta)
    const gaps: TrackGap[] =
      definition.joinedAtSample > 0
        ? [
            {
              trackId: definition.trackId,
              fromSample: -definition.joinedAtSample,
              frames: definition.joinedAtSample,
              reason: 'late-join',
            },
          ]
        : []
    this.tracks.set(definition.trackId, {
      definition,
      journal,
      pending: [],
      pendingFrames: 0,
      gaps,
    })
  }

  get trackDefinitions(): TrackDefinition[] {
    return [...this.tracks.values()].map((track) => track.definition)
  }

  /** The session clock: the furthest timeline sample any track has reached. */
  get sessionFrames(): number {
    let frames = 0
    for (const track of this.tracks.values())
      frames = Math.max(
        frames,
        track.definition.joinedAtSample + track.journal.framesRecorded + track.pendingFrames,
      )
    return frames
  }

  private runtime(trackId: string): TrackRuntime {
    const track = this.tracks.get(trackId)
    if (!track) throw new Error(`No track "${trackId}" in this recording session.`)
    return track
  }

  private async flushFullChunks(track: TrackRuntime): Promise<void> {
    const channels = track.definition.channels
    while (track.pendingFrames >= TIMESLICE_FRAMES) {
      const out = new Float32Array(TIMESLICE_FRAMES * channels)
      let written = 0
      while (written < out.length && track.pending.length > 0) {
        const head = track.pending[0]!
        const take = Math.min(head.length, out.length - written)
        out.set(head.subarray(0, take), written)
        written += take
        if (take === head.length) track.pending.shift()
        else track.pending[0] = head.subarray(take)
      }
      track.pendingFrames -= TIMESLICE_FRAMES
      await track.journal.appendChunk(out)
    }
  }

  private async buffer(track: TrackRuntime, pcm: Float32Array): Promise<void> {
    const channels = track.definition.channels
    if (pcm.length % channels !== 0)
      throw new Error(
        `Track "${track.definition.trackId}" PCM length must be a whole number of frames for its channel count.`,
      )
    track.pending.push(new Float32Array(pcm))
    track.pendingFrames += pcm.length / channels
    await this.flushFullChunks(track)
  }

  /**
   * Writes interleaved PCM to a track exactly as given. This is the
   * PROGRAM path (post-chain audio) and the low-level path the ISO
   * writer below feeds after applying strip gain.
   */
  async write(trackId: string, pcm: Float32Array): Promise<void> {
    if (this.stopped) throw new Error('Recorder is stopped; writes are refused.')
    await this.buffer(this.runtime(trackId), pcm)
  }

  /**
   * The ISO write path: RAW source PCM + the strip's CURRENT fader/mute
   * state. Gain is applied at write time from strip state (a muted strip
   * journals silence; a −6 dB fader journals at −6 dB). NO processing
   * (gate/EQ/comp) exists on this path — that exclusion is structural,
   * not a flag.
   */
  async writeIso(
    trackId: string,
    rawPcm: Float32Array,
    strip: { gainDb: number; muted: boolean },
  ): Promise<void> {
    const track = this.runtime(trackId)
    if (track.definition.kind === 'program')
      throw new Error('The program track is post-chain; write it with write(), not writeIso().')
    const gain = strip.muted ? 0 : dbToLinear(strip.gainDb)
    if (gain === 1) {
      await this.write(trackId, rawPcm)
      return
    }
    const scaled = new Float32Array(rawPcm.length)
    for (let i = 0; i < rawPcm.length; i++) scaled[i] = (rawPcm[i] ?? 0) * gain
    await this.write(trackId, scaled)
  }

  /**
   * Records an explicit gap of `frames` silent frames on a track (e.g.
   * a dropped capture block the desk knows about). Silence is
   * journalled so the chunk stream stays aligned; the gap record is
   * what surfaces in the manifest — the hole is named, never hidden.
   */
  async noteGap(trackId: string, frames: number): Promise<void> {
    if (this.stopped) throw new Error('Recorder is stopped; gaps are refused.')
    if (!(frames > 0)) throw new Error('A gap must cover a positive number of frames.')
    const track = this.runtime(trackId)
    const fromSample = track.journal.framesRecorded + track.pendingFrames
    track.gaps.push({ trackId, fromSample, frames, reason: 'explicit' })
    await this.buffer(track, new Float32Array(frames * track.definition.channels))
  }

  /** Per-track health for the on-air bar: chunk counts, last-write sample, gaps. */
  health(): TrackHealth[] {
    return [...this.tracks.values()].map((track) => ({
      trackId: track.definition.trackId,
      kind: track.definition.kind,
      chunksJournaled: track.journal.chunkCount,
      framesWritten: track.journal.framesRecorded + track.pendingFrames,
      lastWriteSample:
        track.definition.joinedAtSample + track.journal.framesRecorded + track.pendingFrames,
      gaps: [...track.gaps],
    }))
  }

  /** Head sync event for a track (tail events are computed at finalize). */
  headSyncEvent(trackId: string): TrackSyncEvent {
    const track = this.runtime(trackId)
    return { type: 'head', trackSamples: 0, timelineSamples: track.definition.joinedAtSample }
  }

  /**
   * Flushes every track's buffered tail as its final chunk and closes
   * every journal. Returns per-track summaries with head+tail sync
   * events on the shared session clock.
   */
  async stop(): Promise<TrackStopSummary[]> {
    if (this.stopped) throw new Error('Recorder is already stopped.')
    this.stopped = true
    const summaries: TrackStopSummary[] = []
    for (const track of this.tracks.values()) {
      if (track.pendingFrames > 0) {
        const channels = track.definition.channels
        const tail = new Float32Array(track.pendingFrames * channels)
        let written = 0
        for (const part of track.pending) {
          tail.set(part, written)
          written += part.length
        }
        track.pending = []
        track.pendingFrames = 0
        await track.journal.appendChunk(tail, { final: true })
      }
      const footer = await track.journal.finalize()
      summaries.push({
        definition: track.definition,
        totalFrames: footer.totalFrames,
        totalChunks: footer.totalChunks,
        checksum: footer.checksum,
        syncEvents: [
          { type: 'head', trackSamples: 0, timelineSamples: track.definition.joinedAtSample },
          {
            type: 'tail',
            trackSamples: footer.totalFrames,
            timelineSamples: track.definition.joinedAtSample + footer.totalFrames,
          },
        ],
        gaps: [...track.gaps],
      })
    }
    return summaries
  }
}
