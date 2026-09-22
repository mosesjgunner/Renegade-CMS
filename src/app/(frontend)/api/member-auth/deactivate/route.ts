import config from '@payload-config'
import { getPayload } from 'payload'
import {
  changeMemberAccountState,
  clearCsrfCookie,
  clearMemberSessionCookie,
  currentMember,
  readMemberSession,
  verifyCsrf,
} from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Missing or invalid CSRF token.' }, { status: 403 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  await changeMemberAccountState(payload as never, {
    actorUserId: memberId,
    memberId,
    state: 'deactivated',
    reason: 'Member requested deactivation.',
  })
  const secure = loadConfig().secureCookies
  return Response.json(
    { status: 'deactivated' },
    {
      headers: [
        ['set-cookie', clearMemberSessionCookie(secure)],
        ['set-cookie', clearCsrfCookie(secure)],
      ],
    },
  )
}
