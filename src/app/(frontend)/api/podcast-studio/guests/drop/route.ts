import config from '@payload-config'
import { getPayload } from 'payload'

import { dropGuest } from '@/modules/podcast-studio/guests/service'
import { guestErrorResponse, privateJson, readJson, staffInviteContext } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POD-10 staff drop: removes an admitted/waiting guest from the session. */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const inviteId = String(body.inviteId ?? '')
  if (!inviteId) return privateJson({ error: 'inviteId is required.' }, 400)
  const ctx = await staffInviteContext(payload, request, inviteId)
  if ('error' in ctx) return ctx.error
  try {
    const invite = await dropGuest(
      payload as never,
      inviteId,
      body.reason ? String(body.reason) : 'dropped-by-host',
    )
    return privateJson({ invite })
  } catch (error) {
    return guestErrorResponse(error)
  }
}
