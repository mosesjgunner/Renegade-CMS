/**
 * POD-17 — Camera capture BROWSER ADAPTER (thin; UNVERIFIED).
 *
 * Wires the proven camera-track core (camera-tracks.ts) to the
 * browser: `getUserMedia({ video, audio: false })` → `MediaRecorder`
 * (WebM; VP9 where the browser offers it, VP8/plain WebM otherwise)
 * on a 1 s timeslice → each chunk's bytes land in the
 * `CameraTrackRecorder` bookkeeping with the session-clock position
 * supplied by the caller (the POD-05/POD-09 session clock), and the
 * raw parts are kept for assembly into the track's WebM blob at stop.
 *
 * VIDEO-ONLY by construction: audio is never requested — the
 * participant's voice is the POD-06/POD-09 raw audio track. Consent
 * is enforced in the CORE before this adapter can start: constructing
 * the recorder without the participant's explicit opt-in throws
 * `CAMERA_CONSENT_REQUIRED`, and this adapter takes an already-
 * started recorder, so there is no adapter path around the gate.
 *
 * No real browser, camera, or MediaRecorder was exercised — this
 * file is typechecked wiring over a headlessly proven core, in the
 * POD-06/07/09/11 adapter tradition. Browser camera capture and
 * lip-sync on real devices are UNVERIFIED (see
 * docs/podcast-studio/VIDEO.md).
 */

import { CameraTrackRecorder, type CameraTrackSummary } from './camera-tracks'

export type CameraCaptureHandle = {
  /** The live camera stream (for a self-view preview element). */
  stream: MediaStream
  /** The MIME type the browser actually negotiated for the WebM. */
  mimeType: string
  /** Stops capture, seals the core track at the given session-clock sample, and returns the assembled WebM + summary. */
  stop: (atTimelineSample: number) => Promise<{ blob: Blob; summary: CameraTrackSummary }>
}

/** MediaRecorder WebM preference order: VP9, then VP8, then the browser default WebM. */
export const CAMERA_WEBM_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

export const pickCameraMimeType = (isTypeSupported: (mimeType: string) => boolean): string | null =>
  CAMERA_WEBM_MIME_CANDIDATES.find((candidate) => isTypeSupported(candidate)) ?? null

/**
 * Starts camera capture for an ALREADY CONSENTED, already-started
 * core recorder. `sessionSample` is read at every chunk arrival so
 * the core's sync bookkeeping rides the shared session clock.
 */
export async function startCameraCapture(input: {
  recorder: CameraTrackRecorder
  sessionSample: () => number
  video?: MediaTrackConstraints
  timesliceMs?: number
}): Promise<CameraCaptureHandle> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
    throw new Error('Camera capture requires navigator.mediaDevices.getUserMedia.')
  if (typeof MediaRecorder === 'undefined')
    throw new Error('Camera capture requires MediaRecorder (WebM).')
  const mimeType = pickCameraMimeType((candidate) => MediaRecorder.isTypeSupported(candidate))
  if (!mimeType) throw new Error('This browser offers no WebM MediaRecorder mime type.')

  const stream = await navigator.mediaDevices.getUserMedia({
    video: input.video ?? { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  const parts: Blob[] = []
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 })
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size === 0) return
    parts.push(event.data)
    void event.data
      .arrayBuffer()
      .then((buffer) =>
        input.recorder.appendChunk(new Uint8Array(buffer), Math.floor(input.sessionSample())),
      )
  }
  recorder.start(input.timesliceMs ?? 1000)

  return {
    stream,
    mimeType,
    stop: async (atTimelineSample: number) => {
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
      })
      recorder.stop()
      await stopped
      for (const track of stream.getTracks()) track.stop()
      const summary = input.recorder.stop(atTimelineSample)
      return { blob: new Blob(parts, { type: mimeType }), summary }
    },
  }
}
