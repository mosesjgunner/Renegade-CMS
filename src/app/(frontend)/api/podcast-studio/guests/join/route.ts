import config from '@payload-config'
import { getPayload } from 'payload'

import { joinGuest } from '@/modules/podcast-studio/guests/service'
import type { HeadphoneDeclaration } from '@/modules/podcast-studio/guests/lobby'
import { guestErrorResponse, privateJson, readJson } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-10 guest join — NO account, display name only. The single-use
 * invite token is consumed here; the response carries the signalling
 * credential (once) and the ICE config for the guest's peer session.
 * Expired/revoked/reused tokens are refused (401 via the error map).
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const token = String(body.token ?? '')
  if (!token) return privateJson({ error: 'token is required.' }, 400)
  try {
    const result = await joinGuest(payload as never, {
      token,
      displayName: String(body.displayName ?? ''),
      headphones: String(body.headphones ?? '') as HeadphoneDeclaration,
    })
    return privateJson(result)
  } catch (error) {
    return guestErrorResponse(error)
  }
}
