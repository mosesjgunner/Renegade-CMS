import config from '@payload-config'
import { getPayload } from 'payload'
import {
  clearMemberSessionCookie,
  currentMember,
  readMemberSession,
  revokeMemberSession,
} from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  await payload.update({
    collection: 'members',
    id: memberId,
    overrideAccess: true,
    data: { status: 'archived', deletionRequestedAt: new Date().toISOString() },
  } as never)
  await revokeMemberSession(payload as never, readMemberSession(request.headers))
  return Response.json(
    { status: 'deactivated' },
    { headers: { 'set-cookie': clearMemberSessionCookie(loadConfig().secureCookies) } },
  )
}
