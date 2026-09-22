import config from '@payload-config'
import { getPayload } from 'payload'

import {
  currentMember,
  readMemberSession,
  revokeMemberSessionById,
  verifyCsrf,
} from '@/modules/identity/member-identity'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Missing or invalid CSRF token.' }, { status: 403 })
  const { id } = await params
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const revoked = await revokeMemberSessionById(payload as never, memberId, id)
  if (!revoked) return Response.json({ error: 'Session not found.' }, { status: 404 })
  return Response.json({ status: 'revoked' })
}
