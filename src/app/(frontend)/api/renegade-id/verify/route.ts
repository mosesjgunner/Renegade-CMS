import { getPayload } from 'payload'
import config from '@payload-config'

import { loadRenegadeIdConfig, verifyAssertion } from '@/modules/identity/renegade-id'

/**
 * RC3-21 #63: the relying-party side of the handshake. Verifies the
 * assertion signature against the install key AND the live enrollment
 * row, so a revoked enrollment fails here even with a valid signature.
 */
export async function POST(request: Request) {
  const idConfig = loadRenegadeIdConfig()
  if (!idConfig) return Response.json({ error: 'Renegade ID is not configured.' }, { status: 503 })
  const body = (await request.json().catch(() => ({}))) as {
    assertion?: string
    requiredScope?: string
    nonce?: string
  }
  if (!body.assertion)
    return Response.json({ verified: false, reason: 'missing_assertion' }, { status: 400 })
  const payload = await getPayload({ config })
  const result = await verifyAssertion(payload as never, idConfig, body.assertion, {
    requiredScope: body.requiredScope,
    expectedNonce: body.nonce,
  })
  if (!result.ok) return Response.json({ verified: false, reason: result.reason }, { status: 401 })
  return Response.json({
    verified: true,
    identity: { memberId: result.memberId, subject: result.subject, handle: result.handle },
    scopes: result.scopes,
  })
}
