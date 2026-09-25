import config from '@payload-config'
import { getPayload } from 'payload'
import {
  changeMemberAccountState,
  currentMember,
  readMemberSession,
  verifyCsrf,
} from '@/modules/identity/member-identity'

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Missing or invalid CSRF token.' }, { status: 403 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })

  await changeMemberAccountState(payload as never, {
    actorUserId: memberId,
    memberId,
    state: 'active',
    reason: 'Member requested account reactivation / cancelled deletion.',
  })

  await (payload as any).update({
    collection: 'members',
    id: memberId,
    data: {
      deletionRequestedAt: null,
      disabledAt: null,
    },
    overrideAccess: true,
  })

  return Response.json({ status: 'active', message: 'Account reactivated successfully.' })
}
