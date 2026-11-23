'use client'

import { useEffect, useRef, useState } from 'react'
import type { LiveConnection, LiveMediaCapabilities, LiveState, ProviderId } from './provider'
import { publishWhip } from './whip'
import { DestinationControls } from './DestinationControls'

type Session = {
  id: string
  provider: ProviderId
  state: LiveState
  recording: boolean
  providerStopped: boolean
}
type Provider = { id: ProviderId; ready: boolean; capabilities: LiveMediaCapabilities }
type Reply = { session: Session | null; connection?: LiveConnection; providers?: Provider[] }

const buttonClass = 'rounded border px-3 py-1 text-sm disabled:opacity-50'

export function BroadcastControls({
  endpoint,
  programStream,
  onRecordingChange,
  eventShow = false,
}: {
  endpoint: string
  programStream?: MediaStream
  eventShow?: boolean
  onRecordingChange?: (active: boolean) => void
}) {
  const preview = useRef<HTMLVideoElement>(null)
  const source = useRef<MediaStream | null>(null)
  const transport = useRef<Awaited<ReturnType<typeof publishWhip>> | null>(null)
  const reconnecting = useRef(false)
  const activeGeneration = useRef(0)
  const [cameraReady, setCameraReady] = useState(false)
  const [configured, setConfigured] = useState<Provider[]>([])
  const [provider, setProvider] = useState<ProviderId>('mediamtx')
  const [inputId, setInputId] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [recording, setRecording] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function request(action?: string, body: Record<string, unknown> = {}): Promise<Reply> {
    const csrf = document.cookie.match(/(?:^|;\s*)renegade-member-csrf=([^;]+)/)?.[1]
    const response = await fetch(
      endpoint,
      action
        ? {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-member-csrf': csrf ? decodeURIComponent(csrf) : '',
            },
            body: JSON.stringify({ action, ...body }),
          }
        : { cache: 'no-store' },
    )
    const value = await response.json()
    if (!response.ok) throw new Error(value.error ?? 'The live media service is unavailable.')
    return value as Reply
  }

  async function connect(id: string, capture: MediaStream) {
    const generation = activeGeneration.current
    await transport.current?.close()
    transport.current = null
    const reply = await request('connect', { sessionId: id })
    if (!reply.connection) throw new Error('There is no configured browser ingest.')
    const connection = await publishWhip(capture, reply.connection)
    if (generation !== activeGeneration.current) {
      await connection.close()
      return
    }
    transport.current = connection
    setError('')
  }

  const sessionId = session?.id
  const ended = session?.state === 'ended'
  useEffect(() => {
    if (!sessionId || ended) return
    let disposed = false
    let failures = 0
    const timer = setInterval(async () => {
      if (reconnecting.current || disposed) return
      reconnecting.current = true
      try {
        const result = await request('heartbeat', { sessionId })
        if (disposed) return
        setSession(result.session)
        const peer = transport.current?.peer
        const disconnected =
          !peer || ['disconnected', 'failed', 'closed'].includes(peer.connectionState)
        failures = disconnected ? failures + 1 : 0
        if (failures >= 2 && source.current) await connect(sessionId, source.current)
      } catch {
        if (!disposed)
          setError('The source is reconnecting. This broadcast keeps its current room and session.')
      } finally {
        reconnecting.current = false
      }
    }, 5000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
    // The room endpoint and session identify this publisher for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, sessionId, ended])

  useEffect(
    () => () => {
      activeGeneration.current++
      if (!programStream) source.current?.getTracks().forEach((track) => track.stop())
      void transport.current?.close()
    },
    [programStream],
  )

  useEffect(() => {
    onRecordingChange?.(Boolean(session?.recording && !ended))
  }, [session?.recording, ended, onRecordingChange])

  async function run(operation: () => Promise<void>) {
    setPending(true)
    setError('')
    try {
      await operation()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The live media operation failed.')
    } finally {
      setPending(false)
    }
  }

  async function preflight() {
    const result = await request()
    setConfigured(result.providers ?? [])
    setSession(result.session)
    setProvider(
      result.session?.state !== 'ended' && result.session
        ? result.session.provider
        : (result.providers?.find((candidate) => candidate.ready)?.id ?? 'mediamtx'),
    )
    if (eventShow && !result.providers?.find((candidate) => candidate.id === 'mediamtx')?.ready)
      throw new Error(
        'The recording provider is unavailable. Check the provider and retry preflight.',
      )
    if (programStream) {
      source.current = programStream
      if (preview.current) preview.current.srcObject = programStream
      setCameraReady(programStream.getTracks().every((track) => track.readyState === 'live'))
      return
    }
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('Camera and microphone access require HTTPS or a local browser origin.')
    if (source.current?.getTracks().every((track) => track.readyState === 'live')) return
    source.current?.getTracks().forEach((track) => track.stop())
    setCameraReady(false)
    source.current = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true },
    })
    if (preview.current) preview.current.srcObject = source.current
    setCameraReady(
      source.current.getVideoTracks().length > 0 && source.current.getAudioTracks().length > 0,
    )
  }

  async function start() {
    if (!source.current) throw new Error('Run the camera and microphone preflight first.')
    if (session && session.state !== 'ended') {
      await connect(session.id, source.current)
      return
    }
    const result = await request('start', {
      provider: eventShow ? 'mediamtx' : provider,
      recording: eventShow || provider === 'cloudflare' || recording,
      inputId,
    })
    if (!result.session) throw new Error('The broadcast could not be started.')
    setSession(result.session)
    await connect(result.session.id, source.current)
  }

  async function finish(action: 'end' | 'revoke') {
    if (!session) return
    activeGeneration.current++
    setSession({ ...session, state: 'ended', providerStopped: false })
    if (!programStream) source.current?.getTracks().forEach((track) => track.stop())
    source.current = null
    setCameraReady(false)
    const current = transport.current
    transport.current = null
    void current?.close()
    const result = await request(action, { sessionId: session.id })
    setSession(result.session)
  }

  const selected = configured.find((item) => item.id === provider)
  const active = Boolean(session && !ended)

  return (
    <details className="my-4 rounded-lg border p-4">
      <summary>Broadcast from this browser</summary>
      <div className="mt-3 grid gap-3">
        <video
          ref={preview}
          muted
          autoPlay
          playsInline
          aria-label={programStream ? 'Program preview' : 'Camera preview'}
          className="aspect-video w-full max-w-sm rounded bg-black"
        />
        <div>
          <button className={buttonClass} disabled={pending} onClick={() => void run(preflight)}>
            {programStream ? 'Check program and provider' : 'Check camera, microphone and provider'}
          </button>
        </div>
        {configured.length > 0 && (
          <label>
            Provider{' '}
            <select
              value={provider}
              disabled={active || pending}
              onChange={(event) => setProvider(event.target.value as ProviderId)}
            >
              {configured.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id === 'mediamtx' ? 'MediaMTX' : 'Cloudflare Stream'} ·{' '}
                  {item.ready ? 'Ready' : 'Unavailable'}
                </option>
              ))}
            </select>
          </label>
        )}
        {provider === 'cloudflare' && !active && (
          <label>
            Managed input ID{' '}
            <input
              value={inputId}
              onChange={(event) => setInputId(event.target.value)}
              className="rounded border p-1"
            />
          </label>
        )}
        {selected && <p className="text-sm">{selected.capabilities.cost}</p>}
        {!eventShow && configured.length > 0 && !active && provider === 'mediamtx' && (
          <label>
            <input
              type="checkbox"
              checked={recording}
              onChange={(event) => setRecording(event.target.checked)}
            />{' '}
            Record a replay
          </label>
        )}
        {session && (
          <p role="status">
            Broadcast {session.state}
            {ended && !session.providerStopped ? ' · Provider stop pending' : ''}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass}
            disabled={
              pending ||
              !cameraReady ||
              !selected?.ready ||
              Boolean(ended && (eventShow || !session?.providerStopped))
            }
            onClick={() => void run(start)}
          >
            {active ? 'Reconnect source' : eventShow ? 'Start show' : 'Start broadcast'}
          </button>
          {session && (!ended || !session.providerStopped) && (
            <button
              className={buttonClass}
              disabled={pending}
              onClick={() => void run(() => finish('end'))}
            >
              {ended ? 'Retry provider stop' : eventShow ? 'End show' : 'End broadcast'}
            </button>
          )}
          {session && ended && session.providerStopped && (
            <button
              className={buttonClass}
              disabled={pending}
              onClick={() => void run(() => finish('revoke'))}
            >
              Revoke replay access
            </button>
          )}
        </div>
        <DestinationControls
          endpoint={endpoint}
          sessionId={active && session?.provider === 'mediamtx' ? session.id : undefined}
        />
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
