import config from '@payload-config'
import { getPayload } from 'payload'

import { registerGuestClip, revokeGuestClip } from '@/modules/podcast-studio/guests/service'
import {
  guestCredential,
  guestErrorResponse,
  privateJson,
  readJson,
  staffSessionContext,
} from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-10 guest clip slots (POD-REQ-24). POST (guest credential):
 * binds an uploaded media asset to the (session, guest) slot — the
 * clip lands in the session's 'guest-slots' cart bank. The credential
 * only ever resolves its own invite, so cross-session registration is
 * denied by construction (and by the service's explicit session
 * check). DELETE (staff): host revokes a guest clip from the bank.
 * Host stop/replace during a show runs through the POD-08 player
 * engine on the same bank clips.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const credential = guestCredential(request) || String(body.credential ?? '')
  if (!credential) return privateJson({ error: 'Guest credential required.' }, 401)
  try {
    const result = await registerGuestClip(payload as never, {
      credential,
      sessionId: String(body.sessionId ?? ''),
      title: String(body.title ?? ''),
      sizeBytes: Number(body.sizeBytes ?? 0),
      mediaAssetId: String(body.mediaAssetId ?? ''),
    })
    return privateJson({ clipId: result.clipId, inviteId: result.invite.id }, 201)
  } catch (error) {
    return guestErrorResponse(error)
  }
}

export async function DELETE(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const sessionRecordId = String(body.sessionRecordId ?? '')
  if (!sessionRecordId) return privateJson({ error: 'sessionRecordId is required.' }, 400)
  const ctx = await staffSessionContext(payload, request, sessionRecordId)
  if ('error' in ctx) return ctx.error
  try {
    await revokeGuestClip(payload as never, {
      sessionRecordId,
      clipId: String(body.clipId ?? ''),
    })
    return privateJson({ ok: true })
  } catch (error) {
    return guestErrorResponse(error)
  }
}
