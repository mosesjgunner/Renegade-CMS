import config from '@payload-config'
import { getPayload } from 'payload'

import { admitGuest } from '@/modules/podcast-studio/guests/service'
import { guestErrorResponse, privateJson, readJson, staffInviteContext } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-10 staff admission. The service runs the POD-04 consent gate
 * (block policy → 403 here) and the host+≤3 mesh bound (→ 409).
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const inviteId = String(body.inviteId ?? '')
  if (!inviteId) return privateJson({ error: 'inviteId is required.' }, 400)
  const ctx = await staffInviteContext(payload, request, inviteId)
  if ('error' in ctx) return ctx.error
  try {
    const result = await admitGuest(payload as never, inviteId)
    return privateJson(result)
  } catch (error) {
    return guestErrorResponse(error)
  }
}
