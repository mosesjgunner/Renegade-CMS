import { join } from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import {
  completeGuestChunkUpload,
  listGuestReceivedChunks,
  writeGuestChunk,
} from '@/modules/podcast-studio/guests/guest-chunk-upload'
import type { GuestGapInput, GuestSyncPair } from '@/modules/podcast-studio/recording/conform'
import { DirectoryChunkStorage } from '@/modules/podcast-studio/recording/finalize'
import { guestCredential, guestErrorResponse, privateJson, readJson } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-11 guest journal chunk upload (POD-REQ-25). The guest holds no
 * account, so — unlike the host's POD-06 bridge onto owner-bound
 * media upload sessions — chunks travel against the POD-10
 * signalling credential, with the same cross-session refusal
 * discipline as guest clip slots (the credential only resolves its
 * own invite; the service re-checks the session explicitly).
 *
 * - GET  ?sessionId= → the server's received-chunk list (resume
 *   source of truth; acked chunks are never re-sent).
 * - POST { sessionId, index, bytesBase64 } → one journal chunk;
 *   byte-identical re-sends are idempotent acks, never duplicates.
 * - PUT  { sessionId, totalChunks, totalFrames, checksum, headSync,
 *   tailSync, gaps } → completion declaration; the server verifies
 *   the recovered journal against every declared fact before the
 *   track becomes conform-ready.
 *
 * Chunk bytes land in a DirectoryChunkStorage under
 * `<mediaDir>/podcast-guest-chunks` in the POD-06 journal layout.
 */
const guestChunkStorage = () =>
  new DirectoryChunkStorage(join(loadConfig().storage.mediaDir, 'podcast-guest-chunks'))

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const credential = guestCredential(request)
  if (!credential) return privateJson({ error: 'Guest credential required.' }, 401)
  try {
    const result = await listGuestReceivedChunks(payload as never, guestChunkStorage(), {
      credential,
      sessionId: url.searchParams.get('sessionId') ?? '',
    })
    return privateJson(result)
  } catch (error) {
    return guestErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const credential = guestCredential(request) || String(body.credential ?? '')
  if (!credential) return privateJson({ error: 'Guest credential required.' }, 401)
  try {
    const bytes = Buffer.from(String(body.bytesBase64 ?? ''), 'base64')
    const result = await writeGuestChunk(payload as never, guestChunkStorage(), {
      credential,
      sessionId: String(body.sessionId ?? ''),
      index: Number(body.index),
      bytes: new Uint8Array(bytes),
    })
    return privateJson(result, 201)
  } catch (error) {
    return guestErrorResponse(error)
  }
}

export async function PUT(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const credential = guestCredential(request) || String(body.credential ?? '')
  if (!credential) return privateJson({ error: 'Guest credential required.' }, 401)
  try {
    const result = await completeGuestChunkUpload(payload as never, guestChunkStorage(), {
      credential,
      sessionId: String(body.sessionId ?? ''),
      totalChunks: Number(body.totalChunks ?? 0),
      totalFrames: Number(body.totalFrames ?? 0),
      checksum: String(body.checksum ?? ''),
      headSync: body.headSync as GuestSyncPair,
      tailSync: body.tailSync as GuestSyncPair,
      gaps: (body.gaps ?? []) as GuestGapInput[],
    })
    return privateJson({ trackId: result.trackId, recoveredFrames: result.recoveredFrames })
  } catch (error) {
    return guestErrorResponse(error)
  }
}
