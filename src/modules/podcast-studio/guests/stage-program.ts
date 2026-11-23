import { LiveIngestUploader } from '../live/ingest-browser'

export const stageLayouts = [
  'solo',
  'side-by-side',
  'grid',
  'screenshare+picture-in-picture',
] as const
export type StageLayout = (typeof stageLayouts)[number]

export function createStageProgram(canvas: HTMLCanvasElement, mic: MediaStreamTrack) {
  const context = new AudioContext({ sampleRate: 48_000 })
  const output = context.createMediaStreamDestination()
  const sources = new Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode }>()
  const returns = new Map<string, MediaStreamAudioDestinationNode>()
  const cameras = new Map<string, { video: HTMLVideoElement; allowed: boolean }>()
  const ctx = canvas.getContext('2d')!
  canvas.width = 1280
  canvas.height = 720
  const visual = canvas.captureStream(24).getVideoTracks()[0]!
  const stream = new MediaStream([visual, ...output.stream.getAudioTracks()])
  let layout: StageLayout = 'grid'
  let recorder: MediaRecorder | undefined
  let uploader: LiveIngestUploader | undefined

  function input(id: string, track: MediaStreamTrack) {
    const source = context.createMediaStreamSource(new MediaStream([track]))
    const gain = context.createGain()
    gain.gain.value = 0.25
    source.connect(gain)
    gain.connect(output)
    if (id !== 'host') gain.connect(context.destination)
    for (const [guest, destination] of returns) {
      if (guest !== id) gain.connect(destination)
    }
    sources.set(id, { source, gain })
  }
  input('host', mic)

  function removeCamera(id: string) {
    const camera = cameras.get(id)
    if (camera) camera.video.srcObject = null
    cameras.delete(id)
  }

  function drawVideo(
    video: HTMLVideoElement | undefined,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    if (!video || video.readyState < 2 || !video.videoWidth || video.srcObject === null) return
    const scale = Math.min(w / video.videoWidth, h / video.videoHeight)
    const width = video.videoWidth * scale
    const height = video.videoHeight * scale
    ctx.fillStyle = '#111827'
    ctx.fillRect(x, y, w, h)
    ctx.drawImage(video, x + (w - width) / 2, y + (h - height) / 2, width, height)
  }

  function draw() {
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, 1280, 720)
    const visible = [...cameras.entries()]
      .filter(([id, camera]) => id !== 'screen' && camera.allowed)
      .map(([, camera]) => camera.video)
    if (layout === 'screenshare+picture-in-picture') {
      drawVideo(cameras.get('screen')?.video, 0, 0, 1280, 720)
      drawVideo(visible[0], 944, 520, 312, 176)
      return
    }
    const tiles = visible.slice(0, layout === 'solo' ? 1 : layout === 'side-by-side' ? 2 : 4)
    const columns = tiles.length < 2 ? 1 : 2
    const rows = tiles.length > 2 ? 2 : 1
    tiles.forEach((video, index) =>
      drawVideo(
        video,
        ((index % columns) * 1280) / columns,
        (Math.floor(index / columns) * 720) / rows,
        1280 / columns,
        720 / rows,
      ),
    )
  }
  const timer = setInterval(draw, 1000 / 24)

  return {
    visual,
    stream,
    resume: () => context.resume(),
    attachCamera(id: string, track: MediaStreamTrack, allowed: boolean) {
      removeCamera(id)
      if (!allowed) return
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.srcObject = new MediaStream([track])
      cameras.set(id, { video, allowed })
      void video.play().catch(() => undefined)
    },
    removeCamera,
    input,
    guestReturn(id: string) {
      const destination = context.createMediaStreamDestination()
      for (const [sourceId, { gain }] of sources) {
        if (sourceId !== id) gain.connect(destination)
      }
      returns.set(id, destination)
      return destination.stream.getAudioTracks()[0]!
    },
    clearGuest(id: string) {
      removeCamera(id)
      sources.get(id)?.source.disconnect()
      sources.get(id)?.gain.disconnect()
      sources.delete(id)
      const destination = returns.get(id)
      if (!destination) return
      for (const [sourceId, { gain }] of sources) {
        if (sourceId !== id) gain.disconnect(destination)
      }
      destination.stream.getTracks().forEach((track) => track.stop())
      returns.delete(id)
    },
    mute(id: string, muted: boolean) {
      const gain = sources.get(id)?.gain
      if (gain) gain.gain.value = muted ? 0 : 0.25
    },
    layout(value: StageLayout) {
      layout = value
      draw()
    },
    record(onFile: (file: Blob) => void, onError: () => void) {
      const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      if (!mimeType) throw new Error('This browser cannot record the stage as WebM.')
      const chunks: Blob[] = []
      const next = new MediaRecorder(stream, { mimeType })
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      next.onstop = () => {
        if (chunks.length) onFile(new Blob(chunks, { type: mimeType }))
      }
      next.onerror = onError
      next.start(1000)
      recorder = next
    },
    stopRecording() {
      if (recorder?.state === 'recording') recorder.stop()
    },
    async startIngest(sessionRecordId: string, onError: (message: string) => void) {
      const pending = new LiveIngestUploader({ sessionRecordId, onError })
      uploader = pending
      await pending.attach(context, { programDestination: output })
      if (uploader !== pending) pending.detach()
    },
    close() {
      if (recorder?.state === 'recording') recorder.stop()
      uploader?.detach()
      uploader = undefined
      clearInterval(timer)
      for (const id of cameras.keys()) removeCamera(id)
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    },
  }
}
