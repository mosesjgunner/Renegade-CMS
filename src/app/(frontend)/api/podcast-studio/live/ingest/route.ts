/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { LiveIngestError } from '@/modules/podcast-studio/live/ingest-buffer'
import {
  getLiveIngestStatus,
  writeLiveIngestChunk,
} from '@/modules/podcast-studio/live/live-service'
import { loadStudioSessionRecord } from '@/modules/podcast-studio/sessions'
import {
  loadShow,
  privateJson,
  readJson,
  relationId,
  requireSiteAccess,
  resolveStaff,
} from '../../production/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-21 live ingest API — the server end of the browser→ingest byte
 * path (the POD-16 gap). Staff-authenticated + operator site grant,
 * session-scoped, following the POD-16 live route patterns (the grant
 * is checked against the session's owning show's site, never a
 * caller-supplied site id).
 *
 * POST { sessionRecordId, seq, format?, bytesBase64 } — one program
 *      chunk (s16le stereo PCM). Sequence discipline lives in the
 *      ingest buffer: identical re-sends are idempotent acks,
 *      different bytes for a received seq are a 409 conflict,
 *      out-of-order chunks are buffered with the gap recorded.
 * GET  ?sessionRecordId= — the buffer status (received seqs, next
 *      contiguous seq, gaps, flushed bytes, last chunk time).
 */
async function ingestContext(payload: any, request: Request, sessionRecordId: string) {
  const user = await resolveStaff(payload, request)
  if (!user)
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  const record = await loadStudioSessionRecord(payload as never, sessionRecordId)
  if (!record)
    return {
      error: NextResponse.json({ error: 'Studio session not found.' }, { status: 404 }),
    }
  const show = await loadShow(payload, record.showId)
  if (!show)
    return { error: NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 }) }
  const denied = await requireSiteAccess(payload, user, relationId(show.site))
  if (denied) return { error: denied }
  return { user, record }
}

const ingestErrorResponse = (error: unknown) => {
  if (error instanceof LiveIngestError) {
    const status =
      error.code.endsWith('_FORMAT_UNSUPPORTED') ||
      error.code.endsWith('_BAD_SEQ') ||
      error.code.endsWith('_BAD_CHUNK')
        ? 400
        : 409
    return privateJson({ error: error.message, code: error.code }, status)
  }
  return privateJson(
    { error: error instanceof Error ? error.message : 'Live ingest request failed.' },
    500,
  )
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const sessionRecordId = url.searchParams.get('sessionRecordId') ?? ''
  const context = await ingestContext(payload, request, sessionRecordId)
  if ('error' in context) return context.error
  try {
    const status = await getLiveIngestStatus(payload as never, sessionRecordId)
    return privateJson({ sessionRecordId, ingest: status })
  } catch (error) {
    return ingestErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const sessionRecordId = typeof body.sessionRecordId === 'string' ? body.sessionRecordId : ''
  const context = await ingestContext(payload, request, sessionRecordId)
  if ('error' in context) return context.error
  try {
    const bytes = Buffer.from(
      typeof body.bytesBase64 === 'string' ? body.bytesBase64 : '',
      'base64',
    )
    const result = await writeLiveIngestChunk(payload as never, {
      sessionRecordId,
      seq: Number(body.seq),
      bytes: new Uint8Array(bytes),
      ...(typeof body.format === 'string' ? { format: body.format } : {}),
    })
    return privateJson(
      {
        sessionRecordId,
        seq: result.seq,
        duplicate: result.duplicate,
        ingest: result.status,
      },
      201,
    )
  } catch (error) {
    return ingestErrorResponse(error)
  }
}
