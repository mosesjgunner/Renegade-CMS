import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'
import { ProfileAccessError } from '@/modules/community/profile-projection'
import { saveMemberProfile } from '@/modules/community/profile-service'
import { memberProfileHistory } from '@/modules/community/profile-service'
import { communitySiteForHost } from '@/modules/community/site-scope'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  return Response.json(
    { history: await memberProfileHistory(payload, memberId) },
    { headers: { 'cache-control': 'private, no-store' } },
  )
}

export async function PATCH(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token.' }, { status: 403 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  try {
    const profile = await saveMemberProfile(
      payload,
      memberId,
      await request.json().catch(() => ({})),
      undefined,
      await communitySiteForHost(payload, request.headers.get('host')).catch(() => undefined),
    )
    return Response.json({ profile }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Profile update failed.' },
      { status: error instanceof ProfileAccessError ? error.status : 400 },
    )
  }
}
