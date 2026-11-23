'use client'

import { useEffect, useRef, useState } from 'react'

import { cameraTrackId } from '@/modules/podcast-studio/recording/camera-tracks'
import {
  setStageTrackEnabled,
  stageConnection,
  stageDescription,
  stageSignal,
} from '@/modules/podcast-studio/guests/stage-browser'
import type { IceConfig } from '@/modules/podcast-studio/guests/peer-session'
import { SoundCheck } from '../../SoundCheck'
import { StageDevices, StageVideo, useStageDevices } from '../../StageMedia'

type Joined = {
  invite: { id: string; sessionId: string }
  signallingCredential: string
  ice: IceConfig
}

export function GuestJoinClient({ token }: { token: string }) {
  const setup = useStageDevices()
  const [name, setName] = useState('')
  const [headphones, setHeadphones] = useState('')
  const [consent, setConsent] = useState(false)
  const [joined, setJoined] = useState<Joined | null>(null)
  const [joining, setJoining] = useState(false)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [remote, setRemote] = useState<MediaStream | null>(null)
  const [recording, setRecording] = useState<boolean | null>(null)
  const [selfMuted, setSelfMuted] = useState(false)
  const [hostMuted, setHostMuted] = useState(false)
  const mic = setup.stream?.getAudioTracks()[0]
  const camera = setup.stream?.getVideoTracks()[0]
  const [cameraWithdrawn, setCameraWithdrawn] = useState(false)
  const muteRef = useRef(false)
  const withdrawRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (mic) setStageTrackEnabled(mic, !selfMuted && !hostMuted)
    muteRef.current = selfMuted
  }, [mic, selfMuted, hostMuted])

  useEffect(() => {
    if (!joined || !mic || ended) return
    const liveMic = mic
    const ice = joined.ice
    const inviteId = joined.invite.id
    const signalling = stageSignal({
      sessionId: joined.invite.sessionId,
      inviteId: joined.invite.id,
      credential: joined.signallingCredential,
    })
    const abort = new AbortController()
    let pc: RTCPeerConnection | undefined
    let attempt: unknown
    let hostMute = false
    let lastControls: Record<string, unknown> = {}
    withdrawRef.current = () => {
      void signalling
        .send('hello', { attempt, cameraWithdrawn: true }, abort.signal)
        .catch(() => undefined)
    }
    const readControls = (controls: Record<string, unknown>) => {
      lastControls = controls
      hostMute = controls.muted === true
      setHostMuted(hostMute)
      setRecording(controls.recording === true)
      setStageTrackEnabled(liveMic, !hostMute && !muteRef.current)
    }
    async function run() {
      while (!abort.signal.aborted) {
        try {
          const room = await signalling.poll(abort.signal)
          if (abort.signal.aborted) return
          if (room.lobbyState === 'left' || room.lobbyState === 'dropped') {
            liveMic.stop()
            camera?.stop()
            setEnded(true)
            return
          }
          if (room.lobbyState === 'admitted' && !pc) setStatus('Admitted. Waiting for host media.')
          for (const message of room.messages) {
            const { payload } = message
            if (
              room.lobbyState === 'admitted' &&
              message.type === 'offer' &&
              typeof payload.sdp === 'string' &&
              payload.attempt !== attempt
            ) {
              pc?.close()
              setRemote(null)
              readControls(payload)
              const next = stageConnection(ice)
              pc = next
              const tracks = new MediaStream()
              next.ontrack = ({ track }) => {
                if (abort.signal.aborted || pc !== next) return
                tracks.addTrack(track)
                setRemote(new MediaStream(tracks.getTracks()))
              }
              next.onconnectionstatechange = () => {
                if (abort.signal.aborted || pc !== next) return
                if (next.connectionState === 'connected') readControls(lastControls)
                else setRecording(null)
                setStatus(
                  next.connectionState === 'connected'
                    ? 'Connected to stage'
                    : next.connectionState,
                )
              }
              await next.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
              const audio = next
                .getTransceivers()
                .find((item) => item.receiver.track.kind === 'audio')
              const video = next
                .getTransceivers()
                .find((item) => item.receiver.track.kind === 'video')
              if (!audio || !video) throw new Error('Host offer is missing stage tracks.')
              audio.direction = 'sendrecv'
              setStageTrackEnabled(liveMic, !hostMute && !muteRef.current)
              await audio.sender.replaceTrack(liveMic)
              const outgoingCamera = camera?.readyState === 'live' ? camera : null
              video.direction = outgoingCamera ? 'sendrecv' : 'recvonly'
              if (outgoingCamera) await video.sender.replaceTrack(outgoingCamera)
              const sdp = await stageDescription(next, await next.createAnswer(), abort.signal)
              await signalling.send(
                'answer',
                {
                  sdp,
                  attempt: payload.attempt,
                  cameraMid: outgoingCamera ? video.mid : null,
                  cameraTrackId: cameraTrackId(inviteId),
                  cameraConsent: outgoingCamera?.readyState === 'live' && consent,
                },
                abort.signal,
              )
              attempt = payload.attempt
            }
            if (
              message.type === 'hello' &&
              payload.attempt === attempt &&
              payload.stageControls &&
              typeof payload.stageControls === 'object'
            ) {
              readControls(payload.stageControls as Record<string, unknown>)
            }
            signalling.consumed(message)
          }
        } catch {
          if (!abort.signal.aborted) {
            pc?.close()
            pc = undefined
            setRemote(null)
            setRecording(null)
            setStatus('Reconnecting to studio')
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 650))
      }
    }
    void run()
    return () => {
      abort.abort()
      withdrawRef.current = null
      pc?.close()
    }
  }, [joined, mic, camera, consent, ended])

  async function join() {
    setJoining(true)
    setError('')
    try {
      const response = await fetch('/api/podcast-studio/guests/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, displayName: name, headphones }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not join the studio.')
      setJoined(body)
      setStatus('Backstage. Your devices are private until the host admits you.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join the studio.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="mt-4 space-y-4 text-sm">
      {!joined && (
        <fieldset className="space-y-3" disabled={joining}>
          <legend>Guest preflight</legend>
          <label className="block">
            Display name <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <StageDevices setup={setup} />
          <label className="block">
            Headphones{' '}
            <select value={headphones} onChange={(event) => setHeadphones(event.target.value)}>
              <option value="">Select your setup</option>
              <option value="headphones">I am wearing headphones</option>
              <option value="no-headphones-fallback">Speaker fallback (keep volume low)</option>
            </select>
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />{' '}
            Allow this camera in the recorded and public program
          </label>
          <p>
            Your camera can be visible to the host with this box cleared. Your microphone may be
            included in the recorded and public program after admission.
          </p>
          <SoundCheck token={token} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!mic || !name.trim() || !headphones || setup.checking}
            onClick={() => void join()}
          >
            Join backstage
          </button>
        </fieldset>
      )}
      {joined && !ended && (
        <section className="space-y-3" aria-label="Guest stage">
          <p role="status">{status}</p>
          <p role="status">
            Program recording:{' '}
            {recording === null ? 'awaiting host status' : recording ? 'active' : 'off'}.
          </p>
          <p>
            Camera program consent:{' '}
            {cameraWithdrawn
              ? 'withdrawn (camera off)'
              : camera && consent
                ? 'granted for this join'
                : 'denied'}
            .
          </p>
          {joined.ice.limitation && <p>{joined.ice.limitation}</p>}
          {remote && <StageVideo stream={remote} label="Studio program and mix-minus return" />}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={hostMuted}
            aria-pressed={selfMuted || hostMuted}
            onClick={() => setSelfMuted(!selfMuted)}
          >
            {hostMuted ? 'Muted by host' : selfMuted ? 'Unmute microphone' : 'Mute microphone'}
          </button>{' '}
          {camera && !cameraWithdrawn && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                // Disable capture for the rest of this join, including any future negotiation.
                camera.stop()
                withdrawRef.current?.()
                setCameraWithdrawn(true)
              }}
            >
              Turn off camera and withdraw video consent
            </button>
          )}{' '}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void stageSignal({
                ...joined.invite,
                inviteId: joined.invite.id,
                credential: joined.signallingCredential,
              })
                .send('bye', {}, AbortSignal.timeout(5000))
                .catch(() => undefined)
              setup.setStream(null)
              setEnded(true)
            }}
          >
            Leave stage
          </button>
        </section>
      )}
      {ended && <p role="status">Your guest session has ended.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
