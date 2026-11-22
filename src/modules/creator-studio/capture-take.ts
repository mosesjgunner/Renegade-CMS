import { recordingGraph, type CaptureSources } from './capture-browser'
import type { CaptureManifest, CaptureMode } from './capture-contract'
import { RecordingJournal } from './capture-sync'

type Phase = 'countdown' | 'recording' | 'paused' | 'saving' | 'review'
export type ActiveTake = Awaited<ReturnType<typeof prepareTake>>

export async function prepareTake(input: {
  db: IDBDatabase | null
  scope: string
  mode: CaptureMode
  sources: CaptureSources
  screen: HTMLVideoElement | null
  camera: HTMLVideoElement | null
  onUpdate: () => void
  onPhase: (phase: Phase, seconds?: number) => void
}) {
  const consent = new Date().toISOString()
  const graph = await recordingGraph(input.sources, input.screen, input.camera)
  const { tracks } = graph
  const manifest: CaptureManifest = {
    version: 1,
    key: crypto.randomUUID(),
    mode: input.mode,
    localConsentAt: consent,
    createdAt: consent,
    tracks: tracks.map(({ track }) => track),
    pauses: [],
    orientation: [],
  }
  const journal = new RecordingJournal(input.db, input.scope, manifest, input.onUpdate)
  await journal.prepare()
  let origin = 0
  let stopped: Promise<void> | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let reason: string | undefined
  const started = new Set<MediaRecorder>()
  let accepting = true
  const elapsed = () => Math.max(0, performance.now() - origin)
  const orientation = () => {
    if (manifest.orientation.length >= 64) return
    const angle = window.screen.orientation?.angle ?? window.orientation ?? 0
    const portrait = matchMedia('(orientation: portrait)').matches
    manifest.orientation.push({ atMs: elapsed(), angle, portrait })
    void journal.checkpoint()
  }
  const finish = tracks.map(
    ({ recorder, track }) =>
      new Promise<void>((resolve) => {
        recorder.ondataavailable = (event) => {
          if (!accepting || !event.data.size) return
          const mimeType = event.data.type || recorder.mimeType
          track.mimeType = mimeType
          journal.append(
            {
              track: track.id,
              bytes: event.data,
              mimeType,
              eventMs: elapsed(),
              timecodeMs:
                Number.isFinite(event.timecode) && event.timecode >= 0 ? event.timecode : undefined,
            },
            (failure) => void stop(failure),
          )
        }
        recorder.onstop = () => {
          resolve()
          if (!stopped)
            void stop('A capture source ended unexpectedly. Reconnect it and start a new take.')
        }
        recorder.onerror = () =>
          void stop('The browser encoder stopped. Review the data saved before the error.')
      }),
  )
  function stop(failure?: string) {
    reason ??= failure
    if (stopped) return stopped
    stopped = Promise.resolve().then(async () => {
      clearInterval(timer)
      input.onPhase('saving')
      window.removeEventListener('orientationchange', orientation)
      window.screen.orientation?.removeEventListener?.('change', orientation)
      manifest.endedMs = origin ? elapsed() : 0
      const pending = []
      for (const [index, { recorder }] of tracks.entries()) {
        if (!started.has(recorder)) continue
        pending.push(finish[index])
        if (recorder.state !== 'inactive') recorder.stop()
      }
      let deadline: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        Promise.all(pending),
        new Promise((resolve) => {
          deadline = setTimeout(() => {
            reason ??=
              'The browser did not finish flushing the encoder. Part of the tail may be missing.'
            resolve(undefined)
          }, 4000)
        }),
      ])
      clearTimeout(deadline)
      accepting = false
      input.sources.close()
      graph.close()
      manifest.endReason = reason
      await journal.checkpoint(true)
      input.onPhase('review')
    })
    return stopped
  }
  function begin() {
    origin = performance.now()
    orientation()
    window.addEventListener('orientationchange', orientation)
    window.screen.orientation?.addEventListener?.('change', orientation)
    try {
      for (const { track, recorder } of tracks) {
        track.startedMs = elapsed()
        recorder.start(1000)
        started.add(recorder)
        track.mimeType = recorder.mimeType
      }
      input.onPhase('recording')
    } catch {
      void stop('The browser could not start one of the recording tracks.')
    }
  }
  function countdown() {
    let seconds = 3
    input.onPhase('countdown', seconds)
    timer = setInterval(() => {
      seconds--
      if (seconds > 0) input.onPhase('countdown', seconds)
      else {
        clearInterval(timer)
        begin()
      }
    }, 1000)
  }
  const canPause = tracks.every(
    ({ recorder }) => typeof recorder.pause === 'function' && typeof recorder.resume === 'function',
  )
  function togglePause() {
    if (!canPause || stopped) return
    try {
      const state = tracks[0].recorder.state
      if (state === 'recording' && manifest.pauses.length < 128) {
        for (const { recorder } of tracks) recorder.pause()
        manifest.pauses.push({ atMs: elapsed() })
        void journal.checkpoint()
        input.onPhase('paused')
      }
      if (state === 'paused') {
        for (const { recorder } of tracks) recorder.resume()
        const pause = manifest.pauses.at(-1)
        if (pause) pause.resumedMs = elapsed()
        void journal.checkpoint()
        input.onPhase('recording')
      }
    } catch {
      void stop('A browser encoder could not pause or resume. Review the saved portion.')
    }
  }
  return { journal, countdown, stop, canPause, togglePause }
}
