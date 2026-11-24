import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import { enrollRenegadeId, loadRenegadeIdConfig } from '@/modules/identity/renegade-id'

/** RC3-21 #63: enroll the signed-in member in Renegade ID. */
export async function POST(request: Request) {
  const idConfig = loadRenegadeIdConfig()
  if (!idConfig) return Response.json({ error: 'Renegade ID is not configured.' }, { status: 503 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { scopes?: string[] }
  const result = await enrollRenegadeId(
    payload as never,
    idConfig,
    memberId,
    Array.isArray(body.scopes) ? body.scopes : undefined,
  )
  if (!result.ok)
    return Response.json({ error: 'A profile is required to enroll.' }, { status: 409 })
  return Response.json({
    enrolled: true,
    subject: result.subject,
    handle: result.handle,
    scopes: result.scopes,
  })
}
