import config from '@payload-config'
import { getPayload } from 'payload'

import { revokeGuestInvite } from '@/modules/podcast-studio/guests/service'
import { guestErrorResponse, privateJson, readJson, staffInviteContext } from '../../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POD-10 staff revocation: the invite token dies instantly; an admitted guest is dropped. */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const inviteId = String(body.inviteId ?? '')
  if (!inviteId) return privateJson({ error: 'inviteId is required.' }, 400)
  const ctx = await staffInviteContext(payload, request, inviteId)
  if ('error' in ctx) return ctx.error
  try {
    const invite = await revokeGuestInvite(payload as never, inviteId)
    return privateJson({ invite })
  } catch (error) {
    return guestErrorResponse(error)
  }
}
