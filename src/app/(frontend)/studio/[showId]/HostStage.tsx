'use client'

import { useEffect, useRef, useState } from 'react'

import { BroadcastControls } from '@/modules/live-media/BroadcastControls'
import { MAX_REMOTE_GUESTS } from '@/modules/podcast-studio/guests/lobby'

import { startHostPeer, type StageProgram } from '@/modules/podcast-studio/guests/stage-host'
import {
  createStageProgram,
  stageLayouts,
  type StageLayout,
} from '@/modules/podcast-studio/guests/stage-program'
import { StageDevices, StageVideo, useStageDevices } from '../StageMedia'

type Guest = { id: string; displayName: string | null; state: string }

function StageGuest({
  sessionId,
  guest,
  program,
  recording,
}: {
  sessionId: string
  guest: Guest
  program: StageProgram
  recording: boolean
}) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [state, setState] = useState('Connecting')
  const [muted, setMuted] = useState(false)
  const [restart, setRestart] = useState(0)
  const peer = useRef<ReturnType<typeof startHostPeer> | null>(null)
  useEffect(() => {
    const current = startHostPeer({
      sessionId,
      inviteId: guest.id,
      program,
      onState: setState,
      onCamera: (track) => setStream(track ? new MediaStream([track]) : null),
    })
    peer.current = current
    return () => {
      current.close()
      peer.current = null
    }
  }, [sessionId, guest.id, program, restart])

  useEffect(() => {
    peer.current?.setControls({ muted, recording })
  }, [muted, recording, restart])

  return (
    <article className="space-y-2">
      <h4>{guest.displayName ?? 'Guest'}</h4>
      <p role="status">{state}</p>
      {stream && (
        <StageVideo
          stream={stream}
          muted
          label={`Private preview of ${guest.displayName ?? 'guest'}`}
        />
      )}
      <button
        className="btn btn-secondary"
        type="button"
        aria-pressed={muted}
        onClick={() => setMuted(!muted)}
      >
        {muted ? 'Release host mute' : 'Mute guest'}
      </button>
      {state === 'Reconnect budget exhausted' && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setRestart((value) => value + 1)}
        >
          Reconnect guest
        </button>
      )}
    </article>
  )
}

export function HostStage({ sessionId, guests }: { sessionId: string; guests: Guest[] }) {
  const setup = useStageDevices()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [program, setProgram] = useState<StageProgram | null>(null)
  const [hostMuted, setHostMuted] = useState(false)
  const [layout, setLayout] = useState<StageLayout>('grid')
  const [sharing, setSharing] = useState<MediaStreamTrack | null>(null)
  const [recording, setRecording] = useState(false)
  const [broadcastRecording, setBroadcastRecording] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [broadcastRoom, setBroadcastRoom] = useState('')
  const [file, setFile] = useState<Blob | null>(null)
  const [fileUrl, setFileUrl] = useState('')
  const [ingest, setIngest] = useState<'off' | 'starting' | 'uploading'>('off')
  const [error, setError] = useState('')

  useEffect(() => () => program?.close(), [program])
  useEffect(() => () => sharing?.stop(), [sharing])
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function open() {
    const mic = setup.stream?.getAudioTracks()[0]
    if (!canvas.current || !mic) return
    setError('')
    let next: StageProgram | undefined
    try {
      next = createStageProgram(canvas.current, mic)
      const camera = setup.stream?.getVideoTracks()[0]
      if (camera) next.attachCamera('host', camera, true)
      await next.resume()
      setLayout('grid')
      setHostMuted(false)
      setProgram(next)
    } catch (cause) {
      next?.close()
      setError(cause instanceof Error ? cause.message : 'Could not open the stage.')
    }
  }

  function changeLayout(value: StageLayout) {
    setLayout(value)
    program?.layout(value)
  }

  async function share() {
    if (!program) return
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const track = screen.getVideoTracks()[0]!
      track.addEventListener(
        'ended',
        () => {
          program.removeCamera('screen')
          setSharing(null)
        },
        { once: true },
      )
      program.attachCamera('screen', track, true)
      setSharing(track)
      changeLayout('screenshare+picture-in-picture')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Screen sharing failed.')
    }
  }

  function toggleRecord() {
    if (!program) return
    if (recording) {
      program.stopRecording()
      setRecording(false)
      return
    }
    try {
      program.record(setFile, () => {
        setError('Program recording failed.')
        setRecording(false)
      })
      setFile(null)
      setFileUrl('')
      setRecording(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the program.')
    }
  }

  async function startIngest() {
    if (!program) return
    setIngest('starting')
    try {
      await program.startIngest(sessionId, setError)
      setIngest('uploading')
    } catch (cause) {
      setIngest('off')
      setError(cause instanceof Error ? cause.message : 'Program audio ingest failed.')
    }
  }

  return (
    <section className="space-y-3" aria-label="Interactive stage">
      <h3 className="font-bold">Interactive stage</h3>
      {!program && (
        <>
          <StageDevices setup={setup} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!setup.stream || setup.checking}
            onClick={() => void open()}
          >
            Open host stage
          </button>
        </>
      )}
      <canvas
        ref={canvas}
        aria-label="Recorded program preview"
        className="aspect-video w-full bg-slate-950"
        hidden={!program}
      />
      {program && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label>
              Program layout{' '}
              <select
                value={layout}
                onChange={(event) => changeLayout(event.target.value as StageLayout)}
              >
                {stageLayouts.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (sharing) {
                  program.removeCamera('screen')
                  setSharing(null)
                } else void share()
              }}
            >
              {sharing ? 'Stop screenshare' : 'Share screen to program'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              aria-pressed={hostMuted}
              onClick={() => {
                program.mute('host', !hostMuted)
                setHostMuted(!hostMuted)
              }}
            >
              {hostMuted ? 'Unmute host microphone' : 'Mute host microphone'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={toggleRecord}>
              {recording ? 'Stop program recording' : 'Record program'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={ingest !== 'off'}
              onClick={() => void startIngest()}
            >
              Start program audio ingest
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setProgram(null)
                setup.setStream(null)
                setSharing(null)
                setRecording(false)
                setBroadcastRecording(false)
                setBroadcastRoom('')
                setIngest('off')
              }}
            >
              Close stage
            </button>
          </div>
          <p role="status">
            Program recording {recording ? 'active' : 'off'}. Audio ingest {ingest}.
          </p>
          <details>
            <summary>Publish program video to a theater room</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                setBroadcastRoom(roomId.trim().toLowerCase())
              }}
            >
              <label>
                Theater room ID{' '}
                <input
                  value={roomId}
                  required
                  pattern="[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
                  disabled={Boolean(broadcastRoom)}
                  onChange={(event) => setRoomId(event.target.value)}
                />
              </label>{' '}
              <button className="btn btn-secondary" type="submit" disabled={Boolean(broadcastRoom)}>
                Select room
              </button>
            </form>
            <p>Sign in as a broadcast operator for the selected theater room.</p>
            {broadcastRoom && (
              <BroadcastControls
                endpoint={`/api/rooms/${broadcastRoom}/broadcast`}
                programStream={program.stream}
                onRecordingChange={setBroadcastRecording}
              />
            )}
          </details>
          <div className="grid gap-3 md:grid-cols-2">
            {guests
              .filter((guest) => guest.state === 'admitted')
              .slice(0, MAX_REMOTE_GUESTS)
              .map((guest) => (
                <StageGuest
                  key={guest.id}
                  sessionId={sessionId}
                  guest={guest}
                  program={program}
                  recording={recording || broadcastRecording}
                />
              ))}
          </div>
        </>
      )}
      {fileUrl && (
        <a className="btn btn-secondary" href={fileUrl} download="studio-program.webm">
          Download program recording
        </a>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
