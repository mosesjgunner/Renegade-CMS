'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acquireCapture,
  deviceError,
  microphoneMeter,
  type CaptureSources,
} from './capture-browser'
import {
  captureExtension,
  type CaptureChunk,
  type CaptureMode,
  type CaptureSessionView,
} from './capture-contract'
import { deleteLocalTake, listLocalTakes, openCaptureJournal } from './capture-local'
import { captureEndpoint, captureRequest, captureURL, RecordingJournal } from './capture-sync'
import styles from './RecorderWorkspace.module.css'
import Link from 'next/link'
import { prepareTake, type ActiveTake } from './capture-take'

const modes = [
  ['audio', 'Microphone only'],
  ['video', 'Camera only'],
  ['screen', 'Screen'],
  ['screen-camera', 'Screen + camera'],
] as const
type Phase =
  | 'setup'
  | 'opening'
  | 'preview'
  | 'starting'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'saving'
  | 'review'
type ReviewFile = { name: string; url: string; video: boolean }

export function RecorderWorkspace({ scope }: { scope: string }) {
  const [mode, setMode] = useState<CaptureMode>('audio')
  const [mic, setMic] = useState(true)
  const [systemAudio, setSystemAudio] = useState(false)
  const [micId, setMicId] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [support, setSupport] = useState({ record: false, screen: false, overlay: false })
  const [phase, setPhase] = useState<Phase>('setup')
  const [seconds, setSeconds] = useState(0)
  const [message, setMessage] = useState('')
  const [permissionError, setPermissionError] = useState('')
  const permissionNotice = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (permissionError) permissionNotice.current?.focus()
  }, [permissionError])
  const [notice, setNotice] = useState('')
  const [level, setLevel] = useState(0)
  const [sources, setSources] = useState<CaptureSources | null>(null)
  const [local, setLocal] = useState<Awaited<ReturnType<typeof listLocalTakes>>>([])
  const [server, setServer] = useState<CaptureSessionView[]>([])
  const [journal, setJournal] = useState<RecordingJournal | null>(null)
  const [remote, setRemote] = useState<CaptureSessionView | null>(null)
  const [files, setFiles] = useState<ReviewFile[]>([])
  const [reviewed, setReviewed] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canPause, setCanPause] = useState(false)
  const [, refresh] = useState(0)
  const db = useRef<IDBDatabase | null>(null)
  const take = useRef<ActiveTake | null>(null)
  const sourceRef = useRef<CaptureSources | null>(null)
  const screenPreview = useRef<HTMLVideoElement>(null)
  const cameraPreview = useRef<HTMLVideoElement>(null)
  const mounted = useRef(false)
  const selection = useRef(0)
  const isScreen = mode === 'screen' || mode === 'screen-camera'
  const isCamera = mode === 'video' || mode === 'screen-camera'
  const isMic = mode === 'audio' || (isScreen && mic)
  const canOpen =
    support.record && (!isScreen || support.screen) && (mode !== 'screen-camera' || support.overlay)
  const editable = phase === 'setup' || phase === 'preview'
  const inProgress = ['countdown', 'recording', 'paused', 'saving', 'starting'].includes(phase)
  const currentRemote = remote ?? journal?.remote ?? null
  const endReason = journal?.manifest.endReason ?? currentRemote?.endReason

  const list = useCallback(async () => {
    if (db.current) setLocal(await listLocalTakes(db.current, scope).catch(() => []))
    const saved = await captureRequest<CaptureSessionView[]>(captureEndpoint).catch(() => undefined)
    if (saved) setServer(saved)
  }, [scope])
  const enumerate = useCallback(async () => {
    const available = await navigator.mediaDevices?.enumerateDevices().catch(() => [])
    if (available && mounted.current)
      setDevices(available.filter((device) => Boolean(device.deviceId)))
  }, [])
  const update = () => {
    if (mounted.current) refresh((count) => count + 1)
  }
  useEffect(() => {
    mounted.current = true
    const media = navigator.mediaDevices
    const canvas = document.createElement('canvas')
    setSupport({
      record: typeof MediaRecorder !== 'undefined' && Boolean(media?.getUserMedia),
      screen: typeof media?.getDisplayMedia === 'function',
      overlay: typeof canvas.captureStream === 'function',
    })
    void enumerate()
    media?.addEventListener?.('devicechange', enumerate)
    let disposed = false
    void openCaptureJournal()
      .then((database) => {
        if (disposed) database.close()
        else db.current = database
      })
      .catch(() => {
        if (!disposed)
          setNotice(
            'Browser backup storage is unavailable. Server storage or an export is needed to keep a recording.',
          )
      })
      .finally(() => {
        if (!disposed) void list()
      })
    return () => {
      disposed = true
      mounted.current = false
      media?.removeEventListener?.('devicechange', enumerate)
      const database = db.current
      db.current = null
      if (take.current) void take.current.stop().finally(() => database?.close())
      else {
        sourceRef.current?.close()
        database?.close()
      }
    }
  }, [enumerate, list])
  useEffect(() => {
    if (!sources) return
    const camera = sources.local?.getVideoTracks()[0]
    if (screenPreview.current) screenPreview.current.srcObject = sources.display ?? null
    if (cameraPreview.current)
      cameraPreview.current.srcObject = camera ? new MediaStream([camera]) : null
    const microphone = sources.local?.getAudioTracks()[0]
    try {
      if (microphone) return microphoneMeter(microphone, setLevel)
    } catch {
      setNotice('The microphone meter is unavailable in this browser.')
    }
  }, [sources])
  useEffect(() => {
    if (!inProgress) return
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [inProgress])
  useEffect(() => {
    if (!journal) return
    const resume = () => {
      if (journal.count) void journal.sync().catch(() => undefined)
    }
    window.addEventListener('online', resume)
    return () => window.removeEventListener('online', resume)
  }, [journal])
  useEffect(() => () => files.forEach((file) => URL.revokeObjectURL(file.url)), [files])

  function closePreview() {
    selection.current++
    sourceRef.current?.close()
    sourceRef.current = null
    setSources(null)
    setLevel(0)
  }

  function setup() {
    closePreview()
    take.current = null
    setPhase('setup')
    setMessage('')
    setPermissionError('')
    setFiles([])
    setReviewed(false)
    setConsent(false)
    setRemote(null)
    setJournal(null)
  }

  async function preview() {
    closePreview()
    const generation = selection.current
    setPhase('opening')
    setMessage('')
    setPermissionError('')
    try {
      const opened = await acquireCapture(mode, mic, micId, cameraId, systemAudio)
      if (!mounted.current || generation !== selection.current) return opened.close()
      sourceRef.current = opened
      const ended = (track: MediaStreamTrack) => {
        if (sourceRef.current !== opened) return
        const text =
          track === opened.display?.getVideoTracks()[0]
            ? 'Screen sharing ended. Choose a screen again to start a new take.'
            : 'A capture device disconnected or became unavailable. Reconnect it or choose another device.'
        if (take.current) void take.current.stop(text)
        else {
          setup()
          setMessage(text)
        }
      }
      for (const track of [opened.display, opened.local].flatMap(
        (stream) => stream?.getTracks() ?? [],
      )) {
        track.addEventListener('ended', () => ended(track), { once: true })
        if (track.readyState === 'ended') {
          ended(track)
          return
        }
      }
      setSources(opened)
      setPhase('preview')
      if (isScreen && systemAudio && !opened.display?.getAudioTracks().length)
        setMessage(
          mic
            ? 'This share has no system audio. Your microphone is available.'
            : 'This share has no system audio. Enable the microphone for narration.',
        )
      void enumerate()
    } catch (error) {
      if (generation !== selection.current) return
      setPhase('setup')
      setPermissionError(deviceError(error))
    }
  }

  async function start() {
    const opened = sourceRef.current
    if (!opened || !consent) return
    const generation = selection.current
    setPhase('starting')
    setMessage('')
    try {
      const prepared = await prepareTake({
        db: db.current,
        scope,
        mode,
        sources: opened,
        screen: screenPreview.current,
        camera: cameraPreview.current,
        onUpdate: update,
        onPhase(next, remaining) {
          if (!mounted.current || generation !== selection.current) return
          setPhase(next)
          if (remaining !== undefined) setSeconds(remaining)
          if (next === 'review') {
            closePreview()
            void buildFiles(prepared.journal).catch((error: Error) => setMessage(error.message))
            void list()
          }
        },
      })
      if (opened !== sourceRef.current || !mounted.current) {
        await prepared.stop('Device preview closed before recording.')
        return
      }
      take.current = prepared
      setCanPause(prepared.canPause)
      setJournal(prepared.journal)
      prepared.countdown()
    } catch (error) {
      if (!mounted.current) return
      setPhase(sourceRef.current ? 'preview' : 'setup')
      setPermissionError(deviceError(error))
    }
  }

  async function buildFiles(current: RecordingJournal) {
    const generation = selection.current
    const index = new Map<string, CaptureChunk[]>()
    for (let n = 0; n < current.count; n++) {
      const chunk = await current.chunk(n)
      if (!chunk) throw new Error('A local chunk is missing. Check the server backup.')
      const track = index.get(chunk.track) ?? []
      if (!track.length) index.set(chunk.track, track)
      track.push(chunk)
    }
    const output = Array.from(index, ([name, parts]) => {
      const mime = parts[0].mimeType
      return {
        name: name + '.' + captureExtension(mime),
        video: mime.startsWith('video/'),
        url: URL.createObjectURL(
          new Blob(
            parts.map(({ bytes }) => bytes),
            { type: mime },
          ),
        ),
      }
    }).sort((a, b) => Number(b.name.startsWith('master.')) - Number(a.name.startsWith('master.')))
    if (mounted.current && generation === selection.current) setFiles(output)
    else output.forEach((file) => URL.revokeObjectURL(file.url))
  }

  async function recover(key: string) {
    setBusy(true)
    setup()
    setPhase('review')
    const backup = local.find(({ manifest }) => manifest.key === key)
    const saved = server.find((row) => row.key === key)
    setRemote(saved ?? null)
    try {
      if (backup && db.current) {
        const restored = new RecordingJournal(db.current, scope, backup.manifest, update).restore(
          backup.count,
        )
        setJournal(restored)
        await buildFiles(restored)
      }
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!reviewed) return
    setBusy(true)
    setMessage('')
    try {
      const saved =
        journal && journal.count >= (currentRemote?.received ?? 0)
          ? await journal.sync()
          : currentRemote
      if (!saved)
        throw new Error('No server copy. Export the local recording and retry when online.')
      const result =
        saved.state === 'completed'
          ? saved
          : await captureRequest<CaptureSessionView>(captureURL(saved.id), 'POST', {
              reviewed: true,
              count: saved.received,
              ...(journal && journal.count === saved.received
                ? { manifest: journal.manifest }
                : {}),
            })
      setRemote(result)
      setMessage('Verified master saved privately to the media library.')
      await list()
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function discard() {
    setBusy(true)
    setMessage('')
    try {
      const backup = (await journal?.stopSync()) ?? currentRemote
      if (backup?.state === 'open') await captureRequest(captureURL(backup.id), 'DELETE')
      if (journal && db.current) await deleteLocalTake(db.current, journal.manifest.key)
      setup()
      await list()
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const master = files.find((file) => file.name.startsWith('master.'))
  const player =
    currentRemote?.state === 'completed'
      ? { url: captureURL(currentRemote.id) + '&master=1', video: currentRemote.hasVideo === true }
      : ((master && (journal?.count ?? 0) >= (currentRemote?.received ?? 0) ? master : undefined) ??
        (currentRemote?.received
          ? {
              url: captureURL(currentRemote.id),
              video: currentRemote.mode !== 'audio',
            }
          : undefined))
  const known = new Map(
    local.filter((row) => row.count).map(({ manifest }) => [manifest.key, manifest]),
  )
  const saved = server.filter(
    (row) =>
      row.received &&
      ['completed', 'open'].includes(row.state) &&
      (row.state === 'completed' || Date.parse(row.expiresAt) > Date.now()),
  )
  const recoveryKeys = new Set([...known.keys(), ...saved.map((row) => row.key)])
  const showSetup = phase !== 'review'

  return (
    <div className={`space-y-5 ${styles.recorder}`}>
      {showSetup && (
        <section className="surface-card space-y-4 p-3 sm:p-5" aria-label="Recorder">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1">
              Recording mode
              <select
                value={mode}
                disabled={!editable}
                onChange={(event) => {
                  setup()
                  setMode(event.target.value as CaptureMode)
                }}
              >
                {modes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {isMic && (
              <label className="grid gap-1">
                Microphone
                <select
                  value={micId}
                  disabled={!editable}
                  onChange={(event) => {
                    setup()
                    setMicId(event.target.value)
                  }}
                >
                  <option value="">Default microphone</option>
                  {micId && !devices.some((device) => device.deviceId === micId) && (
                    <option value={micId}>Selected microphone unavailable</option>
                  )}
                  {devices
                    .filter(({ kind }) => kind === 'audioinput')
                    .map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || 'Microphone ' + (index + 1)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {isCamera && (
              <label className="grid gap-1">
                Camera
                <select
                  value={cameraId}
                  disabled={!editable}
                  onChange={(event) => {
                    setup()
                    setCameraId(event.target.value)
                  }}
                >
                  <option value="">Default camera</option>
                  {cameraId && !devices.some((device) => device.deviceId === cameraId) && (
                    <option value={cameraId}>Selected camera unavailable</option>
                  )}
                  {devices
                    .filter(({ kind }) => kind === 'videoinput')
                    .map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || 'Camera ' + (index + 1)}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          {isScreen && (
            <div className="flex flex-wrap gap-4">
              <label>
                <input
                  type="checkbox"
                  checked={mic}
                  disabled={!editable}
                  onChange={(event) => {
                    setup()
                    setMic(event.target.checked)
                  }}
                />{' '}
                Include microphone
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={systemAudio}
                  disabled={!editable}
                  onChange={(event) => {
                    setup()
                    setSystemAudio(event.target.checked)
                  }}
                />{' '}
                Request shared audio
              </label>
            </div>
          )}
          {isMic && <p className="text-sm">Use headphones if audio is playing to prevent echo.</p>}
          {!support.record && (
            <p role="status">
              Recording needs browser media access in a secure context. Open Creator Studio over
              HTTPS in a compatible browser.
            </p>
          )}
          {isScreen && !support.screen && (
            <p role="status">
              Screen sharing is unavailable here. Choose Microphone only or Camera only.
            </p>
          )}
          {mode === 'screen-camera' && support.screen && !support.overlay && (
            <p role="status">
              This browser cannot compose a camera overlay. Choose Screen or Camera only.
            </p>
          )}
          {sources && (
            <div
              className={
                isScreen && isCamera ? 'relative max-w-4xl bg-black' : 'max-w-4xl bg-black'
              }
            >
              {isScreen && (
                <video
                  ref={screenPreview}
                  muted
                  autoPlay
                  playsInline
                  aria-label="Screen preview"
                  className="w-full"
                />
              )}
              {isCamera && (
                <video
                  ref={cameraPreview}
                  muted
                  autoPlay
                  playsInline
                  aria-label="Camera preview"
                  className={
                    isScreen
                      ? 'absolute bottom-[2%] right-[2%] max-h-[32%] w-[24%] object-contain'
                      : 'w-full'
                  }
                />
              )}
            </div>
          )}
          {sources?.local?.getAudioTracks().length ? (
            <label className="flex items-center gap-2">
              Microphone level <meter min={0} max={1} value={level} />
            </label>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {phase === 'setup' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canOpen}
                onClick={() => void preview()}
              >
                Enable preview
              </button>
            )}
            {phase === 'preview' && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!consent}
                  onClick={() => void start()}
                >
                  Start recording
                </button>
                <button type="button" className="btn btn-secondary" onClick={setup}>
                  Close preview
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />{' '}
                  Everyone I’m capturing has agreed to be recorded
                </label>
              </>
            )}
            {phase === 'opening' && (
              <>
                <span>Waiting for browser permissions…</span>
                <button type="button" onClick={setup}>
                  Cancel
                </button>
              </>
            )}
            {phase === 'countdown' && (
              <>
                <strong role="status">Starting in {seconds}</strong>
                <button
                  type="button"
                  onClick={() => void take.current?.stop('Countdown canceled.')}
                >
                  Cancel recording
                </button>
              </>
            )}
            {(phase === 'recording' || phase === 'paused') && (
              <>
                <strong role="status">{phase === 'paused' ? 'Paused' : 'Recording'}</strong>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void take.current?.stop()}
                >
                  Stop recording
                </button>
                {canPause && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => take.current?.togglePause()}
                  >
                    {phase === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                )}
              </>
            )}
            {phase === 'saving' && <strong role="status">Finishing recording…</strong>}
          </div>
        </section>
      )}
      {phase === 'review' && (
        <section className="surface-card space-y-3 p-5" aria-label="Review recording">
          <h2 className="text-xl font-bold">Review recording</h2>
          {endReason && <p>{endReason}</p>}
          {(journal?.manifest.endedMs ?? currentRemote?.endedMs) === undefined &&
            currentRemote?.state !== 'completed' && (
              <p>
                This take may have been interrupted. Only committed chunks can be recovered. Some
                partial files may fail to play.
              </p>
            )}
          {player &&
            (player.video ? (
              <video
                key={player.url}
                src={player.url}
                className="max-h-[65vh] w-full bg-black"
                controls
                playsInline
                aria-label="Recorded master"
              />
            ) : (
              <audio key={player.url} src={player.url} controls aria-label="Recorded master" />
            ))}
          {currentRemote?.asset && <p>Private media asset {currentRemote.asset}</p>}
          {currentRemote?.received ? (
            <div className="flex flex-wrap gap-3">
              {!master && (
                <a href={captureURL(currentRemote.id)} download>
                  Download server master
                </a>
              )}
              <a
                href={captureURL(currentRemote.id) + '&manifest=1'}
                download="server-recording-manifest.json"
              >
                Download server manifest
              </a>
            </div>
          ) : null}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {files.map((file) => (
                <a key={file.name} href={file.url} download={file.name}>
                  Download {file.name}
                </a>
              ))}
              {journal && (
                <button
                  type="button"
                  onClick={async () => {
                    const chunks = []
                    for (let index = 0; index < journal.count; index++) {
                      const chunk = await journal.chunk(index)
                      if (chunk) {
                        const { bytes, ...timing } = chunk
                        chunks.push({ ...timing, size: bytes.size })
                      }
                    }
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify({ ...journal.manifest, chunks }, null, 2)], {
                        type: 'application/json',
                      }),
                    )
                    const link = document.createElement('a')
                    link.href = url
                    link.download = 'recording-manifest.json'
                    link.click()
                    setTimeout(() => URL.revokeObjectURL(url), 1000)
                  }}
                >
                  Download manifest
                </button>
              )}
            </div>
          )}
          {currentRemote?.state !== 'completed' && (master || currentRemote?.received) ? (
            <>
              <label className="block">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />{' '}
                I reviewed this recording
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!reviewed || busy}
                onClick={() => void save()}
              >
                Save private master
              </button>
            </>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setup()
                void list()
              }}
            >
              New recording
            </button>
            {(journal || currentRemote?.state === 'open') && (
              <button type="button" disabled={busy} onClick={() => void discard()}>
                {currentRemote?.state === 'completed'
                  ? 'Remove local backup'
                  : 'Discard recording backup'}
              </button>
            )}
          </div>
        </section>
      )}
      {journal && (
        <p className="text-sm" role="status">
          Browser backup {journal.localCount} chunks · Server backup {currentRemote?.received ?? 0}{' '}
          chunks
        </p>
      )}
      {(notice || journal?.localError) && (
        <p className="text-sm" role="status">
          {journal?.localError || notice}
        </p>
      )}
      {journal?.remoteError && (
        <p className="text-sm" role="status">
          {journal.remoteError}{' '}
          <button type="button" onClick={() => void journal.sync().catch(() => undefined)}>
            Retry server sync
          </button>
        </p>
      )}
      {permissionError && (
        <p ref={permissionNotice} role="alert" tabIndex={-1}>
          {permissionError}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {currentRemote?.state === 'completed' && (
        <Link className="underline" href="/studio/media-edit">
          Edit your recording or add captions
        </Link>
      )}
      {recoveryKeys.size > 0 && (
        <section className="surface-card space-y-3 p-5" aria-label="Saved recordings">
          <h2 className="text-xl font-bold">Saved recordings</h2>
          <ul className="space-y-2">
            {Array.from(recoveryKeys, (key) => {
              const manifest = known.get(key)
              const row = saved.find((item) => item.key === key)
              const label =
                row?.state === 'completed'
                  ? 'Private master'
                  : !manifest?.endedMs
                    ? row?.endedMs !== undefined
                      ? 'Server recording'
                      : 'Recoverable recording'
                    : 'Local recording'
              return (
                <li key={key}>
                  <button
                    type="button"
                    data-recording-key={key}
                    disabled={busy || inProgress || phase === 'opening'}
                    onClick={() => void recover(key)}
                  >
                    {label} ·{' '}
                    {modes.find(([value]) => value === (manifest?.mode ?? row?.mode))?.[1]} ·{' '}
                    {new Date(manifest?.createdAt ?? row!.createdAt).toLocaleString()}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
