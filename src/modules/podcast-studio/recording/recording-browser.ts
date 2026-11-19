/**
 * POD-09 — Recording browser adapter (THIN; real-browser behaviour
 * UNVERIFIED).
 *
 * Taps the POD-07 mixer graph into the multitrack recorder:
 * - PROGRAM track ← the graph's program destination stream (post-chain
 *   mix: routing + master + limiter already applied by the engine).
 * - HOST ISO ← the host's RAW master capture stream (the POD-06
 *   dual-path master, processing off) — never the mixer's processed
 *   host send.
 * - CLIPS ISO ← the raw clips source stream feeding the graph.
 * - Guest ISO slots ← per-guest raw return streams (POD-10/11 populate
 *   these; the slot model exists in the core now).
 *
 * Each tap runs through the POD-06 PCM capture worklet
 * (`connectCaptureNode`, 250 ms chunks on a shared sample clock) into
 * the MultitrackRecorder over OPFS journal storage. Strip gain/mute
 * for ISO writes is read live from the caller's mixer state at chunk
 * time, so a fader move mid-show lands in the ISO exactly as the desk
 * performed it. Talkback has no tap and no track — structurally.
 *
 * UNVERIFIED: no real browser, AudioContext, worklet or OPFS was
 * exercised in POD-09. The proven layer is the core (multitrack.ts /
 * assemble.ts) over in-memory and directory storage.
 */

import { OpfsChunkStorage } from '../capture/journal-opfs'
import { connectCaptureNode, type CaptureNodeHandle } from '../capture/worklet/loader'
import type { MixerGraphHandle } from '../mixer/engine-browser'
import type { MixerState } from '../mixer/state'
import {
  MultitrackRecorder,
  defaultTrackDefinitions,
  guestTrackDefinition,
  type TrackDefinition,
} from './multitrack'
import type { RecordingState } from './recording-session'
import { getRecordingState, type SessionDocWithRecording } from './recording-session'
import type { StudioSessionDoc } from '../session-engine'

export type RecordingTapStreams = {
  /** Host RAW master stream (POD-06 master path). */
  hostRaw: MediaStream
  /** Clips source stream (raw, pre-graph). */
  clipsRaw: MediaStream
  /** Per-guest raw return streams, keyed by guest id. */
  guestsRaw?: Record<string, MediaStream>
}

export class RecordingBrowserAdapter {
  private recorder: MultitrackRecorder | null = null
  private handles: CaptureNodeHandle[] = []

  constructor(private readonly storage: OpfsChunkStorage = new OpfsChunkStorage()) {}

  /**
   * Starts recording: opens the multitrack journals and connects one
   * capture node per tap. `getMixerState` is read at every chunk so
   * ISO gain/mute follows the live desk.
   */
  async start(input: {
    context: AudioContext
    session: StudioSessionDoc
    graph: MixerGraphHandle
    taps: RecordingTapStreams
    getMixerState: () => MixerState
    guestIds?: string[]
  }): Promise<void> {
    if (this.recorder) throw new Error('Recording adapter is already recording.')
    const guestIds = input.guestIds ?? []
    const definitions = defaultTrackDefinitions(guestIds)
    this.recorder = await MultitrackRecorder.start(this.storage, {
      sessionId: input.session.id,
      tracks: definitions,
    })
    const recorder = this.recorder
    const stripFor = (trackId: string) => {
      const state = input.getMixerState()
      const strip = state.strips.find((entry) => entry.id === trackId)
      return { gainDb: strip?.gainDb ?? 0, muted: strip?.muted ?? false }
    }
    const wire = async (stream: MediaStream, trackId: string, iso: boolean): Promise<void> => {
      const handle = await connectCaptureNode(input.context, stream, (message) => {
        if (iso) void recorder.writeIso(trackId, message.pcm, stripFor(trackId))
        else void recorder.write(trackId, message.pcm)
      })
      this.handles.push(handle)
    }
    await wire(input.graph.programDestination.stream, 'program', false)
    await wire(input.taps.hostRaw, 'host', true)
    await wire(input.taps.clipsRaw, 'clips', true)
    for (const guestId of guestIds) {
      const stream = input.taps.guestsRaw?.[guestId]
      if (stream) await wire(stream, `guest-${guestId}`, true)
    }
  }

  /** Registers a late-joiner guest track at the current session-clock offset. */
  async addGuestTrack(
    context: AudioContext,
    guestId: string,
    stream: MediaStream,
    getMixerState: () => MixerState,
  ): Promise<TrackDefinition> {
    if (!this.recorder) throw new Error('Recording adapter is not recording.')
    const definition = guestTrackDefinition(guestId, this.recorder.sessionFrames)
    await this.recorder.addTrack(definition)
    const recorder = this.recorder
    const handle = await connectCaptureNode(context, stream, (message) => {
      const strip = getMixerState().strips.find((entry) => entry.id === guestId)
      void recorder.writeIso(definition.trackId, message.pcm, {
        gainDb: strip?.gainDb ?? 0,
        muted: strip?.muted ?? false,
      })
    })
    this.handles.push(handle)
    return definition
  }

  /** The on-air bar data: the POD-05 session document's recording state, refreshed with live track health. */
  onAirState(session: StudioSessionDoc): RecordingState | null {
    const state = getRecordingState(session)
    if (!state) return null
    return {
      ...state,
      trackHealth: this.recorder ? this.recorder.health() : state.trackHealth,
    }
  }

  /** Stops every tap and closes every journal; returns the per-track stop summaries. */
  async stop(session: SessionDocWithRecording) {
    void session
    for (const handle of this.handles) handle.disconnect()
    this.handles = []
    if (!this.recorder) return []
    const summaries = await this.recorder.stop()
    this.recorder = null
    return summaries
  }
}
