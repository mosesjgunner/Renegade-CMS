import { computeBlockLevels } from '../podcast-studio/capture/levels'
import type { CaptureMode, CaptureTrack, CaptureTrackId } from './capture-contract'

export function deviceError(error: unknown) {
  switch ((error as DOMException)?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permission was denied or sharing was canceled. Check your browser permissions and try device preview again.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'The selected device is unavailable. Reconnect it or choose a different device.'
    case 'NotReadableError':
      return 'A device is busy or unavailable. Close other apps using it and try again.'
    case 'NotSupportedError':
      return 'This source is unavailable in this browser. Choose another recording mode or try a different browser.'
    default:
      return error instanceof Error ? error.message : 'Could not open the selected sources.'
  }
}

export async function acquireCapture(
  mode: CaptureMode,
  mic: boolean,
  micId: string,
  cameraId: string,
  systemAudio: boolean,
) {
  const media = navigator.mediaDevices
  const screen = mode === 'screen' || mode === 'screen-camera'
  const camera = mode === 'video' || mode === 'screen-camera'
  const audio = mode === 'audio' || (screen && mic)
  const streams: MediaStream[] = []
  try {
    // The browser requires a fresh user gesture for the display picker.
    const display = screen
      ? await media.getDisplayMedia({ video: true, audio: systemAudio })
      : undefined
    if (display) streams.push(display)
    const local =
      camera || audio
        ? await media.getUserMedia({
            video: camera && {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30, max: 30 },
              ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
            },
            audio: audio && {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              ...(micId ? { deviceId: { exact: micId } } : {}),
            },
          })
        : undefined
    if (local) streams.push(local)
    return {
      display,
      local,
      close: () => streams.flatMap((stream) => stream.getTracks()).forEach((track) => track.stop()),
    }
  } catch (error) {
    streams.flatMap((stream) => stream.getTracks()).forEach((track) => track.stop())
    throw error
  }
}

export type CaptureSources = Awaited<ReturnType<typeof acquireCapture>>

const settings = (track: MediaStreamTrack) => {
  const { width, height, frameRate, sampleRate, channelCount, facingMode, displaySurface } =
    track.getSettings()
  return {
    kind: track.kind,
    width,
    height,
    frameRate,
    sampleRate,
    channelCount,
    facingMode,
    displaySurface,
  }
}

function makeRecorder(stream: MediaStream) {
  const video = stream.getVideoTracks().length > 0
  const audio = stream.getAudioTracks().length > 0
  const candidates = video
    ? [audio ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8', 'video/mp4', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
  for (const mimeType of [
    ...candidates.filter((mime) => MediaRecorder.isTypeSupported?.(mime)),
    undefined,
  ]) {
    try {
      return new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        ...(video ? { videoBitsPerSecond: 2_000_000 } : {}),
        ...(audio ? { audioBitsPerSecond: 96_000 } : {}),
      })
    } catch {
      // A browser may advertise a format its encoder cannot initialize with these tracks.
    }
  }
  throw new Error('This browser could not open an encoder for the selected sources.')
}

export function microphoneMeter(track: MediaStreamTrack, level: (number: number) => void) {
  if (typeof AudioContext === 'undefined') return () => {}
  const context = new AudioContext()
  void context.resume().catch(() => undefined)
  const analyser = context.createAnalyser()
  context.createMediaStreamSource(new MediaStream([track])).connect(analyser)
  const buffer = new Float32Array(analyser.fftSize)
  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buffer)
    level(computeBlockLevels(buffer).rms)
  }, 100)
  return () => {
    clearInterval(timer)
    void context.close().catch(() => undefined)
  }
}

export async function recordingGraph(
  sources: CaptureSources,
  screenView: HTMLVideoElement | null,
  cameraView: HTMLVideoElement | null,
) {
  const screen = sources.display?.getVideoTracks()[0]
  const camera = sources.local?.getVideoTracks()[0]
  const mic = sources.local?.getAudioTracks()[0]
  const system = sources.display?.getAudioTracks()[0]
  const audio = [mic, system].filter((track): track is MediaStreamTrack => Boolean(track))
  const tracks: Array<{ track: CaptureTrack; recorder: MediaRecorder }> = []
  const cleanup: Array<() => void> = []
  const close = () => cleanup.forEach((dispose) => dispose())
  const add = (id: CaptureTrackId, role: CaptureTrack['role'], input: MediaStreamTrack[]) => {
    const recorder = makeRecorder(new MediaStream(input))
    tracks.push({
      track: { id, role, mimeType: recorder.mimeType, startedMs: 0, settings: input.map(settings) },
      recorder,
    })
  }
  try {
    let video = screen ?? camera
    let sound: MediaStreamTrack | undefined = audio[0]
    if (mic && system) {
      const context = new AudioContext()
      cleanup.push(() => void context.close().catch(() => undefined))
      await context.resume()
      const destination = context.createMediaStreamDestination()
      for (const source of [mic, system]) {
        const gain = context.createGain()
        gain.gain.value = 0.5
        context
          .createMediaStreamSource(new MediaStream([source]))
          .connect(gain)
          .connect(destination)
      }
      const mixedTrack = destination.stream.getAudioTracks()[0]
      sound = mixedTrack
      cleanup.push(() => mixedTrack.stop())
    }
    if (screen && camera) {
      if (!screenView?.videoWidth || !cameraView?.videoWidth)
        throw new Error('Wait for both previews to load, then start again.')
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 1920 / Math.max(screenView.videoWidth, screenView.videoHeight))
      canvas.width = Math.max(2, Math.round((screenView.videoWidth * scale) / 2) * 2)
      canvas.height = Math.max(2, Math.round((screenView.videoHeight * scale) / 2) * 2)
      const context = canvas.getContext('2d')
      if (!context || typeof canvas.captureStream !== 'function') {
        throw new Error(
          'Camera overlay is unavailable in this browser. Choose Screen or Camera only.',
        )
      }
      const draw = () => {
        context.drawImage(screenView, 0, 0, canvas.width, canvas.height)
        const ratio = cameraView.videoWidth / cameraView.videoHeight
        if (!(ratio > 0)) return
        const width = Math.min(canvas.width * 0.24, canvas.height * 0.32 * ratio)
        const height = width / ratio
        const margin = Math.round(canvas.width * 0.02)
        context.drawImage(
          cameraView,
          canvas.width - width - margin,
          canvas.height - height - margin,
          width,
          height,
        )
      }
      draw()
      const interval = window.setInterval(draw, 1000 / 30)
      cleanup.push(() => clearInterval(interval))
      video = canvas.captureStream(30).getVideoTracks()[0]
      if (!video) throw new Error('Could not start the camera overlay.')
      const canvasTrack = video
      cleanup.push(() => canvasTrack.stop())
    }
    add(
      'master',
      'program',
      [video, sound].filter((track): track is MediaStreamTrack => Boolean(track)),
    )
    if (screen && (camera || mic)) {
      add('screen', 'screen', [screen])
      if (camera) add('camera', 'camera', [camera])
      if (mic) add('mic', 'host', [mic])
      if (system) add('system', 'screen', [system])
    }
    return { tracks, close }
  } catch (error) {
    close()
    throw error
  }
}
