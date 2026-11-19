'use client'

/**
 * Audio pass — pre-record sound check (client).
 *
 * Records a few seconds of the RAW mic (browser processing OFF, the
 * POD-REQ-16 discipline — the check must hear the room as the master
 * recording will) and sends it to /api/podcast-studio/room-check.
 * The verdicts come back in plain language with a specific fix per
 * problem; the measured numbers sit in a collapsed detail.
 *
 * Advisory only: this component never disables anything. A warning
 * is information, not a gate.
 *
 * Browser behaviour UNVERIFIED in a real browser (no mic on the
 * build rig) — see docs/podcast-studio/PRODUCTION.md.
 */
import { useRef, useState } from 'react'

type RoomCheckItem = {
  id: string
  status: 'pass' | 'warn'
  headline: string
  hint?: string
  detail: Record<string, number | string>
}

type RoomCheckReport = {
  status: 'good' | 'needs-attention'
  summary: string
  items: RoomCheckItem[]
  measurements: Record<string, number | unknown>
}

type Phase = 'idle' | 'recording' | 'measuring' | 'done' | 'error'

const RECORD_MS = 3500

export function SoundCheck({ token }: { token?: string }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [report, setReport] = useState<RoomCheckReport | null>(null)
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)

  const start = async () => {
    setError('')
    setReport(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    } catch {
      setError('Microphone access was refused — allow the mic to run the sound check.')
      setPhase('error')
      return
    }
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream)
    recorderRef.current = recorder
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      void measure(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
    }
    recorder.start()
    setPhase('recording')
    window.setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, RECORD_MS)
  }

  const measure = async (blob: Blob) => {
    setPhase('measuring')
    try {
      const form = new FormData()
      form.set('audio', blob, 'sound-check.webm')
      if (token) form.set('token', token)
      const res = await fetch('/api/podcast-studio/room-check', { method: 'POST', body: form })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        report?: RoomCheckReport
      }
      if (!res.ok || !body.report) {
        setError(body.error ?? `Sound check failed (${res.status}).`)
        setPhase('error')
        return
      }
      setReport(body.report)
      setPhase('done')
    } catch {
      setError('Sound check could not reach the server.')
      setPhase('error')
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">Sound check</legend>
      <p>
        Record a few seconds of yourself talking, the way you will during the show. We measure the
        room — fan noise, clipping, level — and tell you what to fix before it costs a take.
      </p>
      <button
        type="button"
        className="btn"
        disabled={phase === 'recording' || phase === 'measuring'}
        onClick={() => void start()}
      >
        {phase === 'recording'
          ? 'Listening… talk normally'
          : phase === 'measuring'
            ? 'Measuring your room…'
            : 'Test my sound (3 seconds)'}
      </button>
      {phase === 'error' && <p role="alert">{error}</p>}
      {phase === 'done' && report && (
        <div className="space-y-2" role="status">
          <p className="font-medium">{report.summary}</p>
          <ul className="space-y-1">
            {report.items.map((item) => (
              <li key={item.id}>
                {item.status === 'pass' ? '✓ ' : '⚠ '}
                {item.headline}
                {item.hint ? <span className="block"> {item.hint}</span> : null}
              </li>
            ))}
          </ul>
          <details>
            <summary>The measured numbers</summary>
            <pre className="font-mono text-xs">{JSON.stringify(report.measurements, null, 2)}</pre>
          </details>
        </div>
      )}
    </fieldset>
  )
}
