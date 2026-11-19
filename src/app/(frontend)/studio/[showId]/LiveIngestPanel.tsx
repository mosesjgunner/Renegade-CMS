'use client'

/**
 * POD-21 — Live ingest panel (THIN ADAPTER wiring; UNVERIFIED in a
 * real browser, like every POD-06/07/09 browser surface).
 *
 * Wires the studio workspace's program bus to the POD-21 ingest
 * endpoint: when the POD-07 mixer graph is mounted, its program
 * destination stream feeds `LiveIngestUploader`, which uploads
 * sequential PCM chunks the POD-16 relay consumes server-side.
 *
 * The workspace surface does not mount the mixer graph today (the
 * graph's consumers — recording, guests, ingest — are adapters that
 * attach when a host page provides one), so the panel takes the
 * graph as an optional prop: with no graph it says so plainly
 * instead of pretending to stream; with a graph, Start/Stop drive
 * the real uploader and the readout shows its ack state.
 */

import { useRef, useState } from 'react'

import type { MixerGraphHandle } from '@/modules/podcast-studio/mixer/engine-browser'
import {
  LiveIngestUploader,
  type LiveIngestUploadState,
} from '@/modules/podcast-studio/live/ingest-browser'

export function LiveIngestPanel({
  sessionRecordId,
  graph = null,
  context = null,
}: {
  sessionRecordId: string
  graph?: MixerGraphHandle | null
  context?: AudioContext | null
}) {
  const uploaderRef = useRef<LiveIngestUploader | null>(null)
  const [state, setState] = useState<LiveIngestUploadState | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    if (!graph || !context) return
    setError(null)
    const uploader = new LiveIngestUploader({
      sessionRecordId,
      onError: (message) => setError(message),
    })
    uploaderRef.current = uploader
    try {
      await uploader.attach(context, graph)
      setRunning(true)
      setState(uploader.state)
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : String(attachError))
    }
  }

  const stop = () => {
    uploaderRef.current?.detach()
    uploaderRef.current = null
    setRunning(false)
    setState(null)
  }

  return (
    <section className="surface-card p-5 space-y-3" aria-label="Live ingest">
      <h2 className="text-lg font-bold">Live ingest — program bus → relay</h2>
      {!graph || !context ? (
        <p className="text-sm">
          The mixer graph is not mounted in this surface, so there is no program bus to upload yet.
          When the POD-07 graph is mounted, this panel streams its program output to the live relay
          through the ingest endpoint.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            {!running ? (
              <button type="button" onClick={() => void start()}>
                Start program ingest
              </button>
            ) : (
              <button type="button" onClick={stop}>
                Stop program ingest
              </button>
            )}
          </div>
          {state && (
            <p className="text-sm">
              Next seq {state.nextSeq} · acked {state.ackedSeq} · queued {state.queued}
              {state.lastError ? ` · last error: ${state.lastError}` : ''}
            </p>
          )}
        </>
      )}
      {error && <p className="text-sm">{error}</p>}
    </section>
  )
}
