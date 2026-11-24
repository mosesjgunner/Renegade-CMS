import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import {
  consumeChallengeNonce,
  issueAssertion,
  loadRenegadeIdConfig,
} from '@/modules/identity/renegade-id'

/**
 * RC3-21 #63: issue a signed Renegade ID assertion for the signed-in
 * member. When a challenge nonce is supplied it must be a live,
 * unconsumed nonce issued for this member, and the assertion is bound
 * to it via the `nonce` claim.
 */
export async function POST(request: Request) {
  const idConfig = loadRenegadeIdConfig()
  if (!idConfig) return Response.json({ error: 'Renegade ID is not configured.' }, { status: 503 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    nonce?: string
    scopes?: string[]
  }
  if (body.nonce && !(await consumeChallengeNonce(idConfig, body.nonce, memberId)))
    return Response.json({ error: 'Challenge nonce is invalid or already used.' }, { status: 400 })
  const result = await issueAssertion(payload as never, idConfig, memberId, {
    nonce: body.nonce,
    scopes: Array.isArray(body.scopes) ? body.scopes : undefined,
  })
  if (!result.ok)
    return Response.json({ error: 'Assertion refused.', reason: result.reason }, { status: 403 })
  return Response.json({ assertion: result.assertion, expiresAt: result.expiresAt })
}
