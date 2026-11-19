/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-11 (POD-REQ-25) — Guest chunk upload service (SERVER).
 *
 * The guest-side counterpart of the POD-06 upload bridge, for a
 * principal who holds NO account: media upload sessions are
 * owner-bound (a staff/member user owns the session), so a guest's
 * journal chunks travel under the POD-10 signalling credential
 * instead — the same credential that authenticates their signalling
 * and clip slots, resolved by guests/service.ts with the same
 * cross-session refusal discipline (a credential aimed at another
 * session is refused before any byte is stored, and the pure verdict
 * in guest-recording.ts re-checks session + admission + chunk shape).
 *
 * Storage: chunks land in a `ChunkStorage` (production:
 * `DirectoryChunkStorage` under `<mediaDir>/podcast-guest-chunks`)
 * in the POD-06 journal layout — the server maintains the journal
 * manifest itself (header on first chunk, one checksummed chunk line
 * per accepted chunk, footer at completion), so the POD-06 recovery
 * scan, the POD-09 track loader and the POD-11 conform job all read
 * the guest track exactly like a host track.
 *
 * Resume semantics (POD-06 bridge standard): the received list is
 * the server's chunk indexes; re-sending an already-received chunk
 * with identical bytes is an idempotent ack (never a duplicate);
 * re-sending one with DIFFERENT bytes is refused `chunk-conflict` —
 * a journal chunk's bytes cannot change. Completion is declared by
 * the guest with its journal footer facts (chunk count, frames,
 * running checksum) plus head/tail sync pairs and gap records; the
 * server verifies all of it against the recovered journal before the
 * track becomes conform-ready, and stores the sync/gap record on the
 * POD-05 session document's `guestRecordings` extension.
 */
import { TIMESLICE_FRAMES, WORKING_SAMPLE_RATE } from '../capture/capture'
import {
  recoverRecording,
  sha256Hex,
  type ChunkManifestHeader,
  type ChunkRecord,
  type ChunkStorage,
} from '../capture/journal'
import { loadStudioSessionRecord, saveStudioSessionRecord } from '../sessions'
import {
  guestJournalRecordingId,
  guestLocalTrackId,
  validateGuestChunkUpload,
  type GuestRecordingBinding,
} from './guest-recording'
import type { GuestGapInput, GuestSyncPair } from '../recording/conform'
import { PodcastGuestError, resolveSignallingCredential } from './service'

export type GuestRecordingMeta = {
  inviteId: string
  trackId: string
  uploadComplete: boolean
  totalChunks: number | null
  totalFrames: number | null
  journalChecksum: string | null
  headSync: GuestSyncPair | null
  tailSync: GuestSyncPair | null
  gaps: GuestGapInput[]
  completedAt: string | null
  conformReport?: unknown
}

const relationId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id ?? '')
      : ''

type ResolvedGuestUpload = {
  invite: any
  inviteId: string
  sessionRecordId: string
  binding: GuestRecordingBinding
  record: NonNullable<Awaited<ReturnType<typeof loadStudioSessionRecord>>>
}

/** Resolves the credential + session binding every chunk call shares. */
async function resolveGuestUpload(
  payload: any,
  storage: ChunkStorage,
  input: { credential: string; sessionId: string },
): Promise<ResolvedGuestUpload> {
  void storage
  const doc = await resolveSignallingCredential(payload, input.credential, {
    sessionId: input.sessionId,
  })
  const inviteId = String(doc.id)
  const sessionRecordId = relationId(doc.session)
  const record = await loadStudioSessionRecord(payload, sessionRecordId)
  if (!record) throw new PodcastGuestError('session-not-found', 'Studio session not found.')
  return {
    invite: doc,
    inviteId,
    sessionRecordId,
    record,
    binding: {
      sessionId: record.session.id,
      sessionRecordId,
      inviteId,
      guestId: relationId(doc.guest) || null,
      trackId: guestLocalTrackId(inviteId),
    },
  }
}

const parseManifestLines = (
  text: string | null,
): Array<ChunkManifestHeader | ChunkRecord | { type: 'footer'; checksum: string }> => {
  const lines: Array<ChunkManifestHeader | ChunkRecord | { type: 'footer'; checksum: string }> = []
  for (const line of (text ?? '').split('\n')) {
    if (!line.trim()) continue
    try {
      lines.push(JSON.parse(line))
    } catch {
      // Torn lines are ignored, exactly as the POD-06 recovery scan does.
    }
  }
  return lines
}

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Running checksum after `bytes`, continuing the journal chain (PT-B rule). */
const chainChecksum = (previousRunning: string, bytes: Uint8Array): string =>
  sha256Hex(concatBytes(hexToBytes(previousRunning || '0'.repeat(64)), bytes))

// ---------------------------------------------------------------------------
// Chunk writes + received list
// ---------------------------------------------------------------------------

export type GuestChunkWriteResult = {
  trackId: string
  receivedChunks: number[]
  /** True when the chunk was already on the server byte-identically (idempotent re-ack). */
  duplicate: boolean
}

/**
 * Accepts one journal chunk from an admitted (or upload-completing)
 * guest. Bytes land BEFORE the manifest line (PT-B write order).
 */
export async function writeGuestChunk(
  payload: any,
  storage: ChunkStorage,
  input: { credential: string; sessionId: string; index: number; bytes: Uint8Array },
): Promise<GuestChunkWriteResult> {
  const resolved = await resolveGuestUpload(payload, storage, input)
  const verdict = validateGuestChunkUpload({
    lobbyState: String(resolved.invite.state ?? '') as never,
    inviteSessionId: resolved.sessionRecordId,
    sessionId: input.sessionId,
    index: input.index,
    byteLength: input.bytes.length,
  })
  if (!verdict.ok) throw new PodcastGuestError(verdict.code, verdict.message)

  const recordingId = guestJournalRecordingId(resolved.binding)
  const existing = await storage.getChunk(recordingId, input.index)
  if (existing) {
    if (
      existing.length === input.bytes.length &&
      existing.every((byte, i) => byte === input.bytes[i])
    ) {
      return {
        trackId: resolved.binding.trackId,
        receivedChunks: await storage.listChunks(recordingId),
        duplicate: true,
      }
    }
    throw new PodcastGuestError(
      'chunk-conflict',
      `Chunk ${input.index} was already received with different bytes; a journal chunk cannot change.`,
    )
  }

  const lines = parseManifestLines(await storage.getManifest(recordingId))
  const header = lines.find((line) => line.type === 'header') as ChunkManifestHeader | undefined
  const chunkLines = lines.filter((line) => line.type === 'chunk') as ChunkRecord[]
  const previousRunning =
    chunkLines.length > 0
      ? chunkLines.reduce((a, b) => (b.index > a.index ? b : a)).runningChecksum
      : ''
  const checksum = sha256Hex(input.bytes)
  const record: ChunkRecord = {
    type: 'chunk',
    index: input.index,
    startSample: input.index * TIMESLICE_FRAMES,
    frames: input.bytes.length / 2,
    byteLength: input.bytes.length,
    checksum,
    runningChecksum: chainChecksum(previousRunning, input.bytes),
  }
  await storage.putChunk(recordingId, input.index, input.bytes)
  const manifestLines: string[] = []
  if (!header) {
    const newHeader: ChunkManifestHeader = {
      type: 'header',
      recordingId,
      sessionId: resolved.binding.sessionId,
      trackId: resolved.binding.trackId,
      sampleRate: WORKING_SAMPLE_RATE,
      channels: 1,
      chunkFrames: TIMESLICE_FRAMES,
      startedAt: new Date().toISOString(),
    }
    manifestLines.push(JSON.stringify(newHeader))
  }
  manifestLines.push(JSON.stringify(record))
  const existingText = (await storage.getManifest(recordingId)) ?? ''
  await storage.putManifest(
    recordingId,
    `${existingText}${existingText && !existingText.endsWith('\n') ? '\n' : ''}${manifestLines.join('\n')}\n`,
  )
  return {
    trackId: resolved.binding.trackId,
    receivedChunks: await storage.listChunks(recordingId),
    duplicate: false,
  }
}

/** The server's received-chunk list — the resume source of truth. */
export async function listGuestReceivedChunks(
  payload: any,
  storage: ChunkStorage,
  input: { credential: string; sessionId: string },
): Promise<{ trackId: string; receivedChunks: number[] }> {
  const resolved = await resolveGuestUpload(payload, storage, input)
  const recordingId = guestJournalRecordingId(resolved.binding)
  return {
    trackId: resolved.binding.trackId,
    receivedChunks: await storage.listChunks(recordingId),
  }
}

// ---------------------------------------------------------------------------
// Completion: verify the journal, persist sync pairs + gaps
// ---------------------------------------------------------------------------

export const readGuestRecordingMeta = (
  sessionDoc: unknown,
  inviteId: string,
): GuestRecordingMeta | null => {
  const entries = (sessionDoc as any)?.guestRecordings
  if (!Array.isArray(entries)) return null
  return (entries.find((entry) => entry?.inviteId === inviteId) as GuestRecordingMeta) ?? null
}

export async function upsertGuestRecordingMeta(
  payload: any,
  sessionRecordId: string,
  meta: GuestRecordingMeta,
): Promise<void> {
  const record = await loadStudioSessionRecord(payload, sessionRecordId)
  if (!record) throw new PodcastGuestError('session-not-found', 'Studio session not found.')
  const doc = record.session as any
  const entries: any[] = Array.isArray(doc.guestRecordings) ? doc.guestRecordings : []
  const idx = entries.findIndex((entry) => entry?.inviteId === meta.inviteId)
  if (idx >= 0) entries[idx] = { ...entries[idx], ...meta }
  else entries.push(meta)
  doc.guestRecordings = entries
  await saveStudioSessionRecord(payload, record.id, record.session)
}

/**
 * Declares the guest upload complete. The server trusts nothing the
 * guest declared: the POD-06 recovery scan must admit exactly the
 * declared chunk count and frame total, checksums must verify, and
 * the journal's running checksum must equal the guest's footer
 * checksum — only then is the footer written (making the journal
 * `complete` for the conform readiness gate) and the sync/gap record
 * persisted. An interrupted upload simply never reaches this call;
 * it resumes through the received list instead.
 */
export async function completeGuestChunkUpload(
  payload: any,
  storage: ChunkStorage,
  input: {
    credential: string
    sessionId: string
    totalChunks: number
    totalFrames: number
    checksum: string
    headSync: GuestSyncPair
    tailSync: GuestSyncPair
    gaps: GuestGapInput[]
  },
): Promise<{ trackId: string; recoveredFrames: number; meta: GuestRecordingMeta }> {
  const resolved = await resolveGuestUpload(payload, storage, input)
  const lobbyState = String(resolved.invite.state ?? '')
  if (!['admitted', 'left', 'dropped'].includes(lobbyState)) {
    throw new PodcastGuestError(
      'chunk-not-admitted',
      'Upload completion refused: the guest has not been admitted.',
    )
  }
  const recordingId = guestJournalRecordingId(resolved.binding)
  const report = await recoverRecording(storage, recordingId)
  if (!report) {
    throw new PodcastGuestError(
      'upload-incomplete',
      'No guest chunks were received for this track.',
    )
  }
  if (!report.checksumsVerified) {
    throw new PodcastGuestError(
      'chunk-checksum-mismatch',
      'Upload completion refused: a received chunk failed checksum verification.',
    )
  }
  if (
    report.admittedChunks.length !== input.totalChunks ||
    report.recoveredFrames !== input.totalFrames
  ) {
    throw new PodcastGuestError(
      'upload-incomplete',
      `Upload is incomplete: server recovered ${report.admittedChunks.length} chunks / ${report.recoveredFrames} frames, guest declared ${input.totalChunks} chunks / ${input.totalFrames} frames. Resume from the received list.`,
    )
  }
  const lines = parseManifestLines(await storage.getManifest(recordingId))
  const chunkLines = lines.filter((line) => line.type === 'chunk') as ChunkRecord[]
  const running =
    chunkLines.length > 0
      ? chunkLines.reduce((a, b) => (b.index > a.index ? b : a)).runningChecksum
      : ''
  if (running !== input.checksum) {
    throw new PodcastGuestError(
      'chunk-checksum-mismatch',
      'Upload completion refused: the journal running checksum does not match the guest footer checksum.',
    )
  }
  if (!report.complete) {
    const footer = {
      type: 'footer',
      complete: true,
      totalChunks: input.totalChunks,
      totalFrames: input.totalFrames,
      checksum: input.checksum,
    }
    const existingText = (await storage.getManifest(recordingId)) ?? ''
    await storage.putManifest(
      recordingId,
      `${existingText}${existingText && !existingText.endsWith('\n') ? '\n' : ''}${JSON.stringify(footer)}\n`,
    )
  }
  const meta: GuestRecordingMeta = {
    inviteId: resolved.inviteId,
    trackId: resolved.binding.trackId,
    uploadComplete: true,
    totalChunks: input.totalChunks,
    totalFrames: input.totalFrames,
    journalChecksum: input.checksum,
    headSync: input.headSync,
    tailSync: input.tailSync,
    gaps: input.gaps ?? [],
    completedAt: new Date().toISOString(),
  }
  await upsertGuestRecordingMeta(payload, resolved.sessionRecordId, meta)
  return { trackId: resolved.binding.trackId, recoveredFrames: report.recoveredFrames, meta }
}
