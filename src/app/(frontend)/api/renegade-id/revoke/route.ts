import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import { loadRenegadeIdConfig, revokeRenegadeId } from '@/modules/identity/renegade-id'

/** RC3-21 #63: revoke the signed-in member's Renegade ID enrollment. */
export async function POST(request: Request) {
  const idConfig = loadRenegadeIdConfig()
  if (!idConfig) return Response.json({ error: 'Renegade ID is not configured.' }, { status: 503 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const result = await revokeRenegadeId(payload as never, memberId)
  if (!result.ok)
    return Response.json({ error: 'No Renegade ID enrollment found.' }, { status: 404 })
  return Response.json({ revoked: true })
}
