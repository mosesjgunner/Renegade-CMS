import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, listMemberSessions, readMemberSession } from '@/modules/identity/member-identity'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const sessions = await listMemberSessions(payload as never, memberId)
  return Response.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      createdFrom: session.createdFrom,
      deviceLabel: session.deviceLabel ?? null,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt ?? null,
    })),
  })
}
