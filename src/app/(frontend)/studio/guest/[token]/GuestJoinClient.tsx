'use client'

/**
 * POD-10 guest join client (functional-minimal): preflight (display
 * name, mic device check on the POD-06 cores, headphone declaration,
 * and the audio-pass sound check — a measured room/mic diagnostic
 * that warns in plain language and never blocks the join), waiting
 * room, then the live view (big mute button, connection state,
 * talkback indicator, diagnostics log).
 *
 * Device check: saved per-participant prefs are resolved FAIL-CLOSED
 * through POD-06's assertSavedDevicesPresent — a saved mic that is no
 * longer present blocks the join with the device named; a different
 * device is never silently substituted.
 *
 * The WebRTC adapter wiring (peer-browser.ts) is UNVERIFIED in a real
 * browser — see docs/podcast-studio/GUESTS.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  assertSavedDevicesPresent,
  ParticipantDevicePrefsStore,
  type CaptureDeviceInfo,
  type PrefsStorage,
} from '@/modules/podcast-studio/capture/devices'
import {
  startGuestBrowserRecording,
  type GuestBrowserRecording,
} from '@/modules/podcast-studio/guests/guest-recording-browser'
import { SoundCheck } from '../../SoundCheck'

const localStoragePrefs: PrefsStorage = {
  get: (key) => window.localStorage.getItem(key),
  set: (key, value) => window.localStorage.setItem(key, value),
  remove: (key) => window.localStorage.removeItem(key),
}

type Phase = 'preflight' | 'waiting' | 'live' | 'ended' | 'error'

export function GuestJoinClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('preflight')
  const [name, setName] = useState('')
  const [headphones, setHeadphones] = useState<'headphones' | 'no-headphones-fallback' | ''>('')
  const [devices, setDevices] = useState<CaptureDeviceInfo[]>([])
  const [deviceError, setDeviceError] = useState('')
  const [muted, setMuted] = useState(false)
  const [talkback, setTalkback] = useState(false)
  const [peerState, setPeerState] = useState('invited')
  const [log, setLog] = useState<string[]>([])
  const credentialRef = useRef('')
  const sessionIdRef = useRef('')
  const inviteIdRef = useRef('')
  const afterRef = useRef<string | undefined>(undefined)
  // POD-11: the guest's own local recording (journal + resumable
  // upload + conform on the server). Starts on admit, stops on
  // leave/drop. Browser behaviour UNVERIFIED — see GUESTS.md.
  const recordingRef = useRef<GuestBrowserRecording | null>(null)
  const recordingStartedRef = useRef(false)
  const [recordingState, setRecordingState] = useState('not started')

  const note = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-49), `${new Date().toLocaleTimeString()} ${line}`])
  }, [])

  // Device check (POD-06 cores): enumerate, then fail-closed on saved prefs.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setDeviceError('This browser cannot list audio devices; joining is blocked.')
        return
      }
      const found = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      if (cancelled) return
      const mapped: CaptureDeviceInfo[] = found.map((d) => ({
        deviceId: d.deviceId,
        kind: d.kind as CaptureDeviceInfo['kind'],
        label: d.label,
        groupId: d.groupId,
      }))
      setDevices(mapped)
      const store = new ParticipantDevicePrefsStore(localStoragePrefs)
      const prefs = store.load(`guest:${token.slice(0, 8)}`)
      const check = assertSavedDevicesPresent(prefs, mapped)
      if (!check.ok) {
        setDeviceError(
          `Saved device missing: ${check.errors.map((e) => `${e.role} "${e.savedDeviceLabel}"`).join(', ')}. Reconnect it or clear the saved choice in the studio.`,
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const join = async () => {
    if (deviceError) return
    const res = await fetch('/api/podcast-studio/guests/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, displayName: name, headphones }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      signallingCredential?: string
      invite?: { id: string; sessionId: string }
      ice?: { limitation?: string | null }
    }
    if (!res.ok || !body.signallingCredential) {
      note(body.error ?? `Join failed (${res.status}).`)
      setPhase('error')
      return
    }
    credentialRef.current = body.signallingCredential
    sessionIdRef.current = body.invite?.sessionId ?? ''
    inviteIdRef.current = body.invite?.id ?? ''
    if (body.ice?.limitation) note(`Connection note: ${body.ice.limitation}`)
    note('Joined. You are in the waiting room — nothing is transmitted until the host admits you.')
    setPhase('waiting')
  }

  // Long-poll loop: lobby state + talkback indicator + diagnostics.
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'live') return
    let cancelled = false
    void (async () => {
      while (!cancelled) {
        const res = await fetch(
          `/api/podcast-studio/guests/signalling?waitMs=10000${
            afterRef.current ? `&after=${encodeURIComponent(afterRef.current)}` : ''
          }`,
          { headers: { Authorization: `Bearer ${credentialRef.current}` } },
        ).catch(() => null)
        if (!res || !res.ok) {
          if (!cancelled) {
            setPeerState('reconnecting')
            await new Promise((r) => setTimeout(r, 2_000))
          }
          continue
        }
        const body = (await res.json()) as {
          lobbyState: string
          messages: Array<{ type: string; payload: Record<string, unknown>; createdAt: string }>
        }
        if (body.lobbyState === 'admitted') {
          setPeerState('admitted')
          setPhase('live')
        } else if (body.lobbyState === 'dropped' || body.lobbyState === 'left') {
          setPeerState('dropped')
          setPhase('ended')
          note('The host ended your guest session.')
          return
        }
        for (const message of body.messages) {
          afterRef.current = message.createdAt
          if (message.type === 'talkback') setTalkback(Boolean(message.payload.active))
          if (message.type === 'bye') {
            setPhase('ended')
            return
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [phase, note])

  // POD-11 local recording lifecycle: start on admit (the live
  // phase), stop + resumable upload when the session ends. The head
  // sync pair is captured at start: guest sample 0 against the host
  // timeline position the host's signalling hello last reported (0
  // until the host reports one — the correspondence model is data in
  // the conform core; real two-browser capture is UNVERIFIED).
  useEffect(() => {
    if (phase !== 'live' || recordingStartedRef.current) return
    recordingStartedRef.current = true
    void (async () => {
      try {
        recordingRef.current = await startGuestBrowserRecording({
          credential: credentialRef.current,
          // The local journal's session key; the server re-derives the
          // canonical session doc id from the session record.
          sessionId: sessionIdRef.current,
          sessionRecordId: sessionIdRef.current,
          inviteId: inviteIdRef.current,
          headSync: { guestTrackSamples: 0, hostTimelineSamples: 0 },
          onTelemetry: (telemetry) =>
            note(
              `Local recording: ${String(telemetry.phase ?? '')} (${String(telemetry.chunksJournaled ?? 0)} chunks journaled).`,
            ),
        })
        setRecordingState('recording locally (this device keeps the master track)')
        note('Local recording started — your own track is being recorded on this device.')
      } catch {
        setRecordingState('local recording unavailable — the live capture is the fallback')
        note(
          'Local recording could not start; the host still hears you live (fallback ladder rung 2).',
        )
      }
    })()
  }, [phase, note])

  useEffect(() => {
    if (phase !== 'ended' || !recordingRef.current) return
    const recording = recordingRef.current
    recordingRef.current = null
    void (async () => {
      try {
        const frames = recording.recorder.guestSample
        await recording.stopAndUpload({
          guestTrackSamples: frames,
          hostTimelineSamples: frames,
        })
        setRecordingState('uploaded — the host will conform your track to the show timeline')
        note('Local recording stopped and uploaded for conform.')
      } catch {
        setRecordingState('upload incomplete — it resumes from the server received list')
        note('Upload did not finish; the journal on this device resumes where it stopped.')
      }
    })()
  }, [phase, note])

  const micCount = devices.filter((d) => d.kind === 'audioinput').length

  return (
    <div className="mt-4 space-y-4 text-sm">
      {phase === 'preflight' && (
        <section className="space-y-3" aria-label="Guest preflight">
          <label className="block">
            Display name
            <input
              className="border rounded px-2 py-1 block mt-1 w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How the host should introduce you"
            />
          </label>
          <p>
            Microphones found: {micCount}.{' '}
            {deviceError ? (
              <span role="alert">{deviceError}</span>
            ) : (
              'Device check passed (saved devices verified fail-closed).'
            )}
          </p>
          <fieldset className="space-y-1">
            <legend className="font-medium">Headphones</legend>
            <label className="block">
              <input
                type="radio"
                name="headphones"
                checked={headphones === 'headphones'}
                onChange={() => setHeadphones('headphones')}
              />{' '}
              I am wearing headphones
            </label>
            <label className="block">
              <input
                type="radio"
                name="headphones"
                checked={headphones === 'no-headphones-fallback'}
                onChange={() => setHeadphones('no-headphones-fallback')}
              />{' '}
              No headphones — use the fallback (keep speakers low; echo risk noted)
            </label>
          </fieldset>
          <SoundCheck token={token} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!name.trim() || !headphones || Boolean(deviceError)}
            onClick={() => void join()}
          >
            Join the waiting room
          </button>
        </section>
      )}

      {phase === 'waiting' && (
        <p role="status">Waiting room — the host can see you. Please wait to be admitted.</p>
      )}

      {phase === 'live' && (
        <section className="space-y-3" aria-label="Live guest view">
          <p role="status">You are live. Connection: {peerState}.</p>
          <p role="status">Local recording: {recordingState}.</p>
          {talkback && (
            <p className="font-bold" role="alert">
              The host is talking to you off-air (talkback — not recorded or streamed).
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary text-lg px-6 py-3"
            aria-pressed={muted}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
        </section>
      )}

      {phase === 'ended' && <p role="status">Your guest session has ended. Thanks for joining.</p>}
      {phase === 'error' && <p role="alert">Join failed — see the diagnostics log below.</p>}

      <section aria-label="Connection diagnostics">
        <h2 className="font-bold">Diagnostics</h2>
        <ul className="font-mono text-xs space-y-1">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
