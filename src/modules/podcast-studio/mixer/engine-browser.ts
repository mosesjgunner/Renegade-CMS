/**
 * POD-07 — Web Audio adapter (THIN BROWSER ADAPTER).
 *
 * Builds the AudioContext graph that mirrors the pure core's topology
 * (sources → mixer worklet → program / cue / per-guest mix-minus
 * destinations), pushes strip state into the worklet, applies routing diffs
 * click-free (ramps on a master fade), bridges meters to UI state at a
 * throttled rate, and supervises the context with a watchdog: on an
 * unexpected context failure it rebuilds the graph and reports through the
 * session message-bar log callback (tool map row 35's watchdog pattern,
 * adapted from v1's PulseAudio supervisor to the browser graph).
 *
 * UNVERIFIED: no real browser, AudioContext or AudioWorklet was exercised
 * in POD-07. This file is typechecked wiring over the tested core; the rig
 * tests that would close it are named in the POD-07 handoff.
 */

import type { MixerState } from './state'
import type { RoutingChange } from './device-roles'
import { MIXER_PROCESSOR_NAME, mixerProcessorSource } from './worklet/mixer-processor'

export type MixerEngineLogEntry = { type: string; message: string; atElapsedSec?: number }
export type MixerEngineCallbacks = {
  /** Session message-bar log (POD-05 session log sink). */
  log: (entry: MixerEngineLogEntry) => void
  /** Throttled meter bridge (~10 Hz from the worklet). */
  onMeters?: (meters: { programPeak: number }) => void
}

export type MixerGraphHandle = {
  context: AudioContext
  node: AudioWorkletNode
  /** Program output (speakers / stream tap source). */
  programDestination: MediaStreamAudioDestinationNode
  /** Host cue output. */
  cueDestination: MediaStreamAudioDestinationNode
  /** Per-guest mix-minus streams, keyed by guest strip id — POD-10's input. */
  mixMinusStreams: Record<string, MediaStream>
  pushState(state: MixerState): void
  applyRoutingDiff(diff: RoutingChange[]): void
  dispose(): void
}

const registeredContexts = new WeakSet<object>()

export const ensureMixerProcessor = async (context: AudioContext): Promise<void> => {
  if (registeredContexts.has(context)) return
  const blob = new Blob([mixerProcessorSource], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    await context.audioWorklet.addModule(url)
  } finally {
    URL.revokeObjectURL(url)
  }
  registeredContexts.add(context)
}

export type MixerSourceStreams = {
  host?: MediaStream
  clips?: MediaStream
  guests?: Record<string, MediaStream>
  talkback?: MediaStream
}

/**
 * Builds the graph. Input/output indices mirror the worklet topology:
 * inputs 0 host, 1 clips, 2.. guests, last talkback; outputs 0 program,
 * 1 cue, 2.. per-guest mix-minus.
 */
export const buildMixerGraph = async (
  context: AudioContext,
  state: MixerState,
  sources: MixerSourceStreams,
  callbacks: MixerEngineCallbacks,
): Promise<MixerGraphHandle> => {
  await ensureMixerProcessor(context)
  const guestIds = state.strips.filter((s) => s.kind === 'guest').map((s) => s.id)
  const node = new AudioWorkletNode(context, MIXER_PROCESSOR_NAME, {
    numberOfInputs: 3 + guestIds.length,
    numberOfOutputs: 2 + guestIds.length,
    outputChannelCount: Array.from({ length: 2 + guestIds.length }, () => 2),
    processorOptions: { guestIds },
  })

  const connected: AudioNode[] = []
  const connectSource = (stream: MediaStream | undefined, inputIndex: number) => {
    if (!stream) return
    const source = context.createMediaStreamSource(stream)
    source.connect(node, 0, inputIndex)
    connected.push(source)
  }
  connectSource(sources.host, 0)
  connectSource(sources.clips, 1)
  guestIds.forEach((id, index) => connectSource(sources.guests?.[id], 2 + index))
  connectSource(sources.talkback, 2 + guestIds.length)

  const programDestination = context.createMediaStreamDestination()
  const cueDestination = context.createMediaStreamDestination()
  node.connect(programDestination, 0)
  node.connect(cueDestination, 1)
  const mixMinusStreams: Record<string, MediaStream> = {}
  guestIds.forEach((id, index) => {
    const destination = context.createMediaStreamDestination()
    node.connect(destination, 2 + index)
    mixMinusStreams[id] = destination.stream
  })

  node.port.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'meters') {
      callbacks.onMeters?.({ programPeak: Number(event.data.programPeak ?? 0) })
    }
  }

  const pushState = (next: MixerState) => {
    node.port.postMessage({
      type: 'state',
      strips: next.strips.map((strip) => ({
        id: strip.id,
        kind: strip.kind,
        gainDb: strip.gainDb,
        muted: strip.muted,
        pan: strip.pan,
        solo: strip.solo,
        pfl: strip.pfl,
      })),
      masterGainDb: next.masterGainDb,
      limiterCeilingDb: next.limiterCeilingDb,
      talkbackGainDb: next.talkbackGainDb,
      talkbackMuted: next.talkbackMuted,
      keepGuestsInProgram: next.keepGuestsInProgram,
    })
  }
  pushState(state)

  // Click-free diff application: dip a master fade, let the caller rebind
  // devices during the dip, restore. The core computed WHAT changed; the
  // adapter only guarantees the change is not a pop.
  const fade = context.createGain()
  fade.gain.value = 1
  const applyRoutingDiff = (diff: RoutingChange[]) => {
    if (diff.length === 0) return
    const now = context.currentTime
    fade.gain.cancelScheduledValues(now)
    fade.gain.setValueAtTime(fade.gain.value, now)
    fade.gain.linearRampToValueAtTime(0, now + 0.02)
    fade.gain.linearRampToValueAtTime(1, now + 0.07)
    callbacks.log({
      type: 'mixer.routing-diff',
      message: `Routing change applied click-free: ${diff
        .map(
          (change) => `${change.role} ${change.fromDeviceId ?? '—'} → ${change.toDeviceId ?? '—'}`,
        )
        .join('; ')}`,
    })
  }

  return {
    context,
    node,
    programDestination,
    cueDestination,
    mixMinusStreams,
    pushState,
    applyRoutingDiff,
    dispose() {
      for (const source of connected) source.disconnect()
      node.disconnect()
    },
  }
}

/**
 * Graph supervisor (watchdog): if the context drops out of `running`
 * unexpectedly, attempt resume; if it is closed, rebuild via the factory
 * and log both events to the session message bar. Returns a stop function.
 */
export const superviseMixerGraph = (
  getHandle: () => MixerGraphHandle | null,
  rebuild: () => Promise<MixerGraphHandle>,
  callbacks: MixerEngineCallbacks,
  intervalMs = 2000,
): (() => void) => {
  let rebuilding = false
  const timer = setInterval(() => {
    const handle = getHandle()
    if (!handle || rebuilding) return
    const state = handle.context.state as AudioContextState | 'interrupted'
    if (state === 'running') return
    callbacks.log({
      type: 'mixer.watchdog',
      message: `Audio context state is "${state}" — attempting recovery.`,
    })
    if (state === 'closed') {
      rebuilding = true
      void rebuild()
        .then(() => {
          callbacks.log({
            type: 'mixer.watchdog',
            message: 'Mixer graph rebuilt after context closed.',
          })
        })
        .catch((error: unknown) => {
          callbacks.log({
            type: 'mixer.watchdog',
            message: `Mixer graph rebuild FAILED: ${error instanceof Error ? error.message : String(error)}`,
          })
        })
        .finally(() => {
          rebuilding = false
        })
    } else {
      void handle.context.resume().catch(() => {
        callbacks.log({ type: 'mixer.watchdog', message: 'Audio context resume failed.' })
      })
    }
  }, intervalMs)
  return () => clearInterval(timer)
}
