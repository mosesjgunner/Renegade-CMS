import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import { issueChallengeNonce, loadRenegadeIdConfig } from '@/modules/identity/renegade-id'

/**
 * RC3-21 #63: issue a single-use challenge nonce for the signed-in member.
 * The nonce is a short-lived signed token (see renegade-id.ts header for
 * why it is not an `identity-tokens` row).
 */
export async function POST(request: Request) {
  const idConfig = loadRenegadeIdConfig()
  if (!idConfig) return Response.json({ error: 'Renegade ID is not configured.' }, { status: 503 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const { nonce, expiresAt } = await issueChallengeNonce(idConfig, memberId)
  return Response.json({ nonce, expiresAt })
}
