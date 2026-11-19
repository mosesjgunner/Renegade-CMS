import config from '@payload-config'
import { getPayload } from 'payload'

import { issueGuestInvite, listGuestInvites } from '@/modules/podcast-studio/guests/service'
import { guestErrorResponse, privateJson, readJson, staffSessionContext } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-10 staff invites: POST issues an invite for a studio session
 * (the raw token is returned exactly once, in this response); GET
 * lists a session's invites (hashes are never returned — the service
 * record shape carries none).
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const sessionRecordId = String(body.sessionRecordId ?? '')
  if (!sessionRecordId) return privateJson({ error: 'sessionRecordId is required.' }, 400)
  const ctx = await staffSessionContext(payload, request, sessionRecordId)
  if ('error' in ctx) return ctx.error
  try {
    const { invite, token } = await issueGuestInvite(payload as never, {
      sessionRecordId,
      guestId: body.guestId ? String(body.guestId) : null,
      ...(typeof body.ttlMs === 'number' ? { ttlMs: body.ttlMs } : {}),
    })
    return privateJson({ invite, token, joinPath: `/studio/guest/${token}` }, 201)
  } catch (error) {
    return guestErrorResponse(error)
  }
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const sessionRecordId = new URL(request.url).searchParams.get('sessionRecordId') ?? ''
  if (!sessionRecordId) return privateJson({ error: 'sessionRecordId is required.' }, 400)
  const ctx = await staffSessionContext(payload, request, sessionRecordId)
  if ('error' in ctx) return ctx.error
  const invites = await listGuestInvites(payload as never, sessionRecordId)
  return privateJson({ invites })
}
