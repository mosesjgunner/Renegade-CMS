import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'
import { beginMemberPasskeyRegistration } from '@/modules/identity/member-passkey'
import { loadConfig } from '@/modules/core/config'

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Missing or invalid CSRF token.' }, { status: 403 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const member = (await payload.findByID({
    collection: 'members',
    id: memberId,
    overrideAccess: true,
  } as never)) as { email?: string }
  const { challengeToken, options } = await beginMemberPasskeyRegistration(payload as never, {
    memberId,
    memberEmail: member.email ?? '',
    appUrl: loadConfig().appUrl,
  })
  return Response.json({ challengeToken, options })
}
