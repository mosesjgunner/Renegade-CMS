/**
 * POD-11 — Guest recording BROWSER ADAPTER (thin; UNVERIFIED).
 *
 * Wires the proven guest-recording cores to the browser: the guest's
 * mic (POD-06 master constraints — raw, processing off) through the
 * POD-06 capture worklet into an OPFS journal via GuestLocalRecorder,
 * progressive upload over the credential chunk protocol
 * (guests/chunks route), and recording telemetry posted to the host
 * as POD-10 signalling control messages (`hello` payloads — no media,
 * so the signalling core allows them; the host's poll surfaces them).
 *
 * No real browser, microphone, OPFS or AudioWorklet was exercised —
 * this file is typechecked wiring over headlessly proven cores, in
 * the POD-06/07/09/10 adapter tradition. The two-browser rig test
 * that closes it is named in docs/podcast-studio/GUESTS.md.
 */

import { buildMasterConstraints } from '../capture/capture'
import { OpfsChunkStorage } from '../capture/journal-opfs'
import { connectCaptureNode } from '../capture/worklet/loader'
import type { GuestGapInput, GuestSyncPair } from '../recording/conform'
import {
  GuestChunkUploader,
  GuestLocalRecorder,
  guestRecordingBinding,
  type GuestChunkTransport,
} from './guest-recording'

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
}

/** GuestChunkTransport over the guests/chunks route (fetch + signalling credential). */
export const createGuestChunkFetchTransport = (input: {
  credential: string
  sessionRecordId: string
}): GuestChunkTransport => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.credential}`,
  }
  return {
    listReceived: async () => {
      const res = await fetch(
        `/api/podcast-studio/guests/chunks?sessionId=${encodeURIComponent(input.sessionRecordId)}`,
        { headers },
      )
      if (!res.ok) throw new Error(`Received-list failed (${res.status}).`)
      const body = (await res.json()) as { receivedChunks: number[] }
      return body.receivedChunks
    },
    sendChunk: async (index, bytes) => {
      const res = await fetch('/api/podcast-studio/guests/chunks', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: input.sessionRecordId,
          index,
          bytesBase64: bytesToBase64(bytes),
        }),
      })
      if (!res.ok) throw new Error(`Chunk ${index} upload failed (${res.status}).`)
    },
    complete: async (complete) => {
      const res = await fetch('/api/podcast-studio/guests/chunks', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ sessionId: input.sessionRecordId, ...complete }),
      })
      if (!res.ok) throw new Error(`Upload completion failed (${res.status}).`)
      return { ok: true as const }
    },
  }
}

/** Posts one telemetry snapshot to the host over POD-10 signalling (control message). */
export const postGuestRecordingTelemetry = async (input: {
  credential: string
  sessionRecordId: string
  telemetry: Record<string, unknown>
}): Promise<void> => {
  await fetch('/api/podcast-studio/guests/signalling', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.credential}`,
    },
    body: JSON.stringify({
      type: 'hello',
      sessionId: input.sessionRecordId,
      payload: input.telemetry,
    }),
  }).catch(() => undefined)
}

export type GuestBrowserRecording = {
  recorder: GuestLocalRecorder
  /** Stops capture, flushes the journal, uploads (resumable), and declares completion. */
  stopAndUpload(tailSync: GuestSyncPair): Promise<void>
  disconnect(): void
}

/**
 * Starts the guest's local recording: opens the mic on the POD-06
 * master path, connects the capture worklet to the recorder, and
 * returns the handle the guest page drives (stop on leave/drop).
 * `headSync` is the correspondence captured at admit time through
 * the signalling layer (guest sample 0 ↔ host timeline sample).
 */
export const startGuestBrowserRecording = async (input: {
  credential: string
  sessionId: string
  sessionRecordId: string
  inviteId: string
  guestId?: string | null
  headSync: GuestSyncPair
  onTelemetry?: (telemetry: Record<string, unknown>) => void
}): Promise<GuestBrowserRecording> => {
  const binding = guestRecordingBinding({
    sessionId: input.sessionId,
    sessionRecordId: input.sessionRecordId,
    inviteId: input.inviteId,
    guestId: input.guestId ?? null,
  })
  const storage = new OpfsChunkStorage()
  const recorder = await GuestLocalRecorder.start(storage, binding, input.headSync)
  const stream = await navigator.mediaDevices.getUserMedia(buildMasterConstraints())
  const context = new AudioContext({ sampleRate: 48_000 })
  const handle = await connectCaptureNode(context, stream, (message) => {
    void recorder.ingest(message.pcm).catch(() => undefined)
  })
  const transport = createGuestChunkFetchTransport({
    credential: input.credential,
    sessionRecordId: input.sessionRecordId,
  })
  const emitTelemetry = () => {
    const telemetry = recorder.telemetry() as unknown as Record<string, unknown>
    input.onTelemetry?.(telemetry)
    void postGuestRecordingTelemetry({
      credential: input.credential,
      sessionRecordId: input.sessionRecordId,
      telemetry,
    })
  }
  emitTelemetry()
  return {
    recorder,
    stopAndUpload: async (tailSync: GuestSyncPair) => {
      handle.disconnect()
      for (const track of stream.getTracks()) track.stop()
      await context.close().catch(() => undefined)
      const state = await recorder.stop(tailSync)
      emitTelemetry()
      if (recorder.journalRef && recorder.journalFooter) {
        const uploader = new GuestChunkUploader(transport, storage, recorder.journalRef)
        await uploader.finish({
          headSync: state.headSync ?? input.headSync,
          tailSync: state.tailSync ?? tailSync,
          gaps: state.gaps as GuestGapInput[],
          footer: recorder.journalFooter,
        })
        state.chunksUploaded = state.chunksJournaled
        emitTelemetry()
      }
    },
    disconnect: () => {
      handle.disconnect()
      for (const track of stream.getTracks()) track.stop()
      void context.close().catch(() => undefined)
    },
  }
}
